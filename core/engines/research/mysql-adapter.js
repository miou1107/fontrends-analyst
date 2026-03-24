'use strict';

/**
 * mysql-adapter.js — MySQL Database Adapter
 *
 * 透過 SSH tunnel 連接 fontrends DB，直接查詢品牌社群數據。
 * 比 Looker Studio 瀏覽器擷取快 100 倍、精確、無篩選器限制。
 *
 * 數據源：test-fontrends.welcometw.com / spots_analytic
 * 主表：keyword_articles（品牌社群）、search_daily_data（搜尋）、keyword_volume（搜量）
 */

const { Client } = require('ssh2');
const mysql = require('mysql2/promise');
const net = require('net');
const env = require('../env');

// ══════════════════════════════════════════════════════
// SSH Tunnel + MySQL Connection
// ══════════════════════════════════════════════════════

/**
 * 建立 SSH tunnel 並連接 MySQL
 * @returns {Promise<{ connection, tunnel, close }>}
 */
async function connect() {
  const sshConfig = {
    host: env.getConfig('FONTRENDS_DB_HOST', null, 'test-fontrends.welcometw.com'),
    port: 22,
    username: env.getConfig('FONTRENDS_DB_SSH_USER', null, 'root'),
    password: env.getConfig('FONTRENDS_DB_SSH_PASSWORD', null, ''),
  };

  const dbConfig = {
    host: '127.0.0.1',
    user: env.getConfig('FONTRENDS_DB_USER', null, 'fontrip'),
    password: env.getConfig('FONTRENDS_DB_PASSWORD', null, ''),
    database: env.getConfig('FONTRENDS_DB_NAME', null, 'spots_analytic'),
  };

  return new Promise((resolve, reject) => {
    const ssh = new Client();

    ssh.on('ready', () => {
      // 建立 TCP tunnel 到 MySQL
      ssh.forwardOut('127.0.0.1', 0, '127.0.0.1', 3306, async (err, stream) => {
        if (err) { ssh.end(); return reject(err); }

        try {
          const connection = await mysql.createConnection({
            ...dbConfig,
            stream,
          });

          resolve({
            connection,
            ssh,
            close: async () => {
              await connection.end();
              ssh.end();
            },
          });
        } catch (e) {
          ssh.end();
          reject(e);
        }
      });
    });

    ssh.on('error', reject);
    ssh.connect(sshConfig);
  });
}

// ══════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════

/** MySQL SUM() returns string for bigint — convert to number */
function toNum(val) { return val === null || val === undefined ? 0 : Number(val); }

// ══════════════════════════════════════════════════════
// High-level Query Methods
// ══════════════════════════════════════════════════════

/**
 * 查詢品牌社群總覽 KPI
 * @param {mysql.Connection} conn
 * @param {string} brand - e.g., "Dior"
 * @param {string} startDate - e.g., "2025-03-01"
 * @param {string} endDate - e.g., "2026-03-01"
 */
async function querySocialOverview(conn, brand, startDate, endDate) {
  // 用 keyword_content 取 influence_index（跟 Looker Studio 一致）
  const [rows] = await conn.execute(`
    SELECT
      COUNT(ka.id) as total_posts,
      SUM(ka.like_count) as total_likes,
      SUM(ka.comment_count) as total_comments,
      SUM(ka.share_count) as total_shares,
      COALESCE(SUM(kc.influence_index), 0) as total_influence,
      COUNT(DISTINCT ka.channel_name) as channel_count,
      COUNT(DISTINCT ka.author) as author_count
    FROM keyword_articles ka LEFT JOIN keyword_content kc ON ka.match_key = kc.match_key
    WHERE ka.spot_name = ? AND ka.post_time BETWEEN ? AND ? AND ka.deleted_at IS NULL
  `, [brand, startDate, endDate]);

  const r = rows[0];
  return {
    influence: toNum(r.total_influence), // Looker Studio 的影響力指數
    posts: toNum(r.total_posts),
    likes: toNum(r.total_likes),
    comments: toNum(r.total_comments),
    shares: toNum(r.total_shares),
    authors: toNum(r.author_count),
    channels: toNum(r.channel_count),
  };
}

/**
 * 查詢月度趨勢
 */
async function queryMonthlyTrend(conn, brand, startDate, endDate) {
  const [rows] = await conn.execute(`
    SELECT
      DATE_FORMAT(ka.post_time, '%Y-%m') as month,
      COUNT(ka.id) as posts,
      SUM(ka.like_count) as likes,
      SUM(ka.comment_count) as comments,
      SUM(ka.share_count) as shares,
      COALESCE(SUM(kc.influence_index), 0) as influence
    FROM keyword_articles ka LEFT JOIN keyword_content kc ON ka.match_key = kc.match_key
    WHERE ka.spot_name = ? AND ka.post_time BETWEEN ? AND ? AND ka.deleted_at IS NULL
    GROUP BY DATE_FORMAT(ka.post_time, '%Y-%m')
    ORDER BY month
  `, [brand, startDate, endDate]);

  return rows.map(r => ({
    month: r.month,
    influence: toNum(r.influence),
    posts: toNum(r.posts),
    likes: toNum(r.likes),
    comments: toNum(r.comments),
    shares: toNum(r.shares),
  }));
}

/**
 * 查詢日度趨勢（用於 cross-correlation）
 */
async function queryDailyTrend(conn, brand, startDate, endDate) {
  const [rows] = await conn.execute(`
    SELECT
      DATE(ka.post_time) as date,
      COUNT(ka.id) as posts,
      SUM(ka.like_count) as likes,
      SUM(ka.comment_count) as comments,
      SUM(ka.share_count) as shares,
      COALESCE(SUM(kc.influence_index), 0) as influence
    FROM keyword_articles ka LEFT JOIN keyword_content kc ON ka.match_key = kc.match_key
    WHERE ka.spot_name = ? AND ka.post_time BETWEEN ? AND ? AND ka.deleted_at IS NULL
    GROUP BY DATE(ka.post_time)
    ORDER BY date
  `, [brand, startDate, endDate]);

  return rows.map(r => ({
    date: r.date,
    posts: toNum(r.posts),
    likes: toNum(r.likes),
    comments: toNum(r.comments),
    shares: toNum(r.shares),
    influence: toNum(r.influence),
  }));
}

/**
 * 查詢好感度分布
 */
async function querySentiment(conn, brand, startDate, endDate) {
  const [rows] = await conn.execute(`
    SELECT
      ka.mood,
      COUNT(ka.id) as count
    FROM keyword_articles ka LEFT JOIN keyword_content kc ON ka.match_key = kc.match_key
    WHERE ka.spot_name = ? AND ka.post_time BETWEEN ? AND ? AND ka.deleted_at IS NULL
    GROUP BY ka.mood
  `, [brand, startDate, endDate]);

  const total = rows.reduce((sum, r) => sum + r.count, 0) || 1;
  const positive = rows.find(r => r.mood === 1)?.count || 0;
  const neutral = rows.find(r => r.mood === 0)?.count || 0;
  const negative = rows.find(r => r.mood === -1)?.count || 0;

  return {
    positive: +(positive / total * 100).toFixed(1),
    neutral: +(neutral / total * 100).toFixed(1),
    negative: +(negative / total * 100).toFixed(1),
  };
}

/**
 * 查詢平台分布
 */
async function queryPlatformDistribution(conn, brand, startDate, endDate) {
  const [rows] = await conn.execute(`
    SELECT
      ka.source_name as platform,
      COUNT(ka.id) as posts,
      SUM(ka.like_count) as likes,
      SUM(ka.comment_count) as comments,
      SUM(ka.share_count) as shares,
      COALESCE(SUM(kc.influence_index), 0) as influence
    FROM keyword_articles ka LEFT JOIN keyword_content kc ON ka.match_key = kc.match_key
    WHERE ka.spot_name = ? AND ka.post_time BETWEEN ? AND ? AND ka.deleted_at IS NULL
    GROUP BY ka.source_name
    ORDER BY influence DESC
  `, [brand, startDate, endDate]);

  return rows.map(r => ({
    name: r.platform,
    influence: toNum(r.influence),
    posts: toNum(r.posts),
    likes: toNum(r.likes),
    comments: toNum(r.comments),
    shares: toNum(r.shares),
  }));
}

/**
 * 查詢 KOL 排行
 */
async function queryTopKOL(conn, brand, startDate, endDate, limit = 20) {
  const [rows] = await conn.execute(`
    SELECT
      ka.channel_name,
      ka.author,
      ka.source_name as platform,
      COUNT(ka.id) as posts,
      SUM(ka.like_count) as likes,
      SUM(ka.comment_count) as comments,
      SUM(ka.share_count) as shares,
      COALESCE(SUM(kc.influence_index), 0) as influence
    FROM keyword_articles ka LEFT JOIN keyword_content kc ON ka.match_key = kc.match_key
    WHERE ka.spot_name = ? AND ka.post_time BETWEEN ? AND ? AND ka.deleted_at IS NULL
    GROUP BY ka.channel_name, ka.author, ka.source_name
    ORDER BY influence DESC
    LIMIT ${parseInt(limit, 10)}
  `, [brand, startDate, endDate]);

  return rows.map(r => ({
    name: r.channel_name,
    author: r.author,
    platform: r.platform,
    posts: toNum(r.posts),
    likes: toNum(r.likes),
    comments: toNum(r.comments),
    shares: toNum(r.shares),
    influence: toNum(r.influence),
  }));
}

/**
 * 查詢語系分布
 */
async function queryLanguageDistribution(conn, brand, startDate, endDate) {
  const [rows] = await conn.execute(`
    SELECT
      ka.lang,
      COUNT(ka.id) as posts,
      COALESCE(SUM(kc.influence_index), 0) as influence
    FROM keyword_articles ka LEFT JOIN keyword_content kc ON ka.match_key = kc.match_key
    WHERE ka.spot_name = ? AND ka.post_time BETWEEN ? AND ? AND ka.deleted_at IS NULL
    GROUP BY ka.lang
    ORDER BY influence DESC
  `, [brand, startDate, endDate]);

  return rows.map(r => ({
    lang: r.lang,
    posts: toNum(r.posts),
    influence: toNum(r.influence),
  }));
}

/**
 * 查詢熱門文章（爆文分析）
 */
async function queryTopArticles(conn, brand, startDate, endDate, limit = 20) {
  const [rows] = await conn.execute(`
    SELECT
      ka.spot_name, ka.source_name, ka.channel_name, ka.author, ka.lang, ka.mood,
      ka.like_count, ka.comment_count, ka.share_count, ka.impression_count,
      kc.influence_index,
      SUBSTRING(ka.title, 1, 100) as title_short,
      ka.link, ka.post_time
    FROM keyword_articles ka LEFT JOIN keyword_content kc ON ka.match_key = kc.match_key
    WHERE ka.spot_name = ? AND ka.post_time BETWEEN ? AND ? AND ka.deleted_at IS NULL
    ORDER BY kc.influence_index DESC
    LIMIT ${parseInt(limit, 10)}
  `, [brand, startDate, endDate]);

  return rows.map(r => ({
    ...r,
    like_count: toNum(r.like_count),
    comment_count: toNum(r.comment_count),
    share_count: toNum(r.share_count),
    impression_count: toNum(r.impression_count),
  }));
}

/**
 * 查詢搜量月度趨勢（from search_daily_data，用於 cross-correlation）
 */
async function querySearchMonthlyTrend(conn, brand) {
  const [rows] = await conn.execute(`
    SELECT
      DATE_FORMAT(date, '%Y-%m') as month,
      SUM(search_volume) as total_volume,
      COUNT(DISTINCT search_keyword) as keyword_count
    FROM search_daily_data
    WHERE topic_name = ?
    GROUP BY DATE_FORMAT(date, '%Y-%m')
    ORDER BY month
  `, [brand]);

  return rows.map(r => ({
    month: r.month,
    volume: toNum(r.total_volume),
    keyword_count: toNum(r.keyword_count),
  }));
}

/**
 * 查詢熱門搜尋關鍵字（from search_daily_data）
 */
async function queryTopSearchKeywords(conn, brand, limit = 20) {
  const [rows] = await conn.execute(`
    SELECT search_keyword, search_volume, intention_code, lang
    FROM search_daily_data
    WHERE topic_name = ? AND date = (SELECT MAX(date) FROM search_daily_data WHERE topic_name = ?)
    ORDER BY search_volume DESC
    LIMIT ${parseInt(limit, 10)}
  `, [brand, brand]);

  return rows.map(r => ({
    keyword: r.search_keyword,
    volume: toNum(r.search_volume),
    intent_code: r.intention_code,
    lang: r.lang,
  }));
}

/**
 * 查詢搜尋量數據（from keyword_volume）
 */
async function querySearchVolume(conn, brand) {
  const [rows] = await conn.execute(`
    SELECT keyword, search_volume, cost_per_click, keyword_difficulty, intention_code
    FROM keyword_volume
    WHERE core_keyword = ? OR keyword LIKE ?
    ORDER BY cost_per_click DESC
  `, [brand, `%${brand.toLowerCase()}%`]);

  return rows.map(r => ({
    keyword: r.keyword,
    monthly_search_volume: typeof r.search_volume === 'string' ? JSON.parse(r.search_volume) : r.search_volume,
    cpc: r.cost_per_click,
    difficulty: r.keyword_difficulty,
    intent_code: r.intention_code,
  }));
}

// ══════════════════════════════════════════════════════
// All-in-one: Extract complete brand data
// ══════════════════════════════════════════════════════

/**
 * 一次查詢取得品牌完整數據，產出 data.json 格式
 * @param {string} brand
 * @param {string} competitor
 * @param {string} startDate
 * @param {string} endDate
 */
async function extractBrandData(brand, competitor, startDate, endDate) {
  console.log(`[mysql-adapter] 連接 DB...`);
  const { connection, close } = await connect();

  try {
    console.log(`[mysql-adapter] 擷取 ${brand} 數據 (${startDate} ~ ${endDate})`);

    // 主品牌
    const [overview, monthly, daily, sentiment, platforms, kols, languages, topArticles, searchVolume, searchMonthly, topKeywords] = await Promise.all([
      querySocialOverview(connection, brand, startDate, endDate),
      queryMonthlyTrend(connection, brand, startDate, endDate),
      queryDailyTrend(connection, brand, startDate, endDate),
      querySentiment(connection, brand, startDate, endDate),
      queryPlatformDistribution(connection, brand, startDate, endDate),
      queryTopKOL(connection, brand, startDate, endDate),
      queryLanguageDistribution(connection, brand, startDate, endDate),
      queryTopArticles(connection, brand, startDate, endDate),
      querySearchVolume(connection, brand),
      querySearchMonthlyTrend(connection, brand),
      queryTopSearchKeywords(connection, brand),
    ]);

    console.log(`  ✅ ${brand}: ${overview.total_posts} posts, ${overview.author_count} authors`);

    // 競品
    let competitorData = null;
    if (competitor) {
      const [compOverview, compMonthly, compSentiment] = await Promise.all([
        querySocialOverview(connection, competitor, startDate, endDate),
        queryMonthlyTrend(connection, competitor, startDate, endDate),
        querySentiment(connection, competitor, startDate, endDate),
      ]);
      competitorData = {
        brand: competitor,
        overview: compOverview,
        monthly: compMonthly,
        sentiment: compSentiment,
      };
      console.log(`  ✅ ${competitor}: ${compOverview.total_posts} posts`);
    }

    return {
      meta: { brand, competitor, period: `${startDate} ~ ${endDate}`, source: 'mysql', extracted_at: new Date().toISOString() },
      pages: {
        social_overview: { status: 'completed', confidence: 'high', data: { ...overview, monthly } },
        daily_trend: { status: 'completed', data: daily },
        sentiment: { status: 'completed', data: sentiment },
        platform: { status: 'completed', data: { items: platforms } },
        kol: { status: 'completed', data: { items: kols } },
        language: { status: 'completed', data: { items: languages } },
        top_articles: { status: 'completed', data: { items: topArticles } },
        search_volume: { status: 'completed', data: { items: searchVolume } },
        search_monthly_trend: { status: 'completed', data: searchMonthly },
        top_search_keywords: { status: 'completed', data: { items: topKeywords } },
      },
      competitor_data: competitorData ? {
        brand: competitor, source: 'mysql', status: 'completed',
        data: { ...competitorData.overview, monthly: competitorData.monthly, sentiment: competitorData.sentiment },
      } : null,
    };

  } finally {
    await close();
    console.log(`[mysql-adapter] DB 連線已關閉`);
  }
}

// ══════════════════════════════════════════════════════
// CLI
// ══════════════════════════════════════════════════════

if (require.main === module) {
  const args = process.argv.slice(2);
  const brand = args[args.indexOf('--brand') + 1] || 'Dior';
  const competitor = args.includes('--competitor') ? args[args.indexOf('--competitor') + 1] : null;
  const start = args[args.indexOf('--start') + 1] || '2025-03-01';
  const end = args[args.indexOf('--end') + 1] || '2026-03-01';
  const output = args.includes('--output') ? args[args.indexOf('--output') + 1] : null;

  extractBrandData(brand, competitor, start, end).then(data => {
    if (output) {
      require('fs').writeFileSync(output, JSON.stringify(data, null, 2));
      console.log(`✅ 寫入 ${output}`);
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  }).catch(err => {
    console.error('❌', err.message);
    process.exit(1);
  });
}

module.exports = {
  connect, extractBrandData,
  querySocialOverview, queryMonthlyTrend, queryDailyTrend,
  querySentiment, queryPlatformDistribution, queryTopKOL,
  queryLanguageDistribution, queryTopArticles, querySearchVolume,
  querySearchMonthlyTrend, queryTopSearchKeywords,
};
