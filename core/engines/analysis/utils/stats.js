'use strict';

function mean(arr) {
  if (!arr || arr.length === 0) return null;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stddev(arr) {
  if (!arr || arr.length === 0) return null;
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function zScore(value, arr) {
  if (!arr || arr.length === 0) return null;
  const m = mean(arr);
  const sd = stddev(arr);
  if (sd === 0) return null;
  return (value - m) / sd;
}

function percentile(arr, p) {
  if (!arr || arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

function pearson(arrA, arrB) {
  if (!arrA || !arrB) return null;
  if (arrA.length !== arrB.length) return null;
  if (arrA.length < 5) return null;
  const n = arrA.length;
  const mA = mean(arrA);
  const mB = mean(arrB);
  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < n; i++) {
    const dA = arrA[i] - mA;
    const dB = arrB[i] - mB;
    num += dA * dB;
    denA += dA * dA;
    denB += dB * dB;
  }
  const den = Math.sqrt(denA * denB);
  if (den === 0) return null;
  return num / den;
}

function iqr(arr) {
  if (!arr || arr.length === 0) return null;
  const q1 = percentile(arr, 25);
  const q3 = percentile(arr, 75);
  const iqrVal = q3 - q1;
  return {
    q1, q3, iqr: iqrVal,
    lowerFence: q1 - 1.5 * iqrVal,
    upperFence: q3 + 1.5 * iqrVal,
    median: percentile(arr, 50),
  };
}

function changePct(current, previous) {
  if (current === null || current === undefined) return null;
  if (previous === null || previous === undefined) return null;
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function direction(changePctVal, threshold = 1) {
  if (changePctVal === null || changePctVal === undefined) return null;
  if (changePctVal > threshold) return 'up';
  if (changePctVal < -threshold) return 'down';
  return 'flat';
}

function multiplier(a, b) {
  if (b === 0 || b === null || b === undefined) return null;
  return a / b;
}

module.exports = {
  mean, stddev, zScore, percentile, pearson, iqr,
  changePct, direction, multiplier,
};
