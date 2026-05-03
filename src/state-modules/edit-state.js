(() => {
  'use strict';

  async function updatePoolExercise(S, section, cat, index, newName, { renameExercise, persistPoolsState }) {
    const target = S.pools[section]?.[cat];
    if (!target || !Array.isArray(target.pool)) return null;
    const oldName = target.pool[index];
    target.pool[index] = newName;
    await renameExercise(oldName, newName);
    await persistPoolsState();
    return newName;
  }

  async function addPoolExercise(S, section, cat, exerciseName, { persistPoolsState }) {
    const target = S.pools[section]?.[cat];
    if (!target) return null;
    if (!Array.isArray(target.pool)) target.pool = [];
    target.pool.push(exerciseName);
    await persistPoolsState();
    return target.pool;
  }

  async function deletePoolExercise(S, section, cat, index, { persistPoolsState }) {
    const target = S.pools[section]?.[cat];
    if (!target || !Array.isArray(target.pool)) return null;
    const [removed] = target.pool.splice(index, 1);
    if (typeof window.removeExercisePins === 'function') window.removeExercisePins(removed);
    if (typeof window.sanitizePins === 'function') window.sanitizePins();
    await persistPoolsState();
    return removed;
  }

  window.ApexEditState = {
    updatePoolExercise,
    addPoolExercise,
    deletePoolExercise
  };
})();
