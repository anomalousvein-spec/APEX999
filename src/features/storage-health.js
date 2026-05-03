(() => {
  'use strict';

  async function getStorageMetrics() {
    const metrics = {
      localStorageUsed: 0,
      localStorageQuota: 5 * 1024 * 1024, // Approximation
      indexedDBUsed: 0,
      quotaEstimate: null,
      quotaUsage: null,
      lastSave: localStorage.getItem('apex::last-save') || 'Unknown'
    };

    // Calculate localStorage usage
    let lsTotal = 0;
    for (let x in localStorage) {
      if (localStorage.hasOwnProperty(x)) {
        lsTotal += ((localStorage[x].length + x.length) * 2);
      }
    }
    metrics.localStorageUsed = lsTotal;

    // Quota Estimate API
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      metrics.quotaEstimate = estimate.quota;
      metrics.quotaUsage = estimate.usage;
      metrics.indexedDBUsed = estimate.usage - lsTotal; // Rough estimate
      if (metrics.indexedDBUsed < 0) metrics.indexedDBUsed = 0;
    }

    return metrics;
  }

  function getHealthStatus(metrics) {
    if (!metrics.quotaEstimate) return 'good';
    const ratio = metrics.quotaUsage / metrics.quotaEstimate;
    if (ratio > 0.9) return 'critical';
    if (ratio > 0.7) return 'warning';
    return 'good';
  }

  function formatBytes(bytes) {
    if (bytes === 0 || !bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  window.ApexStorageHealth = {
    getStorageMetrics,
    getHealthStatus,
    formatBytes
  };
})();
