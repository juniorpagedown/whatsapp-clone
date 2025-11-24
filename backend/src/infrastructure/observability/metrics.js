// src/infrastructure/observability/metrics.js
/**
 * Implementação simples de métricas em memória.
 * Mantém histogramas (count/sum/min/max) e contadores numéricos.
 */
const histograms = new Map();
const counters = new Map();

const getHistogram = (name) => {
  if (!histograms.has(name)) {
    histograms.set(name, {
      count: 0,
      sum: 0,
      min: null,
      max: null
    });
  }
  return histograms.get(name);
};

const observeHistogram = (name, value) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return;
  }

  const histogram = getHistogram(name);
  histogram.count += 1;
  histogram.sum += value;
  histogram.min = histogram.min === null ? value : Math.min(histogram.min, value);
  histogram.max = histogram.max === null ? value : Math.max(histogram.max, value);
};

const incrementCounter = (name, value = 1) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return;
  }

  const current = counters.get(name) || 0;
  counters.set(name, current + value);
};

const getMetricsSnapshot = () => {
  const histogramSnapshot = {};
  histograms.forEach((value, key) => {
    histogramSnapshot[key] = { ...value };
  });

  const counterSnapshot = {};
  counters.forEach((value, key) => {
    counterSnapshot[key] = value;
  });

  return {
    histograms: histogramSnapshot,
    counters: counterSnapshot
  };
};

module.exports = {
  observeHistogram,
  incrementCounter,
  getMetricsSnapshot
};
