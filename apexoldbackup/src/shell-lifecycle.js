(() => {
  'use strict';

  let shellReady = false;
  let shellDiagLogged = false;

  function logShellWiringAvailability() {
    if (shellDiagLogged) return;
    shellDiagLogged = true;

    const issues = [];

    if (typeof setupShellUi !== 'function') issues.push('setupShellUi');
    if (typeof switchTab !== 'function') issues.push('switchTab');

    if (issues.length) {
      console.warn('APEX shell wiring missing (some UI interactions may fall back/skip)', {
        missing: issues
      });
    }
  }

  function setup() {
    if (shellReady) return;
    logShellWiringAvailability();
    if (typeof setupShellUi === 'function') setupShellUi();
    shellReady = true;
  }

  window.ApexShell = {
    setup,
    switchTab(id) {
      if (typeof switchTab === 'function') switchTab(id);
    }
  };
})();
