(() => {
  'use strict';

  let activePool = 'day1';
  const poolOpen = {};

  function getS() {
    return window.ApexState?.get() || window.S;
  }

  function refreshEditView() {
    if (window.ApexRuntime?.refreshEdit) {
      window.ApexRuntime.refreshEdit();
    } else {
      renderEdit();
    }
  }

  function refreshWorkoutView() {
    if (window.ApexRuntime?.refreshWorkout) window.ApexRuntime.refreshWorkout();
  }

  function refreshReviewView() {
    if (window.ApexRuntime?.refreshReview) window.ApexRuntime.refreshReview();
  }

  function refreshBodyView() {
    if (window.ApexRuntime?.refreshBody) window.ApexRuntime.refreshBody();
  }

  function renderActiveTabView() {
    if (window.ApexRuntime?.refreshActiveTab) window.ApexRuntime.refreshActiveTab();
  }

  async function renderEdit() {
    const S = getS();
    const el = document.getElementById('tab-edit');
    if (!el) return;

    const poolSections = {
      day1: Object.entries(S.pools.day1).map(([key, meta]) => ({ key, label: CAT_LABELS[key] || key, pool: meta.pool })),
      day2: Object.entries(S.pools.day2).map(([key, meta]) => ({ key, label: CAT_LABELS[key] || key, pool: meta.pool })),
      shared: Object.entries(S.pools.shared).map(([key, meta]) => ({ key, label: CAT_LABELS[key] || key, pool: meta.pool }))
    };

    let html = `<div class="pool-tabs">
      ${['day1', 'day2', 'shared'].map(tab =>
        `<button class="ptab${activePool === tab ? ' active' : ''}" onclick="switchPool('${tab}')">${tab === 'day1' ? 'Day 1' : tab === 'day2' ? 'Day 2' : 'Shared'}</button>`
      ).join('')}
    </div>`;

    poolSections[activePool].forEach(({ key, label, pool }) => {
      const uid = key.replace(/[^a-zA-Z0-9]/g, '_');
      const open = !!poolOpen[key];
      html += `<div class="pool-cat">
        <div class="pool-cat-hdr${open ? ' open' : ''}" onclick="togglePoolCat('${key}', '${uid}')">
          <span class="pool-cat-title">${label}</span>
          <span class="pool-cat-cnt">${pool.length}</span>
        </div>
        <div class="pool-body${open ? ' open' : ''}" id="pb-${uid}">
          ${pool.map((ex, i) => `<div class="pool-row">
            <div class="pool-reorder">
              <button class="pool-mv" onclick="movePoolEx('${activePool}', '${key}', ${i}, -1, '${uid}')" ${i === 0 ? 'disabled' : ''}>^</button>
              <button class="pool-mv" onclick="movePoolEx('${activePool}', '${key}', ${i}, 1, '${uid}')" ${i === pool.length - 1 ? 'disabled' : ''}>v</button>
            </div>
            <input class="pool-inp" value="${escapeHtml(ex)}"
              onchange="updatePoolEx('${activePool}', '${key}', ${i}, this.value)">
            <button class="pool-del" onclick="delPoolEx('${activePool}', '${key}', ${i})"
              ${pool.length <= 1 ? ' disabled' : ''}>X</button>
          </div>`).join('')}
          <button class="pool-add" onclick="addPoolEx('${activePool}', '${key}', '${uid}')">+ Add Exercise</button>
        </div>
      </div>`;
    });

    const storageStatus = window.ApexState?.getStorageStatus() || { enabled: false, initialized: false, initializing: false, mode: 'idle', cachedKeys: 0 };
    const driftReport = window.ApexState?.getStorageDriftReport() || { inSync: true, mismatches: [] };
    const storageLabel = !storageStatus.enabled
      ? 'Unavailable'
      : storageStatus.initialized
        ? 'Ready'
        : storageStatus.initializing
          ? 'Initializing...'
          : storageStatus.mode === 'fallback'
            ? 'Fallback Active'
            : 'Idle';
    const storageClass = storageStatus.initialized ? 'good' : 'warn';

    // Phase 3: Detailed Storage Metrics
    const metrics = typeof window.ApexStorageHealth?.getStorageMetrics === 'function'
      ? await window.ApexStorageHealth.getStorageMetrics()
      : null;
    const health = metrics ? window.ApexStorageHealth.getHealthStatus(metrics) : 'good';
    const format = window.ApexStorageHealth?.formatBytes || (b => b);

    html += `
      <div class="edit-section">
        <div class="edit-section-hdr">Storage Health <span class="health-pill ${health}">${health.toUpperCase()}</span></div>
        <div class="storage-grid">
          <div class="storage-stat">
            <div class="storage-k">IndexedDB</div>
            <div class="storage-v ${storageClass}">${storageLabel}</div>
          </div>
          <div class="storage-stat">
            <div class="storage-k">Cached Keys</div>
            <div class="storage-v">${storageStatus.cachedKeys}</div>
          </div>
          <div class="storage-stat">
            <div class="storage-k">Sync Status</div>
            <div class="storage-v ${driftReport.inSync ? 'good' : 'warn'}">${driftReport.inSync ? 'In Sync' : 'Drift Detected'}</div>
          </div>
        </div>
        ${metrics ? `
        <div class="metrics-grid" style="margin-top:12px; display:grid; grid-template-columns: 1fr 1fr; gap:8px; font-size:12px;">
          <div class="metric-item">LS Used: <strong>${format(metrics.localStorageUsed)}</strong></div>
          <div class="metric-item">IDB Used: <strong>${format(metrics.indexedDBUsed)}</strong></div>
          ${metrics.quotaEstimate ? `<div class="metric-item" style="grid-column: span 2">Total Usage: <strong>${format(metrics.quotaUsage)}</strong> of <strong>${format(metrics.quotaEstimate)}</strong></div>` : ''}
        </div>
        ` : ''}
        ${!driftReport.inSync ? `
          <div class="drift-list">
            ${driftReport.mismatches.map(m => `<div class="drift-item"><span>${m.key}</span>: Live ${m.live} vs Storage ${m.persisted}</div>`).join('')}
          </div>
        ` : ''}
        <div class="storage-actions">
          <button class="pa pa-reconcile" onclick="reconcileSessions()" title="Merge missing sessions between memory and storage">Reconcile Sessions</button>
          <button class="pa pa-sync" onclick="forceSyncAll()" title="Force a full overwrite of storage with current memory state">Force Sync to Storage</button>
        </div>
      </div>
    `;

    html += `<div class="pool-actions">
      <button class="pa pa-save" onclick="savePools()">Save Changes</button>
      <div class="pa-row">
        <button class="pa pa-io" onclick="exportData()">Export JSON</button>
        <button class="pa pa-io" onclick="document.getElementById('importFile').click()">Import JSON</button>
      </div>
      <button class="pa pa-reset" onclick="resetPools()">Reset to Defaults</button>
      <button class="pa pa-erase" onclick="eraseAllData()">Erase All Data</button>
      <div class="edit-footnote">APEX v${APP_VERSION} - Backup reminder every ${BACKUP_REMINDER_EVERY} completed workouts</div>
    </div>`;

    el.innerHTML = html;
  }

  function movePoolEx(pool, cat, i, dir, uid) {
    const S = getS();
    const target = pool === 'shared' ? S.pools.shared[cat] : S.pools[pool][cat];
    const list = target?.pool;
    if (!Array.isArray(list)) return;
    const nextIndex = i + dir;
    if (nextIndex < 0 || nextIndex >= list.length) return;
    [list[i], list[nextIndex]] = [list[nextIndex], list[i]];
    poolOpen[cat] = true;
    if (window.safePersist) window.safePersist();
    refreshEditView();
  }

  function switchPool(tab) {
    activePool = tab;
    refreshEditView();
  }

  function togglePoolCat(key, uid) {
    poolOpen[key] = !poolOpen[key];
    refreshEditView();
  }

  function updatePoolEx(pool, cat, i, val) {
    const section = pool === 'shared' ? 'shared' : pool;
    if (window.ApexState?.updatePoolExercise) {
      window.ApexState.updatePoolExercise(section, cat, i, val);
    }
  }

  function delPoolEx(pool, cat, i) {
    const S = getS();
    const section = pool === 'shared' ? 'shared' : pool;
    const target = pool === 'shared' ? S.pools.shared[cat] : S.pools[pool][cat];
    const list = target?.pool;
    if (!Array.isArray(list) || list.length <= 1) {
      showToast('Need at least 1 exercise', 'warn');
      return;
    }

    if (window.ApexState?.deletePoolExercise) {
      window.ApexState.deletePoolExercise(section, cat, i).then(() => {
        refreshEditView();
      });
    }
  }

  function addPoolEx(pool, cat, uid) {
    const section = pool === 'shared' ? 'shared' : pool;
    const exerciseName = 'New Exercise';
    if (window.ApexState?.addPoolExercise) {
      window.ApexState.addPoolExercise(section, cat, exerciseName).then(() => {
        poolOpen[cat] = true;
        refreshEditView();
        setTimeout(() => {
          const inputs = document.querySelectorAll(`#pb-${uid} .pool-inp`);
          if (inputs.length) inputs[inputs.length - 1].focus();
        }, 40);
      });
    }
  }

  function savePools() {
    if (window.ApexState?.persistPoolsState) {
      window.ApexState.persistPoolsState();
    }
    if (window.ApexState?.update) {
      window.ApexState.update('workouts', { '1': null, '2': null });
    }
    refreshWorkoutView();
    showToast('Pools saved');
  }

  function resetPools() {
    showModal(
      'Reset to Defaults?',
      'This restores all exercise pools to defaults and clears workouts.',
      () => {
        const nextPools = JSON.parse(JSON.stringify(DP));
        const nextWorkouts = { '1': null, '2': null };
        const nextLocks = { '1': {}, '2': {} };

        if (window.ApexState?.update) {
          window.ApexState.update('pools', nextPools, { persist: false });
          window.ApexState.update('workouts', nextWorkouts, { persist: false });
          window.ApexState.update('locks', nextLocks);
        }
        if (window.migratePools) window.migratePools();
        refreshEditView();
        refreshWorkoutView();
        showToast('Reset complete');
      }
    );
  }

  function eraseAllData() {
    const confirmText = prompt('Type "yes" to permanently erase all sessions, exercise history, body measurements, prefill data, and notes.');
    if (!confirmText || confirmText.trim().toLowerCase() !== 'yes') return;

    const emptyDayMap = () => ({ '1': {}, '2': {} });
    const emptyNotesMap = () => ({ '1': '', '2': '' });
    const nextBodyMetrics = typeof window.defaultBodyMetrics === 'function' ? window.defaultBodyMetrics() : null;

    if (window.ApexState?.update) {
      window.ApexState.update('sessions', [], { persist: false });
      window.ApexState.update('exHist', {}, { persist: false });
      window.ApexState.update('prefill', emptyDayMap(), { persist: false });
      window.ApexState.update('notes', emptyNotesMap(), { persist: false });
      window.ApexState.update('workouts', { '1': null, '2': null }, { persist: false });
      window.ApexState.update('pins', { '1': {}, '2': {} }, { persist: false });
      window.ApexState.update('recentEx', { '1': {}, '2': {} }, { persist: false });
      window.ApexState.update('restTimer', null, { persist: false });
      window.ApexState.update('startTime', null, { persist: false });
      window.ApexState.update('_activeSessionId', null, { persist: false });
      window.ApexState.update('bodyMetrics', nextBodyMetrics);
    }

    if (window.generateWorkout) {
      window.generateWorkout(1);
      window.generateWorkout(2);
    }
    if (window.ApexRuntime?.refreshHeader) window.ApexRuntime.refreshHeader();
    renderActiveTabView();

    showToast('All training data erased');
  }

  function exportData() {
    const S = getS();
    const data = {
      version: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '1.0',
      pools: S.pools,
      exHist: S.exHist,
      sessions: S.sessions,
      pins: S.pins,
      curBlock: S.curBlock,
      curWeek: S.curWeek,
      currentDay: S.currentDay,
      workouts: S.workouts,
      locks: S.locks,
      prefill: S.prefill,
      notes: S.notes,
      restTimes: S.restTimes,
      restTimer: S.restTimer,
      recentEx: S.recentEx,
      startTime: S.startTime,
      _activeSessionId: S._activeSessionId,
      bodyMetrics: S.bodyMetrics,
      exerciseAnchors: S.exerciseAnchors
    };
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    link.download = `apex-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('Exported');
  }

  function handleImportFileChange(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = loadEvent => {
      try {
        if (window._clearRestTimer) window._clearRestTimer({ clearPersisted: false });
        const raw = JSON.parse(loadEvent.target.result);
        const warnings = typeof window.getImportWarnings === 'function' ? window.getImportWarnings(raw) : [];
        if (warnings.length) {
          const proceed = confirm(`Import warnings:\n\n${warnings.join('\n')}\n\nProceed with fallback values for the invalid sections?`);
          if (!proceed) {
            event.target.value = '';
            showToast('Import cancelled', 'warn');
            return;
          }
        }

        const data = typeof window.sanitizeImportedState === 'function' ? window.sanitizeImportedState(raw) : raw;
        if (window.ApexState?.update) {
          Object.keys(data).forEach(key => {
            window.ApexState.update(key, data[key], { persist: false });
          });
          if (window.ApexState.persist) window.ApexState.persist();
        }
        if (window.migratePools) window.migratePools();
        if (window.ApexRuntime?.refreshHeader) window.ApexRuntime.refreshHeader();
        refreshWorkoutView();
        refreshEditView();
        refreshReviewView();
        refreshBodyView();
        showToast(warnings.length ? 'Imported with warnings' : 'Imported', warnings.length ? 'warn' : '');
      } catch (err) {
        console.error('Import failed', err);
        showToast('Invalid file', 'warn');
      }
    };

    reader.readAsText(file);
    event.target.value = '';
  }

  function setupEditFeature() {
    const importFile = document.getElementById('importFile');
    if (importFile) importFile.onchange = handleImportFileChange;
  }

  window.renderEdit = renderEdit;
  window.initEdit = renderEdit;
  window.cleanupEdit = () => {};
  window.movePoolEx = movePoolEx;
  window.switchPool = switchPool;
  window.togglePoolCat = togglePoolCat;
  window.updatePoolEx = updatePoolEx;
  window.delPoolEx = delPoolEx;
  window.addPoolEx = addPoolEx;
  window.savePools = savePools;
  window.resetPools = resetPools;
  window.eraseAllData = eraseAllData;
  window.exportData = exportData;

  window.reconcileSessions = function() {
    if (!window.ApexState?.reconcileSessions) return;
    window.ApexState.reconcileSessions().then(result => {
      if (result.addedToMemory > 0 || result.addedToStorage > 0) {
        showToast(`Reconciled: ${result.addedToMemory} restored, ${result.addedToStorage} synced`);
        refreshEditView();
        if (window.ApexRuntime?.refreshReview) window.ApexRuntime.refreshReview();
      } else {
        showToast('Sessions already in sync');
      }
    }).catch(err => {
      console.error('Reconciliation failed', err);
      showToast('Reconciliation failed', 'warn');
    });
  };

  window.forceSyncAll = function() {
    if (!window.ApexState?.forceSyncToIndexedDB) return;
    showModal(
      'Force Sync to Storage?',
      'This will overwrite the data in IndexedDB with your current session data. Use this if you see persistent drift. Continue?',
      async () => {
        try {
          await window.ApexState.forceSyncToIndexedDB();
          showToast('Storage synchronized');
          refreshEditView();
        } catch (err) {
          console.error('Sync failed', err);
          showToast('Sync failed', 'warn');
        }
      }
    );
  };

  setupEditFeature();
})();
