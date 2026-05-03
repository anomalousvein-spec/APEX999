(() => {
  'use strict';

  let storageInitPromise = null;
  let storageInitState = 'idle';

  // ══════════════════════════════════════════════════════
  // STORAGE HELPERS
  // ══════════════════════════════════════════════════════
  function LS(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch (e) {
      return d;
    }
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

  function computeSets(group) {
    if (S.curWeek === 'deload') return 1;
    const base = S.curBlock === 1 ? 2 : 3;
    const w = S.curWeek;
    const cb = ['inclineChest','horizontalChest','verticalBack','horizontalBack'];
    const as = ['biceps','triceps','rearSideDelts'];
    if (w === '4') return base + 1;
    if (w === '3' && (cb.includes(group) || as.includes(group))) return base + 1;
    if (w === '2' && cb.includes(group)) return base + 1;
    return base;
  }

  function baseSets() {
    return S.curWeek === 'deload' ? 1 : S.curBlock === 1 ? 2 : 3;
  }

  const VALID_DAYS = new Set([1, 2]);
  const VALID_BLOCKS = new Set([1, 2]);
  const VALID_WEEKS = new Set(['1', '2', '3', '4', 'deload']);
  const DAY_KEYS = ['1', '2'];


  function isDayKeyedStringMap(value) {
    return isPlainObject(value) &&
      DAY_KEYS.every(key => Object.prototype.hasOwnProperty.call(value, key) && typeof value[key] === 'string');
  }

  function isDayKeyedObjectMap(value) {
    return isPlainObject(value) &&
      DAY_KEYS.every(key => Object.prototype.hasOwnProperty.call(value, key) && isPlainObject(value[key]));
  }

  function isEmptyDayKeyedStringMap(value) {
    return isDayKeyedStringMap(value) && DAY_KEYS.every(key => value[key] === '');
  }

  function hasNonEmptyDayKeyedStringMap(value) {
    return isDayKeyedStringMap(value) && DAY_KEYS.some(key => value[key] !== '');
  }

  function isEmptyDayKeyedObjectMap(value) {
    return isDayKeyedObjectMap(value) &&
      DAY_KEYS.every(key => Object.keys(value[key]).length === 0);
  }

  function hasEntriesDayKeyedObjectMap(value) {
    return isDayKeyedObjectMap(value) &&
      DAY_KEYS.some(key => Object.keys(value[key]).length > 0);
  }

  function isValidBodyMetricsShape(value) {
    return isPlainObject(value) &&
      isPlainObject(value.calcSettings) &&
      Array.isArray(value.logs);
  }

  function normalizeBodyMetricsValue(value) {
    if (typeof window.normalizeBodyMetrics === 'function') {
      return window.normalizeBodyMetrics(value);
    }
    return value;
  }

  function normalizeRestTimerValue(value) {
    if (typeof window.normalizeRestTimer === 'function') {
      return window.normalizeRestTimer(value);
    }
    return value;
  }

  function isValidStartTimeValue(value) {
    return value === null || (typeof value === 'string' && !Number.isNaN(Date.parse(value)));
  }

  function buildLegacyStorageEntries() {
    return {
      lp: S.pools,
      lcd: S.currentDay,
      lwo: S.workouts,
      llk: S.locks,
      lpi: S.pins,
      lbl: S.curBlock,
      lwk: S.curWeek,
      leh: S.exHist,
      lsh: S.sessions,
      lst: S.startTime,
      _sid: S._activeSessionId || null,
      lpf: S.prefill,
      lnt: S.notes,
      lrt: S.restTimes,
      lrtm: S.restTimer,
      lrx: S.recentEx,
      lbm: S.bodyMetrics,
      lea: S.exerciseAnchors
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

  function get() {
    return S;
  }

  function update(key, value, options = {}) {
    const { persist = true, mirror = true } = options;
    if (Object.prototype.hasOwnProperty.call(S, key)) {
      S[key] = value;
      if (persist) safePersist();
      if (mirror) mirrorToStorage();
      return true;
    }
    return false;
  }

  function getPersistedValue(key, fallbackValue) {
    if (window.ApexStorage?.get) {
      return window.ApexStorage.get(key, fallbackValue);
    }
    return fallbackValue;
  }

  function persistLegacyFallback() {
    try {
      SS('lp', S.pools); SS('lcd', S.currentDay);
      SS('lwo', S.workouts); SS('llk', S.locks); SS('lpi', S.pins);
      SS('lbl', S.curBlock); SS('lwk', S.curWeek);
      SS('leh', S.exHist); SS('lsh', S.sessions);
      SS('lst', S.startTime); SS('_sid', S._activeSessionId || null); SS('lpf', S.prefill);
      SS('lnt', S.notes); SS('lrt', S.restTimes); SS('lrtm', S.restTimer); SS('lrx', S.recentEx); SS('lbm', S.bodyMetrics);
      return true;
    } catch (e) {
      const isQuota = e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || String(e?.message || '').toLowerCase().includes('quota');
      if (isQuota) {
        if (typeof window.showToast === 'function') window.showToast('Storage nearly full — consider exporting old sessions', 'warn');
        console.warn('APEX localStorage quota warning', e);
      } else {
        if (typeof window.showToast === 'function') window.showToast('Save failed — check console before closing the app', 'warn');
        console.error('APEX Persist failed:', e);
      }
      return false;
    }
  }

  function safePersist() {
    return persistLegacyFallback();
  }

  function stageWorkoutSetInput(day, slotIdx, setIdx, fields) {
    const dk = String(day);
    const slot = S.workouts[dk]?.[slotIdx];
    const log = slot?.sets?.[setIdx];
    if (!log) return null;
    Object.assign(log, fields);

    // Keep in-memory analytics/history current during typing, but avoid
    // forcing a durable flush on every keystroke.
    syncExerciseHistoryEntry(slot, setIdx);

    if (window.ApexStorage?.setMany) {
      window.ApexStorage.setMany({
        lwo: S.workouts,
        leh: S.exHist
      });
    } else if (window.ApexStorage?.set) {
      window.ApexStorage.set('lwo', S.workouts);
      window.ApexStorage.set('leh', S.exHist);
    }

    return log;
  }

  async function persistNotesForDay(day, value) {
    const dayKey = String(day);
    if (!isDayKeyedStringMap(S.notes)) S.notes = {'1':'','2':''};
    S.notes[dayKey] = String(value ?? '');
    if (window.ApexStorage?.set) {
      await window.ApexStorage.set('lnt', S.notes);
    }
    if (window.ApexStorage?.flush) await window.ApexStorage.flush();
    persistLegacyFallback();
    return S.notes[dayKey];
  }

  async function persistRestTimeForSlot(day, slotId, seconds) {
    const dayKey = String(day);
    const slotKey = String(slotId || '').trim();
    const secs = Math.max(5, Math.round(Number(seconds) || 0));
    if (!slotKey || !secs) return null;
    if (!isDayKeyedObjectMap(S.restTimes)) S.restTimes = {'1':{},'2':{}};
    if (!S.restTimes[dayKey] || !isPlainObject(S.restTimes[dayKey])) S.restTimes[dayKey] = {};
    S.restTimes[dayKey][slotKey] = secs;
    if (window.ApexStorage?.set) {
      await window.ApexStorage.set('lrt', S.restTimes);
    }
    if (window.ApexStorage?.flush) await window.ApexStorage.flush();
    persistLegacyFallback();
    return secs;
  }

  async function persistPinsState() {
    if (window.ApexStorage?.set) {
      await window.ApexStorage.set('lpi', S.pins);
    }
    if (window.ApexStorage?.flush) await window.ApexStorage.flush();
    persistLegacyFallback();
    return S.pins;
  }

  async function persistLocksState() {
    if (window.ApexStorage?.set) {
      await window.ApexStorage.set('llk', S.locks);
    }
    if (window.ApexStorage?.flush) await window.ApexStorage.flush();
    persistLegacyFallback();
    return S.locks;
  }

  async function togglePinnedExerciseForSlot(day, slotId, exercise) {
    const dayKey = String(day);
    const slotKey = String(slotId || '').trim();
    const exerciseName = String(exercise || '').trim();
    if (!isDayKeyedObjectMap(S.pins)) S.pins = {'1':{},'2':{}};
    if (!S.pins[dayKey] || !isPlainObject(S.pins[dayKey])) S.pins[dayKey] = {};
    if (!slotKey || !exerciseName) return null;
    if (S.pins[dayKey][slotKey] === exerciseName) {
      delete S.pins[dayKey][slotKey];
      await persistPinsState();
      return null;
    }
    S.pins[dayKey][slotKey] = exerciseName;
    await persistPinsState();
    return exerciseName;
  }

  async function resetWorkoutLocks() {
    S.locks = {'1':{},'2':{}};
    await persistLocksState();
    return S.locks;
  }

  async function persistPrefillForDay(day, prefillMap) {
    const dayKey = String(day);
    if (!isDayKeyedObjectMap(S.prefill)) S.prefill = {'1':{},'2':{}};
    S.prefill[dayKey] = isPlainObject(prefillMap) ? prefillMap : {};
    if (window.ApexStorage?.set) {
      await window.ApexStorage.set('lpf', S.prefill);
    }
    if (window.ApexStorage?.flush) await window.ApexStorage.flush();
    persistLegacyFallback();
    return S.prefill[dayKey];
  }

  async function persistPoolsState() {
    if (window.ApexStorage?.set) {
      await window.ApexStorage.set('lp', S.pools);
    }
    if (window.ApexStorage?.flush) await window.ApexStorage.flush();
    persistLegacyFallback();
    return S.pools;
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
        const key = [
          entry.sessionId || '',
          entry.date || '',
          entry.slotId || '',
          entry.setIdx ?? '',
          entry.weight ?? '',
          entry.reps ?? ''
        ].join('|');
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
    while (merged.length && !merged[merged.length - 1].weight && !merged[merged.length - 1].reps) {
      merged.pop();
    }
    return merged;
  }

  function removeExerciseHistoryEntry(exName, sessionId, slotId, setIdx) {
    const history = S.exHist[exName];
    if (!history?.length || !sessionId) return;
    S.exHist[exName] = history.filter(entry =>
      !(entry.sessionId === sessionId && entry.slotId === slotId && entry.setIdx === setIdx)
    );
    if (!S.exHist[exName].length) delete S.exHist[exName];
  }

  function upsertExerciseHistoryEntry(exName, entry) {
    if (!S.exHist[exName]) S.exHist[exName] = [];
    const history = S.exHist[exName];
    const idx = history.findIndex(item =>
      item.sessionId === entry.sessionId && item.slotId === entry.slotId && item.setIdx === entry.setIdx
    );
    if (idx >= 0) history[idx] = entry;
    else history.push(entry);
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
      sessionId,
      slotId,
      setIdx: li,
      setNum: li + 1,
      weight: metrics.weight,
      reps: metrics.reps,
      volume: metrics.volume,
      repOnly: metrics.repOnly
    });

    // Update the exercise anchor using the 12RM concept logic
    if (typeof updateExerciseAnchor === 'function') {
      // Collect all done sets for this exercise in this session to determine R1, R2, R3
      const doneSets = slot.sets.filter(s => s.done).map(s => ({
        setNum: parseInt(s.setNum || 1),
        weight: parseFloat(s.weight) || 0,
        reps: parseFloat(s.reps) || 0
      })).sort((a, b) => a.setNum - b.setNum);

      if (doneSets.length > 0) {
        const sessionData = {
          W: doneSets[0].weight,
          R1: doneSets[0].reps,
          R2: doneSets.length >= 2 ? doneSets[1].reps : undefined,
          R3: doneSets.length >= 3 ? doneSets[2].reps : undefined
        };
        updateExerciseAnchor(slot.exercise, sessionData);
      }
    }
  }

  function syncSlotHistoryEntries(slot) {
    if (!slot || slot.isWarmup) return;
    clearSlotHistoryEntries(slot);
    (slot.sets || []).forEach((_, li) => syncExerciseHistoryEntry(slot, li));
  }

  async function renameExercise(oldName, newName) {
    if (!oldName || !newName || oldName === newName) return;

    if (S.exHist?.[oldName]) {
      S.exHist[newName] = mergeExerciseHistoryEntries(S.exHist[newName], S.exHist[oldName]);
      delete S.exHist[oldName];
    }

    ['1','2'].forEach(dayKey => {
      if (!S.prefill[dayKey]) S.prefill[dayKey] = {};
      if (S.prefill[dayKey][oldName]) {
        S.prefill[dayKey][newName] = mergePrefillSets(S.prefill[dayKey][newName], S.prefill[dayKey][oldName]);
        delete S.prefill[dayKey][oldName];
      }

      const workout = S.workouts?.[dayKey] || [];
      workout.forEach(slot => {
        if (slot?.exercise === oldName) slot.exercise = newName;
      });

      const recentByCat = S.recentEx?.[dayKey];
      if (recentByCat && typeof recentByCat === 'object') {
        Object.keys(recentByCat).forEach(cat => {
          const items = recentByCat[cat];
          if (!Array.isArray(items) || !items.includes(oldName)) return;
          recentByCat[cat] = items
            .map(ex => ex === oldName ? newName : ex)
            .filter((ex, idx, arr) => arr.indexOf(ex) === idx);
        });
      }
    });

    (S.sessions || []).forEach(session => {
      (session.exercises || []).forEach(ex => {
        if (ex?.name === oldName) ex.name = newName;
      });
    });

    if (window._selEx === oldName) window._selEx = newName;
    if (window._analyticsEx === oldName) window._analyticsEx = newName;

    await persistSessionsState();
  }

  async function updateWorkoutSlot(day, slotIdx, fields) {
    const dk = String(day);
    const slot = S.workouts[dk]?.[slotIdx];
    if (!slot) return null;
    Object.assign(slot, fields);

    // Prioritize storage write
    if (window.ApexStorage?.set) {
      await window.ApexStorage.set('lwo', S.workouts);
    }
    if (window.ApexStorage?.flush) await window.ApexStorage.flush();

    persistLegacyFallback();
    return slot;
  }

  async function updateWorkoutSet(day, slotIdx, setIdx, fields) {
    const dk = String(day);
    const slot = S.workouts[dk]?.[slotIdx];
    const log = slot?.sets?.[setIdx];
    if (!log) return null;
    Object.assign(log, fields);

    // Always attempt to sync history entry (handles both adding and removing based on log.done)
    syncExerciseHistoryEntry(slot, setIdx);

    // Prioritize storage write - persist both workout and history
    if (window.ApexStorage?.setMany) {
      await window.ApexStorage.setMany({
        lwo: S.workouts,
        leh: S.exHist
      });
    } else if (window.ApexStorage?.set) {
      await window.ApexStorage.set('lwo', S.workouts);
      await window.ApexStorage.set('leh', S.exHist);
    }
    if (window.ApexStorage?.flush) await window.ApexStorage.flush();

    persistLegacyFallback();
    return log;
  }

  async function addWorkoutSet(day, slotIdx, setLog) {
    const dk = String(day);
    const slot = S.workouts[dk]?.[slotIdx];
    if (!slot) return null;
    slot.sets.push(setLog);
    slot.numSets = slot.sets.length;
    slot.isCustomSets = true;

    // Prioritize storage write
    if (window.ApexStorage?.set) {
      await window.ApexStorage.set('lwo', S.workouts);
    }
    if (window.ApexStorage?.flush) await window.ApexStorage.flush();

    persistLegacyFallback();
    return slot.sets;
  }

  async function deleteWorkoutSet(day, slotIdx, setIdx) {
    const dk = String(day);
    const slot = S.workouts[dk]?.[slotIdx];
    if (!slot) return null;
    slot.sets.splice(setIdx, 1);
    slot.numSets = slot.sets.length;
    slot.isCustomSets = true;
    syncSlotHistoryEntries(slot);

    // Prioritize storage write - persist both workout and history
    if (window.ApexStorage?.setMany) {
      await window.ApexStorage.setMany({
        lwo: S.workouts,
        leh: S.exHist
      });
    } else if (window.ApexStorage?.set) {
      await window.ApexStorage.set('lwo', S.workouts);
      await window.ApexStorage.set('leh', S.exHist);
    }
    if (window.ApexStorage?.flush) await window.ApexStorage.flush();

    persistLegacyFallback();
    return slot.sets;
  }

  async function updatePoolExercise(section, cat, index, newName) {
    const target = S.pools[section]?.[cat];
    if (!target || !Array.isArray(target.pool)) return null;
    const oldName = target.pool[index];
    target.pool[index] = newName;
    await renameExercise(oldName, newName);
    await persistPoolsState();
    return newName;
  }

  async function addPoolExercise(section, cat, exerciseName) {
    const target = S.pools[section]?.[cat];
    if (!target) return null;
    if (!Array.isArray(target.pool)) target.pool = [];
    target.pool.push(exerciseName);
    await persistPoolsState();
    return target.pool;
  }

  async function deletePoolExercise(section, cat, index) {
    const target = S.pools[section]?.[cat];
    if (!target || !Array.isArray(target.pool)) return null;
    const [removed] = target.pool.splice(index, 1);
    if (typeof removeExercisePins === 'function') removeExercisePins(removed);
    if (typeof sanitizePins === 'function') sanitizePins();
    await persistPoolsState();
    return removed;
  }

  async function persistRecentExercisesForWorkout(day, workout) {
    const dayKey = String(day);
    if (!isDayKeyedObjectMap(S.recentEx)) S.recentEx = {'1':{},'2':{}};
    if (!S.recentEx[dayKey] || !isPlainObject(S.recentEx[dayKey])) S.recentEx[dayKey] = {};
    if (typeof recordCompletedExercisesAsRecent === 'function') {
      recordCompletedExercisesAsRecent(dayKey, workout);
    }
    if (window.ApexStorage?.set) {
      await window.ApexStorage.set('lrx', S.recentEx);
    }
    if (window.ApexStorage?.flush) await window.ApexStorage.flush();
    persistLegacyFallback();
    return S.recentEx[dayKey];
  }

  async function persistBodyMetrics(nextBodyMetrics) {
    const body = normalizeBodyMetricsValue(nextBodyMetrics);
    S.bodyMetrics = body;
    if (window.ApexStorage?.set) {
      await window.ApexStorage.set('lbm', body);
    }
    if (window.ApexStorage?.flush) await window.ApexStorage.flush();
    persistLegacyFallback();
    return S.bodyMetrics;
  }

  async function persistHeaderState() {
    if (typeof window.ApexStorage?.setMany === 'function') {
      await window.ApexStorage.setMany({
        lcd: S.currentDay,
        lbl: S.curBlock,
        lwk: S.curWeek,
        lwo: S.workouts,
        llk: S.locks
      });
    } else if (window.ApexStorage?.set) {
      await window.ApexStorage.set('lcd', S.currentDay);
      await window.ApexStorage.set('lbl', S.curBlock);
      await window.ApexStorage.set('lwk', S.curWeek);
      await window.ApexStorage.set('lwo', S.workouts);
      await window.ApexStorage.set('llk', S.locks);
    }
    if (window.ApexStorage?.flush) await window.ApexStorage.flush();
    persistLegacyFallback();
    return {
      currentDay: S.currentDay,
      curBlock: S.curBlock,
      curWeek: S.curWeek
    };
  }

  async function persistSessionsState() {
    const entries = {
      lsh: S.sessions,
      leh: S.exHist,
      lpf: S.prefill,
      lrx: S.recentEx,
      lnt: S.notes,
      lwo: S.workouts,
      lst: S.startTime,
      _sid: S._activeSessionId || null,
      lrtm: S.restTimer
    };
    if (typeof window.ApexStorage?.setMany === 'function') {
      await window.ApexStorage.setMany(entries);
    } else if (window.ApexStorage?.set) {
      for (const [k, v] of Object.entries(entries)) {
        await window.ApexStorage.set(k, v);
      }
    }
    if (window.ApexStorage?.flush) await window.ApexStorage.flush();
    persistLegacyFallback();
  }

  async function addSession(session, dayKey, prefillMap, workout) {
    const nextSessions = [session, ...S.sessions];
    const dk = String(dayKey);

    // Prioritize storage write
    if (window.ApexStorage?.set) {
      await window.ApexStorage.set('lsh', nextSessions);
    }
    if (window.ApexStorage?.flush) await window.ApexStorage.flush();

    S.sessions = nextSessions;
    if (!isDayKeyedObjectMap(S.prefill)) S.prefill = {'1':{},'2':{}};
    S.prefill[dk] = isPlainObject(prefillMap) ? prefillMap : {};

    if (typeof recordCompletedExercisesAsRecent === 'function') {
      recordCompletedExercisesAsRecent(dk, workout);
    }

    // Reset session runtime state
    S.workouts[dk] = null;
    S.startTime = null;
    S._activeSessionId = null;
    S.restTimer = null;
    if (isDayKeyedStringMap(S.notes)) S.notes[dk] = '';

    persistSessionsState(); // Mirrors to legacy localStorage
    return S.sessions;
  }

  async function updateSession(sessionId, fields) {
    const idx = S.sessions.findIndex(s => s.id === sessionId);
    if (idx === -1) return null;
    Object.assign(S.sessions[idx], fields);
    await persistSessionsState();
    return S.sessions[idx];
  }

  async function reconcileSessions() {
    if (!window.ApexStorage) return;
    const persistedSessions = await window.ApexStorage.get('lsh', []);
    if (!Array.isArray(persistedSessions)) return;

    const memoryIds = new Set(S.sessions.map(s => s.id).filter(Boolean));
    const persistedIds = new Set(persistedSessions.map(s => s.id).filter(Boolean));

    let addedToMemory = 0;
    let addedToStorage = 0;

    persistedSessions.forEach(ps => {
      if (ps.id && !memoryIds.has(ps.id)) {
        S.sessions.push(ps);
        addedToMemory++;
      }
    });

    if (addedToMemory > 0) {
      S.sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
      safePersist();
    }

    const nextPersistedSessions = [...persistedSessions];
    S.sessions.forEach(ms => {
      if (ms.id && !persistedIds.has(ms.id)) {
        nextPersistedSessions.push(ms);
        addedToStorage++;
      }
    });

    if (addedToStorage > 0) {
      nextPersistedSessions.sort((a, b) => new Date(b.date) - new Date(a.date));
      await window.ApexStorage.set('lsh', nextPersistedSessions);
      if (window.ApexStorage?.flush) await window.ApexStorage.flush();
    }

    return { addedToMemory, addedToStorage };
  }

  async function forceSyncToIndexedDB() {
    if (!window.ApexStorage?.setMany) return null;
    const entries = buildLegacyStorageEntries();
    await window.ApexStorage.setMany(entries);
    if (window.ApexStorage?.flush) await window.ApexStorage.flush();
    return true;
  }

  async function deleteSession(idx) {
    const sess = S.sessions[idx];
    if (!sess) return S.sessions;
    const dayKey = String(sess.day || '');

    (sess.exercises || []).forEach(ex => {
      if (!S.exHist[ex.name]) return;
      if (sess.id && S.exHist[ex.name].some(e => e.sessionId)) {
        S.exHist[ex.name] = S.exHist[ex.name].filter(e => e.sessionId !== sess.id);
      } else {
        const sessDate = (sess.date || '').slice(0, 10);
        S.exHist[ex.name] = S.exHist[ex.name].filter(e => e.date !== sessDate);
      }
      if (S.exHist[ex.name].length === 0) delete S.exHist[ex.name];
    });

    const nextSessions = [...S.sessions];
    nextSessions.splice(idx, 1);

    // Prioritize storage write
    if (window.ApexStorage?.set) {
      await window.ApexStorage.set('lsh', nextSessions);
    }
    if (window.ApexStorage?.flush) await window.ApexStorage.flush();

    S.sessions = nextSessions;
    (sess.exercises || []).forEach(ex => {
      if (dayKey && typeof clearPrefillForExercise === 'function') {
        clearPrefillForExercise(dayKey, ex.name);
      }
    });

    persistSessionsState(); // Mirrors to legacy localStorage
    return S.sessions;
  }

  function persist() {
    safePersist();
    mirrorToStorage();
  }

  function migratePools() {
    if (!S.pools || typeof S.pools !== 'object') { S.pools = JSON.parse(JSON.stringify(DP)); return; }
    ['shared','day1','day2'].forEach(section => {
      if (!S.pools[section] || typeof S.pools[section] !== 'object') {
        S.pools[section] = JSON.parse(JSON.stringify(DP[section]));
        return;
      }
      const dpSec = DP[section];
      Object.keys(dpSec).forEach(cat => {
        const dpMeta = dpSec[cat];
        let stored   = S.pools[section][cat];
        if (Array.isArray(stored)) {
          S.pools[section][cat] = { ...dpMeta, pool: stored };
          stored = S.pools[section][cat];
        }
        if (!stored || typeof stored !== 'object') {
          S.pools[section][cat] = JSON.parse(JSON.stringify(dpMeta));
          stored = S.pools[section][cat];
        }
        if (!Array.isArray(stored.pool) || stored.pool.length === 0) stored.pool = [...dpMeta.pool];
        if (!stored.reps)  stored.reps  = dpMeta.reps;
        if (!stored.group) stored.group = dpMeta.group;
        if (section !== 'shared' && stored.dual === undefined) stored.dual = dpMeta.dual;
      });
    });
    if (!S.restTimes || typeof S.restTimes !== 'object') S.restTimes = {'1':{},'2':{}};
    if (!S.restTimes['1']) S.restTimes['1'] = {};
    if (!S.restTimes['2']) S.restTimes['2'] = {};
    S.restTimer = normalizeRestTimerValue(S.restTimer);
    if (!S.prefill || typeof S.prefill !== 'object') S.prefill = {'1':{},'2':{}};
    if (!S.prefill['1']) S.prefill['1'] = {};
    if (!S.prefill['2']) S.prefill['2'] = {};
    if (!S.notes || typeof S.notes !== 'object') S.notes = {'1':'','2':''};
    if (typeof S.notes['1'] !== 'string') S.notes['1'] = '';
    if (typeof S.notes['2'] !== 'string') S.notes['2'] = '';
    if (!S.recentEx || typeof S.recentEx !== 'object') S.recentEx = {'1':{},'2':{}};
    if (!S.recentEx['1']) S.recentEx['1'] = {};
    if (!S.recentEx['2']) S.recentEx['2'] = {};
    if (!S.pins || typeof S.pins !== 'object') S.pins = {'1':{},'2':{}};
    if (!S.pins['1']) S.pins['1'] = {};
    if (!S.pins['2']) S.pins['2'] = {};
    if (!S.workouts || typeof S.workouts !== 'object') S.workouts = {'1':null,'2':null};
    ['1','2'].forEach(dayKey => {
      if (typeof workoutMatchesSlotDefs === 'function' && !workoutMatchesSlotDefs(Number(dayKey), S.workouts[dayKey])) S.workouts[dayKey] = null;
    });
    if (!S.locks || typeof S.locks !== 'object') S.locks = {'1':{},'2':{}};
    if (!S.locks['1']) S.locks['1'] = {};
    if (!S.locks['2']) S.locks['2'] = {};
    S.bodyMetrics = normalizeBodyMetricsValue(S.bodyMetrics);
  }

  function getImportWarnings(data) {
    const warnings = [];
    if (!isPlainObject(data)) return ['Import must be a JSON object'];
    if (!isPlainObject(data.pools)) warnings.push('Exercise pools are missing or invalid and will reset to defaults.');
    if (!isPlainObject(data.exHist)) warnings.push('Exercise history is missing or invalid and will be reset.');
    if (!Array.isArray(data.sessions)) warnings.push('Sessions are missing or invalid and will be reset.');
    if (data.bodyMetrics !== undefined && !isPlainObject(data.bodyMetrics)) warnings.push('Body metrics are invalid and will be reset.');
    if (data.workouts !== undefined && !isPlainObject(data.workouts)) warnings.push('In-progress workouts are invalid and will be cleared.');
    if (data.prefill !== undefined && !isPlainObject(data.prefill)) warnings.push('Prefill data is invalid and will be cleared.');
    if (data.notes !== undefined && !isPlainObject(data.notes)) warnings.push('Notes are invalid and will be cleared.');
    return warnings;
  }

  function cloneDefaultPools() {
    return JSON.parse(JSON.stringify(DP));
  }

  function sanitizeImportedState(data) {
    if (!isPlainObject(data)) throw new Error('Import must be an object');
    const fallbackDayMap = fill => ({'1':fill,'2':fill});
    return {
      pools: isPlainObject(data.pools) ? data.pools : cloneDefaultPools(),
      exHist: isPlainObject(data.exHist) ? data.exHist : {},
      sessions: Array.isArray(data.sessions) ? data.sessions : [],
      pins: isPlainObject(data.pins) ? data.pins : {'1':{},'2':{}},
      curBlock: data.curBlock === 2 ? 2 : 1,
      curWeek: ['1','2','3','4','deload'].includes(String(data.curWeek)) ? String(data.curWeek) : '1',
      currentDay: [1,2].includes(Number(data.currentDay)) ? Number(data.currentDay) : 1,
      workouts: isPlainObject(data.workouts) ? data.workouts : {'1':null,'2':null},
      locks: isPlainObject(data.locks) ? data.locks : {'1':{},'2':{}},
      prefill: isPlainObject(data.prefill) ? data.prefill : fallbackDayMap({}),
      notes: isPlainObject(data.notes) ? data.notes : fallbackDayMap(''),
      restTimes: isPlainObject(data.restTimes) ? data.restTimes : fallbackDayMap({}),
      restTimer: normalizeRestTimerValue(data.restTimer),
      recentEx: isPlainObject(data.recentEx) ? data.recentEx : fallbackDayMap({}),
      startTime: data.startTime ?? null,
      _activeSessionId: data._activeSessionId ?? null,
      bodyMetrics: normalizeBodyMetricsValue(data.bodyMetrics)
    };
  }

  function migrate() {
    migratePools();
  }

  function remindBackup() {
    if (typeof maybeRemindBackup === 'function') maybeRemindBackup();
  }

  function getSnapshot() {
    return {
      currentDay: S.currentDay,
      curBlock: S.curBlock,
      curWeek: S.curWeek,
      sessionsCount: Array.isArray(S.sessions) ? S.sessions.length : 0,
      activeSessionId: S._activeSessionId || null
    };
  }

  function getPersistedSnapshot() {
    const persistedSessions = getPersistedValue('lsh', []);
    return {
      currentDay: getPersistedValue('lcd', S.currentDay),
      curBlock: getPersistedValue('lbl', S.curBlock),
      curWeek: getPersistedValue('lwk', S.curWeek),
      sessionsCount: Array.isArray(persistedSessions) ? persistedSessions.length : 0,
      activeSessionId: getPersistedValue('_sid', S._activeSessionId || null)
    };
  }

  function hydrateBootStateFromStorage() {
    const result = {
      changed: false,
      fields: {}
    };

    const persistedPools = getPersistedValue('lp', null);
    if (!isPlainObject(S.pools) && isPlainObject(persistedPools)) {
      S.pools = persistedPools;
      if (typeof migratePools === 'function') migratePools();
      result.changed = true;
      result.fields.pools = 'persisted';
    }

    const persistedDay = getPersistedValue('lcd', null);
    if (!VALID_DAYS.has(S.currentDay) && VALID_DAYS.has(Number(persistedDay))) {
      S.currentDay = Number(persistedDay);
      result.changed = true;
      result.fields.currentDay = S.currentDay;
    }

    const persistedBlock = getPersistedValue('lbl', null);
    if (!VALID_BLOCKS.has(S.curBlock) && VALID_BLOCKS.has(Number(persistedBlock))) {
      S.curBlock = Number(persistedBlock);
      result.changed = true;
      result.fields.curBlock = S.curBlock;
    }

    const persistedWeek = getPersistedValue('lwk', null);
    if (!VALID_WEEKS.has(String(S.curWeek)) && VALID_WEEKS.has(String(persistedWeek))) {
      S.curWeek = String(persistedWeek);
      result.changed = true;
      result.fields.curWeek = S.curWeek;
    }

    const persistedSessionId = getPersistedValue('_sid', null);
    if (!S._activeSessionId && persistedSessionId) {
      S._activeSessionId = persistedSessionId;
      result.changed = true;
      result.fields.activeSessionId = S._activeSessionId;
    }

    const persistedWorkouts = getPersistedValue('lwo', null);
    if (isPlainObject(persistedWorkouts)) {
      const hasMeaningfulPersisted = Object.values(persistedWorkouts).some(v => v !== null);
      if (hasMeaningfulPersisted || !isPlainObject(S.workouts)) {
        S.workouts = persistedWorkouts;
        result.changed = true;
        result.fields.workouts = 'persisted';
      }
    }

    const persistedExerciseHistory = getPersistedValue('leh', null);
    if (isPlainObject(persistedExerciseHistory)) {
      const hasMeaningfulPersisted = Object.keys(persistedExerciseHistory).length > 0;
      if (hasMeaningfulPersisted || !isPlainObject(S.exHist)) {
        S.exHist = persistedExerciseHistory;
        result.changed = true;
        result.fields.exHist = 'persisted';
      }
    }

    const persistedSessions = getPersistedValue('lsh', null);
    if (Array.isArray(persistedSessions)) {
      if (persistedSessions.length > 0 || !Array.isArray(S.sessions)) {
        S.sessions = persistedSessions;
        result.changed = true;
        result.fields.sessions = 'persisted';
      }
    }

    const persistedNotes = getPersistedValue('lnt', null);
    if (
      (
        !isDayKeyedStringMap(S.notes) ||
        (isEmptyDayKeyedStringMap(S.notes) && hasNonEmptyDayKeyedStringMap(persistedNotes))
      ) &&
      isDayKeyedStringMap(persistedNotes)
    ) {
      S.notes = persistedNotes;
      result.changed = true;
      result.fields.notes = 'persisted';
    }

    const persistedRestTimes = getPersistedValue('lrt', null);
    if (
      (
        !isDayKeyedObjectMap(S.restTimes) ||
        (isEmptyDayKeyedObjectMap(S.restTimes) && hasEntriesDayKeyedObjectMap(persistedRestTimes))
      ) &&
      isDayKeyedObjectMap(persistedRestTimes)
    ) {
      S.restTimes = persistedRestTimes;
      result.changed = true;
      result.fields.restTimes = 'persisted';
    }

    const persistedRecentEx = getPersistedValue('lrx', null);
    if (
      (
        !isDayKeyedObjectMap(S.recentEx) ||
        (isEmptyDayKeyedObjectMap(S.recentEx) && hasEntriesDayKeyedObjectMap(persistedRecentEx))
      ) &&
      isDayKeyedObjectMap(persistedRecentEx)
    ) {
      S.recentEx = persistedRecentEx;
      result.changed = true;
      result.fields.recentEx = 'persisted';
    }

    const persistedPrefill = getPersistedValue('lpf', null);
    if (
      (
        !isDayKeyedObjectMap(S.prefill) ||
        (isEmptyDayKeyedObjectMap(S.prefill) && hasEntriesDayKeyedObjectMap(persistedPrefill))
      ) &&
      isDayKeyedObjectMap(persistedPrefill)
    ) {
      S.prefill = persistedPrefill;
      result.changed = true;
      result.fields.prefill = 'persisted';
    }

    const persistedPins = getPersistedValue('lpi', null);
    if (
      (
        !isDayKeyedObjectMap(S.pins) ||
        (isEmptyDayKeyedObjectMap(S.pins) && hasEntriesDayKeyedObjectMap(persistedPins))
      ) &&
      isDayKeyedObjectMap(persistedPins)
    ) {
      S.pins = persistedPins;
      result.changed = true;
      result.fields.pins = 'persisted';
    }

    const persistedLocks = getPersistedValue('llk', null);
    if (
      (
        !isDayKeyedObjectMap(S.locks) ||
        (isEmptyDayKeyedObjectMap(S.locks) && hasEntriesDayKeyedObjectMap(persistedLocks))
      ) &&
      isDayKeyedObjectMap(persistedLocks)
    ) {
      S.locks = persistedLocks;
      result.changed = true;
      result.fields.locks = 'persisted';
    }

    const persistedBodyMetrics = getPersistedValue('lbm', null);
    if (isValidBodyMetricsShape(persistedBodyMetrics)) {
      const hasMeaningfulPersisted = persistedBodyMetrics.logs.length > 0 || persistedBodyMetrics.height || persistedBodyMetrics.startingWeight;
      if (hasMeaningfulPersisted || !isValidBodyMetricsShape(S.bodyMetrics)) {
        S.bodyMetrics = normalizeBodyMetricsValue(persistedBodyMetrics);
        result.changed = true;
        result.fields.bodyMetrics = 'persisted';
      }
    }

    const persistedRestTimer = getPersistedValue('lrtm', null);
    if (persistedRestTimer) {
      const normalizedPersistedRestTimer = normalizeRestTimerValue(persistedRestTimer);
      const normalizedLiveRestTimer = normalizeRestTimerValue(S.restTimer);
      if (!normalizedLiveRestTimer && normalizedPersistedRestTimer) {
        S.restTimer = normalizedPersistedRestTimer;
        result.changed = true;
        result.fields.restTimer = 'persisted';
      }
    }

    const persistedStartTime = getPersistedValue('lst', null);
    if (!isValidStartTimeValue(S.startTime) && isValidStartTimeValue(persistedStartTime)) {
      S.startTime = persistedStartTime;
      result.changed = true;
      result.fields.startTime = S.startTime;
    }

    return result;
  }

  function pickResolvedValue(liveValue, persistedValue, fallbackValue = null) {
    if (liveValue !== undefined && liveValue !== null && liveValue !== '') {
      return { value: liveValue, source: 'live' };
    }
    if (persistedValue !== undefined && persistedValue !== null && persistedValue !== '') {
      return { value: persistedValue, source: 'persisted' };
    }
    return { value: fallbackValue, source: 'fallback' };
  }

  function getResolvedBootSnapshot() {
    const liveSnapshot = getSnapshot();
    const persistedSnapshot = getPersistedSnapshot();
    const currentDay = pickResolvedValue(liveSnapshot.currentDay, persistedSnapshot.currentDay, 1);
    const curBlock = pickResolvedValue(liveSnapshot.curBlock, persistedSnapshot.curBlock, 1);
    const curWeek = pickResolvedValue(liveSnapshot.curWeek, persistedSnapshot.curWeek, '1');
    const activeSessionId = pickResolvedValue(liveSnapshot.activeSessionId, persistedSnapshot.activeSessionId, null);

    return {
      currentDay: currentDay.value,
      curBlock: curBlock.value,
      curWeek: curWeek.value,
      activeSessionId: activeSessionId.value,
      sources: {
        currentDay: currentDay.source,
        curBlock: curBlock.source,
        curWeek: curWeek.source,
        activeSessionId: activeSessionId.source
      }
    };
  }

  function compareSnapshotFields(liveSnapshot, persistedSnapshot) {
    const mismatches = [];
    ['currentDay', 'curBlock', 'curWeek', 'sessionsCount', 'activeSessionId'].forEach(key => {
      if (liveSnapshot?.[key] !== persistedSnapshot?.[key]) {
        mismatches.push({
          key,
          live: liveSnapshot?.[key] ?? null,
          persisted: persistedSnapshot?.[key] ?? null
        });
      }
    });
    return mismatches;
  }

  function getStorageDriftReport() {
    const liveSnapshot = getSnapshot();
    const persistedSnapshot = getPersistedSnapshot();
    const mismatches = compareSnapshotFields(liveSnapshot, persistedSnapshot);
    return {
      inSync: mismatches.length === 0,
      mismatches,
      liveSnapshot,
      persistedSnapshot
    };
  }

  function initStorage() {
    if (!window.ApexStorage?.init) return Promise.resolve(null);
    if (storageInitPromise) return storageInitPromise;
    storageInitState = 'pending';
    storageInitPromise = window.ApexStorage.init()
      .then(() => {
        mirrorToStorage();
        storageInitState = 'ready';
        return getStorageStatus();
      })
      .catch(error => {
        storageInitState = 'fallback';
        console.warn('APEX state facade storage init fallback', error);
        return getStorageStatus();
      });
    return storageInitPromise;
  }

  function getStorageStatus() {
    const cache = window.ApexStorage?.getCacheSnapshot?.() || null;
    return {
      enabled: !!window.ApexStorage,
      initialized: storageInitState === 'ready',
      initializing: storageInitState === 'pending',
      mode: storageInitState,
      cachedKeys: cache ? Object.keys(cache).length : 0
    };
  }

  window.S = S;
  window.safePersist = safePersist;
  window.DP = DP;
  window.CAT_LABELS = CAT_LABELS;
  window.computeSets = computeSets;
  window.baseSets = baseSets;
  window.migratePools = migratePools;
  window.getImportWarnings = getImportWarnings;
  window.sanitizeImportedState = sanitizeImportedState;

  function ensurePools() {
    if (!S.pools) {
      migratePools();
    }
    return S.pools;
  }

  window.ensurePools = ensurePools;

  window.ApexState = {
    get,
    update,
    stageWorkoutSetInput,
    getPersistedValue,
    persistNotesForDay,
    persistRestTimeForSlot,
    persistPinsState,
    persistLocksState,
    togglePinnedExerciseForSlot,
    resetWorkoutLocks,
    persistPrefillForDay,
    persistRecentExercisesForWorkout,
    persistBodyMetrics,
    persistHeaderState,
    persistPoolsState,
    syncExerciseHistoryEntry,
    syncSlotHistoryEntries,
    renameExercise,
    updateWorkoutSlot,
    updateWorkoutSet,
    addWorkoutSet,
    deleteWorkoutSet,
    updatePoolExercise,
    addPoolExercise,
    deletePoolExercise,
    addSession,
    deleteSession,
    updateSession,
    reconcileSessions,
    persist,
    migrate,
    remindBackup,
    getSnapshot,
    getPersistedSnapshot,
    hydrateBootStateFromStorage,
    getResolvedBootSnapshot,
    getStorageDriftReport,
    initStorage,
    getStorageStatus,
    forceSyncToIndexedDB
  };
})();
