(() => {
  window.ApexLegacy = {
    state: typeof S !== 'undefined' ? S : null,
    appStart: typeof legacyStartApp === 'function' ? legacyStartApp : null,
    persist: typeof persist === 'function' ? persist : null,
    safePersist: typeof safePersist === 'function' ? safePersist : null,
    migratePools: typeof migratePools === 'function' ? migratePools : null,
    maybeRemindBackup: typeof maybeRemindBackup === 'function' ? maybeRemindBackup : null,
    renderHeader: typeof renderHeader === 'function' ? renderHeader : null,
    renderWorkout: typeof renderWorkout === 'function' ? renderWorkout : null,
    rerollAll: typeof rerollAll === 'function' ? rerollAll : null,
    renderBody: typeof renderBody === 'function' ? renderBody : null,
    renderHistory: typeof renderHistory === 'function' ? renderHistory : null,
    renderAnalytics: typeof renderAnalytics === 'function' ? renderAnalytics : null,
    renderSessions: typeof renderSessions === 'function' ? renderSessions : null,
    renderEdit: typeof renderEdit === 'function' ? renderEdit : null,
    notes: 'Snapshot of original app.js entrypoints before modular overrides load'
  };
})();
