(() => {
  'use strict';

  // Access state through ApexState facade if available
  const getS = () => window.ApexState?.get() || window.S;

  let _selEx = '';
  let _analyticsCat = '';
  let _analyticsEx = '';
  let _editingSessId = null;
  let _historyOutsideClickBound = false;
  let _analyticsRenderTimer = null;
  let _historySearchTimer = null;
  let _exerciseOptionsCache = null;
  let _weeklyVolumeBucketsCache = null;
  let _muscleGroupsCache = null;

/**
 * EXPORTS FOR WORKOUT-LIVE
 */
window.getBestExerciseVolume = function(exName) {
  if (typeof ApexCoreUtils?.getBestExerciseVolume === 'function') {
    return ApexCoreUtils.getBestExerciseVolume(exName);
  }
  return 0;
};

function rebuildExerciseOptionsCache() {
  const S = getS();
  const s = new Set();
  Object.values(S.pools.shared).forEach(m => m.pool.forEach(e => s.add(e)));
  Object.values(S.pools.day1).forEach(m => m.pool.forEach(e => s.add(e)));
  Object.values(S.pools.day2).forEach(m => m.pool.forEach(e => s.add(e)));
  Object.keys(S.exHist).forEach(e => s.add(e));
  _exerciseOptionsCache = [...s].sort();
  return _exerciseOptionsCache;
}

function getAllExercises() {
  return _exerciseOptionsCache || rebuildExerciseOptionsCache();
}

function rebuildReviewDerivedCaches() {
  const S = getS();
  const sorted = [...(S.sessions || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
  const map = new Map();
  const cats = new Set();

  sorted.forEach(session => {
    const key = getWeekStartKey(session.date);
    if (!map.has(key)) map.set(key, {key, start:key, sessions:[], volByCat:{}, exVolByCat:{}});
    const bucket = map.get(key);
    bucket.sessions.push(session);
    const volByCat = getSessionVolByCat(session);
    Object.entries(volByCat).forEach(([cat, vol]) => {
      cats.add(cat);
      bucket.volByCat[cat] = (bucket.volByCat[cat] || 0) + (vol || 0);
    });
    (session.exercises || []).forEach(ex => {
      const cat = ex?.cat || 'other';
      const name = ex?.name;
      if (!name) return;
      if (!bucket.exVolByCat[cat]) bucket.exVolByCat[cat] = {};
      bucket.exVolByCat[cat][name] = (bucket.exVolByCat[cat][name] || 0) + (ex.totalVolume || 0);
    });
  });

  _weeklyVolumeBucketsCache = [...map.values()];
  _muscleGroupsCache = [...cats].sort();
}

function getSessionVolByCat(session) {
  if (session?.volByCat && typeof session.volByCat === 'object') return session.volByCat;
  const out = {};
  (session?.exercises || []).forEach(ex => {
    const cat = ex?.cat || 'other';
    out[cat] = (out[cat] || 0) + (ex?.totalVolume || 0);
  });
  return out;
}

function getWeekStartKey(iso) {
  const d = new Date(iso);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function getWeeklyVolumeBuckets() {
  if (!_weeklyVolumeBucketsCache) rebuildReviewDerivedCaches();
  return _weeklyVolumeBucketsCache || [];
}

function getAllMuscleGroups() {
  if (!_muscleGroupsCache) rebuildReviewDerivedCaches();
  return _muscleGroupsCache || [];
}

function fmtCat(cat) {
  return CAT_LABELS?.[cat] || cat;
}

function fmtShortDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {month:'short', day:'numeric'});
}

function getVolumeTrendData(cat) {
  return getWeeklyVolumeBuckets().map(bucket => ({
    label: fmtShortDate(bucket.start),
    value: bucket.volByCat[cat] || 0
  }));
}

function renderAnalyticsLineChart(data) {
  if (!data || data.length < 2) return `<div class="analytics-empty">Log at least 2 weeks to see a trend.</div>`;
  const width = 320;
  const height = 180;
  const padL = 14;
  const padR = 10;
  const padT = 12;
  const padB = 22;
  const values = data.map(d => d.value);
  const maxVal = Math.max(...values, 1);
  const minVal = Math.min(...values, 0);
  const range = maxVal - minVal || 1;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const pts = data.map((d, i) => {
    const x = padL + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
    const y = padT + (1 - ((d.value - minVal) / range)) * plotH;
    return {x, y, label:d.label, value:d.value};
  });
  const line = pts.map(p => `${p.x},${p.y}`).join(' ');
  const area = `${padL},${height-padB} ` + pts.map(p => `${p.x},${p.y}`).join(' ') + ` ${padL + plotW},${height-padB}`;
  const grid = [0, 0.5, 1].map(t => {
    const y = padT + t * plotH;
    return `<line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" class="analytics-grid-line"></line>`;
  }).join('');
  const xLabels = pts.map((p, i) => {
    if (pts.length > 6 && i % 2 === 1 && i !== pts.length - 1) return '';
    return `<text x="${p.x}" y="${height-6}" text-anchor="middle" class="analytics-axis">${escapeHtml(p.label)}</text>`;
  }).join('');
  const yTop = `<text x="${padL}" y="${padT-2}" text-anchor="start" class="analytics-axis">${fmtNum(maxVal)} lbs</text>`;
  return `<svg viewBox="0 0 ${width} ${height}" class="analytics-chart" preserveAspectRatio="none" aria-hidden="true">
    ${grid}
    <polyline points="${area}" class="analytics-area"></polyline>
    <polyline points="${line}" class="analytics-line"></polyline>
    ${pts.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3.5" class="analytics-point"></circle>`).join('')}
    ${yTop}
    ${xLabels}
  </svg>`;
}

function renderMuscleGroupDistribution() {
  const S = getS();
  const sessions = S.sessions || [];
  if (!sessions.length) return '';

  const thirtyDaysAgo = Date.now() - (30 * 86400000);
  const recentSessions = sessions.filter(s => new Date(s.date).getTime() >= thirtyDaysAgo);
  if (!recentSessions.length) return '';

  const volMap = {};
  let totalVol = 0;

  recentSessions.forEach(s => {
    const volByCat = getSessionVolByCat(s);
    Object.entries(volByCat).forEach(([cat, vol]) => {
      volMap[cat] = (volMap[cat] || 0) + vol;
      totalVol += vol;
    });
  });

  if (totalVol === 0) return '';

  const sorted = Object.entries(volMap).sort((a, b) => b[1] - a[1]);

  const barsHtml = sorted.map(([cat, vol]) => {
    const pct = Math.round(vol / totalVol * 100);
    return `
      <div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px">
          <span style="color:var(--m1)">${escapeHtml(fmtCat(cat))}</span>
          <span style="color:var(--m2)">${pct}%</span>
        </div>
        <div style="height:6px;background:rgba(255,255,255,0.05);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:var(--cyan);border-radius:3px"></div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="analytics-card">
      <div class="analytics-hdr">
        <div>
          <div class="analytics-title">Volume Distribution</div>
          <div class="analytics-sub">Relative training focus by muscle group over the last 30 days.</div>
        </div>
      </div>
      <div style="margin-top:10px">${barsHtml}</div>
    </div>
  `;
}

function renderVolumeHeatmap() {
  const buckets = getWeeklyVolumeBuckets();
  const cats = getAllMuscleGroups();
  if (!buckets.length || !cats.length) return `<div class="analytics-empty">Complete a few sessions to build the heatmap.</div>`;
  let maxVol = 0;
  buckets.forEach(bucket => cats.forEach(cat => { maxVol = Math.max(maxVol, bucket.volByCat[cat] || 0); }));
  let html = `<div class="heatmap-wrap"><table class="heatmap"><thead><tr><th class="heatmap-cat">Muscle</th>`;
  buckets.forEach(bucket => { html += `<th>${escapeHtml(fmtShortDate(bucket.start))}</th>`; });
  html += `</tr></thead><tbody>`;
  cats.forEach(cat => {
    html += `<tr><td class="heatmap-cat">${escapeHtml(fmtCat(cat))}</td>`;
    buckets.forEach(bucket => {
      const vol = bucket.volByCat[cat] || 0;
      const t = maxVol ? vol / maxVol : 0;
      const bg = `rgba(232,255,71,${(0.08 + t * 0.42).toFixed(3)})`;
      const color = t > 0.6 ? '#091000' : 'var(--text)';
      const safeCat = cat.replace(/'/g, "\\'");
      html += `<td style="background:${bg};color:${color};cursor:${vol ? 'pointer' : 'default'}"
                  onclick="${vol ? `showVolumeBreakdown('${safeCat}', '${bucket.start}')` : ''}">${vol ? Math.round(vol).toLocaleString() : '&mdash;'}</td>`;
    });
    html += `</tr>`;
  });
  html += `</tbody></table></div>`;
  return html;
}

function estimate1RM(exName) {
  const S = getS();
  const entries = S.exHist[exName] || [];
  const valid = entries.filter(e => {
    const r = parseFloat(e.reps);
    const w = parseFloat(e.weight);
    return Number.isFinite(r) && Number.isFinite(w) && w > 0 && r >= 1 && r <= 20;
  });
  if (valid.length < 2) return null;
  let total = 0;
  let totalWeight = 0;
  valid.forEach(e => {
    const W = parseFloat(e.weight);
    const R = parseFloat(e.reps);
    const est = W * (1 + R / 30);
    const wt = 1 / (Math.abs(R - 8) + 1);
    total += est * wt;
    totalWeight += wt;
  });
  return totalWeight ? Math.round(total / totalWeight) : null;
}

function get1RMConfidence(exName) {
  const S = getS();
  const entries = S.exHist[exName] || [];
  const valid = entries.filter(e => {
    const r = parseFloat(e.reps);
    const w = parseFloat(e.weight);
    return Number.isFinite(r) && Number.isFinite(w) && w > 0 && r >= 1 && r <= 20;
  });
  if (valid.length < 3) return {label:'Low', cls:'low', count:valid.length};
  const estimates = valid.map(e => parseFloat(e.weight) * (1 + parseFloat(e.reps) / 30));
  const mean = estimates.reduce((a, b) => a + b, 0) / estimates.length;
  const variance = estimates.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / estimates.length;
  const cv = mean ? Math.sqrt(variance) / mean : 1;
  if (valid.length >= 8 && cv < 0.12) return {label:'High', cls:'high', count:valid.length};
  if (valid.length >= 5 && cv < 0.2) return {label:'Medium', cls:'medium', count:valid.length};
  return {label:'Low', cls:'low', count:valid.length};
}

function renderAnalytics() {
  rebuildExerciseOptionsCache();
  rebuildReviewDerivedCaches();
  const S = getS();
  const el = document.getElementById('tab-analytics');
  const sessions = S.sessions || [];
  if (!sessions.length) {
    el.innerHTML = `<div class="empty">No analytics yet<span>Complete a few sessions to unlock muscle group trends.</span></div>`;
    return;
  }

  const cats = getAllMuscleGroups();
  if (!_analyticsCat || !cats.includes(_analyticsCat)) _analyticsCat = cats[0] || '';
  const trendData = _analyticsCat ? getVolumeTrendData(_analyticsCat) : [];
  const nonZeroTrend = trendData.some(p => p.value > 0) ? trendData : [];
  const latestVol = nonZeroTrend.length ? nonZeroTrend[nonZeroTrend.length - 1].value : 0;
  const prevVol = nonZeroTrend.length > 1 ? nonZeroTrend[nonZeroTrend.length - 2].value : 0;

  const exerciseOptions = getAllExercises();
  const oneRm = _analyticsEx ? estimate1RM(_analyticsEx) : null;
  const conf = _analyticsEx ? get1RMConfidence(_analyticsEx) : null;
  const history = _analyticsEx ? getExerciseSessionHistory(_analyticsEx) : [];
  const recentSet = history.length ? history[history.length - 1].bestSet : null;

  el.innerHTML = `<div class="analytics-grid">
    ${renderMuscleGroupDistribution()}

    <div class="analytics-card">
      <div class="analytics-hdr">
        <div>
          <div class="analytics-title">Muscle Group Trend</div>
          <div class="analytics-sub">Weekly volume is summed across all exercises in the selected muscle group.</div>
        </div>
      </div>
      <div class="analytics-row">
        <select class="analytics-select" id="analyticsCatSelect">
          ${cats.map(cat => `<option value="${escapeHtml(cat)}"${cat===_analyticsCat?' selected':''}>${escapeHtml(fmtCat(cat))}</option>`).join('')}
        </select>
      </div>
      <div class="analytics-chart-wrap">${renderAnalyticsLineChart(nonZeroTrend)}</div>
      <div class="analytics-stat-row">
        <div class="analytics-stat"><div class="analytics-stat-lbl">Latest Week</div><div class="analytics-stat-val">${latestVol ? Math.round(latestVol).toLocaleString() : '&mdash;'}</div></div>
        <div class="analytics-stat"><div class="analytics-stat-lbl">Prev Week</div><div class="analytics-stat-val">${prevVol ? Math.round(prevVol).toLocaleString() : '&mdash;'}</div></div>
        <div class="analytics-stat"><div class="analytics-stat-lbl">Weeks Logged</div><div class="analytics-stat-val">${trendData.length}</div></div>
      </div>
    </div>

    <div class="analytics-card">
      <div class="analytics-hdr">
        <div>
          <div class="analytics-title">Volume Heatmap</div>
          <div class="analytics-sub">Use this to spot undertrained muscle groups and compare weekly loading.</div>
        </div>
      </div>
      ${renderVolumeHeatmap()}
    </div>

    <div class="analytics-card">
      <div class="analytics-hdr">
        <div>
          <div class="analytics-title">Exercise 1RM Estimate</div>
          <div class="analytics-sub">Estimated from your logged sets using an Epley-style formula, weighted toward moderate rep work.</div>
        </div>
      </div>
      <div class="analytics-row">
        <input class="analytics-input" id="analyticsExInput" list="analyticsExerciseList" placeholder="Type or choose an exercise" value="${escapeHtml(_analyticsEx)}">
        <datalist id="analyticsExerciseList">
          ${exerciseOptions.map(ex => `<option value="${escapeHtml(ex)}"></option>`).join('')}
        </datalist>
      </div>
      ${_analyticsEx && oneRm ? `<div class="analytics-stat-row">
        <div class="analytics-stat"><div class="analytics-stat-lbl">Estimated 1RM</div><div class="analytics-stat-val">${fmtNum(oneRm)} lbs</div></div>
        <div class="analytics-stat"><div class="analytics-stat-lbl">Confidence</div><div class="analytics-stat-val"><span class="confidence-chip ${conf.cls}">${conf.label}</span></div></div>
        <div class="analytics-stat"><div class="analytics-stat-lbl">Sets Used</div><div class="analytics-stat-val">${conf.count}</div></div>
      </div>
      <div class="analytics-sub" style="margin-top:10px">${recentSet ? `Most recent strong set: ${fmtSet(recentSet)}` : 'Add more logged sets to strengthen the estimate.'}</div>`
      : `<div class="analytics-empty">${_analyticsEx ? 'Not enough set history yet. Log at least 2 valid sets for this exercise.' : 'Choose an exercise to estimate 1RM.'}</div>`}
    </div>
  </div>`;

  document.getElementById('analyticsCatSelect')?.addEventListener('change', e => {
    _analyticsCat = e.target.value;
    renderAnalytics();
  });
  document.getElementById('analyticsExInput')?.addEventListener('input', e => {
    _analyticsEx = e.target.value.trim();
    scheduleAnalyticsRender();
  });
  document.getElementById('analyticsExInput')?.addEventListener('change', e => {
    _analyticsEx = e.target.value.trim();
    scheduleAnalyticsRender(0);
  });
}

function scheduleAnalyticsRender(delay = 120) {
  if (_analyticsRenderTimer) clearTimeout(_analyticsRenderTimer);
  _analyticsRenderTimer = setTimeout(() => {
    _analyticsRenderTimer = null;
    renderAnalytics();
  }, delay);
}

function renderHistory() {
  rebuildExerciseOptionsCache();
  rebuildReviewDerivedCaches();
  const el = document.getElementById('tab-history');
  el.innerHTML = `
    <div class="srch-wrap">
      <input class="srch-input" id="histSearch" type="search"
        placeholder="Search exercises..."
        oninput="scheduleHistorySearch(this.value)"
        onkeydown="handleSearchKey(event)"
        autocomplete="off" value="${escapeHtml(_selEx)}">
      <button class="srch-clear" id="histClear" onclick="clearSearch()" style="display:${_selEx ? 'flex' : 'none'}">&times;</button>
    </div>
    <div class="srch-drop" id="srchDrop"></div>
    <div id="histContent"></div>`;
  if (_selEx) renderHistDetail(_selEx);

  if (!_historyOutsideClickBound) {
    _historyOutsideClickBound = true;
    document.addEventListener('click', e => {
      if (!e.target.closest('.srch-wrap') && !e.target.closest('.srch-drop')) {
        const drop = document.getElementById('srchDrop');
        if (drop) drop.style.display = 'none';
      }
    });
  }
}

function handleSearchKey(e) {
  if (e.key === 'Escape') {
    const drop = document.getElementById('srchDrop');
    if (drop) drop.style.display = 'none';
    e.target.blur();
  }
}

function clearSearch() {
  if (_historySearchTimer) {
    clearTimeout(_historySearchTimer);
    _historySearchTimer = null;
  }
  _selEx = '';
  const inp = document.getElementById('histSearch');
  if (inp) inp.value = '';
  const clr = document.getElementById('histClear');
  if (clr) clr.style.display = 'none';
  const drop = document.getElementById('srchDrop');
  if (drop) drop.style.display = 'none';
  renderHistDetail('');
}

function scheduleHistorySearch(val, delay = 100) {
  if (_historySearchTimer) clearTimeout(_historySearchTimer);
  _historySearchTimer = setTimeout(() => {
    _historySearchTimer = null;
    filterSearch(val);
  }, delay);
}

function filterSearch(val) {
  const drop = document.getElementById('srchDrop');
  const clr = document.getElementById('histClear');
  if (clr) clr.style.display = val.trim() ? 'flex' : 'none';

  if (!val.trim()) { drop.style.display = 'none'; return; }
  const matches = getAllExercises().filter(e => e.toLowerCase().includes(val.toLowerCase())).slice(0, 12);
  if (!matches.length) { drop.style.display = 'none'; return; }
  const searchRx = new RegExp('(' + escapeRegex(val) + ')', 'gi');
  drop.innerHTML = matches.map(e => {
    const highlighted = escapeHtml(e).replace(searchRx, match => `<strong>${escapeHtml(match)}</strong>`);
    return `<button class="srch-opt" type="button">${highlighted}</button>`;
  }).join('');
  drop.querySelectorAll('.srch-opt').forEach((btn, idx) => {
    btn.onclick = () => selectEx(matches[idx]);
  });
  drop.style.display = 'block';
}

function selectEx(name) {
  _selEx = name;
  const inp = document.getElementById('histSearch');
  if (inp) inp.value = name;
  const drop = document.getElementById('srchDrop');
  if (drop) drop.style.display = 'none';
  renderHistDetail(name);
}

function getChartDataForExercise(exName) {
  const history = getExerciseSessionHistory(exName);
  if (!history.length) return {volumes:[], est10RMs:[]};

  const volumes = history.map(session => ({
    key: session.key,
    date: session.date,
    value: session.entries.reduce((sum, entry) => sum + (entry.volume || 0), 0)
  }));

  const est10RMs = history.map(session => ({
    key: session.key,
    date: session.date,
    value: estimateTarget10RM(exName, {untilSessionKey: session.key})
  })).filter(point => point.value !== null);

  return {volumes, est10RMs};
}

function renderSparkline(data, cls) {
  if (!data || data.length < 2) return '';
  const width = 100;
  const height = 36;
  const pad = 4;
  const values = data.map(d => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal;
  const yFor = value => range === 0
    ? height / 2
    : height - pad - ((value - minVal) / range) * (height - pad * 2);
  const points = data.map((d, i) => {
    const x = data.length === 1 ? width / 2 : (i / (data.length - 1)) * width;
    return `${x},${yFor(d.value)}`;
  }).join(' ');
  const fillPoints = `0,${height-pad} ${points} ${width},${height-pad}`;
  return `<svg viewBox="0 0 ${width} ${height}" class="sparkline ${cls}" preserveAspectRatio="none" aria-hidden="true">
    <polyline points="${fillPoints}" class="sparkline-fill"></polyline>
    <polyline points="${points}" class="sparkline-line"></polyline>
  </svg>`;
}

function renderMilestoneChart(milestones) {
  if (!milestones || milestones.length < 2) return '';
  const width = 320;
  const height = 120;
  const padL = 10;
  const padR = 10;
  const padT = 15;
  const padB = 15;
  const values = milestones.map(m => m.volume);
  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);
  const range = maxVal - minVal || 1;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const pts = milestones.map((m, i) => {
    const x = padL + (i / (milestones.length - 1)) * plotW;
    const y = padT + (1 - ((m.volume - minVal) / range)) * plotH;
    return {x, y};
  });

  const line = pts.map(p => `${p.x},${p.y}`).join(' ');
  const area = `${padL},${height-padB} ` + pts.map(p => `${p.x},${p.y}`).join(' ') + ` ${padL + plotW},${height-padB}`;

  return `<div style="margin-top:10px;padding:10px;background:rgba(255,255,255,0.02);border-radius:10px;border:1px solid rgba(255,255,255,0.05)">
    <div style="font-size:9px;color:var(--m2);text-transform:uppercase;margin-bottom:8px;letter-spacing:1px">Volume Progress</div>
    <svg viewBox="0 0 ${width} ${height}" style="width:100%;height:80px;display:block" preserveAspectRatio="none">
      <polyline points="${area}" fill="rgba(232,255,71,0.1)"></polyline>
      <polyline points="${line}" fill="none" stroke="var(--lime)" stroke-width="2" stroke-linecap="round"></polyline>
      ${pts.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="var(--lime)"></circle>`).join('')}
    </svg>
  </div>`;
}

function renderTrendCard(title, data, sparkClass, units) {
  if (!data || data.length < 2) return '';
  const last = data[data.length - 1].value;
  const prev = data[data.length - 2].value;
  const delta = last - prev;
  const trendCls = delta > 0 ? 'dp' : delta < 0 ? 'dn' : 'dz';
  const trendLbl = delta > 0 ? 'Up' : delta < 0 ? 'Down' : 'Flat';
  const unitSuffix = units ? ` ${units}` : '';
  const deltaText = delta === 0 ? 'No change' : `${delta > 0 ? '+' : ''}${fmtNum(delta)}${unitSuffix}`;
  return `<div class="chart-card">
    <div class="chart-top">
      <div>
        <div class="chart-lbl">${title}</div>
        <div class="chart-val">${fmtNum(last)}${unitSuffix}</div>
      </div>
      <div class="chart-delta ${trendCls}">${trendLbl} ${deltaText}</div>
    </div>
    ${renderSparkline(data, sparkClass)}
    <div class="chart-note">Latest session vs previous session</div>
  </div>`;
}

function renderHistDetail(exName) {
  const S = getS();
  const el = document.getElementById('histContent');
  if (!exName) { el.innerHTML = ''; return; }
  const entries = S.exHist[exName] || [];
  const target = estimateTarget10RM(exName);
  const history = getExerciseSessionHistory(exName);
  const chartData = getChartDataForExercise(exName);

  const targetBoxHtml = target
    ? `<div class="target-box">
        <div class="target-box-top">
          <span class="target-weight">${target}</span>
          <span class="target-unit">lbs</span>
        </div>
        <div class="target-sub">Target 10RM - Goldilocks zone 8-14 reps</div>
        <div class="target-sub" style="margin-top:4px;opacity:.6">Based on recent logged sets, assuming about 1-4 RIR from rep range position</div>
      </div>`
    : `<div class="target-box" style="border-color:rgba(255,255,255,.08);background:rgba(255,255,255,.03)">
        <div style="font-size:13px;color:var(--m2)">Target 10RM: <em>No data yet</em></div>
        <div class="target-sub" style="margin-top:4px">Log 3+ sets to unlock weight suggestion</div>
      </div>`;

  if (!entries.length) {
    el.innerHTML = `${targetBoxHtml}<div class="empty">No history logged for<span>${escapeHtml(exName)}</span></div>`;
    return;
  }

  const chartsHtml = [
    renderTrendCard('Volume Trend', chartData.volumes, 'sparkline-vol', 'lbs'),
    renderTrendCard('Estimated 10RM', chartData.est10RMs, 'sparkline-10rm', 'lbs')
  ].filter(Boolean).join('');

  const allVols = entries.map(e => e.volume);
  const bestVol = Math.max(...allVols);
  const sessionVolumes = history.map(s => s.entries.reduce((sum, entry) => sum + (entry.volume || 0), 0));
  const bestSessVol = Math.max(...sessionVolumes, 0);
  const last4 = sessionVolumes.slice(-4);
  const avg4 = last4.length ? Math.round(last4.reduce((a, b) => a + b, 0) / last4.length) : 0;

  // Find all-time best set (highest volume set)
  let bestSet = null;
  entries.forEach(e => {
    if (!bestSet || e.volume > bestSet.volume) bestSet = e;
  });

  let h = `${targetBoxHtml}${chartsHtml ? `<div class="hist-charts">${chartsHtml}</div>` : ''}`;

  if (bestSet || bestSessVol) {
    // Calculate PR milestones
    const chrono = (typeof sortExerciseHistoryEntries === 'function' ? sortExerciseHistoryEntries(entries) : [...entries]);
    const milestones = [];
    let maxV = 0;
    chrono.forEach(e => {
      if (e.volume > maxV) {
        maxV = e.volume;
        milestones.push(e);
      }
    });

    h += `<div class="pr-summary">
      <div class="pr-summary-hdr">All-Time Highlights</div>
      <div class="pr-summary-grid">
        ${bestSet ? `<div class="pr-item">
          <div class="pr-k">Best Set</div>
          <div class="pr-v">${escapeHtml(String(bestSet.weight))}x${escapeHtml(String(bestSet.reps))}</div>
          <div class="pr-sub">${bestSet.volume.toLocaleString()} lbs</div>
        </div>` : ''}
        ${bestSessVol ? `<div class="pr-item">
          <div class="pr-k">Best Session</div>
          <div class="pr-v">${bestSessVol.toLocaleString()} lbs</div>
          <div class="pr-sub">Total Volume</div>
        </div>` : ''}
      </div>

      ${milestones.length > 1 ? `
        <div class="pr-summary-hdr" style="margin-top:16px;border-top:1px dashed rgba(232,255,71,0.2);padding-top:12px">Volume Milestones</div>
        ${renderMilestoneChart(milestones)}
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:12px">
          ${[...milestones].reverse().slice(0, 5).map(m => `
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px">
              <span style="color:var(--m1)">${fmtDate(m.date)}</span>
              <span style="font-weight:700;color:var(--lime)">${m.volume.toLocaleString()} lbs <span style="font-weight:400;color:var(--m2);font-family:monospace">(${m.weight}x${m.reps})</span></span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>`;
  }

  h += `<div class="stat-grid">
    <div class="stat-card"><div class="stat-lbl">Best Vol</div><div class="stat-val" style="color:var(--lime)">${bestVol.toLocaleString()}</div></div>
    <div class="stat-card"><div class="stat-lbl">4-Sess Avg</div><div class="stat-val" style="color:var(--cyan)">${avg4 ? avg4.toLocaleString() : '&mdash;'}</div></div>
    <div class="stat-card"><div class="stat-lbl">Sessions</div><div class="stat-val">${history.length}</div></div>
  </div>`;

  const chrono = [...entries];
  [...history].reverse().forEach(session => {
    const sess = [...session.entries].sort((a, b) => b.setNum - a.setNum);
    const sessVol = sess.reduce((a, e) => a + e.volume, 0);
    h += `<div class="h-sess-card">
      <div class="h-sess-hdr">
        <span class="h-date">${fmtDate(session.date)}</span>
        <span class="h-sess-vol">Total: ${sessVol.toLocaleString()} lbs</span>
      </div>`;
    sess.forEach(entry => {
      const entryIdx = chrono.indexOf(entry);
      const prev = chrono.slice(0, entryIdx).filter(e => e.setNum === entry.setNum).pop();
      let dHtml = `<span class="h-delta dz">&mdash;</span>`;
      if (prev && prev.volume > 0) {
        const pct = Math.round((entry.volume - prev.volume) / prev.volume * 100);
        dHtml = `<span class="h-delta ${pct > 0 ? 'dp' : pct < 0 ? 'dn' : 'dz'}">${pct > 0 ? '+' : ''}${pct}%</span>`;
      }
      const isPR = entry.volume >= bestVol;
      const safeEx = exName.replace(/'/g, "\\'");
      h += `<div class="h-set-row">
        <span class="h-set-lbl">Set ${entry.setNum}</span>
        <span class="h-set-val">${escapeHtml(String(entry.weight))}x${escapeHtml(String(entry.reps))}${isPR ? '<span class="pr-badge">PR</span>' : ''}</span>
        <span class="h-set-vol">${entry.volume.toLocaleString()} lbs</span>
        ${dHtml}
        <button class="h-del-btn" onclick="deleteHistEntry('${safeEx}',${entryIdx})" title="Remove this set log" aria-label="Remove this set log">x</button>
      </div>`;
    });
    h += `</div>`;
  });

  el.innerHTML = h;
}

function renderSessions() {
  rebuildReviewDerivedCaches();
  const S = getS();
  const el = document.getElementById('tab-sessions');
  const sess = S.sessions || [];
  if (!sess.length) {
    el.innerHTML = `<div class="empty">No completed sessions yet<span>Complete a workout to see it here</span></div>`;
    return;
  }
  const blockCnt = sess.filter(s => s.block === S.curBlock).length;
  const blockVol = sess.filter(s => s.block === S.curBlock).reduce((a, s) => a + (s.totalSessionVolume || 0), 0);
  let h = `<span class="sess-block-badge">${blockCnt} session${blockCnt !== 1 ? 's' : ''} this block</span>`;
  if (blockVol > 0) h += `<div class="sess-block-vol">Block total: <span>${blockVol.toLocaleString()} lbs</span></div>`;

  sess.forEach((s, i) => {
    const wk = s.week === 'deload' ? 'DL' : s.week;
    const vol = (s.totalSessionVolume || 0).toLocaleString();
    const doneSets = s.totalSetsCompleted ?? s.doneSets ?? 0;
    const totSets = s.totalSets ?? 0;
    const exRows = (s.exercises || []).map(ex => `
      <div class="sess-ex-row">
        <span class="sess-ex-name">${escapeHtml(ex.name)}</span>
        <span class="sess-ex-detail">${ex.setsCompleted}/${ex.totalSets || ex.setsCompleted} sets - ${(ex.totalVolume || 0).toLocaleString()} lbs</span>
      </div>`).join('');

    const isEditing = _editingSessId === s.id;
    h += `<div class="sess-card" id="sc-${i}">
      <div class="sess-card-hdr">
        <div class="sess-meta">
          <span class="sess-date">${fmtDate(s.date)} ${fmtTime(s.date)}</span>
          <span class="sess-tag">Day ${s.day} - B${s.block} W${wk}</span>
        </div>
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
          <div class="sess-vol">${vol} lbs</div>
          <button class="sess-del-btn" id="sdel-${i}" title="Delete session" aria-label="Delete session">Del</button>
        </div>
        <div class="sess-stats-row">
          <span class="sess-stat">${doneSets}/${totSets} sets</span>
          ${s.durationMinutes ? `<span class="sess-stat">${s.durationMinutes}m</span>` : ''}
        </div>
      </div>
      <button class="sess-expand-btn" id="seb-${i}">${isEditing ? 'Hide' : 'Details'}</button>
      <div class="sess-detail${isEditing ? ' open' : ''}" id="sed-${i}">
        ${exRows}
        <div class="sess-notes-wrap">
          ${_editingSessId === s.id
            ? `<textarea class="sess-notes-edit" id="sne-${i}">${escapeHtml(s.notes || '')}</textarea>
               <div class="sess-notes-btns">
                 <button class="sess-notes-btn save" onclick="saveSessionNote('${s.id}', ${i})">Save</button>
                 <button class="sess-notes-btn" onclick="toggleSessionNoteEdit(null)">Cancel</button>
               </div>`
            : `<div class="sess-notes">${s.notes ? `"${escapeHtml(s.notes)}"` : '<em>No notes</em>'}</div>
               <button class="sess-notes-edit-btn" onclick="toggleSessionNoteEdit('${s.id}')">Edit Notes</button>`
          }
        </div>
      </div>
    </div>`;
  });

  el.innerHTML = h;

  el.querySelectorAll('.sess-expand-btn').forEach(btn => {
    btn.onclick = () => {
      const idx = btn.id.replace('seb-', '');
      const det = document.getElementById('sed-' + idx);
      const open = det.classList.toggle('open');
      btn.textContent = open ? 'Hide' : 'Details';
    };
  });

  el.querySelectorAll('.sess-del-btn').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.id.replace('sdel-', ''), 10);
      const sessItem = S.sessions[idx];
      if (!sessItem) return;
      showModal(
        'Delete Session?',
        `Delete workout from ${fmtDate(sessItem.date)}? This also removes all associated set logs from exercise history. This cannot be undone.`,
        () => deleteSession(idx)
      );
    };
  });
}

async function deleteSession(idx) {
  if (window.ApexState?.deleteSession) {
    await window.ApexState.deleteSession(idx);
  } else {
    const S = getS();
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
    window.ApexState?.persist?.() || safePersist();
  }

  window.ApexRuntime?.refreshReview?.() || renderSessions();
  window.ApexRuntime?.refreshHeader?.() || renderHeader();
}

function toggleSessionNoteEdit(sid) {
  _editingSessId = sid;
  renderSessions();
}

async function saveSessionNote(sid, idx) {
  const el = document.getElementById(`sne-${idx}`);
  const nextNotes = el?.value?.trim() || '';
  if (window.ApexState?.updateSession) {
    await window.ApexState.updateSession(sid, { notes: nextNotes });
  } else {
    const S = getS();
    const sess = S.sessions.find(s => s.id === sid);
    if (sess) {
      sess.notes = nextNotes;
      window.ApexState?.persist?.() || safePersist();
    }
  }
  _editingSessId = null;
  renderSessions();
  showToast('Notes updated');
}

function showVolumeBreakdown(cat, weekStart) {
  const buckets = getWeeklyVolumeBuckets();
  const bucket = buckets.find(b => b.start === weekStart);
  if (!bucket) return;

  const exMap = new Map(Object.entries(bucket.exVolByCat?.[cat] || {}));

  if (!exMap.size) return;

  const sorted = [...exMap.entries()].sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((sum, e) => sum + e[1], 0);

  const listHtml = sorted.map(([name, vol]) => `
    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
      <span style="font-weight:600;font-size:13px">${escapeHtml(name)}</span>
      <div style="text-align:right">
        <div style="font-family:monospace;font-size:13px">${Math.round(vol).toLocaleString()} lbs</div>
        <div style="font-size:10px;color:var(--m2)">${Math.round(vol / total * 100)}%</div>
      </div>
    </div>
  `).join('');

  showModal(
    `${fmtCat(cat)} Breakdown`,
    `<div style="margin-top:10px;max-height:300px;overflow-y:auto">${listHtml}</div>
     <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--bdr);font-weight:700;display:flex;justify-content:space-between">
       <span>Total</span>
       <span style="font-family:monospace">${Math.round(total).toLocaleString()} lbs</span>
     </div>`,
    null,
    { cancelText: 'Close', hideConfirm: true }
  );
}

function deleteHistEntry(exName, entryIdx) {
  const S = getS();
  if (!S.exHist[exName]) return;
  showModal('Delete set log?',
    'This removes the selected history entry. This cannot be undone.',
    () => {
      const S = getS();
      if (!S.exHist[exName]) return;
      S.exHist[exName].splice(entryIdx, 1);
      if (S.exHist[exName].length === 0) delete S.exHist[exName];
      window.ApexState?.persist?.() || safePersist();
      renderHistDetail(exName);
    });
}

  window.renderAnalytics = renderAnalytics;
  window.renderHistory = renderHistory;
  window.renderSessions = renderSessions;
  window.selectEx = selectEx;
  window.filterSearch = filterSearch;
  window.deleteSession = deleteSession;
  window.deleteHistEntry = deleteHistEntry;
  window.showVolumeBreakdown = showVolumeBreakdown;
  window.toggleSessionNoteEdit = toggleSessionNoteEdit;
  window.saveSessionNote = saveSessionNote;
  window.clearSearch = clearSearch;
  window.scheduleHistorySearch = scheduleHistorySearch;
  window.handleSearchKey = handleSearchKey;
})();
