(() => {
  'use strict';

  // Access state through ApexState facade if available
  const getS = () => window.ApexState?.get() || window.S;

  function persistState() {
    return window.ApexState?.persist?.() || safePersist();
  }

  function refreshWorkoutView() {
    return window.ApexRuntime?.refreshWorkout?.() || renderWorkout();
  }

  function refreshHeaderView() {
    return window.ApexRuntime?.refreshHeader?.() || renderHeader();
  }

  async function rerollAll() {
    const S = getS();
    const dayKey = String(S.currentDay);
    const prev = S.workouts[dayKey] || [];
    if (workoutHasProgress(prev)) {
      showToast('Clear or complete this workout before re-rolling', 'warn');
      return;
    }
    if (window.ApexState?.update) {
      window.ApexState.update('workouts', { ...S.workouts, [dayKey]: null });
    } else {
      S.workouts[dayKey] = null;
      persistState();
    }
    generateWorkout(S.currentDay, prev);
    refreshWorkoutView();
  }

  async function rerollWarmup() {
    const S = getS();
    const dayKey = String(S.currentDay);
    const workout = S.workouts[dayKey];
    const slotIdx = workout.findIndex(s => s.isWarmup);
    if (slotIdx === -1) return;
    const slot = workout[slotIdx];
    const exercise = rnd(slot.pool, [slot.exercise]);

    if (window.ApexState?.updateWorkoutSlot) {
      await window.ApexState.updateWorkoutSlot(dayKey, slotIdx, { exercise });
    } else {
      slot.exercise = exercise;
      persistState();
    }
    refreshWorkoutView();
  }

  async function rerollSlot(si) {
    const S = getS();
    const dayKey = String(S.currentDay);
    const workout = S.workouts[dayKey];
    const slot = workout[si];
    if (getPinnedExercise(dayKey, slot.id)) return;
    if (slotHasProgress(slot)) {
      showToast('Clear or complete this exercise before re-rolling', 'warn');
      return;
    }
    const pair = slot.pairId ? workout.find(s => s.id === slot.pairId) : null;
    const exclude = [slot.exercise, pair?.exercise].filter(Boolean);
    const exercise = rnd(slot.pool, exclude);
    const pf = S.prefill[dayKey]?.[exercise] || [];
    const sets = slot.sets.map((_, i) => createSetLog(pf[i]));
    const card = document.getElementById(`ec-${si}`);
    if (card) card.classList.add('rolling');

    if (window.ApexState?.updateWorkoutSlot) {
      await window.ApexState.updateWorkoutSlot(dayKey, si, { exercise, sets });
    } else {
      slot.exercise = exercise;
      slot.sets = sets;
      persistState();
    }
    setTimeout(() => refreshWorkoutView(), 180);
  }

  async function toggleLock(si) {
    const S = getS();
    const dayKey = String(S.currentDay);
    const slot = S.workouts[dayKey]?.[si];
    if (!slot || slot.isWarmup) return;
    if (!S.pins[dayKey]) {
      if (window.ApexState?.update) {
        window.ApexState.update('pins', { ...S.pins, [dayKey]: {} }, { persist: false });
      } else {
        S.pins[dayKey] = {};
      }
    }
    if (S.pins[dayKey][slot.id] === slot.exercise) {
      if (window.ApexState?.togglePinnedExerciseForSlot) {
        await window.ApexState.togglePinnedExerciseForSlot(dayKey, slot.id, slot.exercise);
      } else {
        delete S.pins[dayKey][slot.id];
        persistState();
      }
    } else {
      const pairPinned = slot.pairId ? getPinnedExercise(dayKey, slot.pairId) : null;
      if (pairPinned && pairPinned === slot.exercise) {
        showToast('Pair slot already pinned to this exercise', 'warn');
        return;
      }
      if (window.ApexState?.togglePinnedExerciseForSlot) {
        await window.ApexState.togglePinnedExerciseForSlot(dayKey, slot.id, slot.exercise);
      } else {
        S.pins[dayKey][slot.id] = slot.exercise;
        persistState();
      }
    }
    refreshWorkoutView();
  }

  function toggleSetEdit(si) {
    const S = getS();
    const line = document.getElementById(`sc-${si}`);
    const editor = document.getElementById(`se-${si}`);
    if (!line || !editor) return;
    const showing = editor.style.display !== 'none';
    editor.style.display = showing ? 'none' : 'flex';
    line.style.display = showing ? 'flex' : 'none';
    if (!showing) {
      const dayKey = String(S.currentDay);
      const currentSets = S.workouts[dayKey]?.[si]?.numSets ?? 1;
      const counter = document.getElementById(`sec-${si}`);
      if (counter) counter.textContent = currentSets;
    }
  }

  function adjustSets(si, delta) {
    const el = document.getElementById(`sec-${si}`);
    if (!el) return;
    const cur = parseInt(el.textContent) || 1;
    el.textContent = Math.max(1, Math.min(20, cur + delta));
  }

  async function confirmSetEdit(si) {
    const S = getS();
    const el = document.getElementById(`sec-${si}`);
    if (!el) return;
    const n = Math.max(1, Math.min(20, parseInt(el.textContent) || 1));
    const dayKey = String(S.currentDay);
    const slot = S.workouts[dayKey]?.[si];
    if (!slot) return;
    const pf = S.prefill[dayKey]?.[slot.exercise] || [];
    let nextSets = [...slot.sets];
    while (nextSets.length < n) {
      const i = nextSets.length;
      nextSets.push(createSetLog(pf[i]));
    }
    if (nextSets.length > n) {
      const done = nextSets.filter(set => set.done);
      const notDone = nextSets.filter(set => !set.done);
      nextSets = [...done, ...notDone].slice(0, n);
    }

    if (window.ApexState?.updateWorkoutSlot) {
      await window.ApexState.updateWorkoutSlot(dayKey, si, {
        sets: nextSets,
        numSets: n,
        isCustomSets: true
      });
      if (window.ApexState?.syncSlotHistoryEntries) {
        window.ApexState.syncSlotHistoryEntries(S.workouts[dayKey][si]);
      }
    } else {
      slot.sets = nextSets;
      slot.numSets = n;
      slot.isCustomSets = true;
      syncSlotHistoryEntries(slot);
      persistState();
    }
    refreshWorkoutView();
  }

  async function addSet(si) {
    const S = getS();
    const dayKey = String(S.currentDay);
    const slot = S.workouts[dayKey]?.[si];
    if (!slot) return;
    const nextIdx = slot.sets.length;
    const pf = S.prefill[dayKey]?.[slot.exercise] || [];
    const setLog = createSetLog(pf[nextIdx]);

    if (window.ApexState?.addWorkoutSet) {
      await window.ApexState.addWorkoutSet(dayKey, si, setLog);
    } else {
      slot.sets.push(setLog);
      slot.numSets = slot.sets.length;
      slot.isCustomSets = true;
      persistState();
    }
    refreshWorkoutView();
  }

  async function deleteSet(si, li) {
    const S = getS();
    const dayKey = String(S.currentDay);
    const slot = S.workouts[dayKey]?.[si];
    if (!slot) return;
    const log = slot.sets[li];
    if (log?.done) {
      showModal(
        'Delete completed set?',
        'This removes a completed set from the workout. Continue?',
        async () => {
          const S = getS();
          const dayKey = String(S.currentDay);
          const liveSlot = S.workouts[dayKey]?.[si];
          if (!liveSlot) return;
          if (liveSlot.sets.length <= 1) {
            const clearedSet = { weight: '', reps: '', done: false, isPf: false };
            if (window.ApexState?.updateWorkoutSet) {
              await window.ApexState.updateWorkoutSet(dayKey, si, 0, clearedSet);
              await window.ApexState.updateWorkoutSlot(dayKey, si, { numSets: 1, isCustomSets: true });
            } else {
              liveSlot.sets[0] = clearedSet;
              liveSlot.numSets = 1;
              liveSlot.isCustomSets = true;
              syncSlotHistoryEntries(liveSlot);
              persistState();
            }
            refreshWorkoutView();
            showToast('Last set cleared', 'warn');
            return;
          }

          if (window.ApexState?.deleteWorkoutSet) {
            await window.ApexState.deleteWorkoutSet(dayKey, si, li);
          } else {
            liveSlot.sets.splice(li, 1);
            liveSlot.numSets = liveSlot.sets.length;
            liveSlot.isCustomSets = true;
            syncSlotHistoryEntries(liveSlot);
            persistState();
          }
          refreshWorkoutView();
        }
      );
      return;
    }
    if (slot.sets.length <= 1) {
      const clearedSet = { weight: '', reps: '', done: false, isPf: false };
      if (window.ApexState?.updateWorkoutSet) {
        await window.ApexState.updateWorkoutSet(dayKey, si, 0, clearedSet);
        await window.ApexState.updateWorkoutSlot(dayKey, si, { numSets: 1, isCustomSets: true });
      } else {
        slot.sets[0] = clearedSet;
        slot.numSets = 1;
        slot.isCustomSets = true;
        syncSlotHistoryEntries(slot);
        persistState();
      }
      refreshWorkoutView();
      showToast('Last set cleared', 'warn');
      return;
    }

    if (window.ApexState?.deleteWorkoutSet) {
      await window.ApexState.deleteWorkoutSet(dayKey, si, li);
    } else {
      slot.sets.splice(li, 1);
      slot.numSets = slot.sets.length;
      slot.isCustomSets = true;
      syncSlotHistoryEntries(slot);
      persistState();
    }
    refreshWorkoutView();
  }

  async function onSetInput(si, li, field, val) {
    const S = getS();
    const dayKey = String(S.currentDay);
    const slot = S.workouts[dayKey][si];

    if (window.ApexState?.stageWorkoutSetInput) {
      window.ApexState.stageWorkoutSetInput(dayKey, si, li, { [field]: val, isPf: false });
    } else if (window.ApexState?.updateWorkoutSet) {
      await window.ApexState.updateWorkoutSet(dayKey, si, li, { [field]: val, isPf: false });
    } else {
      const log = slot.sets[li];
      log[field] = val;
      log.isPf = false;
      if (log.done) syncExerciseHistoryEntry(slot, li);
      persistState();
    }

    const sig = document.getElementById(`sig-${si}`);
    if (sig) sig.innerHTML = progressSignalsHtml(slot);

    const row = document.getElementById(`sr-${si}-${li}`);
    if (row) {
      const bestVol = typeof window.getBestExerciseVolume === 'function' ? window.getBestExerciseVolume(slot.exercise) : 0;
      const log = slot.sets[li];
      const curVol = (parseFloat(log.weight) || 0) * (parseFloat(log.reps) || 0);
      const isLivePR = bestVol > 0 && curVol >= bestVol;
      const label = row.querySelector('.set-n');
      if (label) {
        const existingDot = label.querySelector('.live-pr-dot');
        if (isLivePR) {
          if (!existingDot) {
            const dot = document.createElement('span');
            dot.className = 'live-pr-dot';
            dot.title = 'Live PR Volume!';
            label.appendChild(dot);
          }
        } else {
          if (existingDot) existingDot.remove();
        }
      }
    }
    if (row) {
      const btn = row.querySelector('.set-del-btn');
      const setLog = slot.sets[li];
      const hasData = (setLog.weight !== '' && setLog.weight !== null) || (setLog.reps !== '' && setLog.reps !== null);
      if (btn) {
        btn.disabled = hasData;
        btn.title = hasData ? 'Clear values first' : 'Delete set';
      }
    }
  }

  async function normalizeSetField(si, li, field, val) {
    const S = getS();
    const dayKey = String(S.currentDay);
    const clean = sanitizeNumericInput(val, field);

    if (window.ApexState?.updateWorkoutSet) {
      await window.ApexState.updateWorkoutSet(dayKey, si, li, { [field]: clean, isPf: false });
    } else {
      const S = getS();
      const slot = S.workouts[dayKey]?.[si];
      const log = slot?.sets?.[li];
      if (log) {
        log[field] = clean;
        log.isPf = false;
        if (log.done) syncExerciseHistoryEntry(slot, li);
        persistState();
      }
    }
    return clean;
  }

  function normalizeSetFieldFromInput(input, si, li, field) {
    if (!input) return;
    const clean = sanitizeNumericInput(input.value, field);
    input.value = clean;
    normalizeSetField(si, li, field, clean).catch(error => {
      console.warn('APEX normalizeSetField persistence fallback', error);
    });
  }

  function refreshSetRowUi(si, li) {
    const S = getS();
    const dayKey = String(S.currentDay);
    const slot = S.workouts[dayKey]?.[si];
    const log = slot?.sets?.[li];
    const row = document.getElementById(`sr-${si}-${li}`);
    if (!slot || !log || !row) return;

    row.classList.toggle('done-row', !!log.done);

    const label = row.querySelector('.set-n');
    if (label) {
      label.classList.toggle('done-n', !!log.done);
      const bestVol = typeof window.getBestExerciseVolume === 'function' ? window.getBestExerciseVolume(slot.exercise) : 0;
      const curVol = (parseFloat(log.weight) || 0) * (parseFloat(log.reps) || 0);
      const isLivePR = bestVol > 0 && curVol >= bestVol;
      label.innerHTML = `${li + 1}${isLivePR ? '<span class="live-pr-dot" title="Live PR Volume!"></span>' : ''}`;
    }

    const inputs = row.querySelectorAll('.set-i');
    inputs.forEach(input => input.classList.remove('pf'));
    if (inputs[0]) inputs[0].value = log.weight ?? '';
    if (inputs[1]) inputs[1].value = log.reps ?? '';

    const deleteBtn = row.querySelector('.set-del-btn');
    const hasData = (log.weight !== '' && log.weight !== null) || (log.reps !== '' && log.reps !== null);
    if (deleteBtn) {
      deleteBtn.disabled = hasData;
      deleteBtn.title = hasData ? 'Clear values first' : 'Delete set';
    }

    const checkBtn = row.querySelector('.ck-btn');
    if (checkBtn) {
      checkBtn.className = 'ck-btn' + (log.done ? ' checked' : '');
      checkBtn.innerHTML = log.done ? '&#10003;' : '&#9675;';
      checkBtn.setAttribute('aria-label', log.done ? 'Mark set incomplete' : 'Mark set done');
    }
  }

  function onSetKeydown(event, si, li, field) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const S = getS();
    const dayKey = String(S.currentDay);
    const slot = S.workouts[dayKey]?.[si];
    if (!slot) return;

    if (field === 'weight') {
      const row = document.getElementById(`sr-${si}-${li}`);
      if (row) {
        const repsInput = row.querySelectorAll('input')[1];
        if (repsInput) {
          repsInput.focus();
          repsInput.select();
        }
      }
    } else if (field === 'reps') {
      const totalSets = slot.sets.length;
      if (li < totalSets - 1) {
        const nextRow = document.getElementById(`sr-${si}-${li + 1}`);
        if (nextRow) {
          const weightInput = nextRow.querySelectorAll('input')[0];
          if (weightInput) {
            weightInput.focus();
            weightInput.select();
          }
        }
      } else {
        addSet(si);
        setTimeout(() => {
          const S = getS();
          const dayKey = String(S.currentDay);
          const slot = S.workouts[dayKey]?.[si];
          const newLi = slot.sets.length - 1;
          const newRow = document.getElementById(`sr-${si}-${newLi}`);
          if (newRow) {
            const weightInput = newRow.querySelectorAll('input')[0];
            if (weightInput) {
              weightInput.focus();
              weightInput.select();
            }
          }
        }, 80);
      }
    }
  }

  async function toggleDone(si, li) {
    const S = getS();
    const dayKey = String(S.currentDay);
    const workout = S.workouts[dayKey];
    const slot = workout[si];
    const log = slot.sets[li];
    const nextDone = !log.done;
    let nextWeight = log.weight;

    if (nextDone && !nextWeight && li > 0) {
      const prev = workout[si].sets[li - 1];
      if (prev?.weight && !prev.isPf) nextWeight = prev.weight;
    }
    if (nextDone && !S.startTime) {
      const start = new Date().toISOString();
      if (window.ApexState?.update) {
        window.ApexState.update('startTime', start, { persist: false });
      } else {
        S.startTime = start;
      }
      ensureActiveSessionId();
    }
    if (nextDone && !S._activeSessionId) ensureActiveSessionId();

    if (window.ApexState?.updateWorkoutSet) {
      await window.ApexState.updateWorkoutSet(dayKey, si, li, { done: nextDone, weight: nextWeight, isPf: false });
    } else {
      log.done = nextDone;
      log.weight = nextWeight;
      log.isPf = false;
      syncExerciseHistoryEntry(slot, li);
      persistState();
    }

    if (nextDone) {
      _armAudioFromGesture();
      startExerciseRestTimer(si);
    }
    const shouldFocusNext = nextDone && li < workout[si].sets.length - 1;
    const sig = document.getElementById(`sig-${si}`);
    if (sig) sig.innerHTML = progressSignalsHtml(slot);
    refreshSetRowUi(si, li);
    updateFinishButtonState();
    if (shouldFocusNext) {
      setTimeout(() => {
        const nextInput = document.querySelector(`input[data-si="${si}"][data-li="${li + 1}"][data-f="weight"]`);
        if (nextInput) {
          nextInput.focus();
          nextInput.select?.();
        }
      }, 80);
    }
  }

  async function setRestTime(si, secs) {
    const S = getS();
    const dayKey = String(S.currentDay);
    const id = S.workouts[dayKey][si].id;
    if (window.ApexState?.persistRestTimeForSlot) {
      await window.ApexState.persistRestTimeForSlot(dayKey, id, secs);
    } else {
      if (!S.restTimes[dayKey]) {
        if (window.ApexState?.update) {
          window.ApexState.update('restTimes', { ...S.restTimes, [dayKey]: {} }, { persist: false });
        } else {
          S.restTimes[dayKey] = {};
        }
      }
      S.restTimes[dayKey][id] = secs;
      persistState();
    }
    const wrap = document.getElementById(`rest-btns-${si}`);
    if (wrap) {
      wrap.querySelectorAll('.rbtn').forEach(button => {
        button.className = 'rbtn' + (parseInt(button.dataset.secs) === secs ? ' on' : '');
      });
    }
  }

  function handleComplete() {
    const S = getS();
    const dayKey = String(S.currentDay);
    const workout = S.workouts[dayKey];
    const total = workout.reduce((sum, slot) => slot.isWarmup ? sum : sum + slot.numSets, 0);
    const done = workout.reduce((sum, slot) => slot.isWarmup ? sum : sum + slot.sets.filter(log => log.done).length, 0);
    
    // PHASE 4: Session validation - ensure minimum data quality before completion
    if (done === 0) {
      showToast('Mark at least one set as done before completing', 'warn');
      return;
    }
    
    // PHASE 4: Validate exercises have required data for anchor calculation
    const exercisesWithData = workout.filter(slot => {
      if (slot.isWarmup) return false;
      const doneSets = slot.sets.filter(s => s.done);
      return doneSets.length > 0 && doneSets[0].reps !== '' && doneSets[0].weight !== '';
    });
    
    if (exercisesWithData.length === 0) {
      showToast('Complete at least one exercise with weight and reps to finish session', 'warn');
      return;
    }
    
    if (done < total) {
      showModal(
        'Incomplete Sets',
        `${total - done} set${total - done !== 1 ? 's' : ''} not marked done. Complete workout anyway?`,
        doComplete
      );
    } else {
      doComplete();
    }
  }

  async function doComplete() {
    const S = getS();
    const dayKey = String(S.currentDay);
    const workout = S.workouts[dayKey];
    const notes = (S.notes[S.currentDay] || '').trim();
    let totalVol = 0;
    let topSet = null;
    const exercises = [];
    const improvements = countSessionImprovements(workout);

    workout.forEach(slot => {
      if (slot.isWarmup) return;
      const doneLogs = slot.sets
        .map(log => ({ log, metrics: log.done ? getLoggedSetMetrics(slot.exercise, log) : null }))
        .filter(item => item.metrics);
      if (!doneLogs.length) return;
      const volumes = doneLogs.map(item => item.metrics.volume);
      const slotVol = volumes.reduce((sum, vol) => sum + vol, 0);
      totalVol += slotVol;
      const bestIndex = volumes.indexOf(Math.max(...volumes));
      const bestMetrics = doneLogs[bestIndex].metrics;
      const bestWeight = bestMetrics.weight;
      const bestReps = bestMetrics.reps;
      const bestVolume = bestMetrics.volume;
      if (!topSet || bestVolume > topSet.volume) {
        topSet = { name: slot.exercise, weight: bestWeight, reps: bestReps, volume: bestVolume, repOnly: bestMetrics.repOnly };
      }
      exercises.push({
        name: slot.exercise,
        cat: slot.cat,
        setsCompleted: doneLogs.length,
        totalSets: slot.numSets,
        totalVolume: slotVol,
        bestSet: { weight: bestWeight, reps: bestReps, volume: bestVolume, repOnly: bestMetrics.repOnly }
      });
    });

    const duration = S.startTime ? Math.round((Date.now() - new Date(S.startTime).getTime()) / 60000) : null;
    const totalSets = workout.reduce((sum, slot) => slot.isWarmup ? sum : sum + slot.numSets, 0);
    const doneSets = workout.reduce((sum, slot) => slot.isWarmup ? sum : sum + slot.sets.filter(log => log.done).length, 0);
    const volByCat = {};
    exercises.forEach(ex => {
      const cat = ex.cat || 'other';
      volByCat[cat] = (volByCat[cat] || 0) + (ex.totalVolume || 0);
    });

    const sessionId = S._activeSessionId || (Date.now() + '-' + Math.random().toString(36).slice(2, 8));
    
    // PHASE 4: Session status tracking for proper lifecycle management
    const totalExpectedSets = workout.reduce((sum, slot) => slot.isWarmup ? sum : sum + slot.numSets, 0);
    const sessionStatus = doneSets >= totalExpectedSets ? 'completed' : 'partial';
    
    const session = {
      id: sessionId,
      date: new Date().toISOString(),
      day: S.currentDay,
      block: S.curBlock,
      week: S.curWeek,
      notes,
      exercises,
      totalSessionVolume: totalVol,
      totalSetsCompleted: doneSets,
      totalSets,
      durationMinutes: duration,
      volByCat,
      status: sessionStatus  // PHASE 4: Track session completion status
    };

    const pf = {};
    workout.forEach(slot => {
      if (slot.isWarmup) return;
      pf[slot.exercise] = slot.sets.map(log => ({ weight: log.weight || '', reps: log.reps || '' }));
    });

    // PHASE 1: Per-session anchor update with intent detection and feedback
    // Collect session data for each exercise and update anchors at session level
    const anchorUpdates = [];
    
    // PHASE 5: Get session history for days-since-last calculation
    const getExerciseSessionHistory = window.ApexCoreUtils?.getExerciseSessionHistory || window.getExerciseSessionHistory;
    
    exercises.forEach(ex => {
      const slot = workout.find(s => s.exercise === ex.name);
      if (!slot || slot.isWarmup) return;

      // Collect all done sets for this exercise to determine R1, R2, R3
      const doneSets = slot.sets.filter(s => s.done).map(s => ({
        setNum: parseInt(s.setNum || 1),
        weight: parseFloat(s.weight) || 0,
        reps: parseFloat(s.reps) || 0,
        isAmrap: !!s.isAmrap  // PHASE 4: Capture AMRAP flag from set log
      })).sort((a, b) => a.setNum - b.setNum);

      if (doneSets.length > 0 && typeof updateExerciseAnchor === 'function') {
        // PHASE 5: Calculate days since last session for this exercise
        let daysSinceLast = null;
        if (typeof getExerciseSessionHistory === 'function') {
          const history = getExerciseSessionHistory(ex.name, { excludeSessionId: sessionId });
          if (history && history.length > 0) {
            const lastSessionDate = new Date(history[0].date);
            const today = new Date();
            const diffTime = Math.abs(today - lastSessionDate);
            daysSinceLast = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          }
        }
        
        const sessionData = {
          W: doneSets[0].weight,
          R1: doneSets[0].reps,
          R2: doneSets.length >= 2 ? doneSets[1].reps : undefined,
          R3: doneSets.length >= 3 ? doneSets[2].reps : undefined,
          amrapFlagged: doneSets.some(s => s.isAmrap),  // PHASE 4: User-declared AMRAP intent
          sessionStatus: sessionStatus,  // PHASE 5: Pass session completion status
          daysSinceLast: daysSinceLast,  // PHASE 5: Days since last session for streak reset
          skipAnchorUpdate: false  // PHASE 5: Default to false; can be overridden via UI prompt
        };

        // Detect AMRAP intent: prioritize user flag, fall back to R3 > 12 heuristic
        const amrapFlag = sessionData.amrapFlagged || (sessionData.R3 && sessionData.R3 > 12);

        // Update anchor and get detailed feedback
        const result = updateExerciseAnchor(ex.name, sessionData);

        if (result) {
          anchorUpdates.push({
            exercise: ex.name,
            ...result,
            amrapFlag
          });
        }
      }
    });

    _clearRestTimer({ clearPersisted: false });

    if (window.ApexState?.addSession) {
      await window.ApexState.addSession(session, dayKey, pf, workout, anchorUpdates);
    } else {
      S.sessions = [session, ...S.sessions];
      S.prefill[dayKey] = pf;
      if (window.ApexState?.persistRecentExercisesForWorkout) {
        window.ApexState.persistRecentExercisesForWorkout(dayKey, workout);
      } else {
        recordCompletedExercisesAsRecent(dayKey, workout);
      }
      S.workouts[dayKey] = null;
      S.startTime = null;
      S._activeSessionId = null;
      S.restTimer = null;
      S.notes[S.currentDay] = '';
      persistState();
    }
    maybeRemindBackup();
    generateWorkout(S.currentDay);
    refreshWorkoutView();
    showToast('Workout saved');
    
    // PHASE 3: Show anchor adjustment feedback (silent coach)
    if (anchorUpdates && anchorUpdates.length > 0) {
      anchorUpdates.forEach(update => {
        // Skip feedback for skipped/incomplete sessions - they don't change the anchor
        if (update.skipped || update.incomplete) {
          console.log(`[Feedback] Skipping notification for ${update.exercise} - ${update.sessionOutcome}`);
          return;
        }
        
        // Only show feedback when anchor actually changed
        if (update.change !== 0) {
          const changeText = update.change > 0 ? `+${update.change.toFixed(1)}` : update.change.toFixed(1);
          const reasonText = update.adjustmentReason || 'Session complete';
          showAnchorFeedback(update.exercise, changeText, reasonText);
        } else if (update.sessionOutcome === 'unchanged' || update.sessionOutcome === 'streak-building') {
          // Optional: Show subtle feedback for unchanged anchor with reason (e.g., rep drop detected)
          // This provides transparency about why no increase happened
          console.log(`[Feedback] Anchor unchanged for ${update.exercise}: ${update.adjustmentReason}`);
        }
      });
    }
    
    showSessionSummary({ totalVolume: totalVol, topSet, improvements });
  }

  window.rerollAll = rerollAll;
  window.rerollWarmup = rerollWarmup;
  window.rerollSlot = rerollSlot;
  function openSwapModal(si) {
    const S = getS();
    const dayKey = String(S.currentDay);
    const workout = S.workouts[dayKey];
    const slot = workout[si];
    if (!slot || !slot.pool) return;

    const listHtml = slot.pool.map(ex => `
      <button class="srch-opt" style="width:100%;text-align:left;padding:12px;border-bottom:1px solid var(--bdr);background:none;color:var(--text);border-left:none;border-right:none;border-top:none"
        onclick="swapExercise(${si}, '${ex.replace(/'/g, "\\'")}')">
        ${escapeHtml(ex)}
      </button>
    `).join('');

    showModal(
      `Swap ${escapeHtml(slot.label)}`,
      `<div style="max-height:300px;overflow-y:auto;margin-top:10px;border:1px solid var(--bdr);border-radius:8px">${listHtml}</div>`,
      null
    );
    // Overwrite the default modal buttons to just be a cancel/close
    const modal = document.getElementById('appModal');
    if (modal) {
      const btnArea = modal.querySelector('.modal-btns');
      if (btnArea) btnArea.innerHTML = '<button class="modal-cancel" style="flex:1" onclick="closeModal()">Cancel</button>';
    }
  }

  async function swapExercise(si, newEx) {
    closeModal();
    const S = getS();
    const dayKey = String(S.currentDay);
    const workout = S.workouts[dayKey];
    const slot = workout[si];
    if (!slot || slot.exercise === newEx) return;

    const pf = S.prefill[dayKey]?.[newEx] || [];
    const sets = slot.sets.map((_, i) => createSetLog(pf[i]));

    if (window.ApexState?.updateWorkoutSlot) {
      await window.ApexState.updateWorkoutSlot(dayKey, si, { exercise: newEx, sets });
    } else {
      slot.exercise = newEx;
      slot.sets = sets;
      persistState();
    }
    refreshWorkoutView();
    showToast(`Swapped to ${newEx}`);
  }

  window.openSwapModal = openSwapModal;
  async function duplicateSet(si, li) {
    const S = getS();
    const dayKey = String(S.currentDay);
    const slot = S.workouts[dayKey]?.[si];
    if (!slot) return;
    const log = slot.sets[li];
    if (!log) return;

    const newSet = {
      weight: log.weight || '',
      reps: log.reps || '',
      done: false,
      isPf: false
    };

    if (window.ApexState?.addWorkoutSet) {
      // The addWorkoutSet currently appends to the end.
      // For consistency with typical workout apps, let's append but we can later refine if needed to insert at li+1.
      // Currently the UI is structured to add to the end mostly.
      // Let's modify addWorkoutSet to allow insertion if we wanted, or just push.
      // The requirement was "below the current one".

      const nextSets = [...slot.sets];
      nextSets.splice(li + 1, 0, newSet);

      await window.ApexState.updateWorkoutSlot(dayKey, si, {
        sets: nextSets,
        numSets: nextSets.length,
        isCustomSets: true
      });
      if (window.ApexState?.syncSlotHistoryEntries) {
        window.ApexState.syncSlotHistoryEntries(S.workouts[dayKey][si]);
      }
    } else {
      slot.sets.splice(li + 1, 0, newSet);
      slot.numSets = slot.sets.length;
      slot.isCustomSets = true;
      syncSlotHistoryEntries(slot);
      persistState();
    }
    refreshWorkoutView();
    showToast('Set duplicated');
  }

  window.duplicateSet = duplicateSet;
  window.swapExercise = swapExercise;
  window.toggleLock = toggleLock;
  window.toggleSetEdit = toggleSetEdit;
  window.adjustSets = adjustSets;
  window.confirmSetEdit = confirmSetEdit;
  window.addSet = addSet;
  window.deleteSet = deleteSet;
  window.onSetInput = onSetInput;
  window.normalizeSetField = normalizeSetField;
  window.normalizeSetFieldFromInput = normalizeSetFieldFromInput;
  window.onSetKeydown = onSetKeydown;
  window.toggleDone = toggleDone;
  window.setRestTime = setRestTime;
  window.handleComplete = handleComplete;
  window.doComplete = doComplete;
})();
