(() => {
  'use strict';

  async function addSession(S, session, dayKey, prefillMap, workout, anchorUpdates = [], { isDayKeyedObjectMap, isPlainObject, isDayKeyedStringMap, recordCompletedExercisesAsRecent, persistSessionsState }) {
    const nextSessions = [session, ...S.sessions];
    const dk = String(dayKey);

    // Store anchor update feedback with session for transparent user feedback
    if (anchorUpdates && anchorUpdates.length > 0) {
      session.anchorUpdates = anchorUpdates;
    }

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

    await persistSessionsState(); // Mirrors to legacy localStorage
    return S.sessions;
  }

  async function updateSession(S, sessionId, fields, { persistSessionsState }) {
    const idx = S.sessions.findIndex(s => s.id === sessionId);
    if (idx === -1) return null;
    Object.assign(S.sessions[idx], fields);
    await persistSessionsState();
    return S.sessions[idx];
  }

  async function deleteSession(S, idx, { clearPrefillForExercise, persistSessionsState }) {
    const sess = S.sessions[idx];
    if (!sess) return;
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

    S.sessions.splice(idx, 1);
    (sess.exercises || []).forEach(ex => {
      if (dayKey && typeof clearPrefillForExercise === 'function') {
        clearPrefillForExercise(dayKey, ex.name);
      }
    });
    await persistSessionsState();
  }

  window.ApexReviewState = {
    addSession,
    updateSession,
    deleteSession
  };
})();
