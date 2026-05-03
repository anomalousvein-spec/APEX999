(() => {
  'use strict';

  /**
   * Universal Helpers
   */

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Schema Logic & Sets Calculation
   */

  function baseSets() {
    const S = window.S || window.ApexState?.get?.();
    if (!S) return 2;
    if (S.curBlock === 2 && ['3', '4'].includes(S.curWeek)) return 3;
    return 2;
  }

  function computeSets(group) {
    if (group === 'warmUp') return 0;
    return baseSets();
  }

  function ensurePools() {
    const S = window.S || window.ApexState?.get?.();
    if (S && !S.pools) {
      const dp = window.ApexCoreUtils?.DP || window.DP;
      if (dp) S.pools = JSON.parse(JSON.stringify(dp));
    }
    return S?.pools || window.ApexCoreUtils?.DP || window.DP;
  }

  const DAY_KEYS = ['1', '2'];

  function isDayKeyedStringMap(value) {
    return isPlainObject(value) &&
      DAY_KEYS.every(key => Object.prototype.hasOwnProperty.call(value, key) && typeof value[key] === 'string');
  }

  function isDayKeyedObjectMap(value) {
    return isPlainObject(value) &&
      DAY_KEYS.every(key => Object.prototype.hasOwnProperty.call(value, key) && isPlainObject(value[key]));
  }

  function isEmptyDayKeyedStringMap(value) {
    return isDayKeyedStringMap(value) && DAY_KEYS.every(key => value[key] === '');
  }

  function hasNonEmptyDayKeyedStringMap(value) {
    return isDayKeyedStringMap(value) && DAY_KEYS.some(key => value[key] !== '');
  }

  function isEmptyDayKeyedObjectMap(value) {
    return isDayKeyedObjectMap(value) &&
      DAY_KEYS.every(key => Object.keys(value[key]).length === 0);
  }

  function hasEntriesDayKeyedObjectMap(value) {
    return isDayKeyedObjectMap(value) &&
      DAY_KEYS.some(key => Object.keys(value[key]).length > 0);
  }

  window.ApexSharedStateUtils = {
    isPlainObject,
    escapeHtml,
    escapeRegex,
    baseSets,
    computeSets,
    ensurePools,
    isDayKeyedStringMap,
    isDayKeyedObjectMap,
    isEmptyDayKeyedStringMap,
    hasNonEmptyDayKeyedStringMap,
    isEmptyDayKeyedObjectMap,
    hasEntriesDayKeyedObjectMap,
    DAY_KEYS
  };

  // Expose globally for legacy support
  window.isPlainObject = isPlainObject;
  window.escapeHtml = escapeHtml;
  window.escapeRegex = escapeRegex;
  window.baseSets = baseSets;
  window.computeSets = computeSets;
  window.ensurePools = ensurePools;
})();
