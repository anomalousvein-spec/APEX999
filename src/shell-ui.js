function buildWorkoutShareText() {
  const S = window.ApexState?.get() || window.S;
  const wo = S.workouts[String(S.currentDay)] || [];
  const wk = S.curWeek === 'deload' ? 'Deload' : `Week ${S.curWeek}`;
  const liveVol = wo.reduce((a, s) => {
    if (s.isWarmup) return a;
    return a + s.sets.filter(l => l.done).reduce((b, l) => b + (parseFloat(l.weight) || 0) * (parseFloat(l.reps) || 0), 0);
  }, 0);

  let txt = `Day ${S.currentDay} - Block ${S.curBlock}, ${wk}\n${'-'.repeat(34)}\n`;
  if (liveVol > 0) txt += `Session volume so far: ${Math.round(liveVol).toLocaleString()} lbs\n${'-'.repeat(34)}\n`;

  wo.forEach(s => {
    txt += s.isWarmup
      ? `Warm Up: ${s.exercise}\n`
      : `${s.label}: ${s.exercise}  ${s.numSets}x${s.reps}\n`;
    if (!s.isWarmup) {
      s.sets.forEach((l, i) => {
        txt += `  Set ${i + 1}: ${l.weight || '-'} x ${l.reps || '-'}${l.done ? ' done' : ''}\n`;
      });
    }
  });

  return txt;
}

function refreshHeaderView() {
  if (window.ApexRuntime?.refreshHeader) {
    window.ApexRuntime.refreshHeader();
    return;
  }
  renderHeader();
}

function renderTabView(id) {
  if (window.ApexRuntime?.renderTab) {
    window.ApexRuntime.renderTab(id);
    return;
  }
  if (id === 'workout') renderWorkout();
  if (id === 'body') renderBody();
  if (id === 'history') renderHistory();
  if (id === 'analytics') renderAnalytics();
  if (id === 'sessions') renderSessions();
  if (id === 'edit') renderEdit();
}

function bindHeaderButtons() {
  const copyBtn = document.getElementById('copyBtn');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const importFile = document.getElementById('importFile');

  if (copyBtn) {
    copyBtn.onclick = () => {
      navigator.clipboard?.writeText(buildWorkoutShareText())
        .then(() => showToast('Copied ✓'))
        .catch(() => showToast('Copy failed', 'warn'));
    };
  }

  if (exportBtn) exportBtn.onclick = exportData;
  if (importBtn && importFile) importBtn.onclick = () => importFile.click();
}

function switchTab(id) {
  document.querySelectorAll('.ntab').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + id));
  refreshHeaderView();
  renderTabView(id);
}

function bindTabNavigation() {
  document.querySelectorAll('.ntab').forEach(b => {
    b.onclick = () => switchTab(b.dataset.tab);
  });
}

function setupShellUi() {
  bindHeaderButtons();
  bindTabNavigation();
}
