(() => {
  'use strict';

  // Access state through ApexState facade if available
  const getS = () => window.ApexState?.get() || window.S;

  function persistState() {
    return window.ApexState?.persist?.() || safePersist();
  }

  function updateWorkoutNotes(value) {
    if (window.ApexState?.persistNotesForDay) {
      window.ApexState.persistNotesForDay(window.S.currentDay, value);
      return;
    }
    window.S.notes[window.S.currentDay] = value;
    persistState();
  }

  function renderWorkout() {
    const S = getS();
    const dayKey = String(S.currentDay);
    const workout = ensureWorkout(S.currentDay);
    const el = document.getElementById('tab-workout');
    if (!el) return;

    const totalSets = workout.reduce((sum, slot) => slot.isWarmup ? sum : sum + slot.numSets, 0);
    const doneSets = workout.reduce((sum, slot) => slot.isWarmup ? sum : sum + slot.sets.filter(log => log.done).length, 0);
    const pct = totalSets ? Math.round(doneSets / totalSets * 100) : 0;
    const canFinish = doneSets > 0;
    const anyProgressAnywhere = workoutHasProgress(workout);

    const rerollAllButtonHtml = `<div class="wo-actions"><button class="rr-btn" onclick="rerollAll()" ${anyProgressAnywhere ? 'disabled title="Clear or complete this workout before re-rolling"' : ''}>&#10227; Re-Roll All</button></div>`;
    let html = rerollAllButtonHtml;

    workout.forEach((slot, si) => {
      if (slot.isWarmup) {
        html += `<div class="wu-card">
          <div class="wu-info">
            <div class="wu-lbl">Warm Up</div>
            <div class="wu-name">${escapeHtml(slot.exercise)}</div>
            <div class="wu-meta">5 min</div>
            <div class="wu-reminder">Warm-up: 1&times;8 @ 50% working weight</div>
          </div>
          <button class="wu-btn" onclick="rerollWarmup()">&#10227;</button>
        </div>`;
        return;
      }

      const pinned = !!getPinnedExercise(dayKey, slot.id);
      const label = slot.label;
      const setCount = slot.numSets;

      const rawTarget = getExerciseAnchor(slot.exercise);
      const target = rawTarget !== null && rawTarget % 1 !== 0 ? rawTarget.toFixed(1) : rawTarget;
      const ago = daysAgo(slot.exercise);
      const restSec = S.restTimes[dayKey]?.[slot.id] || 90;
      const slotInProgress = slotHasProgress(slot);
      const rerollTitle = pinned ? 'Unpin to re-roll' : slotInProgress ? 'Clear or complete this exercise before re-rolling' : 'Re-roll exercise';
      let targetRowContent = target
        ? `<span class="target-row-txt">Anchor (14RM): ${target} lbs</span><span class="target-row-sub">Use for 3×12 (~2 RIR)</span>`
        : `<span class="target-row-txt no-data">Not calibrated - log a set near failure to start</span>`;

      if (target) {
        const targetHint = 'Self-correcting anchor based on your last session performance';
        targetRowContent = `<span class="target-row-txt">Anchor (14RM): ${target} lbs</span><span class="target-row-sub">${targetHint}</span>`;
      }

      const lastUsedLbl = ago !== null
        ? `<div class="last-used">${ago === 0 ? 'Used today' : ago === 1 ? 'Used yesterday' : `Last used ${ago} days ago`}</div>`
        : '';
      const pinLbl = pinned ? `<div class="last-used">Pinned to Day ${S.currentDay}</div>` : '';

      const history = typeof window.getExerciseSessionHistory === 'function' ? window.getExerciseSessionHistory(slot.exercise, {excludeSessionId: S._activeSessionId}) : [];
      const lastSess = history.length ? history[history.length - 1] : null;
      let lastSetsHtml = '';
      if (lastSess && lastSess.entries) {
        const setsText = lastSess.entries.map(e => `${e.weight}x${e.reps}`).join(', ');
        lastSetsHtml = `
          <div class="last-sets-toggle" onclick="toggleLastSets(${si})">
            <span>Last: ${setsText}</span>
            <span class="last-sets-chevron" id="lsc-${si}">&#9662;</span>
          </div>
          <div class="last-sets-detail" id="lsd-${si}" style="display:none">
            <div class="last-sets-hdr">Last Session: ${fmtDate(lastSess.date)}</div>
            ${lastSess.entries.map(e => `<div class="last-sets-row"><span>Set ${e.setNum}</span> <span>${e.weight} lbs x ${e.reps}</span></div>`).join('')}
          </div>
        `;
      }

      let setRows = `<div class="set-hdr"><span>#</span><span>Weight</span><span>Reps</span><span></span><span></span><span></span></div>`;
      slot.sets.forEach((log, li) => {
        const pf = (log.isPf && !log.done && !log.weight) ? ' pf' : '';
        const doneRow = log.done ? ' done-row' : '';
        const doneNum = log.done ? ' done-n' : '';
        const pfWeight = (log.isPf && !log.weight) ? S.prefill[dayKey]?.[slot.exercise]?.[li]?.weight || 'lbs' : 'lbs';
        const pfReps = (log.isPf && !log.reps) ? S.prefill[dayKey]?.[slot.exercise]?.[li]?.reps || slot.reps : slot.reps;
        const hasData = (log.weight !== '' && log.weight !== null) || (log.reps !== '' && log.reps !== null);
        const bestVol = typeof window.getBestExerciseVolume === 'function' ? window.getBestExerciseVolume(slot.exercise) : 0;
        const curVol = numVal(log.weight) * numVal(log.reps);
        const isLivePR = bestVol > 0 && curVol >= bestVol;

        const isSet3 = (li === 2);
        const amrapChecked = log.isAmrap ? ' checked' : '';
        const amrapDisabled = !log.done ? ' disabled' : '';
        const amrapLabel = isSet3
          ? `<label class="amrap-toggle${amrapDisabled}" title="Mark this set as an intentional AMRAP for anchor calibration">
              <input type="checkbox" data-si="${si}" data-li="${li}" data-amrap="1" onchange="toggleAmrapIntent(${si},${li},this.checked)"${amrapChecked}>
              <span>AMRAP</span>
             </label>`
          : '';

        setRows += `<div class="set-row${doneRow}" id="sr-${si}-${li}">
          <span class="set-n${doneNum}">${li + 1}${isLivePR ? '<span class="live-pr-dot" title="Live PR Volume!"></span>' : ''}</span>
          <input class="set-i${pf}" type="text" inputmode="decimal" enterkeyhint="next"
            placeholder="${escapeHtml(pfWeight)}" value="${escapeHtml(log.weight)}"
            data-si="${si}" data-li="${li}" data-f="weight"
            onfocus="this.select()"
            oninput="onSetInput(${si},${li},'weight',this.value)"
            onblur="normalizeSetFieldFromInput(this,${si},${li},'weight')"
            onkeydown="onSetKeydown(event,${si},${li},'weight')">
          <input class="set-i${pf}" type="text" inputmode="numeric" enterkeyhint="next"
            placeholder="${escapeHtml(pfReps)}" value="${escapeHtml(log.reps)}"
            data-si="${si}" data-li="${li}" data-f="reps"
            onfocus="this.select()"
            oninput="onSetInput(${si},${li},'reps',this.value)"
            onblur="normalizeSetFieldFromInput(this,${si},${li},'reps')"
            onkeydown="onSetKeydown(event,${si},${li},'reps')">
          <button class="set-cp-btn" onclick="duplicateSet(${si},${li})" aria-label="Duplicate set"
            title="Duplicate this set below">&#10010;</button>
          <button class="set-del-btn" onclick="deleteSet(${si},${li})" aria-label="Delete set"
            title="${hasData ? 'Clear values first' : 'Delete set'}"
            ${hasData ? 'disabled' : ''}>X</button>
          <button class="ck-btn${log.done ? ' checked' : ''}" onclick="toggleDone(${si},${li})" aria-label="${log.done ? 'Mark set incomplete' : 'Mark set done'}">${log.done ? '&#10003;' : '&#9675;'}</button>
          ${amrapLabel}
        </div>`;
      });

      html += `<div class="ex-card" id="ec-${si}">
        <div class="ex-hdr">
          <div class="ex-cat">${label}</div>
          <div class="ex-top">
            <div class="ex-name-group">
              <span class="ex-name">${escapeHtml(slot.exercise)}</span>
              ${eqHtml(slot.exercise)}
            </div>
            <div class="ex-ctrls">
              <div class="rest-btns" id="rest-btns-${si}">
                ${[60, 90, 120].map(seconds => `<button class="rbtn${restSec === seconds ? ' on' : ''}" data-secs="${seconds}" onclick="setRestTime(${si},${seconds})">${seconds}s</button>`).join('')}
              </div>
              <button class="ibtn${pinned ? ' locked' : ''}" onclick="toggleLock(${si})" title="${pinned ? 'Unpin from this day' : 'Pin to this day'}" aria-label="${pinned ? 'Unpin from this day' : 'Pin to this day'}">${pinned ? '&#128274;' : '&#128275;'}</button>
              <button class="ibtn" onclick="openSwapModal(${si})" title="Swap exercise" aria-label="Swap exercise" ${(slotInProgress || pinned) ? 'disabled' : ''}>&#8646;</button>
              <button class="ibtn" onclick="rerollSlot(${si})" title="${rerollTitle}" aria-label="${rerollTitle}" ${(slotInProgress || pinned) ? 'disabled' : ''}>&#10227;</button>
            </div>
          </div>
          <div id="sig-${si}">${progressSignalsHtml(slot)}</div>
          ${pinLbl}
          ${lastUsedLbl}
          <div class="ex-sets-line">
            <div class="sets-count" onclick="toggleSetEdit(${si})" title="Tap to edit" id="sc-${si}">
              <span class="cdot${slot.isCustomSets ? ' show' : ''}"></span>
              <span id="scn-${si}">${setCount}</span>
            </div>
            <span class="sets-reps-lbl">x ${slot.reps} reps</span>
          </div>
          <div class="sets-editor" id="se-${si}" style="display:none">
            <button class="sets-adj" onclick="adjustSets(${si},-1)">-</button>
            <span class="sets-cur" id="sec-${si}">${setCount}</span>
            <button class="sets-adj" onclick="adjustSets(${si},1)">+</button>
            <button class="sets-confirm" onclick="confirmSetEdit(${si})">Done</button>
          </div>
          <div class="target-row">
            <span class="target-row-ico">&#127919;</span>
            ${targetRowContent}
          </div>
          ${lastSetsHtml}
        </div>
        <div class="set-wrap">${setRows}</div>
        <div class="set-add-wrap">
          <button class="set-add-btn" onclick="addSet(${si})">+ Add Set</button>
        </div>
      </div>`;
    });

    html += `<div class="complete-sect">
      <div class="complete-inner">
        <div class="finish-lbl">Finish Session</div>
        ${totalSets > 0 ? `<div class="prog-row">
          <div class="prog-wrap"><div class="prog-bar" id="progBar" style="width:${pct}%"></div></div>
          <span class="prog-lbl" id="progLbl">${doneSets}/${totalSets}</span>
        </div>` : ''}
        <textarea class="notes-ta" id="notesTA" rows="2"
          placeholder="Session notes... (optional)"
          oninput="updateWorkoutNotes(this.value)">${S.notes[S.currentDay] || ''}</textarea>
        <button class="finish-btn${canFinish ? ' ready' : ''}" id="finishBtn"
          ${canFinish ? '' : 'disabled'}
          onclick="handleComplete()">
          ${canFinish ? '&#10003; COMPLETE WORKOUT' : 'MARK A SET DONE TO COMPLETE'}
        </button>
      </div>
    </div>`;

    el.innerHTML = html;
  }

  function updateFinishButtonState() {
    const S = getS();
    const dayKey = String(S.currentDay);
    const workout = S.workouts[dayKey] || [];
    const done = workout.reduce((sum, slot) => slot.isWarmup ? sum : sum + slot.sets.filter(log => log.done).length, 0);
    const total = workout.reduce((sum, slot) => slot.isWarmup ? sum : sum + slot.numSets, 0);
    const pct = total ? Math.round(done / total * 100) : 0;
    const finishBtn = document.getElementById('finishBtn');
    const progBar = document.getElementById('progBar');
    const progLbl = document.getElementById('progLbl');
    if (finishBtn) {
      finishBtn.disabled = done === 0;
      finishBtn.innerHTML = done > 0 ? '&#10003; COMPLETE WORKOUT' : 'MARK A SET DONE TO COMPLETE';
      finishBtn.className = 'finish-btn' + (done > 0 ? ' ready' : '');
    }
    if (progBar) progBar.style.width = `${pct}%`;
    if (progLbl) progLbl.textContent = `${done}/${total}`;
  }

  function toggleLastSets(si) {
    const det = document.getElementById(`lsd-${si}`);
    const chev = document.getElementById(`lsc-${si}`);
    if (!det || !chev) return;
    const isHidden = det.style.display === 'none';
    det.style.display = isHidden ? 'block' : 'none';
    chev.innerHTML = isHidden ? '&#9652;' : '&#9662;';
  }

  function toggleAmrapIntent(si, li, isChecked) {
    const S = getS();
    const dayKey = String(S.currentDay);
    if (!S || !S.workouts || !S.workouts[dayKey]) return;
    const slot = S.workouts[dayKey][si];
    if (!slot || !slot.sets || !slot.sets[li]) return;
    slot.sets[li].isAmrap = isChecked;
    persistState();
  }

  window.renderWorkout = renderWorkout;
  window.initWorkout = renderWorkout;
  window.cleanupWorkout = () => {};
  window.updateFinishButtonState = updateFinishButtonState;
  window.updateWorkoutNotes = updateWorkoutNotes;
  window.toggleLastSets = toggleLastSets;
  window.toggleAmrapIntent = toggleAmrapIntent;
})();
