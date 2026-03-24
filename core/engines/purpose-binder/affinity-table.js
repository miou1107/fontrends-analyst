'use strict';

const DIMENSIONS = [
  'social_overview', 'trend', 'language', 'platform',
  'kol', 'sentiment', 'search', 'competitor',
];

const PURPOSE_TYPES = [
  'sell-venue', 'brand-review', 'market-entry', 'kol-strategy', 'crisis-response',
];

const AFFINITY_TABLE = {
  'sell-venue': {
    social_overview: 0.5, trend: 0.9, language: 0.4, platform: 0.7,
    kol: 0.7, sentiment: 0.5, search: 0.8, competitor: 0.5,
  },
  'brand-review': {
    social_overview: 0.8, trend: 0.9, language: 0.5, platform: 0.6,
    kol: 0.5, sentiment: 0.7, search: 0.4, competitor: 0.7,
  },
  'market-entry': {
    social_overview: 0.5, trend: 0.6, language: 0.8, platform: 0.7,
    kol: 0.4, sentiment: 0.5, search: 0.9, competitor: 0.8,
  },
  'kol-strategy': {
    social_overview: 0.4, trend: 0.5, language: 0.4, platform: 0.7,
    kol: 0.9, sentiment: 0.7, search: 0.3, competitor: 0.4,
  },
  'crisis-response': {
    social_overview: 0.5, trend: 0.8, language: 0.3, platform: 0.5,
    kol: 0.7, sentiment: 0.9, search: 0.5, competitor: 0.4,
  },
};

function getAffinityWeights(purposeType) {
  if (AFFINITY_TABLE[purposeType]) return { ...AFFINITY_TABLE[purposeType] };
  const neutral = {};
  for (const dim of DIMENSIONS) neutral[dim] = 0.5;
  return neutral;
}

module.exports = { getAffinityWeights, PURPOSE_TYPES, DIMENSIONS, AFFINITY_TABLE };
