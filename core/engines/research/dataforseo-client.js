'use strict';

/**
 * dataforseo-client.js — DataForSEO API Client
 *
 * Handles authentication, request/response, rate limiting, and error handling.
 * Reads credentials from ~/.fontrends/config.json
 */

const https = require('https');
const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.join(process.env.HOME, '.fontrends', 'config.json');

/**
 * Load DataForSEO credentials from config.json
 */
function loadCredentials() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const { login, password } = config.dataforseo || {};
    if (!login || !password) throw new Error('Missing dataforseo.login or dataforseo.password');
    return { login, password };
  } catch (e) {
    throw new Error(`Cannot load DataForSEO credentials from ${CONFIG_PATH}: ${e.message}`);
  }
}

/**
 * Make a POST request to DataForSEO API
 * @param {string} endpoint - API path (e.g., "/v3/dataforseo_labs/google/historical_search_volume/live")
 * @param {Array} payload - Request body array
 * @param {Object} [options] - { maxRetries: 3, retryDelay: 3000 }
 * @returns {Promise<Object>} API response
 */
async function apiPost(endpoint, payload, options = {}) {
  const { login, password } = loadCredentials();
  const maxRetries = options.maxRetries || 3;
  const retryDelay = options.retryDelay || 3000;

  const auth = Buffer.from(`${login}:${password}`).toString('base64');
  const body = JSON.stringify(payload);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'api.dataforseo.com',
          path: endpoint,
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json',
          },
        }, (res) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            try { resolve(JSON.parse(data)); }
            catch (e) { reject(new Error(`Invalid JSON response: ${data.substring(0, 200)}`)); }
          });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
      });

      // Check response status
      if (result.status_code === 20000) {
        const task = result.tasks?.[0];
        if (task?.status_code === 20000) {
          return {
            success: true,
            cost: result.cost || 0,
            data: task.result,
            raw: result,
          };
        }
        if (task?.status_code === 40200) {
          return { success: false, error: 'Payment Required — 帳號餘額不足', cost: 0, data: null };
        }
        if (task?.status_code === 40000) {
          return { success: false, error: `Bad Request: ${task.status_message}`, cost: 0, data: null };
        }
        // Retry on server errors
        if (task?.status_code >= 50000 && attempt < maxRetries) {
          console.log(`  [dataforseo] Server error ${task.status_code}, retry ${attempt + 1}/${maxRetries}...`);
          await sleep(retryDelay * (attempt + 1));
          continue;
        }
        return { success: false, error: `API error: ${task?.status_code} ${task?.status_message}`, cost: result.cost || 0, data: null };
      }

      return { success: false, error: `HTTP error: ${result.status_code} ${result.status_message}`, cost: 0, data: null };

    } catch (err) {
      if (attempt < maxRetries) {
        console.log(`  [dataforseo] Network error, retry ${attempt + 1}/${maxRetries}...`);
        await sleep(retryDelay * (attempt + 1));
        continue;
      }
      return { success: false, error: `Network error: ${err.message}`, cost: 0, data: null };
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ══════════════════════════════════════════════════════
// High-level API Methods
// ══════════════════════════════════════════════════════

/**
 * Get historical search volume for keywords
 * @param {string[]} keywords - e.g., ["louis vuitton", "dior", "gucci"]
 * @param {Object} [opts] - { location: "Taiwan", language: "Chinese (Traditional)" }
 * @returns {Promise<Object>} { success, cost, items: [{ keyword, search_volume, monthly_searches, competition, cpc, difficulty }] }
 */
async function getHistoricalSearchVolume(keywords, opts = {}) {
  const location = opts.location || 'Taiwan';
  const language = opts.language || 'Chinese (Traditional)';

  const result = await apiPost('/v3/dataforseo_labs/google/historical_search_volume/live', [{
    location_name: location,
    language_name: language,
    keywords,
  }]);

  if (!result.success) return result;

  const items = (result.data?.[0]?.items || []).map(item => ({
    keyword: item.keyword,
    search_volume: item.keyword_info?.search_volume || 0,
    monthly_searches: (item.keyword_info?.monthly_searches || []).map(m => ({
      year: m.year,
      month: m.month,
      volume: m.search_volume,
    })),
    competition: item.keyword_info?.competition_level || 'N/A',
    cpc: item.keyword_info?.cpc || 0,
    difficulty: item.keyword_properties?.keyword_difficulty || 0,
    trend: item.keyword_info?.search_volume_trend || {},
  }));

  return { success: true, cost: result.cost, items };
}

/**
 * Get related keywords for a seed keyword
 * @param {string} keyword - e.g., "louis vuitton"
 * @param {Object} [opts] - { location, language, limit: 50 }
 * @returns {Promise<Object>} { success, cost, items: [{ keyword, search_volume, difficulty, cpc }] }
 */
async function getRelatedKeywords(keyword, opts = {}) {
  const location = opts.location || 'Taiwan';
  const language = opts.language || 'Chinese (Traditional)';
  const limit = opts.limit || 50;

  const result = await apiPost('/v3/dataforseo_labs/google/related_keywords/live', [{
    keyword,
    location_name: location,
    language_name: language,
    limit,
    include_seed_keyword: true,
  }]);

  if (!result.success) return result;

  const items = (result.data?.[0]?.items || []).map(item => ({
    keyword: item.keyword_data?.keyword || '',
    search_volume: item.keyword_data?.keyword_info?.search_volume || 0,
    difficulty: item.keyword_data?.keyword_properties?.keyword_difficulty || 0,
    cpc: item.keyword_data?.keyword_info?.cpc || 0,
    competition: item.keyword_data?.keyword_info?.competition_level || 'N/A',
  }));

  return { success: true, cost: result.cost, items };
}

/**
 * Get keyword suggestions (long-tail keywords)
 * @param {string} keyword - e.g., "dior"
 * @param {Object} [opts] - { location, language, limit: 50 }
 * @returns {Promise<Object>}
 */
async function getKeywordSuggestions(keyword, opts = {}) {
  const location = opts.location || 'Taiwan';
  const language = opts.language || 'Chinese (Traditional)';
  const limit = opts.limit || 50;

  const result = await apiPost('/v3/dataforseo_labs/google/keyword_suggestions/live', [{
    keyword,
    location_name: location,
    language_name: language,
    limit,
    include_seed_keyword: false,
  }]);

  if (!result.success) return result;

  const items = (result.data?.[0]?.items || []).map(item => {
    // keyword_suggestions has flat structure: item.keyword + item.keyword_info
    const kw = item.keyword_data?.keyword || item.keyword || '';
    const info = item.keyword_data?.keyword_info || item.keyword_info || {};
    const props = item.keyword_data?.keyword_properties || item.keyword_properties || {};
    return {
      keyword: kw,
      search_volume: info.search_volume || 0,
      difficulty: props.keyword_difficulty || 0,
      cpc: info.cpc || 0,
    };
  }).filter(item => item.keyword); // filter out empty keywords

  return { success: true, cost: result.cost, items };
}

/**
 * Search Google News for events around a date
 * @param {string} query - e.g., "Louis Vuitton 台北101"
 * @param {Object} [opts] - { location, language, depth: 10 }
 * @returns {Promise<Object>}
 */
async function searchNews(query, opts = {}) {
  const location = opts.location || 'Taiwan';
  const language = opts.language || 'Chinese (Traditional)';
  const depth = opts.depth || 10;

  const result = await apiPost('/v3/serp/google/news/live/advanced', [{
    keyword: query,
    location_name: location,
    language_name: language,
    depth,
  }]);

  if (!result.success) return result;

  const items = (result.data?.[0]?.items || [])
    .filter(item => item.type === 'news_search')
    .map(item => ({
      title: item.title || '',
      url: item.url || '',
      source: item.source || '',
      date: item.date || '',
      snippet: item.snippet || '',
    }));

  return { success: true, cost: result.cost, items };
}

module.exports = {
  loadCredentials,
  apiPost,
  getHistoricalSearchVolume,
  getRelatedKeywords,
  getKeywordSuggestions,
  searchNews,
};
