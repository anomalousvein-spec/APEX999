(() => {
  function resolveRenderer(currentName, legacyName = currentName) {
    if (typeof window[currentName] === 'function') return window[currentName];
    if (typeof window.ApexLegacy?.[legacyName] === 'function') return window.ApexLegacy[legacyName];
    return null;
  }

  let rendererDiagLogged = false;

  function getRendererAvailability() {
    const rendererNames = [
      'renderHeader',
      'renderWorkout',
      'renderBody',
      'renderHistory',
      'renderAnalytics',
      'renderSessions',
      'renderEdit'
    ];

    const results = rendererNames.map(name => ({
      name,
      modular: typeof window[name] === 'function',
      legacy: typeof window.ApexLegacy?.[name] === 'function'
    }));

    return {
      results,
      missing: results.filter(r => !r.modular && !r.legacy).map(r => r.name),
      legacyOnly: results.filter(r => !r.modular && r.legacy).map(r => r.name)
    };
  }

  function logRendererAvailability() {
    if (rendererDiagLogged) return;
    rendererDiagLogged = true;
    const rendererAvailability = getRendererAvailability();
    const missing = rendererAvailability.missing;
    const legacyOnly = rendererAvailability.legacyOnly;

    if (missing.length) {
      console.warn('APEX renderer resolution missing (tab may render blank)', { missing });
    }
    if (legacyOnly.length) {
      console.info('APEX renderer resolution using legacy fallback (modular not found)', { legacyOnly });
    }
  }

  function callRenderer(currentName, legacyName) {
    resolveRenderer(currentName, legacyName)?.();
  }

  function getState() {
    return window.ApexState?.get?.() || S;
  }

  function getStateSnapshot() {
    return window.ApexState?.getSnapshot?.() || null;
  }

  function getPersistedStateSnapshot() {
    return window.ApexState?.getPersistedSnapshot?.() || null;
  }

  function hydrateBootStateFromStorage() {
    return window.ApexState?.hydrateBootStateFromStorage?.() || { changed: false, fields: {} };
  }

  function getResolvedBootSnapshot() {
    return window.ApexState?.getResolvedBootSnapshot?.() || null;
  }

  function getStorageDriftReport() {
    return window.ApexState?.getStorageDriftReport?.() || null;
  }

  function getRuntimeStatus() {
    const rendererAvailability = getRendererAvailability();
    return {
      shellReady: !!window.ApexShell?.setup,
      storage: window.ApexState?.getStorageStatus?.() || {
        enabled: !!window.ApexStorage,
        initialized: false,
        cachedKeys: 0
      },
      legacy: {
        appStart: typeof window.ApexLegacy?.appStart === 'function' || typeof window.legacyStartApp === 'function'
      },
      renderers: {
        missing: rendererAvailability.missing,
        legacyOnly: rendererAvailability.legacyOnly,
        modularCount: rendererAvailability.results.filter(r => r.modular).length,
        legacyCount: rendererAvailability.results.filter(r => r.legacy).length
      }
    };
  }

  function persist() {
    if (window.ApexState?.persist) {
      window.ApexState.persist();
      return;
    }
    safePersist();
  }

  function renderTab(tabId) {
    if (tabId === 'workout') callRenderer('renderWorkout');
    if (tabId === 'body') callRenderer('renderBody');
    if (tabId === 'history') callRenderer('renderHistory');
    if (tabId === 'analytics') callRenderer('renderAnalytics');
    if (tabId === 'sessions') callRenderer('renderSessions');
    if (tabId === 'edit') callRenderer('renderEdit');
  }

  function getActiveTab() {
    return document.querySelector('.ntab.active')?.dataset.tab || 'workout';
  }

  function refreshHeader() {
    callRenderer('renderHeader');
  }

  function refreshWorkout() {
    callRenderer('renderWorkout');
  }

  function refreshBody() {
    callRenderer('renderBody');
  }

  function refreshReview() {
    callRenderer('renderHistory');
    callRenderer('renderAnalytics');
    callRenderer('renderSessions');
  }

  function refreshEdit() {
    callRenderer('renderEdit');
  }

  function refreshActiveTab() {
    renderTab(getActiveTab());
  }

  function refreshApp() {
    refreshHeader();
    refreshActiveTab();
  }

  function start() {
    logRendererAvailability();
    if (window.ApexLegacy?.appStart) {
      try {
        refreshApp();
        if (typeof restoreRestTimerIfNeeded === 'function') restoreRestTimerIfNeeded();
        return;
      } catch (error) {
        console.warn('APEX modular runtime start fallback', error);
        window.ApexLegacy.appStart();
        return;
      }
    }
    refreshApp();
    if (typeof restoreRestTimerIfNeeded === 'function') restoreRestTimerIfNeeded();
  }

  window.ApexRuntime = {
    getState,
    getStateSnapshot,
    getPersistedStateSnapshot,
    hydrateBootStateFromStorage,
    getResolvedBootSnapshot,
    getStorageDriftReport,
    getRuntimeStatus,
    persist,
    renderTab,
    getActiveTab,
    refreshHeader,
    refreshWorkout,
    refreshBody,
    refreshReview,
    refreshEdit,
    refreshActiveTab,
    refreshApp,
    start
  };
})();
