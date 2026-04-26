const Store = (() => {
  const KEYS = {
    PLACES: 'mytravelblog_places',
    TAGS: 'mytravelblog_tag_index',
  };

  const API_PATH = '/api/state';
  const LEGACY_DB_NAME = 'mytravelblog_db';
  const LEGACY_DB_VERSION = 1;
  const LEGACY_STORE_NAME = 'app_state';

  const cache = {};
  let initPromise = null;
  let storageMode = 'initializing';
  let warnedUnavailable = false;

  function _clone(value) {
    return value == null ? null : JSON.parse(JSON.stringify(value));
  }

  function _readLocal(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function _removeLocal(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore cleanup errors
    }
  }

  function _hasPlaces(state) {
    return Array.isArray(state?.[KEYS.PLACES]) && state[KEYS.PLACES].length > 0;
  }

  function _showUnavailableError() {
    if (warnedUnavailable) return;
    warnedUnavailable = true;
    alert('The file-backed database is unavailable right now, so new changes cannot be saved. Make sure you started the app with python serve.py.');
  }

  async function _fetchFileState() {
    const res = await fetch(API_PATH, { cache: 'no-store' });
    if (!res.ok) throw new Error(`State fetch failed: ${res.status}`);
    const payload = await res.json();
    return (payload && typeof payload === 'object') ? payload : {};
  }

  async function _saveFileState(state) {
    const res = await fetch(API_PATH, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    if (!res.ok) throw new Error(`State save failed: ${res.status}`);
    await res.json().catch(() => ({}));
    return state;
  }

  function _openLegacyDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(LEGACY_DB_NAME, LEGACY_DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(LEGACY_STORE_NAME)) {
          db.createObjectStore(LEGACY_STORE_NAME, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function _readLegacyDbValue(db, key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LEGACY_STORE_NAME, 'readonly');
      const store = tx.objectStore(LEGACY_STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result ? request.result.value : null);
      request.onerror = () => reject(request.error);
    });
  }

  async function _loadLegacyBrowserState() {
    const keys = Object.values(KEYS);
    const legacyState = {};

    keys.forEach(key => {
      legacyState[key] = _readLocal(key);
    });

    if (typeof indexedDB === 'undefined') {
      return legacyState;
    }

    try {
      const db = await _openLegacyDb();
      for (const key of keys) {
        const dbValue = await _readLegacyDbValue(db, key);
        if (dbValue != null) {
          legacyState[key] = dbValue;
        }
      }
      db.close();
    } catch {
      // If the legacy DB cannot be read, keep whatever we found in localStorage.
    }

    return legacyState;
  }

  async function init() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      const keys = Object.values(KEYS);

      try {
        let fileState = await _fetchFileState();
        storageMode = 'file';

        keys.forEach(key => {
          if (!(key in fileState)) fileState[key] = null;
        });

        if (!_hasPlaces(fileState)) {
          const legacyState = await _loadLegacyBrowserState();
          if (_hasPlaces(legacyState)) {
            const mergedState = { ...fileState, ...legacyState };
            fileState = await _saveFileState(mergedState);
            keys.forEach(_removeLocal);
          }
        }

        keys.forEach(key => {
          cache[key] = _clone(fileState[key]);
        });
        return;
      } catch {
        storageMode = 'browser-fallback';
      }

      const legacyState = await _loadLegacyBrowserState();
      Object.values(KEYS).forEach(key => {
        cache[key] = _clone(legacyState[key]);
      });
    })();

    return initPromise;
  }

  function load(key) {
    return _clone(cache[key]);
  }

  async function save(key, value) {
    await init();
    const snapshot = _clone(value);

    if (storageMode === 'file') {
      try {
        const nextState = {};
        Object.values(KEYS).forEach(stateKey => {
          nextState[stateKey] = (stateKey === key) ? snapshot : _clone(cache[stateKey]);
        });

        const savedState = await _saveFileState(nextState);
        Object.values(KEYS).forEach(stateKey => {
          cache[stateKey] = _clone(savedState[stateKey]);
        });
        return true;
      } catch {
        _showUnavailableError();
        return false;
      }
    }

    cache[key] = snapshot;
    _showUnavailableError();
    return false;
  }

  function mode() {
    return storageMode;
  }

  return { KEYS, init, load, save, mode };
})();
