(() => {
  function resolveRenderer(currentName, legacyName = currentName) {
    if (typeof window[currentName] === 'function') return window[currentName];
    if (typeof window.ApexLegacy?.[legacyName] === 'function') return window.ApexLegacy[legacyName];
    // Fallback if we have renderX but not initX
    if (currentName.startsWith('init')) {
      const altName = currentName.replace('init', 'render');
      if (typeof window[altName] === 'function') return window[altName];
    }
    return null;
  }

  let rendererDiagLogged = false;
  let activeTabCleanup = null;

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
      modular: typeof window[name] === 'function' || typeof window['init' + name.slice(6)] === 'function',
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
    // Run cleanup for previous tab if it exists
    if (typeof activeTabCleanup === 'function') {
      try { activeTabCleanup(); } catch (e) { console.warn('Cleanup failed', e); }
      activeTabCleanup = null;
    }

    if (tabId === 'workout') {
      callRenderer('initWorkout', 'renderWorkout');
      activeTabCleanup = window.cleanupWorkout || null;
    } else if (tabId === 'body') {
      callRenderer('initBody', 'renderBody');
      activeTabCleanup = window.cleanupBody || null;
    } else if (tabId === 'history') {
      callRenderer('initHistory', 'renderHistory');
      activeTabCleanup = window.cleanupHistory || null;
    } else if (tabId === 'analytics') {
      callRenderer('initAnalytics', 'renderAnalytics');
      activeTabCleanup = window.cleanupAnalytics || null;
    } else if (tabId === 'sessions') {
      callRenderer('initSessions', 'renderSessions');
      activeTabCleanup = window.cleanupSessions || null;
    } else if (tabId === 'edit') {
      callRenderer('initEdit', 'renderEdit');
      activeTabCleanup = window.cleanupEdit || null;
    }
  }

  function getActiveTab() {
    return document.querySelector('.ntab.active')?.dataset.tab || 'workout';
  }

  function refreshHeader() {
    callRenderer('initHeader', 'renderHeader');
  }

  function refreshWorkout() {
    if (getActiveTab() === 'workout') callRenderer('initWorkout', 'renderWorkout');
  }

  function refreshBody() {
    if (getActiveTab() === 'body') callRenderer('initBody', 'renderBody');
  }

  function refreshReview() {
    const tab = getActiveTab();
    if (tab === 'history') callRenderer('initHistory', 'renderHistory');
    if (tab === 'analytics') callRenderer('initAnalytics', 'renderAnalytics');
    if (tab === 'sessions') callRenderer('initSessions', 'renderSessions');
  }

  function refreshEdit() {
    if (getActiveTab() === 'edit') callRenderer('initEdit', 'renderEdit');
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
