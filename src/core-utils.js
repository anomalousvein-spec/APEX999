(() => {
  'use strict';

  const APP_VERSION = '10.5';
  const BACKUP_REMINDER_EVERY = 8;

  function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function getLocalDateInputValue(date = new Date()) {
    const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    return local.toISOString().slice(0, 10);
  }

  function sanitizeNumericInput(val, field) {
    let clean = String(val ?? '').replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    if (field === 'reps') clean = clean.replace(/\./g, '');
    return clean;
  }

  function sanitizePositiveMetric(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  }

  function ensureActiveSessionId() {
    if (!window.S._activeSessionId) {
      window.S._activeSessionId = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    }
    return window.S._activeSessionId;
  }

  function maybeRemindBackup() {
    const sessionCount = window.S?.sessions?.length || 0;
    if (!sessionCount || sessionCount % 8 !== 0) return;
    try {
      const lastReminderAt = Number(localStorage.getItem('lbrc')) || 0;
      if (lastReminderAt >= sessionCount) return;
      localStorage.setItem('lbrc', sessionCount);
      setTimeout(() => {
        if (typeof showToast === 'function') showToast('Backup reminder: export your data from Edit or the top bar', 'warn');
      }, 600);
    } catch (e) {}
  }

  function recordCompletedExercisesAsRecent(dayKey, workout) {
    if (!window.S.recentEx[dayKey]) window.S.recentEx[dayKey] = {};
    const touchedByCat = {};
    workout.forEach(slot => {
      if (slot.isWarmup || !slot.sets?.some(log => log.done)) return;
      if (!touchedByCat[slot.cat]) touchedByCat[slot.cat] = [];
      if (!touchedByCat[slot.cat].includes(slot.exercise)) touchedByCat[slot.cat].push(slot.exercise);
    });
    Object.entries(touchedByCat).forEach(([cat, exercises]) => {
      const prev = window.S.recentEx[dayKey][cat] || [];
      const merged = [...exercises, ...prev.filter(ex => !exercises.includes(ex))];
      window.S.recentEx[dayKey][cat] = merged.slice(0, 2);
    });
  }

  function clearPrefillForExercise(dayKey, exName) {
    if (!window.S.prefill[dayKey]) window.S.prefill[dayKey] = {};
    delete window.S.prefill[dayKey][exName];
  }

  function numVal(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }

  function fmtNum(n) {
    return Number.isInteger(n) ? String(n) : String(n).replace(/\.0$/, '');
  }

  function fmtSet(set) {
    if (!set) return '';
    if (set.repOnly && !(numVal(set.weight) > 0)) return `BW x ${fmtNum(set.reps)}`;
    return `${fmtNum(set.weight)} x ${fmtNum(set.reps)}`;
  }

  function fmtDate(iso) {
    const d = new Date(iso);
    const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${mo[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  function fmtTime(iso) {
    return new Date(iso).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  }

  function supportsRepsOnlyLogging(exName) {
    const l = String(exName || '').toLowerCase();
    if (/push.?up|pull.?up|pullup|hyper|captain/.test(l)) return true;
    if (/back extension/.test(l) && !l.includes('machine')) return true;
    if (/assisted/.test(l)) return true;
    return false;
  }

  function getLoggedSetMetrics(exName, setLike) {
    const reps = parseFloat(setLike?.reps);
    if (!(reps > 0)) return null;
    const weight = parseFloat(setLike?.weight);
    if (weight > 0) {
      return {weight, reps, repOnly:false, volume:Math.round(weight * reps)};
    }
    if (!supportsRepsOnlyLogging(exName)) return null;
    return {weight:0, reps, repOnly:true, volume:0};
  }

  function getSlotMetrics(slot) {
    if (!slot || slot.isWarmup) return null;
    const valid = (slot.sets || [])
      .map((s, idx) => {
        const metrics = getLoggedSetMetrics(slot.exercise, s);
        return metrics ? {index:idx, weight:metrics.weight, reps:metrics.reps, done:!!s.done, repOnly:metrics.repOnly} : null;
      })
      .filter(Boolean);
    if (!valid.length) return null;
    const firstSet = valid[0];
    const bestSet = valid.reduce((best, cur) =>
      (cur.weight * cur.reps) > (best.weight * best.reps) ? cur : best
    , valid[0]);
    return {firstSet, bestSet, validSets:valid};
  }

  function comparePerf(nowSet, prevSet) {
    if (!nowSet || !prevSet) return null;
    if (nowSet.weight > prevSet.weight) return 1;
    if (nowSet.weight === prevSet.weight && nowSet.reps > prevSet.reps) return 1;
    if (nowSet.weight === prevSet.weight && nowSet.reps === prevSet.reps) return 0;
    if (nowSet.weight < prevSet.weight && nowSet.reps < prevSet.reps) return -1;
    return 0;
  }

  function perfStateMeta(cmp) {
    if (cmp > 0) return {arrow:'↑', cls:'up'};
    if (cmp < 0) return {arrow:'↓', cls:'down'};
    return {arrow:'→', cls:'flat'};
  }

  function firstSetDeltaText(nowSet, prevSet, cmp) {
    if (!nowSet || !prevSet || cmp === null) return '';
    if (cmp === 0) return 'same';
    if (nowSet.weight > prevSet.weight) return `+${fmtNum(nowSet.weight - prevSet.weight)} lbs`;
    if (nowSet.weight === prevSet.weight && nowSet.reps > prevSet.reps) return `+${fmtNum(nowSet.reps - prevSet.reps)} reps`;
    return `${fmtNum(nowSet.weight - prevSet.weight)} lbs`;
  }

  function logHasUserProgress(log) {
    if (!log) return false;
    if (log.done) return true;
    if (log.isPf) return false;
    return String(log.weight ?? '').trim() !== '' || String(log.reps ?? '').trim() !== '';
  }

  function slotHasProgress(slot) {
    return !!slot && !slot.isWarmup && (slot.sets || []).some(logHasUserProgress);
  }

  function workoutHasProgress(workout) {
    return (workout || []).some(slotHasProgress);
  }

  function anyWorkoutHasProgress() {
    return ['1', '2'].some(dayKey => workoutHasProgress(window.S?.workouts?.[dayKey] || []));
  }

  function rnd(arr, excl=[], recent=[]) {
    const candidates = arr.filter(x => !excl.includes(x));
    if (!candidates.length) return arr[Math.floor(Math.random()*arr.length)];
    const weights = candidates.map(x => recent.includes(x) ? 0.4 : 1.0);
    const total   = weights.reduce((a,b)=>a+b, 0);
    let rand = Math.random() * total;
    for (let i = 0; i < candidates.length; i++) {
      rand -= weights[i];
      if (rand <= 0) return candidates[i];
    }
    return candidates[candidates.length-1];
  }

  function findRepRange(exName) {
    const allCats = [
      ...Object.values(window.S?.pools?.shared || {}),
      ...Object.values(window.S?.pools?.day1 || {}),
      ...Object.values(window.S?.pools?.day2 || {})
    ];
    for (const meta of allCats) {
      if (Array.isArray(meta.pool) && meta.pool.includes(exName) && meta.reps) {
        const parts = meta.reps.split('-').map(Number).filter(Number.isFinite);
        if (parts.length === 2) return {minR: parts[0], maxR: parts[1]};
        if (parts.length === 1) return {minR: parts[0], maxR: parts[0]};
      }
    }
    return null;
  }

  function estimateTarget10RM(exName, opts={}) {
    // DEPRECATED: This function is kept for backward compatibility but is no longer used.
    // The new Self-Correcting Hypertrophy Anchor System (12RM concept) has replaced it.
    // See getExerciseAnchor() for the new implementation.
    let entries = window.S?.exHist?.[exName] || [];
    if (opts.untilSessionKey && typeof getExerciseSessionHistory === 'function') {
      const history = getExerciseSessionHistory(exName);
      const cutoffIdx = history.findIndex(s => s.key === opts.untilSessionKey);
      if (cutoffIdx >= 0) {
        const allowedKeys = new Set(history.slice(0, cutoffIdx + 1).map(s => s.key));
        entries = entries.filter(e => allowedKeys.has(e.sessionId || e.date));
      }
    }
    if (!entries.length) return null;

    const valid = entries.filter(e => {
      const r = parseFloat(e.reps), w = parseFloat(e.weight);
      return Number.isFinite(r) && Number.isFinite(w) && w > 0 && r >= 1 && r <= 30;
    });
    if (valid.length < 3) return null;

    const range = findRepRange(exName);
    let totalEst = 0, weightSum = 0;
    const est10RMValues = [];

    valid.forEach(e => {
      const W    = parseFloat(e.weight);
      const Ract = parseFloat(e.reps);
      let rir = 3;
      if (range) {
        if (Ract >= range.maxR) rir = 1;
        else if (Ract <= range.minR) rir = 4;
        else rir = 3;
      }
      const Rmax = Ract + rir;
      const est  = W * (1 + Rmax / 30) / (4 / 3);
      const w    = 1 / (Math.abs(Rmax - 10) + 1);
      est10RMValues.push(est);
      totalEst  += w * est;
      weightSum += w;
    });

    if (weightSum === 0) return null;

    const sorted = [...est10RMValues].sort((a,b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    let tot2 = 0, wt2 = 0;
    valid.forEach((e, i) => {
      if (Math.abs(est10RMValues[i] - median) / median > 0.15) return;
      const W    = parseFloat(e.weight);
      const Ract = parseFloat(e.reps);
      let rir = 3;
      if (range) {
        if (Ract >= range.maxR) rir = 1;
        else if (Ract <= range.minR) rir = 4;
      }
      const Rmax = Ract + rir;
      const est  = W * (1 + Rmax / 30) / (4 / 3);
      const w    = 1 / (Math.abs(Rmax - 10) + 1);
      tot2 += w * est;
      wt2  += w;
    });

    const raw = wt2 > 0 ? tot2 / wt2 : totalEst / weightSum;
    return Math.max(5, Math.round(raw / 5) * 5);
  }

  /**
   * Get the current Anchor (smoothed 14RM working weight) for an exercise.
   * This implements the Self-Correcting Hypertrophy Anchor System from 12RM_Concept.md
   * @param {string} exName - Exercise name
   * @returns {number|null} - The current anchor weight in lbs, or null if not calibrated
   */
  function getExerciseAnchor(exName) {
    const anchors = window.S?.exerciseAnchors || {};
    const anchorData = anchors[exName];
    if (!anchorData || typeof anchorData.anchor !== 'number') return null;

    const raw = anchorData.anchor;
    // Implement plate rounding: round to nearest 2.5 (common in gym plates)
    // You can make this a user setting in the future, but 2.5 is a solid default.
    const plateIncrement = 2.5;
    return Math.round(raw / plateIncrement) * plateIncrement;
  }

  /**
   * Update the Anchor for an exercise based on session performance.
   * Implements the three-case logic from 12RM_Concept.md:
   * - Case 1: First-set failure (R1 < 12)
   * - Case 2: Intentional last-set AMRAP (R3 > 12 or amrapFlagged = true)
   * - Case 3: Normal session (R1 = 12, no AMRAP)
   * @param {string} exName - Exercise name
   * @param {Object} sessionData - Session data with reps and weight info
   * @param {number} sessionData.W - Weight used in the session
   * @param {number} sessionData.R1 - Reps achieved on set 1
   * @param {number} [sessionData.R2] - Reps achieved on set 2 (optional)
   * @param {number} [sessionData.R3] - Reps achieved on set 3 (optional, for AMRAP)
   * @param {boolean} [sessionData.amrapFlagged] - User-declared AMRAP intent (PHASE 4)
   * @param {string} [sessionData.sessionStatus] - Session completion status ('completed' or 'partial') (PHASE 5)
   * @param {number} [sessionData.daysSinceLast] - Days since last session for this exercise (PHASE 5)
   * @param {boolean} [sessionData.skipAnchorUpdate] - User chose to skip anchor update for bad day (PHASE 5)
   */
  function updateExerciseAnchor(exName, sessionData) {
    const S = window.S;
    if (!S || !S.exerciseAnchors) return;

    const { W, R1, R2, R3, amrapFlagged, sessionStatus, daysSinceLast, skipAnchorUpdate } = sessionData;
    if (!W || !R1) return;

    // PHASE 5: Edge Case - User explicitly chose to skip anchor update (bad day safeguard)
    if (skipAnchorUpdate === true) {
      console.log(`[Anchor] Skipped update for ${exName} - user flagged as bad day`);
      return {
        previousAnchor: getExerciseAnchor(exName) || W,
        newAnchor: getExerciseAnchor(exName) || W,
        change: 0,
        sessionOutcome: 'skipped',
        adjustmentReason: 'User skipped anchor update (bad day safeguard)',
        amrapPerformed: false,
        skipped: true
      };
    }

    // PHASE 5: Edge Case - Incomplete session status blocks anchor updates
    if (sessionStatus === 'partial') {
      console.log(`[Anchor] Skipped update for ${exName} - incomplete session`);
      return {
        previousAnchor: getExerciseAnchor(exName) || W,
        newAnchor: getExerciseAnchor(exName) || W,
        change: 0,
        sessionOutcome: 'incomplete',
        adjustmentReason: 'Incomplete session - anchor update deferred until workout is fully completed',
        amrapPerformed: false,
        incomplete: true
      };
    }

    const constants = {
      alpha: 0.3,
      target_RM: 14,
      auto_nudge: 1.25,
      perfect_streak_threshold: 2,
      drop_rep_threshold: 2,
      long_gap_threshold: 14 // PHASE 5: Reset streak if >14 days gap
    };

    const anchors = S.exerciseAnchors;
    if (!anchors[exName]) {
      anchors[exName] = {
        anchor: W,
        perfect_streak_counter: 0
      };
    }

    const state = anchors[exName];
    const A_old = state.anchor;
    let A_new = A_old;
    let streak = state.perfect_streak_counter || 0;

    // PHASE 5: Edge Case - Long gap detection (reset streak if >14 days since last session)
    if (daysSinceLast !== undefined && daysSinceLast !== null && daysSinceLast > constants.long_gap_threshold) {
      console.log(`[Anchor] Long gap detected for ${exName} (${daysSinceLast} days) - resetting streak`);
      streak = 0;
      // Note: We don't block the update, just reset the streak to prevent auto-nudge after a long layoff
    }

    // Helper: compute 14RM estimate from a set using Epley-based formula
    const compute14RM = (weight, reps) => {
      return weight * (1 + reps / 30) / (1 + constants.target_RM / 30);
    };

    // Determine session outcome type and adjustment reason
    let sessionOutcome = 'unchanged';
    let adjustmentReason = '';
    let amrapPerformed = false;

    // PHASE 4: Check for user-declared AMRAP intent
    const hasAmrapIntent = amrapFlagged === true || (R3 && R3 > 12);

    // Case 1: First-set failure (R1 < 12)
    if (R1 < 12) {
      const W_14RM = compute14RM(W, R1);
      A_new = constants.alpha * W_14RM + (1 - constants.alpha) * A_old;
      streak = 0;
      sessionOutcome = 'decreased';
      adjustmentReason = `First-set failure (${R1} reps) - reduced anchor based on ${R1}RM estimate`;
    }
    // Case 2: Intentional last-set AMRAP (user-flagged or R3 > 12)
    else if (hasAmrapIntent && R3) {
      const W_14RM = compute14RM(W, R3);
      A_new = constants.alpha * W_14RM + (1 - constants.alpha) * A_old;
      amrapPerformed = true;
      // Streak continues if R1 was solid (handled below)
      if (R1 === 12 && (!R2 || (R1 - R2) < constants.drop_rep_threshold)) {
        streak += 1;
        sessionOutcome = 'increased';
        adjustmentReason = `AMRAP calibration (${R3} reps${amrapFlagged ? ' [user-flagged]' : ''}) - blended into anchor`;
      } else {
        sessionOutcome = 'increased';
        adjustmentReason = `AMRAP calibration (${R3} reps${amrapFlagged ? ' [user-flagged]' : ''}) - blended into anchor (fatigue noted)`;
      }
    }
    // Case 3: Normal session (R1 = 12 or R1 >= 12, no AMRAP)
    else {
      // Step 1: Rep-drop check
      if (R2 !== undefined && R2 !== null) {
        const drop = R1 - R2;
        if (drop >= constants.drop_rep_threshold) {
          // Fatigue is high, not a solid session
          A_new = A_old;
          streak = 0;
          sessionOutcome = 'unchanged';
          adjustmentReason = `Rep drop detected (${R1}→${R2}) - blocked increase, reset streak`;
        } else {
          // Solid session
          streak += 1;
          sessionOutcome = 'streak-building';
          adjustmentReason = `Solid session (${R1} reps, drop=${R1-R2}) - streak: ${streak}/${constants.perfect_streak_threshold}`;
        }
      } else {
        // No R2 provided, assume solid
        streak += 1;
        sessionOutcome = 'streak-building';
        adjustmentReason = `Solid session (${R1} reps, no R2 logged) - streak: ${streak}/${constants.perfect_streak_threshold}`;
      }

      // Step 2: Auto-nudge on perfect streak
      if (streak >= constants.perfect_streak_threshold) {
        A_new = A_old + constants.auto_nudge;
        streak = 0;
        sessionOutcome = 'increased';
        adjustmentReason = `Perfect streak complete (${constants.perfect_streak_threshold} sessions) - auto-nudge +${constants.auto_nudge} lbs`;
      } else {
        A_new = A_old;
      }
    }

    // Build anchor history entry
    const historyEntry = {
      timestamp: new Date().toISOString(),
      previousAnchor: Math.round(A_old * 100) / 100,
      newAnchor: Math.round(A_new * 100) / 100,
      change: Math.round((A_new - A_old) * 100) / 100,
      sessionOutcome,
      adjustmentReason,
      amrapPerformed,
      input: { W, R1, R2, R3 }
    };

    // Update state with history
    const existingHistory = state.anchorHistory || [];
    anchors[exName] = {
      anchor: A_new,
      perfect_streak_counter: streak,
      amrapPerformed,
      sessionOutcome,
      adjustmentReason,
      anchorHistory: [...existingHistory, historyEntry].slice(-50) // Keep last 50 entries
    };

    // PHASE 2: Persist anchor changes to storage
    // Trigger persistence via ApexState if available
    if (typeof window.ApexState?.persistExerciseAnchorsState === 'function') {
      // Fire-and-forget persistence to avoid blocking the UI
      window.ApexState.persistExerciseAnchorsState().catch(err => {
        console.warn('Failed to persist exercise anchors:', err);
      });
    }

    return {
      previousAnchor: Math.round(A_old * 100) / 100,
      newAnchor: Math.round(A_new * 100) / 100,
      change: Math.round((A_new - A_old) * 100) / 100,
      sessionOutcome,
      adjustmentReason,
      amrapPerformed
    };
  }

  function daysAgo(exName) {
    const entries = window.S?.exHist?.[exName];
    if (!entries || !entries.length) return null;
    const last = entries[entries.length-1].date;
    const diff = Math.floor((Date.now() - new Date(last+'T00:00:00').getTime()) / 86400000);
    return diff;
  }

  function eqTag(name) {
    const l = name.toLowerCase();
    if (/smith|barbell|ez bar/.test(l))                           return 'BB';
    if (/dumbbell|\bdb\b/.test(l))                                return 'DB';
    if (/cable/.test(l))                                          return 'Cable';
    if (/pushup|push.up/.test(l))                                 return 'BW';
    if (/pull.?up|pullup/.test(l) && !l.includes('assisted'))     return 'BW';
    if (/hyper|captain/.test(l))                                  return 'BW';
    if (/back extension/.test(l) && !l.includes('machine'))       return 'BW';
    if (/machine|assisted|hack squat|leg press|leg curl|leg extension/.test(l)) return 'Mach';
    return null;
  }

  function eqHtml(name) {
    const t = eqTag(name);
    return t ? `<span class="eq eq-${t}">[${t}]</span>` : '';
  }

  function exNameHtml(name) { return escapeHtml(name); }

  function normalizeRestTimer(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const day = String(data.day || '');
    const slotId = String(data.slotId || '').trim();
    const label = String(data.label || '').trim();
    const total = Math.max(5, Math.round(Number(data.total) || 0));
    const endsAt = Math.round(Number(data.endsAt) || 0);
    if (!['1', '2'].includes(day) || !slotId || !label || !total || !endsAt) return null;
    return { day, slotId, label, total, endsAt };
  }

  const BODY_SMOOTHING_PRESETS = {
    responsive: { weightAlpha: 0.25, waistAlpha: 0.20, label: 'Responsive' },
    balanced: { weightAlpha: 0.18, waistAlpha: 0.14, label: 'Balanced' },
    smooth: { weightAlpha: 0.12, waistAlpha: 0.10, label: 'Smooth' }
  };
  const BODY_RATE_WINDOW_OPTIONS = [7, 14, 21, 28];

  function defaultBodyCalcSettings() { return { smoothing: 'balanced', rateWindowDays: 21 }; }

  function defaultBodyMetrics() {
    return {
      height: null,
      startingWeight: null,
      goalWeight: null,
      startingWaist: null,
      profileLocked: false,
      calcSettings: defaultBodyCalcSettings(),
      logs: []
    };
  }

  function normalizeBodyCalcSettings(data) {
    const defaults = defaultBodyCalcSettings();
    const smoothing = String(data?.smoothing || defaults.smoothing).toLowerCase();
    const rateWindowDays = Number(data?.rateWindowDays);
    return {
      smoothing: BODY_SMOOTHING_PRESETS[smoothing] ? smoothing : defaults.smoothing,
      rateWindowDays: BODY_RATE_WINDOW_OPTIONS.includes(rateWindowDays) ? rateWindowDays : defaults.rateWindowDays
    };
  }

  function getBodySmoothingPreset(level) {
    return BODY_SMOOTHING_PRESETS[level] || BODY_SMOOTHING_PRESETS.balanced;
  }

  function normalizeBodyDate(v) {
    const s = String(v || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  }

  function sortBodyLogs(logs) {
    return [...logs].sort((a, b) => b.date.localeCompare(a.date));
  }

  function normalizeBodyLog(log) {
    if (!log || typeof log !== 'object' || Array.isArray(log)) return null;
    const date = normalizeBodyDate(log.date);
    const weight = sanitizePositiveMetric(log.weight);
    const waist = sanitizePositiveMetric(log.waist);
    if (!date || (weight === null && waist === null)) return null;
    return { date, weight, waist };
  }

  function applyBodyEma(logs, calcSettings = defaultBodyCalcSettings()) {
    const asc = [...logs].sort((a, b) => a.date.localeCompare(b.date));
    const preset = getBodySmoothingPreset(normalizeBodyCalcSettings(calcSettings).smoothing);
    let lastSmoothedWeight = null;
    let lastSmoothedWaist = null;
    const enriched = asc.map(log => {
      const next = { ...log, smoothedWeight: null, smoothedWaist: null };
      if (typeof log.weight === 'number') {
        lastSmoothedWeight = lastSmoothedWeight === null
          ? log.weight
          : Math.round((preset.weightAlpha * log.weight + (1 - preset.weightAlpha) * lastSmoothedWeight) * 100) / 100;
        next.smoothedWeight = lastSmoothedWeight;
      }
      if (typeof log.waist === 'number') {
        lastSmoothedWaist = lastSmoothedWaist === null
          ? log.waist
          : Math.round((preset.waistAlpha * log.waist + (1 - preset.waistAlpha) * lastSmoothedWaist) * 100) / 100;
        next.smoothedWaist = lastSmoothedWaist;
      }
      return next;
    });
    return sortBodyLogs(enriched);
  }

  function buildBodyLogs(logs, calcSettings = defaultBodyCalcSettings()) {
    return applyBodyEma(logs.map(normalizeBodyLog).filter(Boolean), calcSettings);
  }

  function normalizeBodyMetrics(data) {
    const base = defaultBodyMetrics();
    if (!data || typeof data !== 'object' || Array.isArray(data)) return base;
    base.height = sanitizePositiveMetric(data.height);
    base.startingWeight = sanitizePositiveMetric(data.startingWeight);
    base.goalWeight = sanitizePositiveMetric(data.goalWeight);
    base.startingWaist = sanitizePositiveMetric(data.startingWaist);
    base.profileLocked = !!data.profileLocked;
    base.calcSettings = normalizeBodyCalcSettings(data.calcSettings);
    base.logs = Array.isArray(data.logs) ? buildBodyLogs(data.logs, base.calcSettings) : [];
    return base;
  }

  function getBodyCalcSettings(bodyMetrics = window.S?.bodyMetrics) {
    return normalizeBodyCalcSettings(bodyMetrics?.calcSettings);
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

  function getBestExerciseVolume(exName) {
    const entries = window.S?.exHist?.[exName] || [];
    if (!entries.length) return 0;
    return Math.max(...entries.map(e => e.volume || 0));
  }

  function getExerciseSessionHistory(exName, opts={}) {
    const excludeSessionId = opts.excludeSessionId || '';
    const entries = sortExerciseHistoryEntries((window.S?.exHist[exName] || []).filter(e => {
      if (!getLoggedSetMetrics(exName, e)) return false;
      if (excludeSessionId && e.sessionId && e.sessionId === excludeSessionId) return false;
      return true;
    }));
    if (!entries.length) return [];

    const grouped = [];
    entries.forEach(entry => {
      const key = entry.sessionId || entry.date;
      let group = grouped[grouped.length - 1];
      if (!group || group.key !== key) {
        group = {key, sessionId:entry.sessionId || '', date:entry.date, entries:[]};
        grouped.push(group);
      }
      group.entries.push(entry);
    });

    return grouped.map(group => {
      const sorted = [...group.entries].sort((a,b) => a.setNum - b.setNum);
      const first = sorted[0];
      const best = sorted.reduce((top, cur) => cur.volume > top.volume ? cur : top, sorted[0]);
      const firstMetrics = getLoggedSetMetrics(exName, first) || {weight:numVal(first.weight), reps:numVal(first.reps), repOnly:!!first.repOnly};
      const bestMetrics = getLoggedSetMetrics(exName, best) || {weight:numVal(best.weight), reps:numVal(best.reps), repOnly:!!best.repOnly};
      return {
        key: group.key,
        sessionId: group.sessionId,
        date: group.date,
        entries: sorted,
        firstSet: {weight:firstMetrics.weight, reps:firstMetrics.reps, setNum:first.setNum, repOnly:firstMetrics.repOnly},
        bestSet: {weight:bestMetrics.weight, reps:bestMetrics.reps, setNum:best.setNum, repOnly:bestMetrics.repOnly}
      };
    });
  }

  function countSessionImprovements(wo) {
    return (wo || []).reduce((count, slot) => {
      if (slot.isWarmup) return count;
      return count + (getExerciseSignals(slot).currentCmp === 1 ? 1 : 0);
    }, 0);
  }

  function getExerciseSignals(slot) {
    if (typeof getSlotMetrics !== 'function' || typeof getExerciseSessionHistory !== 'function') return null;
    const metrics = getSlotMetrics(slot);
    const history = getExerciseSessionHistory(slot.exercise, {excludeSessionId:window.S?._activeSessionId || ''});
    const lastSession = history[history.length - 1] || null;
    const prevSession = history[history.length - 2] || null;
    const prevPrevSession = history[history.length - 3] || null;

    const lastSet = lastSession?.firstSet || null;
    const nowSet = metrics?.firstSet || null;
    const currentCmp = comparePerf(nowSet, lastSet);
    const lastCmp = comparePerf(lastSession?.firstSet, prevSession?.firstSet);
    const priorCmp = comparePerf(prevSession?.firstSet, prevPrevSession?.firstSet);
    const trendingUp = lastCmp === 1 && priorCmp === 1;
    const feltStrong = lastCmp === 1;

    let firstSetText = '';
    if (lastSet && nowSet) {
      firstSetText = firstSetDeltaText(nowSet, lastSet, currentCmp);
    }

    return {
      lastSet,
      nowSet,
      currentCmp,
      firstSetText,
      trendingUp,
      feltStrong
    };
  }

  function progressSignalsHtml(slot) {
    const sig = getExerciseSignals(slot);
    if (!sig || (!sig.lastSet && !sig.trendingUp && !sig.feltStrong)) return '';

    let html = '<div class="ex-signals">';
    if (sig.lastSet && sig.nowSet && sig.firstSetText) {
      const meta = perfStateMeta(sig.currentCmp);
      html += `<div class="ex-signal-line"><strong>First set:</strong> <span class="sig-text ${meta.cls}">${escapeHtml(sig.firstSetText)}</span> <span class="sig-arrow ${meta.cls}">${meta.arrow}</span></div>`;
    }
    if (sig.lastSet) {
      const meta = perfStateMeta(sig.currentCmp);
      html += `<div class="ex-signal-line"><strong>Last:</strong> ${escapeHtml(fmtSet(sig.lastSet))}`;
      if (sig.nowSet && sig.currentCmp !== null) {
        html += ` <strong>Now:</strong> ${escapeHtml(fmtSet(sig.nowSet))} <span class="sig-arrow ${meta.cls}">${meta.arrow}</span>`;
      }
      html += `</div>`;
    }
    if (sig.trendingUp) {
      html += `<div class="trend-badge">🔥 Trending Up</div>`;
    } else if (sig.feltStrong) {
      html += `<div class="context-hint">↑ Felt strong last time</div>`;
    }

    const bestVol = getBestExerciseVolume(slot.exercise);
    const liveMetrics = getSlotMetrics(slot);
    if (bestVol > 0 && liveMetrics?.bestSet?.weight * liveMetrics?.bestSet?.reps >= bestVol) {
      html += `<div class="trend-badge" style="background:rgba(74,222,128,0.1);border-color:rgba(74,222,128,0.3);color:var(--green)">⭐ New PR Volume!</div>`;
    }
    html += '</div>';
    return html;
  }

  window.escapeHtml = escapeHtml;
  window.escapeRegex = escapeRegex;
  window.getLocalDateInputValue = getLocalDateInputValue;
  window.sanitizeNumericInput = sanitizeNumericInput;
  window.ensureActiveSessionId = ensureActiveSessionId;
  window.maybeRemindBackup = maybeRemindBackup;
  window.recordCompletedExercisesAsRecent = recordCompletedExercisesAsRecent;
  window.clearPrefillForExercise = clearPrefillForExercise;
  window.numVal = numVal;
  window.fmtNum = fmtNum;
  window.fmtSet = fmtSet;
  window.fmtDate = fmtDate;
  window.fmtTime = fmtTime;
  window.supportsRepsOnlyLogging = supportsRepsOnlyLogging;
  window.getLoggedSetMetrics = getLoggedSetMetrics;
  window.getSlotMetrics = getSlotMetrics;
  window.comparePerf = comparePerf;
  window.perfStateMeta = perfStateMeta;
  window.firstSetDeltaText = firstSetDeltaText;
  window.logHasUserProgress = logHasUserProgress;
  window.slotHasProgress = slotHasProgress;
  window.workoutHasProgress = workoutHasProgress;
  window.anyWorkoutHasProgress = anyWorkoutHasProgress;
  window.rnd = rnd;
  window.findRepRange = findRepRange;
  window.estimateTarget10RM = estimateTarget10RM;
  window.getExerciseAnchor = getExerciseAnchor;
  window.updateExerciseAnchor = updateExerciseAnchor;
  window.sortExerciseHistoryEntries = sortExerciseHistoryEntries;
  window.getExerciseSessionHistory = getExerciseSessionHistory;
  window.countSessionImprovements = countSessionImprovements;
  window.sanitizePositiveMetric = sanitizePositiveMetric;
  window.normalizeRestTimer = normalizeRestTimer;
  window.defaultBodyMetrics = defaultBodyMetrics;
  window.normalizeBodyMetrics = normalizeBodyMetrics;
  window.buildBodyLogs = buildBodyLogs;
  window.getBodyCalcSettings = getBodyCalcSettings;
  window.getBodySmoothingPreset = getBodySmoothingPreset;
  window.daysAgo = daysAgo;
  window.eqTag = eqTag;
  window.eqHtml = eqHtml;
  window.exNameHtml = exNameHtml;
  window.getExerciseSignals = getExerciseSignals;
  window.progressSignalsHtml = progressSignalsHtml;
  window.isPlainObject = isPlainObject;
  window.APP_VERSION = APP_VERSION;
  window.BACKUP_REMINDER_EVERY = BACKUP_REMINDER_EVERY;
  window.BODY_RATE_WINDOW_OPTIONS = BODY_RATE_WINDOW_OPTIONS;

  window.ApexCoreUtils = {
    APP_VERSION,
    BACKUP_REMINDER_EVERY,
    isPlainObject,
    escapeHtml,
    escapeRegex,
    getLocalDateInputValue,
    sanitizeNumericInput,
    ensureActiveSessionId,
    maybeRemindBackup,
    recordCompletedExercisesAsRecent,
    clearPrefillForExercise,
    numVal,
    fmtNum,
    fmtSet,
    fmtDate,
    fmtTime,
    supportsRepsOnlyLogging,
    getLoggedSetMetrics,
    getSlotMetrics,
    comparePerf,
    perfStateMeta,
    firstSetDeltaText,
    logHasUserProgress,
    slotHasProgress,
    workoutHasProgress,
    anyWorkoutHasProgress,
    rnd,
    findRepRange,
    estimateTarget10RM,
    sortExerciseHistoryEntries,
    getBestExerciseVolume,
    getExerciseSessionHistory,
    countSessionImprovements,
    sanitizePositiveMetric,
    normalizeRestTimer,
    defaultBodyMetrics,
    normalizeBodyMetrics,
    buildBodyLogs,
    getBodyCalcSettings,
    getBodySmoothingPreset,
    daysAgo,
    eqTag,
    eqHtml,
    exNameHtml,
    getExerciseSignals,
    progressSignalsHtml,
    isPlainObject,
    BODY_RATE_WINDOW_OPTIONS
  };
})();
