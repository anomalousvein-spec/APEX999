(() => {
  'use strict';

  // Access state through ApexState facade if available
  const getS = () => window.ApexState?.get() || window.S;

  function refreshHeaderView() {
    return window.ApexRuntime?.refreshHeader?.() || renderHeader();
  }

  function refreshWorkoutView() {
    return window.ApexRuntime?.refreshWorkout?.() || renderWorkout();
  }

  function persistHeaderSelection() {
    if (window.ApexState?.persistHeaderState) {
      window.ApexState.persistHeaderState();
      return;
    }
    return window.ApexState?.persist?.() || safePersist();
  }

  function renderHeader() {
    const S = getS();
    const isDeload = S.curWeek === 'deload';
    const workoutLocked = anyWorkoutHasProgress();
    const lockTitle = workoutLocked ? 'Complete or clear your in-progress workouts to change this' : '';

    const badge = document.getElementById('bwBadge');
    if (badge) {
      badge.textContent = isDeload ? 'DELOAD' : `BLOCK ${S.curBlock} · WK ${S.curWeek}`;
      badge.className = 'bw-badge' + (isDeload ? ' deload' : '');
    }

    const blockPills = document.getElementById('blockPills');
    if (blockPills) {
      blockPills.innerHTML = [1, 2].map(block =>
        `<button class="pbtn${S.curBlock === block ? ' on' : ''}" onclick="setBlock(${block})" ${workoutLocked ? `disabled title="${lockTitle}"` : ''}>${block}</button>`
      ).join('');
    }

    const weekPills = document.getElementById('weekPills');
    if (weekPills) {
      weekPills.innerHTML = ['1', '2', '3', '4', 'deload'].map(week => {
        const isDeloadWeek = week === 'deload';
        const isOn = S.curWeek === week;
        const cls = isOn && isDeloadWeek ? 'pbtn dl-on' : !isOn && isDeloadWeek ? 'pbtn dl-off' : isOn ? 'pbtn on' : 'pbtn';
        return `<button class="${cls}" onclick="setWeek('${week}')" ${workoutLocked ? `disabled title="${lockTitle}"` : ''}>${isDeloadWeek ? 'DL' : week}</button>`;
      }).join('');
    }

    const setsBadge = document.getElementById('setsBadge');
    if (setsBadge) {
      setsBadge.textContent = isDeload ? '1x' : `${baseSets()}x`;
      setsBadge.className = 'sets-badge' + (isDeload ? ' deload' : '');
    }

    const deloadBanner = document.getElementById('dlBanner');
    if (deloadBanner) deloadBanner.style.display = isDeload ? 'block' : 'none';

    const activeTab = document.querySelector('.ntab.active')?.dataset.tab;
    const dayToggle = document.getElementById('dayToggle');
    if (dayToggle) {
      if (activeTab === 'workout') {
        dayToggle.style.display = 'flex';
        dayToggle.innerHTML = [1, 2].map(day => `
          <button class="day-btn${S.currentDay === day ? ' active' : ''}" onclick="setDay(${day})">
            <span class="day-btn-lbl">DAY ${day}</span>
            <span class="day-btn-sub">${day === 1 ? 'Pull · Legs · Shoulders' : 'Push · Legs · Shoulders'}</span>
          </button>`
        ).join('');
      } else {
        dayToggle.style.display = 'none';
      }
    }

    const count = (S.sessions || []).filter(session => session.block === S.curBlock).length;
    const sessionBadge = document.getElementById('sessBadge');
    if (sessionBadge) {
      sessionBadge.textContent = count > 9 ? '9+' : count;
      sessionBadge.className = 'nbadge' + (count > 0 ? ' show' : '');
    }
  }

  function setBlock(block) {
    if (anyWorkoutHasProgress()) {
      showToast('Complete or clear in-progress workouts before changing block', 'warn');
      return;
    }
    const S = getS();
    if (window.ApexState?.update) {
      window.ApexState.update('curBlock', block, { persist: false });
      window.ApexState.update('workouts', { '1': null, '2': null }, { persist: false });
      if (window.ApexState?.resetWorkoutLocks) {
        window.ApexState.resetWorkoutLocks();
      } else {
        window.ApexState.update('locks', { '1': {}, '2': {} }, { persist: false });
      }
    } else {
      S.curBlock = block;
      S.workouts = { '1': null, '2': null };
      S.locks = { '1': {}, '2': {} };
    }
    persistHeaderSelection();
    refreshHeaderView();
    refreshWorkoutView();
  }

  function setWeek(week) {
    if (anyWorkoutHasProgress()) {
      showToast('Complete or clear in-progress workouts before changing week', 'warn');
      return;
    }
    const S = getS();
    const weekStr = String(week);
    if (window.ApexState?.update) {
      window.ApexState.update('curWeek', weekStr, { persist: false });
      window.ApexState.update('workouts', { '1': null, '2': null }, { persist: false });
    } else {
      S.curWeek = weekStr;
      S.workouts = { '1': null, '2': null };
    }
    persistHeaderSelection();
    refreshHeaderView();
    refreshWorkoutView();
  }

  function setDay(day) {
    const S = getS();
    if (window.ApexState?.update) {
      window.ApexState.update('currentDay', day, { persist: false });
    } else {
      S.currentDay = day;
    }
    persistHeaderSelection();
    refreshHeaderView();
    refreshWorkoutView();
  }

  window.renderHeader = renderHeader;
  window.setBlock = setBlock;
  window.setWeek = setWeek;
  window.setDay = setDay;
})();
