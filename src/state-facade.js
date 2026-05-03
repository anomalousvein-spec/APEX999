(() => {
  'use strict';

  let storageInitPromise = null;
  let storageInitState = 'idle';

  // ══════════════════════════════════════════════════════
  // HELPERS (Local to facade)
  // ══════════════════════════════════════════════════════
  function LS(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch (e) { return d; }
  }

  function SS(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {}
  }

  // ══════════════════════════════════════════════════════
  // STATE INITIALIZATION
  // ══════════════════════════════════════════════════════
  const S = {
    pools: LS('lp', null),
    currentDay: LS('lcd', 1),
    workouts: LS('lwo', { '1': null, '2': null }),
    locks: LS('llk', { '1': {}, '2': {} }),
    pins: LS('lpi', { '1': {}, '2': {} }),
    curBlock: LS('lbl', 1),
    curWeek: LS('lwk', '1'),
    exHist: LS('leh', {}),
    sessions: LS('lsh', []),
    startTime: LS('lst', null),
    _activeSessionId: LS('_sid', null),
    prefill: LS('lpf', { '1': {}, '2': {} }),
    notes: LS('lnt', { '1': '', '2': '' }),
    restTimes: LS('lrt', { '1': {}, '2': {} }),
    restTimer: LS('lrtm', null),
    recentEx: LS('lrx', { '1': {}, '2': {} }),
    bodyMetrics: LS('lbm', null),
    exerciseAnchors: LS('lea', {})
  };

  const DP = {
    shared:{
      warmUp:       {reps:'5 min',  group:'warmUp',          pool:['Elliptical','Steep Incline Treadmill','Stair Master','Recumbent Bike']},
      rearSideDelts:{reps:'12-20',  group:'rearSideDelts',   pool:['Cable Lateral Raise','Dumbbell Lateral Raise','Cable Upright Row','EZ Bar Upright Row','Cable Face Pull','Cable Reverse Fly','Machine Reverse Fly']},
      accessory:    {reps:'12-15',  group:'accessory',       pool:['Calf Press Machine','Ab Twist Machine','Back Extension Machine','Captains Chair Knee Raise','Hip Abductor','Hip Adductor','Calf Press on LP Machine','Smith Machine Overhead Press']}
    },
    day1:{
      verticalBack:  {reps:'10-12', group:'verticalBack',    dual:false, pool:['Lat Pulldown Machine (Yellow)','Lat Pulldown Machine (Purple)','Cable Lat Pulldown','Cable Lat Pulldown (Supinated Grip)','Assisted Pull Ups','Dumbbell Pullover (Lat Focused)','Cable Lat Prayers']},
      horizontalBack:{reps:'10-12', group:'horizontalBack',  dual:false, pool:['Cable Flexion Row','Machine Row (Yellow)','Machine Row (Purple)']},
      biceps:        {reps:'12-15', group:'biceps',          dual:true,  pool:['Flat Bench Curls','Incline Bench Curls','Dumbbell Twist Curls','Machine Curl','Heavy Dumbbell Curls']},
      quads:         {reps:'8-12',  group:'quads',           dual:true,  pool:['Leg Extension Machine','Machine Leg Press','Plate Leg Press','Hack Squat','Smith Machine Squat']}
    },
    day2:{
      inclineChest:  {reps:'8-12',  group:'inclineChest',    dual:false, pool:['Smith Incline Press','Dumbbell Incline Press','Dumbbell Incline Fly']},
      horizontalChest:{reps:'8-12', group:'horizontalChest', dual:false, pool:['Smith Machine Press','Dumbbell Press','Deficit Pushups','Machine Press (Yellow)','Machine Press (Purple)','Chest Fly Machine']},
      triceps:       {reps:'10-15', group:'triceps',         dual:true,  pool:['Smith Skull Crusher','Cable Tricep Pushdown','Dumbbell Tricep Extension','Assisted Dips','Dip Machine','Tricep Extension Machine']},
      hamstrings:    {reps:'10-12', group:'hamstrings',      dual:true,  pool:['Leg Curl Machine','Smith Machine Good Mornings','Hyper Extensions']}
    }
  };

  const CAT_LABELS = {
    warmUp:'Warm Up', verticalBack:'Vertical Back', horizontalBack:'Horizontal Back',
    biceps:'Biceps', quads:'Quads', inclineChest:'Incline Chest',
    horizontalChest:'Horizontal Chest', triceps:'Triceps', hamstrings:'Hamstrings',
    rearSideDelts:'Rear / Side Delts', accessory:'Accessory'
  };

  const VALID_DAYS = new Set([1, 2]);
  const VALID_BLOCKS = new Set([1, 2]);
  const VALID_WEEKS = new Set(['1', '2', '3', '4', 'deload']);

  // ══════════════════════════════════════════════════════
  // DOMAIN DELEGATION UTILS
  // ══════════════════════════════════════════════════════
  const utils = {
    get isPlainObject() { return window.ApexSharedStateUtils.isPlainObject; },
    get isDayKeyedStringMap() { return window.ApexSharedStateUtils.isDayKeyedStringMap; },
    get isDayKeyedObjectMap() { return window.ApexSharedStateUtils.isDayKeyedObjectMap; },
    get isEmptyDayKeyedStringMap() { return window.ApexSharedStateUtils.isEmptyDayKeyedStringMap; },
    get hasNonEmptyDayKeyedStringMap() { return window.ApexSharedStateUtils.hasNonEmptyDayKeyedStringMap; },
    get isEmptyDayKeyedObjectMap() { return window.ApexSharedStateUtils.isEmptyDayKeyedObjectMap; },
    get hasEntriesDayKeyedObjectMap() { return window.ApexSharedStateUtils.hasEntriesDayKeyedObjectMap; },
    get DAY_KEYS() { return window.ApexSharedStateUtils.DAY_KEYS; },
    normalizeBodyMetricsValue: (v) => (typeof window.normalizeBodyMetrics === 'function' ? window.normalizeBodyMetrics(v) : v),
    normalizeRestTimerValue: (v) => (typeof window.normalizeRestTimer === 'function' ? window.normalizeRestTimer(v) : v),
    safePersist: () => safePersist(),
    syncExerciseHistoryEntry: (slot, li) => syncExerciseHistoryEntry(slot, li),
    syncSlotHistoryEntries: (slot) => syncSlotHistoryEntries(slot),
    mergeExerciseHistoryEntries: (p, s) => mergeExerciseHistoryEntries(p, s),
    mergePrefillSets: (p, s) => mergePrefillSets(p, s),
    persistSessionsState: () => persistSessionsState(),
    persistPoolsState: () => window.ApexState.persistPoolsState(),
    renameExercise: (o, n) => window.ApexState.renameExercise(o, n),
    recordCompletedExercisesAsRecent: (dk, w) => (typeof window.recordCompletedExercisesAsRecent === 'function' && window.recordCompletedExercisesAsRecent(dk, w)),
    clearPrefillForExercise: (dk, ex) => (typeof window.clearPrefillForExercise === 'function' && window.clearPrefillForExercise(dk, ex))
  };

  // ══════════════════════════════════════════════════════
  // STORAGE & PERSISTENCE (Core logic kept in facade)
  // ══════════════════════════════════════════════════════
  function buildLegacyStorageEntries() {
    return {
      lp: S.pools, lcd: S.currentDay, lwo: S.workouts, llk: S.locks, lpi: S.pins,
      lbl: S.curBlock, lwk: S.curWeek, leh: S.exHist, lsh: S.sessions,
      lst: S.startTime, _sid: S._activeSessionId || null, lpf: S.prefill,
      lnt: S.notes, lrt: S.restTimes, lrtm: S.restTimer, lrx: S.recentEx,
      lbm: S.bodyMetrics, lea: S.exerciseAnchors
    };
  }

  function mirrorToStorage() {
    if (!window.ApexStorage) return null;
    if (typeof window.ApexStorage.setMany === 'function') {
      return window.ApexStorage.setMany(buildLegacyStorageEntries());
    }
    const entries = buildLegacyStorageEntries();
    Object.keys(entries).forEach(key => window.ApexStorage.set?.(key, entries[key]));
    return window.ApexStorage.getCacheSnapshot?.() || null;
  }

  function safePersist() {
    try {
      const entries = buildLegacyStorageEntries();
      for (const [k, v] of Object.entries(entries)) { SS(k, v); }
      return true;
    } catch (e) {
      const isQuota = e.name === 'QuotaExceededError' || String(e?.message || '').toLowerCase().includes('quota');
      if (isQuota && typeof window.showToast === 'function') window.showToast('Storage nearly full', 'warn');
      return false;
    }
  }

  async function persistSessionsState() {
    const entries = buildLegacyStorageEntries();
    if (typeof window.ApexStorage?.setMany === 'function') {
      await window.ApexStorage.setMany(entries);
    } else if (window.ApexStorage?.set) {
      for (const [k, v] of Object.entries(entries)) { await window.ApexStorage.set(k, v); }
    }
    if (window.ApexStorage?.flush) await window.ApexStorage.flush();
    safePersist();
  }

  // ══════════════════════════════════════════════════════
  // HISTORY HELPERS (Kept here as they are tightly coupled to state shape)
  // ══════════════════════════════════════════════════════
  function upsertExerciseHistoryEntry(exName, entry) {
    if (!S.exHist[exName]) S.exHist[exName] = [];
    const history = S.exHist[exName];
    const idx = history.findIndex(item =>
      item.sessionId === entry.sessionId && item.slotId === entry.slotId && item.setIdx === entry.setIdx
    );
    if (idx >= 0) history[idx] = entry;
    else history.push(entry);
  }

  function removeExerciseHistoryEntry(exName, sessionId, slotId, setIdx) {
    if (!S.exHist[exName]) return;
    S.exHist[exName] = S.exHist[exName].filter(e =>
      !(e.sessionId === sessionId && e.slotId === slotId && e.setIdx === setIdx)
    );
    if (!S.exHist[exName].length) delete S.exHist[exName];
  }

  function clearSlotHistoryEntries(slot, sessionId = S._activeSessionId || '') {
    if (!slot || slot.isWarmup || !sessionId) return;
    const slotId = slot.id || '';
    if (!slotId || !S.exHist[slot.exercise]?.length) return;
    S.exHist[slot.exercise] = S.exHist[slot.exercise].filter(entry =>
      !(entry.sessionId === sessionId && entry.slotId === slotId)
    );
    if (!S.exHist[slot.exercise].length) delete S.exHist[slot.exercise];
  }

  function syncExerciseHistoryEntry(slot, li) {
    if (!slot || slot.isWarmup) return;
    const sessionId = S._activeSessionId || '';
    const slotId = slot.id || '';
    if (!sessionId || !slotId) return;
    const log = slot.sets?.[li];
    removeExerciseHistoryEntry(slot.exercise, sessionId, slotId, li);
    if (!log?.done) return;
    const metrics = typeof getLoggedSetMetrics === 'function' ? getLoggedSetMetrics(slot.exercise, log) : null;
    if (!metrics) return;
    upsertExerciseHistoryEntry(slot.exercise, {
      date: new Date().toISOString().slice(0,10),
      sessionId, slotId, setIdx: li, setNum: li + 1,
      weight: metrics.weight, reps: metrics.reps, volume: metrics.volume, repOnly: metrics.repOnly
    });
  }

  function syncSlotHistoryEntries(slot) {
    if (!slot || slot.isWarmup) return;
    clearSlotHistoryEntries(slot);
    (slot.sets || []).forEach((_, li) => syncExerciseHistoryEntry(slot, li));
  }

  function sortExerciseHistoryEntries(entries) {
    return [...entries].sort((a, b) => {
      const dateCmp = String(a?.date || '').localeCompare(String(b?.date || ''));
      if (dateCmp) return dateCmp;
      const sessionCmp = String(a?.sessionId || '').localeCompare(String(b?.sessionId || ''));
      if (sessionCmp) return sessionCmp;
      const slotCmp = String(a?.slotId || '').localeCompare(String(b?.slotId || ''));
      if (slotCmp) return slotCmp;
      return (Number(a?.setIdx) || 0) - (Number(b?.setIdx) || 0);
    });
  }

  function mergeExerciseHistoryEntries(primary = [], secondary = []) {
    const seen = new Set();
    return sortExerciseHistoryEntries(
      [...(primary || []), ...(secondary || [])].filter(entry => {
        if (!entry || typeof entry !== 'object') return false;
        const key = [entry.sessionId || '', entry.date || '', entry.slotId || '', entry.setIdx ?? '', entry.weight ?? '', entry.reps ?? ''].join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
    );
  }

  function mergePrefillSets(primary = [], secondary = []) {
    const maxLen = Math.max(primary.length, secondary.length);
    const merged = Array.from({length:maxLen}, (_, i) => {
      const a = primary[i] || {};
      const b = secondary[i] || {};
      const weight = a.weight !== undefined && a.weight !== '' ? a.weight : (b.weight ?? '');
      const reps = a.reps !== undefined && a.reps !== '' ? a.reps : (b.reps ?? '');
      return {weight, reps};
    });
    while (merged.length && !merged[merged.length - 1].weight && !merged[merged.length - 1].reps) { merged.pop(); }
    return merged;
  }

  // ══════════════════════════════════════════════════════
  // PUBLIC API (Delegates to modules)
  // ══════════════════════════════════════════════════════
  window.S = S;
  window.DP = DP;
  window.CAT_LABELS = CAT_LABELS;
  window.safePersist = safePersist;

  window.ApexState = {
    get: () => S,
    update: (key, value, opts = {}) => {
      if (!Object.prototype.hasOwnProperty.call(S, key)) return false;
      S[key] = value;
      if (opts.persist !== false) safePersist();
      if (opts.mirror !== false) mirrorToStorage();
      return true;
    },
    stageWorkoutSetInput: (d, si, li, f) => stageWorkoutSetInput(S, d, si, li, f),
    updateWorkoutSlot: (d, si, f) => updateWorkoutSlot(S, d, si, f),
    updateWorkoutSet: (d, si, li, f) => updateWorkoutSet(S, d, si, li, f),
    addWorkoutSet: (d, si, sl) => addWorkoutSet(S, d, si, sl),
    deleteWorkoutSet: (d, si, li) => deleteWorkoutSet(S, d, si, li),
    renameExercise: (o, n) => window.ApexWorkoutState.renameExercise(S, o, n, utils),

    persistBodyMetrics: (m) => window.ApexBodyState.persistBodyMetrics(S, m, utils),

    addSession: (s, dk, pm, w, au) => window.ApexReviewState.addSession(S, s, dk, pm, w, au, utils),
    updateSession: (sid, f) => window.ApexReviewState.updateSession(S, sid, f, utils),
    deleteSession: (idx) => window.ApexReviewState.deleteSession(S, idx, utils),

    updatePoolExercise: (sc, cat, i, n) => window.ApexEditState.updatePoolExercise(S, sc, cat, i, n, utils),
    addPoolExercise: (sc, cat, n) => window.ApexEditState.addPoolExercise(S, sc, cat, n, utils),
    deletePoolExercise: (sc, cat, i) => window.ApexEditState.deletePoolExercise(S, sc, cat, i, utils),

    persistNotesForDay: async (d, v) => {
      const dk = String(d);
      if (!utils.isDayKeyedStringMap(S.notes)) S.notes = {'1':'','2':''};
      S.notes[dk] = String(v ?? '');
      if (window.ApexStorage?.set) await window.ApexStorage.set('lnt', S.notes);
      safePersist();
      return S.notes[dk];
    },

    persistRestTimeForSlot: async (d, si, s) => {
      const dk = String(d);
      const sk = String(si || '').trim();
      const secs = Math.max(5, Math.round(Number(s) || 0));
      if (!sk || !secs) return null;
      if (!utils.isDayKeyedObjectMap(S.restTimes)) S.restTimes = {'1':{},'2':{}};
      if (!S.restTimes[dk]) S.restTimes[dk] = {};
      S.restTimes[dk][sk] = secs;
      if (window.ApexStorage?.set) await window.ApexStorage.set('lrt', S.restTimes);
      safePersist();
      return secs;
    },

    persistPinsState: async () => {
      if (window.ApexStorage?.set) await window.ApexStorage.set('lpi', S.pins);
      safePersist();
      return S.pins;
    },

    persistLocksState: async () => {
      if (window.ApexStorage?.set) await window.ApexStorage.set('llk', S.locks);
      safePersist();
      return S.locks;
    },

    persistPoolsState: async () => {
      if (window.ApexStorage?.set) await window.ApexStorage.set('lp', S.pools);
      safePersist();
      return S.pools;
    },

    persistExerciseAnchorsState: async () => {
      if (window.ApexStorage?.set) await window.ApexStorage.set('lea', S.exerciseAnchors);
      safePersist();
      return S.exerciseAnchors;
    },

    persistHeaderState: async () => {
      if (window.ApexStorage?.setMany) {
        await window.ApexStorage.setMany({ lcd: S.currentDay, lbl: S.curBlock, lwk: S.curWeek, lwo: S.workouts, llk: S.locks });
      }
      safePersist();
      return { currentDay: S.currentDay, curBlock: S.curBlock, curWeek: S.curWeek };
    },

    persistPrefillForDay: async (d, pm) => {
      const dk = String(d);
      if (!utils.isDayKeyedObjectMap(S.prefill)) S.prefill = {'1':{},'2':{}};
      S.prefill[dk] = utils.isPlainObject(pm) ? pm : {};
      if (window.ApexStorage?.set) await window.ApexStorage.set('lpf', S.prefill);
      safePersist();
      return S.prefill[dk];
    },

    persistRecentExercisesForWorkout: async (d, w) => {
      const dk = String(d);
      if (!utils.isDayKeyedObjectMap(S.recentEx)) S.recentEx = {'1':{},'2':{}};
      utils.recordCompletedExercisesAsRecent(dk, w);
      if (window.ApexStorage?.set) await window.ApexStorage.set('lrx', S.recentEx);
      safePersist();
      return S.recentEx[dk];
    },

    togglePinnedExerciseForSlot: async (d, si, ex) => {
      const dk = String(d);
      const sk = String(si || '').trim();
      const en = String(ex || '').trim();
      if (!utils.isDayKeyedObjectMap(S.pins)) S.pins = {'1':{},'2':{}};
      if (!S.pins[dk]) S.pins[dk] = {};
      if (!sk || !en) return null;
      if (S.pins[dk][sk] === en) {
        delete S.pins[dk][sk];
        await window.ApexState.persistPinsState();
        return null;
      }
      S.pins[dk][sk] = en;
      await window.ApexState.persistPinsState();
      return en;
    },

    resetWorkoutLocks: async () => {
      S.locks = {'1':{},'2':{}};
      await window.ApexState.persistLocksState();
      return S.locks;
    },

    initStorage: () => {
      if (!window.ApexStorage?.init) return Promise.resolve(null);
      if (storageInitPromise) return storageInitPromise;
      storageInitState = 'pending';
      storageInitPromise = window.ApexStorage.init()
        .then(() => { mirrorToStorage(); storageInitState = 'ready'; return window.ApexState.getStorageStatus(); })
        .catch(e => { storageInitState = 'fallback'; console.warn('Storage fallback', e); return window.ApexState.getStorageStatus(); });
      return storageInitPromise;
    },

    getStorageStatus: () => ({
      enabled: !!window.ApexStorage,
      initialized: storageInitState === 'ready',
      initializing: storageInitState === 'pending',
      mode: storageInitState,
      cachedKeys: window.ApexStorage?.getCacheSnapshot?.() ? Object.keys(window.ApexStorage.getCacheSnapshot()).length : 0
    }),

    persist: () => safePersist(),
    syncExerciseHistoryEntry: (s, li) => syncExerciseHistoryEntry(s, li),
    syncSlotHistoryEntries: (s) => syncSlotHistoryEntries(s)
  };
})();
