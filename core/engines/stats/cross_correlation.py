#!/usr/bin/env python3
"""
cross_correlation.py — 社群聲量 × 搜尋量 交叉驗證模組

功能：
1. Cross-correlation: 找最佳 lag（社群領先搜尋多少天/月）
2. Granger Causality: 檢定因果關係
3. Distributed Lag Model: 量化延遲效應
4. ARIMAX: 嚴謹的因果分析（可選）

用法：
  python3 cross_correlation.py --run-dir ~/.fontrends/runs/louis-vuitton-2026-03-23

或作為模組：
  from cross_correlation import analyze_correlation
  result = analyze_correlation(social_daily, search_monthly)
"""

import json
import sys
import os
import numpy as np
import pandas as pd
from scipy.signal import correlate
from scipy.stats import pearsonr
from statsmodels.tsa.stattools import grangercausalitytests, adfuller


def load_data(run_dir):
    """從 data.json 載入社群日度和搜量月度數據"""
    data_path = os.path.join(run_dir, 'data.json')
    with open(data_path, 'r') as f:
        data = json.load(f)

    # 社群月度（from social_overview.data.monthly）
    social_monthly = data.get('pages', {}).get('social_overview', {}).get('data', {}).get('monthly', [])

    # 社群日度（from daily_trend）
    social_daily = data.get('pages', {}).get('daily_trend', {}).get('data', [])

    # 搜量（from search_volume 或 research.json）
    search_items = data.get('pages', {}).get('search_volume', {}).get('data', {}).get('items', [])

    # 也嘗試從 research.json 取搜量
    research_path = os.path.join(run_dir, 'research.json')
    research_trends = []
    if os.path.exists(research_path):
        with open(research_path, 'r') as f:
            research = json.load(f)
        research_trends = research.get('search_trends', [])

    return {
        'social_monthly': social_monthly,
        'social_daily': social_daily,
        'search_items': search_items,
        'research_trends': research_trends,
    }


def cross_correlation_analysis(social_series, search_series, max_lag=6):
    """
    Cross-correlation 分析

    Args:
        social_series: 社群聲量時間序列 (numpy array)
        search_series: 搜尋量時間序列 (numpy array)
        max_lag: 最大 lag 值

    Returns:
        dict: { best_lag, best_corr, all_lags: [{lag, corr}] }
    """
    if len(social_series) < 5 or len(search_series) < 5:
        return {'error': '樣本不足（需要至少 5 個數據點）', 'best_lag': 0, 'best_corr': 0}

    # 標準化
    x = (social_series - np.mean(social_series)) / (np.std(social_series) or 1)
    y = (search_series - np.mean(search_series)) / (np.std(search_series) or 1)

    # 確保長度一致
    min_len = min(len(x), len(y))
    x = x[:min_len]
    y = y[:min_len]

    # Cross-correlation
    n = len(x)
    all_lags = []
    for lag in range(-max_lag, max_lag + 1):
        if lag >= 0:
            corr, _ = pearsonr(x[:n-lag] if lag > 0 else x, y[lag:] if lag > 0 else y)
        else:
            corr, _ = pearsonr(x[-lag:], y[:n+lag])
        all_lags.append({'lag': lag, 'correlation': round(float(corr), 4)})

    # 找最佳 lag（正 lag = 社群領先搜尋）
    best = max(all_lags, key=lambda x: abs(x['correlation']))

    return {
        'best_lag': best['lag'],
        'best_correlation': best['correlation'],
        'interpretation': interpret_correlation(best['lag'], best['correlation']),
        'all_lags': all_lags,
    }


def interpret_correlation(lag, corr):
    """解讀 cross-correlation 結果"""
    strength = '強' if abs(corr) > 0.7 else '中' if abs(corr) > 0.4 else '弱'
    direction = '正' if corr > 0 else '負'

    if lag > 0:
        timing = f'社群聲量領先搜尋量 {lag} 期'
    elif lag < 0:
        timing = f'搜尋量領先社群聲量 {abs(lag)} 期'
    else:
        timing = '兩者同步波動'

    return f'{timing}，{strength}{direction}相關（r={corr:.3f}）'


def granger_causality_test(social_series, search_series, max_lag=4):
    """
    Granger Causality 檢定

    檢驗「過去的社群聲量是否能幫助預測未來的搜尋量」

    Returns:
        dict: { is_significant, best_lag, p_value, all_results }
    """
    if len(social_series) < 15 or len(search_series) < 15:
        return {'error': '樣本不足（Granger 需要至少 15 個數據點）', 'is_significant': None}

    # 確保長度一致
    min_len = min(len(social_series), len(search_series))
    df = pd.DataFrame({
        'search': search_series[:min_len],
        'social': social_series[:min_len],
    })

    # 檢查平穩性（ADF test）
    adf_social = adfuller(df['social'].dropna())
    adf_search = adfuller(df['search'].dropna())

    # 如果不平穩，取差分
    if adf_social[1] > 0.05 or adf_search[1] > 0.05:
        df['social'] = df['social'].diff().dropna()
        df['search'] = df['search'].diff().dropna()
        df = df.dropna()
        differenced = True
    else:
        differenced = False

    if len(df) < max_lag + 5:
        return {'error': f'差分後樣本不足（剩 {len(df)} 筆）', 'is_significant': None}

    # Granger test
    try:
        results = grangercausalitytests(df[['search', 'social']], maxlag=max_lag, verbose=False)
    except Exception as e:
        return {'error': str(e), 'is_significant': None}

    all_results = []
    best_p = 1.0
    best_lag = 1
    for lag in range(1, max_lag + 1):
        if lag in results:
            f_test = results[lag][0]['ssr_ftest']
            p_value = float(f_test[1])
            all_results.append({'lag': lag, 'p_value': round(p_value, 6), 'f_stat': round(float(f_test[0]), 4)})
            if p_value < best_p:
                best_p = p_value
                best_lag = lag

    is_significant = best_p < 0.05

    return {
        'is_significant': is_significant,
        'best_lag': best_lag,
        'best_p_value': round(best_p, 6),
        'differenced': differenced,
        'interpretation': f'社群聲量{"能" if is_significant else "不能"}顯著預測搜尋量（p={best_p:.4f}，lag={best_lag}）',
        'all_results': all_results,
    }


def analyze_correlation(run_dir):
    """
    完整的交叉驗證分析

    Returns:
        dict: { cross_correlation, granger_causality, summary }
    """
    raw = load_data(run_dir)

    results = {
        'monthly': {},
        'summary': '',
        'data_availability': {},
    }

    # 月度分析（社群 monthly vs 搜量 monthly）
    social_monthly = raw['social_monthly']
    search_monthly = []

    # 從 research_trends 取搜量月度
    if raw['research_trends']:
        brand_trend = raw['research_trends'][0] if raw['research_trends'] else None
        if brand_trend and brand_trend.get('monthly'):
            search_monthly = brand_trend['monthly']

    results['data_availability'] = {
        'social_monthly_points': len(social_monthly),
        'search_monthly_points': len(search_monthly),
        'social_daily_points': len(raw['social_daily']),
    }

    if social_monthly and search_monthly:
        # 對齊月份
        social_dict = {m['month']: m.get('influence', 0) for m in social_monthly}
        search_dict = {}
        for m in search_monthly:
            key = f"{m.get('year', '')}-{m.get('month', ''):02d}" if 'year' in m else m.get('month', '')
            search_dict[key] = m.get('volume', m.get('search_volume', 0))

        common_months = sorted(set(social_dict.keys()) & set(search_dict.keys()))

        if len(common_months) >= 5:
            social_arr = np.array([social_dict[m] for m in common_months], dtype=float)
            search_arr = np.array([search_dict[m] for m in common_months], dtype=float)

            results['monthly']['cross_correlation'] = cross_correlation_analysis(social_arr, search_arr)
            results['monthly']['granger_causality'] = granger_causality_test(social_arr, search_arr)
            results['monthly']['months_used'] = common_months
        else:
            results['monthly']['error'] = f'共同月份只有 {len(common_months)} 個（需要 >= 5）'
    else:
        results['monthly']['error'] = f'數據不足：社群 {len(social_monthly)} 月，搜量 {len(search_monthly)} 月'

    # 摘要
    cc = results.get('monthly', {}).get('cross_correlation', {})
    gc = results.get('monthly', {}).get('granger_causality', {})
    summaries = []
    if cc.get('interpretation'):
        summaries.append(f'Cross-correlation: {cc["interpretation"]}')
    if gc.get('interpretation'):
        summaries.append(f'Granger Causality: {gc["interpretation"]}')
    results['summary'] = ' | '.join(summaries) if summaries else '數據不足，無法進行交叉驗證'

    return results


# ══════════════════════════════════════════════════════
# CLI
# ══════════════════════════════════════════════════════

if __name__ == '__main__':
    args = sys.argv[1:]
    run_dir_idx = args.index('--run-dir') if '--run-dir' in args else -1
    if run_dir_idx == -1 or run_dir_idx + 1 >= len(args):
        print('Usage: python3 cross_correlation.py --run-dir <path>')
        sys.exit(1)

    run_dir = args[run_dir_idx + 1]
    result = analyze_correlation(run_dir)

    output_path = os.path.join(run_dir, 'correlation.json')
    with open(output_path, 'w') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print(f'\n📊 交叉驗證結果')
    print(f'   {result["summary"]}')
    print(f'   數據：社群 {result["data_availability"]["social_monthly_points"]} 月，搜量 {result["data_availability"]["search_monthly_points"]} 月')
    print(f'   寫入：{output_path}')
