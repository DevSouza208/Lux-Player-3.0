import type { LuxState } from "@/lib/luxTypes";
import { EMPTY_LUX_STATE } from "@/lib/luxTypes";

const DATABASE_NAME = "lux-player-db";
const STORE_NAME = "app-state";
const STATE_KEY = "lux-state";

let databasePromise: Promise<IDBDatabase> | undefined;

function openDatabase() {
  databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
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
    request.onsuccess = () => resolve((request.result as LuxState | undefined) ?? structuredClone(EMPTY_LUX_STATE));
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

export const createLocalId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;