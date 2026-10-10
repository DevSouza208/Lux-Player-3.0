import type { LuxState, WatchProgress } from "@/lib/luxTypes";
import { EMPTY_LUX_STATE } from "@/lib/luxTypes";
import { migrateLuxCatalog } from "@/lib/catalog";

const DATABASE_NAME = "lux-player-db";
const STORE_NAME = "app-state";
const PROGRESS_STORE_NAME = "watch-progress";
const STATE_KEY = "lux-state";

let databasePromise: Promise<IDBDatabase> | undefined;

function openDatabase() {
  databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      if (!request.result.objectStoreNames.contains(PROGRESS_STORE_NAME)) request.result.createObjectStore(PROGRESS_STORE_NAME);
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
  return databasePromise;
}

export async function loadLuxState(): Promise<LuxState> {
  if (typeof indexedDB === "undefined") return structuredClone(EMPTY_LUX_STATE);
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(STATE_KEY);
    request.onsuccess = async () => {
      try {
        const stored = (request.result as LuxState | undefined) ?? structuredClone(EMPTY_LUX_STATE);
        const progress = await new Promise<Record<string, WatchProgress>>((progressResolve, progressReject) => {
          const transaction = database.transaction(PROGRESS_STORE_NAME, "readonly");
          const store = transaction.objectStore(PROGRESS_STORE_NAME);
          const keysRequest = store.getAllKeys();
          const valuesRequest = store.getAll();
          transaction.oncomplete = () => progressResolve(Object.fromEntries(keysRequest.result.map((key, index) => [String(key), valuesRequest.result[index] as WatchProgress])));
          transaction.onerror = () => progressReject(transaction.error);
        });
        stored.progress = { ...stored.progress, ...progress };
        const migrated = await migrateLuxCatalog(stored);
        if (migrated.changed) await saveLuxState(migrated.state);
        resolve(migrated.state);
      } catch (error) {
        reject(error);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveLuxState(state: LuxState) {
  if (typeof indexedDB === "undefined") return;
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(state, STATE_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function saveWatchProgress(key: string, progress: WatchProgress) {
  if (typeof indexedDB === "undefined") return;
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(PROGRESS_STORE_NAME, "readwrite").objectStore(PROGRESS_STORE_NAME).put(progress, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export const createLocalId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;