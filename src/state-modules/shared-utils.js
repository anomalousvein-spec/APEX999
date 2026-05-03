(() => {
  'use strict';

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
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
    isDayKeyedStringMap,
    isDayKeyedObjectMap,
    isEmptyDayKeyedStringMap,
    hasNonEmptyDayKeyedStringMap,
    isEmptyDayKeyedObjectMap,
    hasEntriesDayKeyedObjectMap,
    DAY_KEYS
  };
})();
