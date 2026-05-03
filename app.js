'use strict';

// ══════════════════════════════════════════════════════
// APEX LEGACY BRIDGE & BOOTSTRAP
// ══════════════════════════════════════════════════════

/**
 * Minimal legacy entry point.
 * State initialization and persistence now live in src/state-facade.js.
 * Feature modules live in src/features/.
 */

let _modularStartAttempted = false;

function legacyStartApp() {
  // Safeguard: if we already tried modular start and ended up here (fallback),
  // do NOT try modular start again to avoid infinite recursion.
  if (typeof window.ApexRuntime?.start === 'function' && !_modularStartAttempted) {
    _modularStartAttempted = true;
    window.ApexRuntime.start();
  } else {
    if (typeof renderHeader === 'function') renderHeader();
    if (typeof renderWorkout === 'function') renderWorkout();
    if (typeof restoreRestTimerIfNeeded === 'function') restoreRestTimerIfNeeded();
  }
}

// Global functions for compatibility across older modules
function isPlainObject(v) {
  if (typeof window.isPlainObject === 'function' && window.isPlainObject !== isPlainObject) {
    return window.isPlainObject(v);
  }
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function generateWorkout(day, prevOverride = null) {
  if (typeof window.generateWorkout === 'function' && window.generateWorkout !== generateWorkout) {
    return window.generateWorkout(day, prevOverride);
  }
  return null;
}

function buildSets(exName, dk, slotId, n, prevSlot) {
  if (typeof window.buildSets === 'function' && window.buildSets !== buildSets) {
    return window.buildSets(exName, dk, slotId, n, prevSlot);
  }
  return [];
}

function createSetLog(prefillSet) {
  if (typeof window.createSetLog === 'function' && window.createSetLog !== createSetLog) {
    return window.createSetLog(prefillSet);
  }
  return { weight: '', reps: '', done: false, isPf: false };
}

function workoutMatchesSlotDefs(day, workout) {
  if (typeof window.workoutMatchesSlotDefs === 'function' && window.workoutMatchesSlotDefs !== workoutMatchesSlotDefs) {
    return window.workoutMatchesSlotDefs(day, workout);
  }
  // Default to true during early boot to prevent accidental workout clearing
  return true;
}

window.legacyStartApp = legacyStartApp;
window.isPlainObject = isPlainObject;
window.generateWorkout = generateWorkout;
window.buildSets = buildSets;
window.createSetLog = createSetLog;
window.workoutMatchesSlotDefs = workoutMatchesSlotDefs;
