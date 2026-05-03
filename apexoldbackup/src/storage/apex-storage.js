(() => {
  'use strict';

  const DB_NAME = 'apex';
  const DB_VERSION = 1;
  const STORE_NAME = 'kv';
  const STATE_KEY = 'app-state';
  const CACHE_KEY = 'apex::cache';
  const LEGACY_KEYS = [
    'lp', 'lcd', 'lwo', 'llk', 'lpi', 'lbl', 'lwk', 'leh', 'lsh',
    'lst', '_sid', 'lpf', 'lnt', 'lrt', 'lrtm', 'lrx', 'lbm', 'lbrc'
  ];

  let cache = loadInitialCache();
  let dbPromise = null;
  let flushTimer = null;
  let flushInFlight = Promise.resolve();

  function deepClone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function loadInitialCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      }
    } catch {}
    const legacy = readLegacyLocalStorage();
    if (Object.keys(legacy).length) {
      syncMirror();
      return legacy;
    }
    return {};
  }

  function readLegacyLocalStorage() {
    const out = {};
    LEGACY_KEYS.forEach(key => {
      try {
        const raw = localStorage.getItem(key);
        if (raw !== null) out[key] = JSON.parse(raw);
      } catch {}
    });
    return out;
  }

  function syncMirror() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {}
  }

  function scheduleFlush() {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushInFlight = flushInFlight
        .catch(() => {})
        .then(() => writeCacheToDb())
        .catch(error => console.warn('APEX storage flush failed', error));
    }, 120);
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB unavailable in this context'));
        return;
      }
      let req;
      try {
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (error) {
        reject(error);
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
      req.onblocked = () => reject(new Error('IndexedDB open blocked'));
    });
    return dbPromise;
  }

  function readStateFromDb() {
    return openDb().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(STATE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error('IndexedDB read failed'));
    }));
  }

  function writeCacheToDb() {
    const snapshot = deepClone(cache);
    return openDb().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
      tx.objectStore(STORE_NAME).put(snapshot, STATE_KEY);
    }));
  }

  function mergeAuthoritativeState(dbState) {
    if (dbState && typeof dbState === 'object' && !Array.isArray(dbState)) {
      cache = dbState;
      syncMirror();
      return Promise.resolve(cache);
    }
    if (Object.keys(cache).length) {
      syncMirror();
      return writeCacheToDb().then(() => cache);
    }
    return Promise.resolve(cache);
  }

  function init() {
    return Promise.race([
      readStateFromDb(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('IndexedDB init timeout')), 700))
    ])
      .then(mergeAuthoritativeState)
      .catch(error => {
        console.warn('APEX storage init fallback', error);
        const legacy = readLegacyLocalStorage();
        if (Object.keys(legacy).length) {
          cache = legacy;
          syncMirror();
        }
        return cache;
      });
  }

  function get(key, fallbackValue) {
    if (Object.prototype.hasOwnProperty.call(cache, key)) return deepClone(cache[key]);
    return deepClone(fallbackValue);
  }

  function set(key, value) {
    cache[key] = deepClone(value);
    syncMirror();
    scheduleFlush();
    return value;
  }

  function setMany(entries) {
    if (!entries || typeof entries !== 'object') return getCacheSnapshot();
    Object.keys(entries).forEach(key => {
      cache[key] = deepClone(entries[key]);
    });
    syncMirror();
    scheduleFlush();
    return getCacheSnapshot();
  }

  function getCacheSnapshot() {
    return deepClone(cache);
  }

  function flush() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    flushInFlight = flushInFlight
      .catch(() => {})
      .then(() => writeCacheToDb())
      .catch(error => console.warn('APEX storage flush failed', error));
    return flushInFlight;
  }

  window.ApexStorage = {
    init,
    get,
    set,
    setMany,
    getCacheSnapshot,
    flush
  };
})();
