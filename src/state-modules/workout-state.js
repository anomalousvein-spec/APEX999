(() => {
  'use strict';

  function stageWorkoutSetInput(S, day, slotIdx, setIdx, fields, { syncExerciseHistoryEntry }) {
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

  async function updateWorkoutSlot(S, day, slotIdx, fields, { safePersist }) {
    const dk = String(day);
    const slot = S.workouts[dk]?.[slotIdx];
    if (!slot) return null;
    Object.assign(slot, fields);

    // Prioritize storage write
    if (window.ApexStorage?.set) {
      await window.ApexStorage.set('lwo', S.workouts);
    }
    if (window.ApexStorage?.flush) await window.ApexStorage.flush();

    safePersist();
    return slot;
  }

  async function updateWorkoutSet(S, day, slotIdx, setIdx, fields, { syncExerciseHistoryEntry, safePersist }) {
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

    safePersist();
    return log;
  }

  async function addWorkoutSet(S, day, slotIdx, setLog, { safePersist }) {
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

    safePersist();
    return slot.sets;
  }

  async function deleteWorkoutSet(S, day, slotIdx, setIdx, { syncSlotHistoryEntries, safePersist }) {
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

    safePersist();
    return slot.sets;
  }

  async function renameExercise(S, oldName, newName, { mergeExerciseHistoryEntries, mergePrefillSets, persistSessionsState }) {
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

  window.ApexWorkoutState = {
    stageWorkoutSetInput,
    updateWorkoutSlot,
    updateWorkoutSet,
    addWorkoutSet,
    deleteWorkoutSet,
    renameExercise
  };
})();
