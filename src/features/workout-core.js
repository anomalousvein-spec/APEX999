(() => {
  'use strict';

  // Access state through ApexState facade if available
  const getS = () => window.ApexState?.get() || window.S;

  function persistState() {
    return window.ApexState?.persist?.() || safePersist();
  }

  function buildSlotDefs(day) {
    const dayKey = day === 1 ? 'day1' : 'day2';
    const slots = [];
    const pools = ensurePools();

    const warmMeta = pools.shared?.warmUp || DP.shared.warmUp;
    slots.push({
      id: 'warmup',
      label: 'Warm Up',
      cat: 'warmUp',
      isWarmup: true,
      reps: '5 min',
      group: 'warmUp',
      dual: false,
      pairId: null,
      pool: Array.isArray(warmMeta.pool) && warmMeta.pool.length ? warmMeta.pool : DP.shared.warmUp.pool
    });

    const dayPool = pools[dayKey] || {};
    Object.keys(DP[dayKey] || {}).forEach(cat => {
      const meta = dayPool[cat] || DP[dayKey][cat];
      if (!meta || !Array.isArray(meta.pool) || !meta.pool.length) return;
      const fallback = DP[dayKey]?.[cat] || {};
      const reps = meta.reps || fallback.reps || '8-12';
      const group = meta.group || fallback.group || cat;
      const dual = meta.dual !== undefined ? meta.dual : (fallback.dual || false);
      if (dual) {
        const label = CAT_LABELS[cat] || cat;
        slots.push({ id: `${cat}_A`, label: `${label} A`, cat, reps, group, dual: true, pairId: `${cat}_B`, pool: meta.pool });
        slots.push({ id: `${cat}_B`, label: `${label} B`, cat, reps, group, dual: true, pairId: `${cat}_A`, pool: meta.pool });
      } else {
        slots.push({ id: cat, label: CAT_LABELS[cat] || cat, cat, reps, group, dual: false, pairId: null, pool: meta.pool });
      }
    });

    ['rearSideDelts', 'accessory'].forEach(cat => {
      const meta = pools.shared?.[cat] || DP.shared[cat];
      if (!meta || !Array.isArray(meta.pool) || !meta.pool.length) return;
      slots.push({ id: cat, label: CAT_LABELS[cat] || cat, cat, reps: meta.reps || '12-15', group: meta.group || cat, dual: false, pairId: null, pool: meta.pool });
    });

    return slots;
  }

  function getSlotDef(day, slotId) {
    return buildSlotDefs(day).find(def => def.id === slotId) || null;
  }

  function getPinnedExercise(dayKey, slotId) {
    const S = getS();
    const exName = S.pins?.[dayKey]?.[slotId];
    if (!exName) return null;
    const def = getSlotDef(Number(dayKey), slotId);
    if (!def || !Array.isArray(def.pool) || !def.pool.includes(exName)) {
      if (window.ApexState?.update) {
        const nextPins = { ...S.pins };
        if (nextPins[dayKey]) {
          nextPins[dayKey] = { ...nextPins[dayKey] };
          delete nextPins[dayKey][slotId];
          window.ApexState.update('pins', nextPins, { persist: false });
        }
      } else {
        delete S.pins?.[dayKey]?.[slotId];
      }
      return null;
    }
    return exName;
  }

  function removeExercisePins(exName) {
    const S = getS();
    const nextPins = JSON.parse(JSON.stringify(S.pins || { '1': {}, '2': {} }));
    let changed = false;
    ['1', '2'].forEach(dayKey => {
      if (!nextPins[dayKey]) return;
      Object.keys(nextPins[dayKey]).forEach(slotId => {
        if (nextPins[dayKey][slotId] === exName) {
          delete nextPins[dayKey][slotId];
          changed = true;
        }
      });
    });
    if (changed) {
      if (window.ApexState?.update) {
        window.ApexState.update('pins', nextPins, { persist: false });
      } else {
        S.pins = nextPins;
      }
    }
  }

  function renameExercisePins(oldName, newName) {
    if (!oldName || oldName === newName) return;
    const S = getS();
    const nextPins = JSON.parse(JSON.stringify(S.pins || { '1': {}, '2': {} }));
    let changed = false;
    ['1', '2'].forEach(dayKey => {
      if (!nextPins[dayKey]) return;
      Object.keys(nextPins[dayKey]).forEach(slotId => {
        if (nextPins[dayKey][slotId] === oldName) {
          nextPins[dayKey][slotId] = newName;
          changed = true;
        }
      });
    });
    if (changed) {
      if (window.ApexState?.update) {
        window.ApexState.update('pins', nextPins, { persist: false });
      } else {
        S.pins = nextPins;
      }
    }
  }

  function sanitizePins() {
    const S = getS();
    const nextPins = JSON.parse(JSON.stringify(S.pins || { '1': {}, '2': {} }));
    let changed = false;
    ['1', '2'].forEach(dayKey => {
      if (!nextPins[dayKey]) nextPins[dayKey] = {};
      Object.keys(nextPins[dayKey]).forEach(slotId => {
        const def = getSlotDef(Number(dayKey), slotId);
        const exName = nextPins[dayKey][slotId];
        if (!def || !Array.isArray(def.pool) || !def.pool.includes(exName)) {
          delete nextPins[dayKey][slotId];
          changed = true;
        }
      });
    });
    if (changed) {
      if (window.ApexState?.update) {
        window.ApexState.update('pins', nextPins, { persist: false });
      } else {
        S.pins = nextPins;
      }
    }
  }

  function generateWorkout(day, prevOverride = null) {
    const S = getS();
    const dayKey = String(day);
    const defs = buildSlotDefs(day);
    const prev = prevOverride || S.workouts[dayKey] || [];
    const prevMap = {};
    prev.forEach(slot => {
      prevMap[slot.id] = slot;
    });
    const chosen = {};
    const workout = [];

    defs.forEach(def => {
      const pinned = getPinnedExercise(dayKey, def.id);
      const prevSlot = prevMap[def.id];

      let exercise;
      if (pinned) {
        exercise = pinned;
      } else {
        const pairEx = def.pairId ? chosen[def.pairId] : null;
        const exclude = pairEx ? [pairEx] : [];
        const safePool = Array.isArray(def.pool) && def.pool.length ? def.pool : ['-'];
        const recent = S.recentEx?.[dayKey]?.[def.cat] || [];
        exercise = rnd(safePool, exclude, recent);
      }
      chosen[def.id] = exercise;

      const numSets = def.isWarmup ? 0 : (prevMap[def.id]?.isCustomSets ? prevMap[def.id].numSets : computeSets(def.group));
      const sets = def.isWarmup ? [] : buildSets(exercise, dayKey, def.id, numSets, prevSlot);
      workout.push({ ...def, exercise, isPinned: !!pinned, numSets, sets, isCustomSets: prevMap[def.id]?.isCustomSets || false });
    });

    if (window.ApexState?.update) {
      window.ApexState.update('workouts', { ...S.workouts, [dayKey]: workout });
    } else {
      S.workouts[dayKey] = workout;
      persistState();
    }
    return workout;
  }

  function buildSets(exName, dayKey, slotId, count, prevSlot) {
    const S = getS();
    const pf = S.prefill[dayKey]?.[exName] || [];
    const prev = prevSlot?.sets || [];
    return Array.from({ length: count }, (_, i) => {
      if (prev[i] && (prev[i].done || prev[i].weight || prev[i].reps)) return prev[i];
      return createSetLog(pf[i]);
    });
  }

  function createSetLog(prefillSet) {
    if (prefillSet && (prefillSet.weight || prefillSet.reps)) {
      return { weight: prefillSet.weight || '', reps: prefillSet.reps || '', done: false, isPf: true, isAmrap: false };
    }
    return { weight: '', reps: '', done: false, isPf: false, isAmrap: false };
  }

  function workoutMatchesSlotDefs(day, workout) {
    if (!Array.isArray(workout) || !workout.length) return false;
    const defs = buildSlotDefs(day);
    if (workout.length !== defs.length) return false;
    const defIds = defs.map(def => def.id);
    const workoutIds = workout.map(slot => slot?.id);
    return defIds.every((id, idx) => workoutIds[idx] === id);
  }

  function ensureWorkout(day) {
    const S = getS();
    const dayKey = String(day);
    if (!workoutMatchesSlotDefs(day, S.workouts[dayKey])) {
      generateWorkout(day, S.workouts[dayKey] || []);
    }
    return S.workouts[dayKey];
  }

  sanitizePins();

  window.buildSlotDefs = buildSlotDefs;
  window.getSlotDef = getSlotDef;
  window.getPinnedExercise = getPinnedExercise;
  window.removeExercisePins = removeExercisePins;
  window.renameExercisePins = renameExercisePins;
  window.sanitizePins = sanitizePins;
  window.generateWorkout = generateWorkout;
  window.buildSets = buildSets;
  window.createSetLog = createSetLog;
  window.workoutMatchesSlotDefs = workoutMatchesSlotDefs;
  window.ensureWorkout = ensureWorkout;
})();
