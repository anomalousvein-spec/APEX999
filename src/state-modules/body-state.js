(() => {
  'use strict';

  async function persistBodyMetrics(S, nextBodyMetrics, { normalizeBodyMetricsValue, safePersist }) {
    const body = normalizeBodyMetricsValue(nextBodyMetrics);
    S.bodyMetrics = body;
    if (window.ApexStorage?.set) {
      await window.ApexStorage.set('lbm', body);
    }
    if (window.ApexStorage?.flush) await window.ApexStorage.flush();
    safePersist();
    return S.bodyMetrics;
  }

  window.ApexBodyState = {
    persistBodyMetrics
  };
})();
