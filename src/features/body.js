(() => {
  'use strict';

  // Access state through ApexState facade if available
  const getS = () => window.ApexState?.get() || window.S;

  let bodyEditingIndex = null;

  function persistState() {
    return window.ApexState?.persist?.() || safePersist();
  }

  function refreshBodyView() {
    return window.ApexRuntime?.refreshBody?.() || renderBody();
  }

  async function commitBodyMetrics(nextBodyMetrics) {
    if (window.ApexState?.persistBodyMetrics) {
      return await window.ApexState.persistBodyMetrics(nextBodyMetrics);
    }
    const S = getS();
    if (window.ApexState?.update) {
      window.ApexState.update('bodyMetrics', nextBodyMetrics);
    } else {
      S.bodyMetrics = nextBodyMetrics;
      persistState();
    }
    return nextBodyMetrics;
  }

  function getBodyMetricKey(metric, smoothed = false) {
    if (!smoothed) return metric;
    return metric === 'weight' ? 'smoothedWeight' : metric === 'waist' ? 'smoothedWaist' : metric;
  }

  function getLatestMetric(metric, opts = {}) {
    const S = getS();
    const logs = S.bodyMetrics?.logs || [];
    const key = getBodyMetricKey(metric, !!opts.smoothed);
    const match = logs.find(log => typeof log?.[key] === 'number');
    return match ? match[key] : null;
  }

  function getBodyMetricLogs(metric, opts = {}) {
    const S = getS();
    const key = getBodyMetricKey(metric, !!opts.smoothed);
    return (S.bodyMetrics?.logs || [])
      .filter(log => typeof log?.[key] === 'number')
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function getBodySeries(metric) {
    const rawKey = getBodyMetricKey(metric, false);
    const smoothedKey = getBodyMetricKey(metric, true);
    const logs = getBodyMetricLogs(metric);
    return {
      raw: logs.map(log => ({ date: log.date, value: log[rawKey] })),
      smoothed: logs
        .filter(log => typeof log?.[smoothedKey] === 'number')
        .map(log => ({ date: log.date, value: log[smoothedKey] }))
    };
  }

  function getBodyLogSpanDays(metric, opts = {}) {
    const logs = getBodyMetricLogs(metric, opts);
    if (!logs.length) return 0;
    if (logs.length === 1) return 1;
    const firstDate = new Date(`${logs[0].date}T00:00:00`);
    const lastDate = new Date(`${logs[logs.length - 1].date}T00:00:00`);
    return Math.max(1, Math.round((lastDate - firstDate) / 86400000) + 1);
  }

  function shouldShowBodyTrendStabilizingNote() {
    return ['weight', 'waist'].some(metric => {
      const logs = getBodyMetricLogs(metric);
      if (!logs.length) return false;
      return logs.length < 12 || getBodyLogSpanDays(metric, { smoothed: true }) < 14;
    });
  }

  function getBodyRateReadiness(metric, windowDays = getBodyCalcSettings().rateWindowDays) {
    const logs = getBodyMetricLogs(metric, { smoothed: true });
    const minLogs = Math.max(6, Math.ceil(windowDays / 3));
    const minSpanDays = Math.max(10, Math.ceil(windowDays * 0.67));
    if (logs.length < minLogs) {
      return {
        ready: false,
        message: `Building trend: add at least ${minLogs} ${metric} logs for a steadier recent rate.`
      };
    }
    const spanDays = getBodyLogSpanDays(metric, { smoothed: true });
    if (spanDays < minSpanDays) {
      return {
        ready: false,
        message: `Building trend: recent rate becomes more useful after about ${minSpanDays} days of ${metric} logs.`
      };
    }
    return { ready: true, message: '' };
  }

  function getBodyRate(metric, windowDays = getBodyCalcSettings().rateWindowDays) {
    const readiness = getBodyRateReadiness(metric, windowDays);
    if (!readiness.ready) return null;
    const key = getBodyMetricKey(metric, true);
    const logs = getBodyMetricLogs(metric, { smoothed: true });
    if (logs.length < 2) return null;
    const latest = logs[logs.length - 1];
    const latestDate = new Date(`${latest.date}T00:00:00`);
    const targetDate = new Date(latestDate);
    targetDate.setDate(targetDate.getDate() - windowDays);
    let anchor = null;
    for (let i = logs.length - 2; i >= 0; i--) {
      const date = new Date(`${logs[i].date}T00:00:00`);
      if (date <= targetDate) {
        anchor = logs[i];
        break;
      }
    }
    if (!anchor) anchor = logs[0];
    if (!anchor || anchor.date === latest.date) return null;
    const anchorDate = new Date(`${anchor.date}T00:00:00`);
    const days = Math.max(1, Math.round((latestDate - anchorDate) / 86400000));
    const change = latest[key] - anchor[key];
    const weeklyRate = change / days * 7;
    const dailyRate = change / days;
    const direction = Math.abs(weeklyRate) < 0.01 ? 'flat' : weeklyRate > 0 ? 'up' : 'down';
    return {
      change,
      dailyRate,
      weeklyRate,
      direction,
      days,
      startValue: anchor[key],
      endValue: latest[key],
      label: `Trend over last ${days} days`
    };
  }

  function getOverallBodyRate(metric) {
    const key = getBodyMetricKey(metric, true);
    const logs = getBodyMetricLogs(metric, { smoothed: true });
    if (logs.length < 2) return null;
    const first = logs[0];
    const last = logs[logs.length - 1];
    if (first.date === last.date) return null;
    const firstDate = new Date(`${first.date}T00:00:00`);
    const lastDate = new Date(`${last.date}T00:00:00`);
    const days = Math.max(1, Math.round((lastDate - firstDate) / 86400000));
    const change = last[key] - first[key];
    return {
      weeklyRate: change / days * 7,
      days,
      label: `Overall trend since ${first.date}`
    };
  }

  function formatBodyRateNumber(value) {
    const abs = Math.abs(value);
    const decimals = abs >= 0.15 ? 1 : 2;
    return abs.toFixed(decimals).replace(/\.0$/, '');
  }

  function formatBodyRate(value, unit, suffix = 'wk') {
    const sign = value > 0 ? '+' : value < 0 ? '-' : '';
    return `${sign}${formatBodyRateNumber(value)} ${unit}/${suffix}`;
  }

  function formatBodyGoalDate(date) {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  }

  /**
   * Smoothed-trend slope over the last `windowDays` calendar days (from latest log).
   * Captures a short recent pace (complements the longer rate window + overall trend).
   */
  function getSmoothedWeightRateWindow(windowDays) {
    const key = getBodyMetricKey('weight', true);
    const logs = getBodyMetricLogs('weight', { smoothed: true });
    if (logs.length < 2) return null;
    const latest = logs[logs.length - 1];
    const latestDate = new Date(`${latest.date}T00:00:00`);
    const cutoff = new Date(latestDate);
    cutoff.setDate(cutoff.getDate() - windowDays);
    const inWindow = logs.filter(log => new Date(`${log.date}T00:00:00`) >= cutoff);
    if (inWindow.length < 2) return null;
    const first = inWindow[0];
    const last = inWindow[inWindow.length - 1];
    const d1 = new Date(`${first.date}T00:00:00`);
    const d2 = new Date(`${last.date}T00:00:00`);
    const daySpan = Math.max(1, Math.round((d2 - d1) / 86400000));
    const change = last[key] - first[key];
    return {
      weeklyRate: change / daySpan * 7,
      dailyRate: change / daySpan,
      days: daySpan,
      label: `last ${windowDays}d`
    };
  }

  function getGoalBlendWeights(level) {
    if (level === 'low') return { r7: 0.34, rWindow: 0.46, rOverall: 0.2 };
    if (level === 'medium') return { r7: 0.28, rWindow: 0.38, rOverall: 0.34 };
    return { r7: 0.2, rWindow: 0.3, rOverall: 0.5 };
  }

  /**
   * Predicted goal date: blends recent 7-day pace, configured rate window, and overall smoothed trend.
   * Confidence label strengthens as log count and history span grow.
   */
  function getBodyGoalPrediction(currentWeight, goalWeight, weightRate, overallWeightRate, calcSettings) {
    if (currentWeight === null || goalWeight === null || !calcSettings) return null;
    const remaining = goalWeight - currentWeight;
    if (Math.abs(remaining) < 0.01) return null;

    const r7 = getSmoothedWeightRateWindow(7);
    const rWindow = weightRate;
    const rOverall = overallWeightRate;

    const logsForConf = getBodyMetricLogs('weight', { smoothed: true });
    const nLogs = logsForConf.length;
    const spanDays = getBodyLogSpanDays('weight', { smoothed: true });
    const readiness = getBodyRateReadiness('weight', calcSettings.rateWindowDays);
    let confidenceScore = 0;
    confidenceScore += 0.35 * Math.min(1, nLogs / 14);
    confidenceScore += 0.35 * Math.min(1, spanDays / 42);
    confidenceScore += 0.30 * (readiness.ready ? 1 : 0.35);
    if (r7 && rWindow && Math.sign(r7.weeklyRate) === Math.sign(rWindow.weeklyRate)) {
      const den = Math.abs(rWindow.weeklyRate);
      if (den > 1e-6) {
        const ratio = Math.abs(r7.weeklyRate / den);
        if (ratio >= 0.35 && ratio <= 2.8) confidenceScore = Math.min(1, confidenceScore + 0.07);
      }
    }
    confidenceScore = Math.min(1, confidenceScore);
    const level = confidenceScore < 0.38 ? 'low' : confidenceScore < 0.68 ? 'medium' : 'high';
    const weights = getGoalBlendWeights(level);

    const parts = [];
    const available = [];
    if (r7) {
      available.push({ rate: r7.weeklyRate, w: weights.r7, tag: '7-day pace' });
      parts.push('recent week');
    }
    if (rWindow) {
      available.push({ rate: rWindow.weeklyRate, w: weights.rWindow, tag: 'rate window' });
      parts.push(`${calcSettings.rateWindowDays}-day window`);
    }
    if (rOverall) {
      available.push({ rate: rOverall.weeklyRate, w: weights.rOverall, tag: 'overall' });
      parts.push('overall trend');
    }

    if (!available.length) return null;

    const totalW = available.reduce((s, a) => s + a.w, 0);
    let blendedWeekly = 0;
    available.forEach(a => {
      blendedWeekly += a.rate * (a.w / totalW);
    });

    if (Math.abs(blendedWeekly) < 0.05) return null;
    if ((remaining < 0 && blendedWeekly >= 0) || (remaining > 0 && blendedWeekly <= 0)) return null;

    const weeks = Math.abs(remaining / blendedWeekly);
    if (!Number.isFinite(weeks) || weeks <= 0 || weeks > 104) return null;

    const eta = new Date();
    eta.setDate(eta.getDate() + Math.round(weeks * 7));

    const confidenceLabel = level === 'low'
      ? 'Rough estimate — keep logging; this date will stabilize.'
      : level === 'medium'
        ? 'Moderate confidence — blends recent pace and longer trends.'
        : 'Stronger confidence — your history makes this forecast more reliable.';

    const blendLine = parts.length
      ? `Combines ${parts.join(', ')}.`
      : '';

    return {
      weeks,
      dateLabel: formatBodyGoalDate(eta),
      blendedWeeklyRate: blendedWeekly,
      confidence: level,
      confidenceScore,
      confidenceLabel,
      blendLine
    };
  }

  function renderBodyChart(metric, label, units) {
    const series = getBodySeries(metric);
    const raw = series.raw;
    const trend = series.smoothed;
    if (raw.length < 2) return `<div class="body-note">Need 2+ logs for ${metric} trend.</div>`;

    const width = 320;
    const height = 120;
    const padL = 10;
    const padR = 10;
    const padT = 15;
    const padB = 15;

    const allValues = [...raw, ...trend].map(d => d.value);
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    const range = maxVal - minVal || 1;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const getX = (date, first, last) => {
      const d = new Date(`${date}T00:00:00`).getTime();
      const f = new Date(`${first}T00:00:00`).getTime();
      const l = new Date(`${last}T00:00:00`).getTime();
      const span = l - f || 1;
      return padL + ((d - f) / span) * plotW;
    };

    const firstDate = raw[0].date;
    const lastDate = raw[raw.length - 1].date;

    const rawPts = raw.map(d => ({ x: getX(d.date, firstDate, lastDate), y: padT + (1 - ((d.value - minVal) / range)) * plotH }));
    const trendPts = trend.map(d => ({ x: getX(d.date, firstDate, lastDate), y: padT + (1 - ((d.value - minVal) / range)) * plotH }));

    const trendLine = trendPts.map(p => `${p.x},${p.y}`).join(' ');
    const cls = metric === 'weight' ? 'sparkline-vol' : 'sparkline-10rm';
    const stroke = metric === 'weight' ? 'var(--cyan)' : 'var(--lime)';

    return `<div style="margin-top:10px;padding:12px;background:rgba(255,255,255,0.02);border-radius:12px;border:1px solid var(--bdr)">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <div style="font-size:10px;text-transform:uppercase;color:var(--m2);letter-spacing:1px">${label} History</div>
        <div style="font-size:10px;color:var(--m2)">${fmtNum(minVal)} &ndash; ${fmtNum(maxVal)} ${units}</div>
      </div>
      <svg viewBox="0 0 ${width} ${height}" style="width:100%;height:100px;display:block" preserveAspectRatio="none">
        ${rawPts.map(p => `<circle cx="${p.x}" cy="${p.y}" r="1.5" fill="rgba(255,255,255,0.15)"></circle>`).join('')}
        <polyline points="${trendLine}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></polyline>
      </svg>
    </div>`;
  }

  function renderBodyMetricSparkline(rawData, trendData, cls) {
    if ((!rawData || rawData.length < 2) && (!trendData || trendData.length < 2)) return '';
    const width = 100;
    const height = 36;
    const pad = 4;
    const values = [...(rawData || []), ...(trendData || [])].map(d => d.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal;
    const yFor = value => range === 0
      ? height / 2
      : height - pad - ((value - minVal) / range) * (height - pad * 2);
    const pointsFor = data => data.map((d, i) => {
      const x = data.length === 1 ? width / 2 : (i / (data.length - 1)) * width;
      return `${x},${yFor(d.value)}`;
    }).join(' ');
    const rawPoints = rawData?.length ? pointsFor(rawData) : '';
    const trendPoints = trendData?.length ? pointsFor(trendData) : '';
    return `<svg viewBox="0 0 ${width} ${height}" class="sparkline ${cls}" preserveAspectRatio="none" aria-hidden="true">
      ${rawPoints ? `<polyline points="${rawPoints}" class="sparkline-raw"></polyline>` : ''}
      ${trendPoints ? `<polyline points="${trendPoints}" class="sparkline-line"></polyline>` : ''}
    </svg>`;
  }

  function calculateWaistToHeight(waist, height) {
    return waist && height ? waist / height : null;
  }

  function getBodyDeltaClass(delta) {
    if (delta === null) return 'flat';
    if (Math.abs(delta) < 0.01) return 'flat';
    return delta > 0 ? 'up' : 'down';
  }

  function getBodyDeltaLabel(delta, unit = '') {
    if (delta === null) return 'No starting value set';
    const roundedDelta = Math.round(delta * 100) / 100;
    if (Math.abs(roundedDelta) < 0.01) return `No change from start${unit ? ` (${unit})` : ''}`;
    const arrow = roundedDelta > 0 ? '&uarr;' : '&darr;';
    const unitText = unit ? ` ${unit}` : '';
    return `${arrow} ${roundedDelta > 0 ? '+' : ''}${fmtNum(roundedDelta)}${unitText} from start`;
  }

  function avg(nums) {
    return nums.length ? nums.reduce((sum, n) => sum + n, 0) / nums.length : null;
  }

  function getTrend(metric, days = 7) {
    const logs = getBodyMetricLogs(metric);
    if (logs.length < 2) return null;
    const latest = logs[logs.length - 1];
    const latestDate = new Date(`${latest.date}T00:00:00`);
    const recentStart = new Date(latestDate);
    recentStart.setDate(recentStart.getDate() - (days - 1));
    const previousStart = new Date(latestDate);
    previousStart.setDate(previousStart.getDate() - ((days * 2) - 1));
    const previousEnd = new Date(latestDate);
    previousEnd.setDate(previousEnd.getDate() - days);

    const recentValues = logs
      .filter(log => new Date(`${log.date}T00:00:00`) >= recentStart)
      .map(log => log[metric]);
    const previousValues = logs
      .filter(log => {
        const date = new Date(`${log.date}T00:00:00`);
        return date >= previousStart && date < recentStart;
      })
      .map(log => log[metric]);

    let change = null;
    let base = null;
    let label = `Recent ${days}d avg vs previous ${days}d`;
    if (recentValues.length && previousValues.length) {
      const recentAvg = avg(recentValues);
      const previousAvg = avg(previousValues);
      change = recentAvg - previousAvg;
      base = previousAvg;
    } else {
      const older = [...logs].reverse().find(log => new Date(`${log.date}T00:00:00`) <= previousEnd);
      if (!older) return null;
      change = latest[metric] - older[metric];
      base = older[metric];
      label = `Latest vs ${older.date}`;
    }

    const direction = Math.abs(change) < 0.01 ? 'flat' : change > 0 ? 'up' : 'down';
    const percentChange = base ? (change / base) * 100 : 0;
    return { direction, change, percentChange, label };
  }

  async function updateProfile(fields) {
    await commitBodyMetrics({
      ...S.bodyMetrics,
      height: sanitizePositiveMetric(fields.height),
      startingWeight: sanitizePositiveMetric(fields.startingWeight),
      goalWeight: sanitizePositiveMetric(fields.goalWeight),
      startingWaist: sanitizePositiveMetric(fields.startingWaist),
      profileLocked: true
    });
    refreshBodyView();
    showToast('Profile saved');
  }

  async function unlockBodyProfile() {
    await commitBodyMetrics({
      ...S.bodyMetrics,
      profileLocked: false
    });
    refreshBodyView();
  }

  function saveBodyProfile() {
    updateProfile({
      height: document.getElementById('bodyHeight')?.value,
      startingWeight: document.getElementById('bodyStartWeight')?.value,
      goalWeight: document.getElementById('bodyGoalWeight')?.value,
      startingWaist: document.getElementById('bodyStartWaist')?.value
    });
  }

  async function saveBodyCalcSettings() {
    const smoothing = document.getElementById('bodySmoothing')?.value;
    const rateWindowDays = document.getElementById('bodyRateWindow')?.value;
    const calcSettings = normalizeBodyCalcSettings({ smoothing, rateWindowDays });
    const prev = getBodyCalcSettings();
    if (calcSettings.smoothing === prev.smoothing && calcSettings.rateWindowDays === prev.rateWindowDays) {
      showToast('Calculation settings already match');
      return false;
    }
    await commitBodyMetrics({
      ...S.bodyMetrics,
      calcSettings,
      logs: buildBodyLogs(S.bodyMetrics.logs, calcSettings)
    });
    refreshBodyView();
    showToast('Trend values updated with new settings');
    return true;
  }

  async function addBodyLog(date, weight, waist) {
    const entry = normalizeBodyLog({ date, weight, waist });
    if (!entry) {
      showToast('Enter a date and at least weight or waist', 'warn');
      return false;
    }
    await commitBodyMetrics({
      ...S.bodyMetrics,
      logs: buildBodyLogs([...S.bodyMetrics.logs, entry], getBodyCalcSettings())
    });
    refreshBodyView();
    showToast('Measurement added');
    return true;
  }

  async function updateBodyLog(index, date, weight, waist) {
    const S = getS();
    const entry = normalizeBodyLog({ date, weight, waist });
    if (!entry) {
      showToast('Enter a date and at least weight or waist', 'warn');
      return false;
    }
    if (index < 0 || index >= S.bodyMetrics.logs.length) return false;
    const nextLogs = [...S.bodyMetrics.logs].map(normalizeBodyLog).filter(Boolean);
    nextLogs[index] = entry;
    await commitBodyMetrics({
      ...S.bodyMetrics,
      logs: buildBodyLogs(nextLogs, getBodyCalcSettings())
    });
    refreshBodyView();
    showToast('Measurement updated');
    return true;
  }

  async function submitBodyLog() {
    const date = document.getElementById('bodyLogDate')?.value;
    const weight = document.getElementById('bodyLogWeight')?.value;
    const waist = document.getElementById('bodyLogWaist')?.value;
    if (bodyEditingIndex === null) {
      await addBodyLog(date, weight, waist);
      return;
    }
    const editIndex = bodyEditingIndex;
    bodyEditingIndex = null;
    if (!(await updateBodyLog(editIndex, date, weight, waist))) bodyEditingIndex = editIndex;
  }

  function editBodyLog(index) {
    bodyEditingIndex = index;
    refreshBodyView();
  }

  function cancelBodyLogEdit() {
    bodyEditingIndex = null;
    refreshBodyView();
  }

  function deleteBodyLog(index) {
    const S = getS();
    if (index < 0 || index >= S.bodyMetrics.logs.length) return;
    showModal(
      'Delete measurement?',
      'This removes the selected body measurement entry.',
      async () => {
        const S = getS();
        const nextLogs = [...S.bodyMetrics.logs];
        nextLogs.splice(index, 1);
        await commitBodyMetrics({
          ...S.bodyMetrics,
          logs: buildBodyLogs(nextLogs, getBodyCalcSettings())
        });
        if (bodyEditingIndex === index) bodyEditingIndex = null;
        refreshBodyView();
        showToast('Measurement deleted');
      }
    );
  }

  function renderBodyMetricCard(label, value, delta, unit) {
    const className = getBodyDeltaClass(delta);
    const display = value === null ? '&mdash;' : `${fmtNum(value)} ${unit}`;
    return `<div class="body-metric">
      <div class="body-k">${label}</div>
      <div class="body-v">${display}</div>
      <div class="body-delta ${className}">${getBodyDeltaLabel(delta, unit)}</div>
    </div>`;
  }

  function renderBodyRateCard(label, rate, overallRate, unit, buildMessage = 'Add more logs to build a stable trend.') {
    if (!rate) {
      return `<div class="body-trend">
        <div class="body-k">${label} Rate</div>
        <div class="body-note">${buildMessage}</div>
      </div>`;
    }
    const cls = rate.direction;
    const weeklyText = formatBodyRate(rate.weeklyRate, unit, 'wk');
    const dailyText = formatBodyRate(rate.dailyRate, unit, 'day');
    const overallText = overallRate ? `${formatBodyRate(overallRate.weeklyRate, unit, 'wk')} overall` : 'Need more history for overall rate';
    const dirSymbol = cls === 'up' ? '&uarr;' : cls === 'down' ? '&darr;' : '&rarr;';
    return `<div class="body-trend">
      <div class="body-trend-top">
        <div>
          <div class="body-k">${label} Rate</div>
          <div class="body-trend-change ${cls}">${dirSymbol} ${weeklyText}</div>
        </div>
        <div class="body-sub">${dailyText}</div>
      </div>
      <div class="body-note">${rate.label}</div>
      <div class="body-note">${overallText}</div>
    </div>`;
  }

  function renderBody() {
    const el = document.getElementById('tab-body');
    if (!el) return;

    const S = getS();
    const body = normalizeBodyMetrics(S.bodyMetrics);
    if (window.ApexState?.update) {
      window.ApexState.update('bodyMetrics', body, { persist: false });
    } else {
      S.bodyMetrics = body;
    }
    const latestWeight = getLatestMetric('weight');
    const latestWaist = getLatestMetric('waist');
    const avgWeight = getLatestMetric('weight', { smoothed: true });
    const avgWaist = getLatestMetric('waist', { smoothed: true });
    const weightDelta = latestWeight !== null && body.startingWeight !== null ? latestWeight - body.startingWeight : null;
    const waistDelta = latestWaist !== null && body.startingWaist !== null ? latestWaist - body.startingWaist : null;
    const avgWeightDelta = avgWeight !== null && body.startingWeight !== null ? avgWeight - body.startingWeight : null;
    const avgWaistDelta = avgWaist !== null && body.startingWaist !== null ? avgWaist - body.startingWaist : null;
    const ratioWaist = avgWaist ?? latestWaist;
    const ratio = calculateWaistToHeight(ratioWaist, body.height);
    const ratioBand = ratio === null ? 'caution' : ratio <= 0.55 ? 'good' : ratio <= 0.6 ? 'caution' : 'high';
    const ratioLabel = ratio === null ? 'Need waist + height' : ratio <= 0.55 ? 'Healthy' : ratio <= 0.6 ? 'Caution' : 'High';
    const ratioPct = ratio === null ? 0 : Math.min((ratio / 0.7) * 100, 100);
    const calcSettings = getBodyCalcSettings(body);
    const smoothingPreset = getBodySmoothingPreset(calcSettings.smoothing);
    const weightRateReadiness = getBodyRateReadiness('weight', calcSettings.rateWindowDays);
    const waistRateReadiness = getBodyRateReadiness('waist', calcSettings.rateWindowDays);
    const weightRate = getBodyRate('weight', calcSettings.rateWindowDays);
    const waistRate = getBodyRate('waist', calcSettings.rateWindowDays);
    const overallWeightRate = getOverallBodyRate('weight');
    const overallWaistRate = getOverallBodyRate('waist');
    const weightSeries = getBodySeries('weight');
    const waistSeries = getBodySeries('waist');
    const editingLog = bodyEditingIndex === null ? null : body.logs[bodyEditingIndex] || null;
    const today = getLocalDateInputValue();
    const profileLocked = !!body.profileLocked;
    const showTrendNote = shouldShowBodyTrendStabilizingNote();
    const trendNoteHtml = showTrendNote
      ? '<div class="body-note body-note-banner">Your trend is still stabilizing. Keep logging consistently for the most accurate picture.</div>'
      : '';

    let goalHtml = '';
    const goalWeightBasis = avgWeight ?? latestWeight;
    if (body.goalWeight !== null && body.startingWeight !== null && goalWeightBasis !== null && body.goalWeight !== body.startingWeight) {
      const total = body.goalWeight - body.startingWeight;
      const progressRaw = (goalWeightBasis - body.startingWeight) / total;
      const progress = Math.max(0, Math.min(progressRaw, 1));
      const remaining = Math.round(Math.abs(body.goalWeight - goalWeightBasis) * 100) / 100;
      const goalPrediction = getBodyGoalPrediction(goalWeightBasis, body.goalWeight, weightRate, overallWeightRate, calcSettings);
      const predictionHtml = goalPrediction
        ? `<div class="body-goal-eta">
          <div class="body-goal-eta-label">Estimated goal date</div>
          <div class="body-goal-eta-date">${goalPrediction.dateLabel}</div>
          <div class="body-note">~${formatBodyRateNumber(goalPrediction.weeks)} weeks at blended trend (${formatBodyRate(goalPrediction.blendedWeeklyRate, 'lbs', 'wk')}).</div>
          <div class="body-note">${goalPrediction.confidenceLabel}</div>
          <div class="body-note">${goalPrediction.blendLine}</div>
        </div>`
        : '<div class="body-note">Add enough weight logs (or a clearer trend) to estimate a goal date.</div>';
      goalHtml = `<div class="body-goal">
        <div class="body-k">Goal Progress</div>
        <div class="body-v">${Math.round(progress * 100)}%</div>
        <div class="body-bar"><div class="body-bar-fill good" style="width:${progress * 100}%"></div></div>
        <div class="body-goal-meta"><span>Goal: ${fmtNum(body.goalWeight)} lbs</span><span>${fmtNum(remaining)} lbs remaining</span></div>
        <div class="body-note">Uses trend weight when available to smooth daily noise.</div>
        ${predictionHtml}
      </div>`;
    }

    const logsHtml = body.logs.length ? `
      <table class="body-table">
        <thead>
          <tr><th>Date</th><th>Weight</th><th>Waist</th><th>Trend Wt</th><th>Trend Waist</th><th>Ratio</th><th></th></tr>
        </thead>
        <tbody>
          ${body.logs.map((log, index) => {
            const rowRatio = calculateWaistToHeight(log.waist, body.height);
            return `<tr>
              <td>${escapeHtml(log.date)}</td>
              <td>${log.weight === null ? '&mdash;' : `${fmtNum(log.weight)} lbs`}</td>
              <td>${log.waist === null ? '&mdash;' : `${fmtNum(log.waist)} in`}</td>
              <td>${typeof log.smoothedWeight === 'number' ? `${fmtNum(log.smoothedWeight)} lbs` : '&mdash;'}</td>
              <td>${typeof log.smoothedWaist === 'number' ? `${fmtNum(log.smoothedWaist)} in` : '&mdash;'}</td>
              <td>${rowRatio === null ? '&mdash;' : rowRatio.toFixed(3)}</td>
              <td><div class="body-row-actions">
                <button class="body-row-btn" onclick="editBodyLog(${index})">Edit</button>
                <button class="body-row-btn del" onclick="deleteBodyLog(${index})">Del</button>
              </div></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>` :
      `<div class="empty">No measurements yet<span>Add your first log to start tracking progress.</span></div>`;

    el.innerHTML = `<div class="body-grid">
      <div class="body-card">
        <div class="body-card-head">
          <div>
            <div class="body-title">Profile</div>
            <div class="body-sub">Set your reference numbers for body tracking.</div>
          </div>
        </div>
        <div class="body-form-grid">
          <div class="body-field"><label for="bodyHeight">Height (in)</label><input id="bodyHeight" class="body-input" type="number" step="0.1" min="0" value="${body.height ?? ''}" ${profileLocked ? 'disabled' : ''}></div>
          <div class="body-field"><label for="bodyStartWeight">Starting Weight (lbs)</label><input id="bodyStartWeight" class="body-input" type="number" step="0.1" min="0" value="${body.startingWeight ?? ''}" ${profileLocked ? 'disabled' : ''}></div>
          <div class="body-field"><label for="bodyGoalWeight">Goal Weight (lbs)</label><input id="bodyGoalWeight" class="body-input" type="number" step="0.1" min="0" value="${body.goalWeight ?? ''}" ${profileLocked ? 'disabled' : ''}></div>
          <div class="body-field"><label for="bodyStartWaist">Starting Waist (in)</label><input id="bodyStartWaist" class="body-input" type="number" step="0.1" min="0" value="${body.startingWaist ?? ''}" ${profileLocked ? 'disabled' : ''}></div>
        </div>
        <div class="body-actions">
          <button class="body-btn" onclick="saveBodyProfile()" ${profileLocked ? 'disabled' : ''}>Save Profile</button>
          <button class="body-btn alt${profileLocked ? '' : ' active'}" onclick="${profileLocked ? 'unlockBodyProfile()' : 'return false;'}">${profileLocked ? 'Edit' : 'Editing'}</button>
        </div>
      </div>

      <div class="body-card">
        <div class="body-card-head">
          <div>
            <div class="body-title">Current Metrics</div>
            <div class="body-sub">Raw check-ins plus smoothed trend values.</div>
          </div>
        </div>
        <div class="body-metrics">
          ${renderBodyMetricCard('Latest Weight', latestWeight, weightDelta, 'lbs')}
          ${renderBodyMetricCard('Trend Weight', avgWeight, avgWeightDelta, 'lbs')}
          ${renderBodyMetricCard('Latest Waist', latestWaist, waistDelta, 'in')}
          ${renderBodyMetricCard('Trend Waist', avgWaist, avgWaistDelta, 'in')}
        </div>
        <div class="body-ratio">
          <div class="body-ratio-top">
            <div>
              <div class="body-k">Waist-to-Height Ratio</div>
              <div class="body-v">${ratio === null ? '&mdash;' : ratio.toFixed(3)}</div>
            </div>
            <span class="body-pill ${ratioBand}">${ratioLabel}</span>
          </div>
          <div class="body-bar"><div class="body-bar-fill ${ratioBand}" style="width:${ratioPct}%"></div></div>
          <div class="body-note">Target: 0.55 or lower${avgWaist !== null ? ' &bull; using trend waist for a steadier read' : ''}</div>
        </div>
        ${goalHtml}
        ${trendNoteHtml}
      </div>

      <div class="body-card">
        <div class="body-card-head">
          <div>
            <div class="body-title">Trend Preferences</div>
            <div class="body-sub">Balanced works best for most people. Adjust if you want the trend to react faster or smoother.</div>
          </div>
        </div>
        <div class="body-form-grid">
          <div class="body-field">
            <label for="bodySmoothing">Smoothing</label>
            <select id="bodySmoothing" class="body-input">
              <option value="responsive" ${calcSettings.smoothing === 'responsive' ? 'selected' : ''}>Responsive</option>
              <option value="balanced" ${calcSettings.smoothing === 'balanced' ? 'selected' : ''}>Balanced</option>
              <option value="smooth" ${calcSettings.smoothing === 'smooth' ? 'selected' : ''}>Smooth</option>
            </select>
            <div class="body-setting-list">
              <div><strong>Responsive</strong> - Reacts faster to recent changes (more sensitive)</div>
              <div><strong>Balanced</strong> - Recommended for most people (default)</div>
              <div><strong>Smooth</strong> - Steadiest trend line, less daily noise</div>
            </div>
          </div>
          <div class="body-field">
            <label for="bodyRateWindow">Rate Window</label>
            <select id="bodyRateWindow" class="body-input">
              ${BODY_RATE_WINDOW_OPTIONS.map(days => `<option value="${days}" ${calcSettings.rateWindowDays === days ? 'selected' : ''}>${days} days</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="body-actions">
          <button class="body-btn" onclick="saveBodyCalcSettings()">Apply Settings</button>
        </div>
        <div class="body-note">Current smoothing: ${smoothingPreset.label} (${smoothingPreset.weightAlpha.toFixed(2)} weight / ${smoothingPreset.waistAlpha.toFixed(2)} waist).</div>
      </div>

      <div class="body-card">
        <div class="body-card-head">
          <div>
            <div class="body-title">Rates</div>
            <div class="body-sub">Current rate uses the last ${calcSettings.rateWindowDays} days of your smoothed trend.</div>
          </div>
        </div>
        <div class="body-trends">
          ${renderBodyRateCard('Weight', weightRate, overallWeightRate, 'lbs', weightRateReadiness.message)}
          ${renderBodyRateCard('Waist', waistRate, overallWaistRate, 'in', waistRateReadiness.message)}
        </div>
      </div>

      <div class="body-card">
        <div class="body-card-head">
          <div>
            <div class="body-title">Trends</div>
            <div class="body-sub">Daily entries with the smoothed EMA trend line.</div>
          </div>
        </div>
        ${renderBodyChart('weight', 'Weight', 'lbs')}
        ${renderBodyChart('waist', 'Waist', 'in')}
      </div>

      <div class="body-card">
        <div class="body-card-head">
          <div>
            <div class="body-title">${editingLog ? 'Edit Log' : 'Add Log'}</div>
            <div class="body-sub">Log weight, waist, or both for any date.</div>
          </div>
        </div>
        <div class="body-form-grid">
          <div class="body-field"><label for="bodyLogDate">Date</label><input id="bodyLogDate" class="body-input" type="date" value="${editingLog?.date || today}"></div>
          <div class="body-field"><label for="bodyLogWeight">Weight (lbs)</label><input id="bodyLogWeight" class="body-input" type="number" step="0.1" min="0" value="${editingLog?.weight ?? ''}"></div>
          <div class="body-field"><label for="bodyLogWaist">Waist (in)</label><input id="bodyLogWaist" class="body-input" type="number" step="0.1" min="0" value="${editingLog?.waist ?? ''}"></div>
        </div>
        <div class="body-actions">
          <button class="body-btn" onclick="submitBodyLog()">${editingLog ? 'Update Log' : 'Add Log'}</button>
          ${editingLog ? '<button class="body-btn alt" onclick="cancelBodyLogEdit()">Cancel</button>' : ''}
        </div>
      </div>

      <div class="body-card">
        <div class="body-card-head">
          <div>
            <div class="body-title">Logs</div>
            <div class="body-sub">Entries are stored newest first.</div>
          </div>
        </div>
        ${logsHtml}
      </div>
    </div>`;
  }

  window.getBodyMetricKey = getBodyMetricKey;
  window.getLatestMetric = getLatestMetric;
  window.getBodyMetricLogs = getBodyMetricLogs;
  window.getBodySeries = getBodySeries;
  window.getBodyLogSpanDays = getBodyLogSpanDays;
  window.shouldShowBodyTrendStabilizingNote = shouldShowBodyTrendStabilizingNote;
  window.getBodyRateReadiness = getBodyRateReadiness;
  window.getBodyRate = getBodyRate;
  window.getOverallBodyRate = getOverallBodyRate;
  window.formatBodyRateNumber = formatBodyRateNumber;
  window.formatBodyRate = formatBodyRate;
  window.formatBodyGoalDate = formatBodyGoalDate;
  window.getBodyGoalPrediction = getBodyGoalPrediction;
  window.renderBodyMetricSparkline = renderBodyMetricSparkline;
  window.calculateWaistToHeight = calculateWaistToHeight;
  window.getBodyDeltaClass = getBodyDeltaClass;
  window.getBodyDeltaLabel = getBodyDeltaLabel;
  window.avg = avg;
  window.getTrend = getTrend;
  window.unlockBodyProfile = unlockBodyProfile;
  window.saveBodyProfile = saveBodyProfile;
  window.saveBodyCalcSettings = saveBodyCalcSettings;
  window.addBodyLog = addBodyLog;
  window.updateBodyLog = updateBodyLog;
  window.submitBodyLog = submitBodyLog;
  window.editBodyLog = editBodyLog;
  window.cancelBodyLogEdit = cancelBodyLogEdit;
  window.deleteBodyLog = deleteBodyLog;
  window.renderBodyMetricCard = renderBodyMetricCard;
  window.renderBodyRateCard = renderBodyRateCard;
  window.renderBody = renderBody;
  window.initBody = renderBody;
  window.cleanupBody = () => {};
})();
