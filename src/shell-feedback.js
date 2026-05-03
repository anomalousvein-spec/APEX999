(() => {
  'use strict';

  let modalCallback = null;

  function showToast(msg, type = '') {
    const t = document.createElement('div');
    t.className = 'toast' + (type === 'warn' ? ' warn' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  function closeModal() {
    document.getElementById('appModal')?.remove();
  }

  function confirmModal() {
    closeModal();
    modalCallback?.();
  }

  function showModal(title, msg, onConfirm) {
    modalCallback = onConfirm;
    const d = document.createElement('div');
    d.className = 'modal-bg';
    d.id = 'appModal';
    d.innerHTML = `<div class="modal">
      <h3>${title}</h3><p>${msg}</p>
      <div class="modal-btns">
        <button class="modal-cancel" onclick="closeModal()">Go Back</button>
        <button class="modal-confirm" onclick="confirmModal()">Confirm</button>
      </div>
    </div>`;
    document.body.appendChild(d);
  }

  function closeSessionSummary() {
    document.getElementById('sessionSummaryModal')?.remove();
    if (window.ApexShell?.switchTab) {
      window.ApexShell.switchTab('sessions');
      return;
    }
    if (typeof switchTab === 'function') switchTab('sessions');
  }

  function showSessionSummary(summary) {
    const topSetText = summary.topSet
      ? `${escapeHtml(summary.topSet.name)} ${fmtSet(summary.topSet)}`
      : 'No top set logged';
    const d = document.createElement('div');
    d.className = 'modal-bg summary-modal';
    d.id = 'sessionSummaryModal';
    d.onclick = closeSessionSummary;
    d.innerHTML = `<div class="modal" onclick="event.stopPropagation()">
      <h3>Session Complete</h3>
      <div class="summary-grid">
        <div class="summary-item">
          <div class="summary-k">Volume</div>
          <div class="summary-v">${Math.round(summary.totalVolume || 0).toLocaleString()} lbs</div>
        </div>
        <div class="summary-item">
          <div class="summary-k">Top Set</div>
          <div class="summary-v">${topSetText}</div>
        </div>
        <div class="summary-item">
          <div class="summary-k">Improvements</div>
          <div class="summary-v">${summary.improvements || 0}</div>
        </div>
      </div>
      <div class="modal-btns">
        <button class="modal-confirm" onclick="closeSessionSummary()">Done</button>
      </div>
    </div>`;
    document.body.appendChild(d);
  }

  window.showToast = showToast;
  window.showModal = showModal;
  window.closeModal = closeModal;
  window.confirmModal = confirmModal;
  window.showSessionSummary = showSessionSummary;
  window.closeSessionSummary = closeSessionSummary;
  window.ApexFeedback = {
    showToast,
    showModal,
    closeModal,
    confirmModal,
    showSessionSummary,
    closeSessionSummary
  };
})();
