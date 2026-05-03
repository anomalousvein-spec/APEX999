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

  // PHASE 3: Silent coach feedback for anchor adjustments
  function showAnchorFeedback(exercise, changeText, reasonText) {
    const notification = document.createElement('div');
    notification.className = 'anchor-feedback-toast';
    notification.innerHTML = `
      <div class="feedback-header">
        <span class="feedback-icon">&#127919;</span>
        <strong>${escapeHtml(exercise)}</strong>
      </div>
      <div class="feedback-body">
        Anchor: <span class="change-value">${changeText} lbs</span>
      </div>
      <div class="feedback-reason">${escapeHtml(reasonText)}</div>
    `;
    document.body.appendChild(notification);
    
    // Trigger animation
    setTimeout(() => notification.classList.add('show'), 10);
    
    // Auto-remove after 6 seconds
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 6000);
  }

  window.showToast = showToast;
  window.showModal = showModal;
  window.closeModal = closeModal;
  window.confirmModal = confirmModal;
  window.showSessionSummary = showSessionSummary;
  window.closeSessionSummary = closeSessionSummary;
  window.showAnchorFeedback = showAnchorFeedback;
  window.ApexFeedback = {
    showToast,
    showModal,
    closeModal,
    confirmModal,
    showSessionSummary,
    closeSessionSummary,
    showAnchorFeedback
  };
})();
