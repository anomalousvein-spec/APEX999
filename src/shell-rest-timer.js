(() => {
  'use strict';

  let _audioCtx = null;
  let _audioUnlocked = false;
  let _audioPrimed = false;
  let _audioResumePromise = null;

  function _initAudioContext() {
    if (!_audioCtx) {
      try {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        _audioCtx.onstatechange = () => {
          if (_audioCtx.state === 'interrupted' || _audioCtx.state === 'suspended') {
            _audioUnlocked = false;
            _audioPrimed = false;
          }
        };
      } catch (e) {
        return null;
      }
    }
    return _audioCtx;
  }

  function _primeAudioForIOS() {
    const ctx = _audioCtx;
    if (!ctx || _audioPrimed) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.001;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.001);
      _audioPrimed = true;
    } catch (e) {}
  }

  function _armAudioFromGesture() {
    const ctx = _audioCtx || _initAudioContext();
    if (!ctx) return false;
    try {
      if (ctx.state === 'suspended' || ctx.state === 'interrupted') ctx.resume();
    } catch (e) {}
    _primeAudioForIOS();
    return true;
  }

  async function _ensureAudioRunningAsync() {
    const ctx = _audioCtx || _initAudioContext();
    if (!ctx) return false;
    if (ctx.state === 'running' && _audioPrimed) return true;
    if (_audioResumePromise) return _audioResumePromise;

    if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
      _audioResumePromise = ctx.resume()
        .then(() => {
          _primeAudioForIOS();
          _audioUnlocked = ctx.state === 'running' && _audioPrimed;
          return _audioUnlocked;
        })
        .catch(() => {
          _audioUnlocked = false;
          return false;
        })
        .finally(() => {
          _audioResumePromise = null;
        });
      return _audioResumePromise;
    }

    _primeAudioForIOS();
    _audioUnlocked = ctx.state === 'running' && _audioPrimed;
    return _audioUnlocked;
  }

  function _ensureAudioRunning() {
    _ensureAudioRunningAsync();
    return _audioCtx?.state === 'running' && _audioPrimed;
  }

  function _setupAudioUnlock() {
    const unlockEvents = ['touchstart', 'touchend', 'click', 'mousedown', 'keydown'];
    const unlockHandler = async (e) => {
      if (e.type === 'touchstart' && e.touches?.length > 1) return;
      _armAudioFromGesture();
      await _ensureAudioRunningAsync();
    };
    unlockEvents.forEach(evt => {
      document.body.addEventListener(evt, unlockHandler, { capture: true, passive: true });
    });
  }

  _initAudioContext();
  _setupAudioUnlock();

  async function playRestDing() {
    const isReady = await _ensureAudioRunningAsync();
    const ctx = _audioCtx;
    if (!isReady || !ctx || ctx.state !== 'running' || !_audioPrimed) {
      if (typeof showToast === 'function') {
        showToast('Time! (Tap to enable audio)', 'warn');
      }
      return;
    }
    function ding(freq, duration, vol = 0.25, decay = 2.2) {
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        filter.type = 'lowpass';
        filter.frequency.value = 1800;
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration * decay);
        osc.connect(filter).connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration * decay + 0.1);
      } catch (e) {}
    }
    ding(720, 0.22, 0.28, 2.2);
    setTimeout(() => ding(540, 0.28, 0.24, 2.0), 240);
  }

  let _restTimerId = null;
  let _restRemaining = 0;
  let _restTotal = 0;
  let _restEndsAt = 0;

  function _stopRestTimerLoop() {
    if (_restTimerId) { clearInterval(_restTimerId); _restTimerId = null; }
  }

  function _removeRestPopup() {
    document.getElementById('restPopup')?.remove();
  }

  function _persistRestTimerState() {
    if (!_restEndsAt || !_restTotal || !window.S?.restTimer?.slotId) {
      window.S.restTimer = null;
    } else {
      window.S.restTimer = {
        day: window.S.restTimer.day,
        slotId: window.S.restTimer.slotId,
        label: window.S.restTimer.label,
        total: _restTotal,
        endsAt: _restEndsAt
      };
    }
  }

  function _clearRestTimer(opts = {}) {
    const { clearPersisted = true } = opts;
    _stopRestTimerLoop();
    _removeRestPopup();
    _restRemaining = 0;
    _restTotal = 0;
    _restEndsAt = 0;
    if (clearPersisted) {
      window.S.restTimer = null;
      if (typeof safePersist === 'function') safePersist();
    }
  }

  function _showRestDoneState() {
    const popup = document.getElementById('restPopup');
    const body = document.getElementById('restBody');
    const countEl = document.getElementById('restCount');
    const progEl = document.getElementById('restProg');
    const footerBtn = document.getElementById('restActionBtn');
    if (popup) popup.classList.add('done');
    if (body) {
      body.classList.add('done');
      body.onclick = () => _clearRestTimer();
    }
    if (countEl) {
      countEl.textContent = 'REST DONE!';
      countEl.className = 'rest-count done';
    }
    if (progEl) {
      progEl.style.width = '100%';
      progEl.style.background = 'var(--lime)';
    }
    if (footerBtn) footerBtn.textContent = 'Dismiss';
  }

  function _updateRestPopup() {
    const countEl = document.getElementById('restCount');
    const progEl = document.getElementById('restProg');
    if (countEl) {
      countEl.textContent = _restRemaining + 's';
      countEl.className = 'rest-count' + (_restRemaining <= 10 ? ' urgent' : '');
    }
    if (progEl) {
      const pct = Math.max(0, _restRemaining / _restTotal * 100);
      progEl.style.width = pct + '%';
      progEl.style.background = _restRemaining <= 10 ? 'var(--orange)' : 'var(--cyan)';
    }
  }

  function _tickRestTimer() {
    if (!_restEndsAt) return;
    _restRemaining = Math.max(0, Math.ceil((_restEndsAt - Date.now()) / 1000));
    _updateRestPopup();
    if (_restRemaining <= 0) {
      _stopRestTimerLoop();
      _showRestDoneState();
      window.S.restTimer = null;
      if (typeof safePersist === 'function') safePersist();
      playRestDing().catch(() => {});
    }
  }

  function _startRestTimerLoop() {
    _stopRestTimerLoop();
    _tickRestTimer();
    if (_restRemaining > 0) {
      _restTimerId = setInterval(_tickRestTimer, 1000);
    }
  }

  function _renderRestPopup(label) {
    _removeRestPopup();
    const popup = document.createElement('div');
    popup.className = 'rest-popup';
    popup.id = 'restPopup';
    popup.innerHTML = `
      <div class="rest-popup-hdr">
        <span class="rest-popup-lbl">Rest</span>
        <span class="rest-popup-ex">${escapeHtml(label)}</span>
        <button class="rest-popup-close" onclick="_clearRestTimer()" title="Dismiss">✕</button>
      </div>
      <div class="rest-popup-body" id="restBody">
        <button class="rest-adj-btn" onclick="adjustRestTime(-15)">−15s</button>
        <div class="rest-count-wrap">
          <span class="rest-count" id="restCount">${_restRemaining}s</span>
          <div class="rest-prog-wrap">
            <div class="rest-prog-bar" id="restProg" style="width:100%"></div>
          </div>
        </div>
        <button class="rest-adj-btn" onclick="adjustRestTime(15)">+15s</button>
      </div>
      <div class="rest-popup-footer">
        <button class="rest-skip-btn" id="restActionBtn" onclick="_clearRestTimer()">Skip Rest</button>
      </div>`;
    document.body.appendChild(popup);
    if (_restRemaining <= 0) _showRestDoneState();
    else _updateRestPopup();
  }

  function restoreRestTimerIfNeeded() {
    if (typeof normalizeRestTimer !== 'function') return;
    const saved = normalizeRestTimer(window.S?.restTimer);
    if (!saved) return;
    window.S.restTimer = saved;
    _restTotal = saved.total;
    _restEndsAt = saved.endsAt;
    _restRemaining = Math.max(0, Math.ceil((saved.endsAt - Date.now()) / 1000));
    _renderRestPopup(saved.label);
    if (_restRemaining > 0) _startRestTimerLoop();
    else {
      window.S.restTimer = null;
      if (typeof safePersist === 'function') safePersist();
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (typeof safePersist === 'function') safePersist();
      _clearRestTimer({ clearPersisted: false });
      return;
    }
    if (_audioCtx?.state === 'suspended' || _audioCtx?.state === 'interrupted') _ensureAudioRunningAsync();
    restoreRestTimerIfNeeded();
  });

  window.addEventListener('pagehide', () => {
    if (typeof safePersist === 'function') safePersist();
    _clearRestTimer({ clearPersisted: false });
  });

  function startExerciseRestTimer(si) {
    _clearRestTimer({ clearPersisted: false });
    const dk = String(window.S.currentDay);
    const id = window.S.workouts[dk][si]?.id;
    const label = window.S.workouts[dk][si]?.label || '';
    _restTotal = window.S.restTimes[dk]?.[id] || 90;
    _restRemaining = _restTotal;
    _restEndsAt = Date.now() + (_restRemaining * 1000);
    window.S.restTimer = { day: dk, slotId: id || '', label, total: _restTotal, endsAt: _restEndsAt };
    _persistRestTimerState();
    if (typeof safePersist === 'function') safePersist();
    _renderRestPopup(label);
    _startRestTimerLoop();
  }

  function adjustRestTime(delta) {
    _restRemaining = Math.max(5, _restRemaining + delta);
    if (_restRemaining > _restTotal) _restTotal = _restRemaining;
    _restEndsAt = Date.now() + (_restRemaining * 1000);
    _persistRestTimerState();
    if (typeof safePersist === 'function') safePersist();
    _updateRestPopup();
  }

  window._armAudioFromGesture = _armAudioFromGesture;
  window.startExerciseRestTimer = startExerciseRestTimer;
  window.adjustRestTime = adjustRestTime;
  window._clearRestTimer = _clearRestTimer;
  window.restoreRestTimerIfNeeded = restoreRestTimerIfNeeded;

  window.ApexRestTimer = {
    playRestDing,
    startExerciseRestTimer,
    adjustRestTime,
    _clearRestTimer,
    restoreRestTimerIfNeeded
  };
})();
