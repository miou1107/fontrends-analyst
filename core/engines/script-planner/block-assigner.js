'use strict';

function assignBlocks(dimension, analysisDimId = '', recommendations = [], snapshot) {
  const sigThreshold = snapshot?.get?.('thresholds.scoring.significant_change') ?? 10;
  const blocks = [];
  const excluded = [];

  blocks.push('data_table');

  const hasInsights = (dimension.insights || []).length > 0;
  if (hasInsights) {
    blocks.push('insight_block');
    blocks.push('so_what');
  } else {
    excluded.push('insight_block');
    excluded.push('so_what');
  }

  const hasMatchingRec = recommendations.some(r =>
    (r.linked_dimensions || []).includes(analysisDimId)
  );
  if (hasMatchingRec) {
    blocks.push('action_link');
  } else {
    excluded.push('action_link');
  }

  if ((dimension.anomalies || []).length > 0) {
    blocks.push('anomaly_callout');
  } else {
    excluded.push('anomaly_callout');
  }

  let hasSignificantChange = false;
  const mom = dimension.self_comparison?.mom;
  if (mom && typeof mom === 'object') {
    for (const val of Object.values(mom)) {
      if (val && typeof val.change_pct === 'number' && Math.abs(val.change_pct) > sigThreshold) {
        hasSignificantChange = true;
        break;
      }
    }
  }
  if (hasSignificantChange) {
    blocks.push('self_comparison_note');
  } else {
    excluded.push('self_comparison_note');
  }

  if (dimension.competitor_comparison != null) {
    blocks.push('competitor_note');
  } else {
    excluded.push('competitor_note');
  }

  return { blocks, excluded_blocks: excluded };
}

module.exports = { assignBlocks };
