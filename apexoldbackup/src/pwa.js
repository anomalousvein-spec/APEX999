(() => {
  'use strict';

  if (!('serviceWorker' in navigator)) return;

  function checkForAppUpdate() {
    navigator.serviceWorker.getRegistration()
      .then(reg => reg?.update().catch(() => {}))
      .catch(() => {});
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then(reg => {
        reg.update().catch(() => {});
      })
      .catch(() => {});
  });

  window.addEventListener('online', checkForAppUpdate);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkForAppUpdate();
  });

  window.ApexPwa = { checkForAppUpdate };
})();
