import { useSyncExternalStore } from "react";
import type { Instrument } from "./profile";

// A guest has no account, so their instrument lives in this browser's localStorage.
// `id` is a random seed that keeps the generated avatar the same across visits.
export type Guest = { id: string; instrument?: Instrument; skipped?: boolean };

const KEY = "btr_guest";
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cached: Guest | null = null;

function read(): Guest | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return cached; // storage blocked: fall back to what this tab already knows
  }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    cached = raw ? (JSON.parse(raw) as Guest) : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function saveGuest(patch: Partial<Omit<Guest, "id">>) {
  const next: Guest = { ...(read() ?? { id: crypto.randomUUID() }), ...patch };
  const raw = JSON.stringify(next);
  try {
    localStorage.setItem(KEY, raw);
    cachedRaw = raw;
  } catch {
    cachedRaw = null;
  }
  cached = next;
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

// `undefined` means localStorage has not been read yet (server render and the first hydration pass), which is
// different from `null` (read, nothing saved). Treating the two alike sent saved guests back to /onboarding.
export function useGuest(): Guest | null | undefined {
  return useSyncExternalStore<Guest | null | undefined>(subscribe, read, () => undefined);
}
