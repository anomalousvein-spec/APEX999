(() => {
  'use strict';

  let started = false;
  let runtimeStatusLogged = false;
  const STORAGE_BOOT_TIMEOUT_MS = 250;

  function installGlobalErrorHandlers() {
    if (window.__apexGlobalErrorHandlers) return;
    window.__apexGlobalErrorHandlers = true;
    window.addEventListener('error', event => {
      console.warn('APEX uncaught error', event.error || event.message, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
    });
    window.addEventListener('unhandledrejection', event => {
      console.warn('APEX unhandled rejection', event.reason);
    });
  }

  installGlobalErrorHandlers();

  function startLegacyApp() {
    if (window.ApexLegacy?.appStart) {
      window.ApexLegacy.appStart();
      return;
    }
    if (typeof window.legacyStartApp === 'function') {
      window.legacyStartApp();
    }
  }

  function warmBootStorage() {
    if (!window.ApexState?.initStorage) return Promise.resolve();
    return Promise.race([
      window.ApexState.initStorage(),
      new Promise(resolve => setTimeout(resolve, STORAGE_BOOT_TIMEOUT_MS))
    ]).catch(error => {
      console.warn('APEX boot storage warmup fallback', error);
    });
  }

  function logRuntimeStatus(stage) {
    if (runtimeStatusLogged) return;
    const status = window.ApexRuntime?.getRuntimeStatus?.();
    if (!status) return;
    runtimeStatusLogged = true;
    console.info(`APEX runtime status (${stage})`, status);
  }

  async function startApp() {
    if (started) return;
    started = true;
    window.ApexShell?.setup?.();
    await warmBootStorage();
    const hydratedBoot = window.ApexRuntime?.hydrateBootStateFromStorage?.();
    if (hydratedBoot?.changed) {
      console.info('APEX boot state hydrated from persisted storage', hydratedBoot);
    }
    if (window.ApexRuntime?.start) {
      window.ApexRuntime.start();
      logRuntimeStatus('post-start');
      window.ApexState?.initStorage?.().then(() => {
        const resolvedBoot = window.ApexRuntime?.getResolvedBootSnapshot?.();
        if (resolvedBoot && Object.values(resolvedBoot.sources || {}).includes('persisted')) {
          console.info('APEX boot snapshot used persisted storage fallback', resolvedBoot);
        }
        const drift = window.ApexRuntime?.getStorageDriftReport?.();
        if (drift && !drift.inSync) {
          console.warn('APEX storage drift detected', drift);
        }
      });
      return;
    }
    startLegacyApp();
    logRuntimeStatus('legacy-start');
    window.ApexState?.initStorage?.().then(() => {
      const resolvedBoot = window.ApexRuntime?.getResolvedBootSnapshot?.();
      if (resolvedBoot && Object.values(resolvedBoot.sources || {}).includes('persisted')) {
        console.info('APEX boot snapshot used persisted storage fallback', resolvedBoot);
      }
      const drift = window.ApexRuntime?.getStorageDriftReport?.();
      if (drift && !drift.inSync) {
        console.warn('APEX storage drift detected', drift);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp, {once:true});
    return;
  }

  startApp();
})();
