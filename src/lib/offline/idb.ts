const DB_NAME = 'readfox-offline';
const STORE_NAME = 'state';
const STATE_KEY = 'offline-v1';

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE_NAME)) {
          req.result.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Read raw OfflineState JSON from IndexedDB, or null when unavailable/empty. */
export async function readWebOfflineFile(): Promise<string | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      try {
        db.close();
      } catch {
        // ignore close errors
      }
      resolve(value);
    };
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(STATE_KEY);
      req.onsuccess = () => finish(typeof req.result === 'string' ? req.result : null);
      req.onerror = () => finish(null);
      tx.onerror = () => finish(null);
      tx.onabort = () => finish(null);
    } catch {
      finish(null);
    }
  });
}

/** Persist raw OfflineState JSON to IndexedDB; degrades cleanly to a no-op if blocked. */
export async function writeWebOfflineFile(content: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        db.close();
      } catch {
        // ignore close errors
      }
      resolve();
    };
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(content, STATE_KEY);
      tx.oncomplete = finish;
      tx.onerror = finish;
      tx.onabort = finish;
    } catch {
      finish();
    }
  });
}
