import { usePlayer } from "./player-store";
import { loadFile } from "./engine";

export type SongMeta = { id: string; name: string; size: number; addedAt: number };

// Songs live in this browser's IndexedDB: metadata in one store, the file bytes in another so listing stays light.
const DB_NAME = "backtorock";
const META = "songs";
const FILES = "files";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(META, { keyPath: "id" });
      req.result.createObjectStore(FILES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(store: string | string[], mode: IDBTransactionMode, fn: (tx: IDBTransaction) => IDBRequest<T>) {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx);
        tx.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        tx.onerror = tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

export async function listSongs(): Promise<SongMeta[]> {
  const all = await run<SongMeta[]>(META, "readonly", (tx) => tx.objectStore(META).getAll());
  return all.sort((a, b) => b.addedAt - a.addedAt);
}

export async function getSongData(id: string): Promise<ArrayBuffer | undefined> {
  return run<ArrayBuffer | undefined>(FILES, "readonly", (tx) => tx.objectStore(FILES).get(id));
}

export async function saveSong(name: string, data: ArrayBuffer): Promise<void> {
  // Ask the browser not to evict the songbook when storage runs low. Best effort: it may be refused or unsupported.
  navigator.storage?.persist?.().catch(() => {});
  const existing = (await listSongs()).find((s) => s.name === name && s.size === data.byteLength);
  const meta: SongMeta = {
    id: existing?.id ?? crypto.randomUUID(),
    name,
    size: data.byteLength,
    addedAt: Date.now(),
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([META, FILES], "readwrite");
    tx.objectStore(META).put(meta);
    tx.objectStore(FILES).put(data, meta.id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function deleteSong(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([META, FILES], "readwrite");
    tx.objectStore(META).delete(id);
    tx.objectStore(FILES).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}

const set = usePlayer.getState().set;

export async function refreshSongs() {
  try {
    set({ songs: await listSongs(), songsState: "ready" });
  } catch {
    set({ songsState: "error" });
  }
}

export function songLabel(name: string) {
  return name.replace(/.[^.]+$/, "");
}

export function songSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Throws when the stored bytes are gone, so callers can show their own message.
export async function openSong(song: SongMeta) {
  const data = await getSongData(song.id);
  if (!data) throw new Error("Missing song data");
  loadFile(song.name, data);
}
