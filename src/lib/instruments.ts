// Instruments played from recorded samples instead of the synth (see instrument.ts), and their saved mixer settings.
import type { PieceFx } from "./drums";

export type InstId = "bass" | "piano" | "strings";

const ALL_INSTRUMENTS: {
  id: InstId;
  label: string;
  url: string;
  programs: number[];
  credit: string;
  // Whether the samples are used until the user switches them on. Off: the synth plays it, as before.
  defaultOn: boolean;
  // Whether the strip has the amp controls (drive and tone), which only suit a bass or guitar.
  amp: boolean;
}[] = [
  {
    id: "bass",
    label: "Bass",
    url: "/kits/growlybass",
    // General MIDI programs 33-40 (0-based 32-39): acoustic, fingered, picked, fretless, slap and synth basses.
    programs: [32, 33, 34, 35, 36, 37, 38, 39],
    credit: "Growlybass by Karoryfer Samples, CC0",
    defaultOn: false,
    amp: true,
  },
  {
    id: "piano",
    label: "Piano",
    url: "/kits/piano",
    // General MIDI 1-2: acoustic grand and bright acoustic piano. Electric and honky-tonk pianos stay on the synth.
    programs: [0, 1],
    credit: "Salamander Grand Piano by Alexander Holm, CC BY 3.0",
    defaultOn: false,
    amp: false,
  },
  {
    id: "strings",
    label: "Strings",
    url: "/kits/strings",
    // Violin, viola, cello and the two string ensembles. Tremolo, pizzicato and synth strings stay on the synth.
    programs: [40, 41, 42, 48, 49],
    credit: "VS Chamber Orchestra Community Edition by Versilian Studios, CC0",
    defaultOn: false,
    amp: false,
  },
];

// Sampled bass, piano and strings are switched off for now: with no instrument in this list, no song track is taken
// over, nothing is downloaded and the mixer button stays hidden. Set to true to bring them back.
const SAMPLED_INSTRUMENTS_ENABLED = false;
export const INSTRUMENTS = SAMPLED_INSTRUMENTS_ENABLED ? ALL_INSTRUMENTS : [];

// A channel strip: level plus the same tone controls as a drum (pan, pitch, EQ, compressor, reverb send, mute), and a
// small amp: drive (soft saturation, 0-1) and tone (low-pass like a speaker cabinet, 0 = dark, 1 = open).
export type InstSettings = PieceFx & { level: number; drive: number; tone: number };
export type InstMix = Record<InstId, InstSettings>;

// The bass samples were recorded straight from the guitar, with no amp: raw, they sound thin and clicky. The default
// puts them through a small amp and cabinet.
const FLAT: InstSettings = { level: 1, low: 0, mid: 0, high: 0, comp: 0, reverb: 0, pan: 0, pitch: 0, mute: 0, drive: 0, tone: 1 };

export const INSTRUMENT_PRESETS: Record<InstId, { id: string; label: string; fx: Partial<InstSettings> }[]> = {
  piano: [
    { id: "natural", label: "Natural", fx: {} },
    { id: "bright", label: "Bright", fx: { high: 3, mid: 1, comp: 0.15 } },
    { id: "warm", label: "Warm", fx: { low: 2, high: -3, reverb: 0.15 } },
    { id: "hall", label: "Hall", fx: { reverb: 0.4, comp: 0.1 } },
  ],
  strings: [
    { id: "natural", label: "Natural", fx: {} },
    { id: "lush", label: "Lush", fx: { reverb: 0.35, high: -1 } },
    { id: "bright", label: "Bright", fx: { high: 3, mid: 1 } },
  ],
  bass: [
    { id: "di", label: "Raw", fx: {} },
    { id: "rock", label: "Rock", fx: { low: 3, mid: -1, high: -3, comp: 0.45, drive: 0.25, tone: 0.55 } },
    { id: "metal", label: "Metal", fx: { low: 4, mid: -3, high: 2, comp: 0.6, drive: 0.55, tone: 0.62 } },
    { id: "warm", label: "Warm", fx: { low: 5, mid: 0, high: -6, comp: 0.35, drive: 0.1, tone: 0.4 } },
  ],
};

export const INST_DEFAULT: InstMix = {
  bass: { ...FLAT, ...INSTRUMENT_PRESETS.bass[1].fx },
  piano: FLAT,
  strings: FLAT,
};
export const INST_FLAT = FLAT;

const close = (a: number, b: number) => Math.abs(a - b) < 0.001;

export const sameMix = (a: InstMix, b: InstMix) =>
  INSTRUMENTS.every((i) =>
    (Object.keys(a[i.id]) as (keyof InstSettings)[]).every((k) => close(a[i.id][k], b[i.id][k])),
  );

const KEY = "btr-instruments";
const SAMPLED_KEY = "btr-sampled";

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {}
  return null;
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function loadInstruments(): InstMix {
  const saved = read<Partial<Record<InstId, Partial<InstSettings>>>>(KEY);
  return Object.fromEntries(INSTRUMENTS.map((i) => [i.id, { ...INST_DEFAULT[i.id], ...saved?.[i.id] }])) as InstMix;
}
export const saveInstruments = (mix: InstMix) => write(KEY, mix);

/** Which instruments play from samples, by id. */
export function loadSampled(): Record<InstId, boolean> {
  const saved = read<Partial<Record<InstId, boolean>>>(SAMPLED_KEY);
  return Object.fromEntries(INSTRUMENTS.map((i) => [i.id, saved?.[i.id] ?? i.defaultOn])) as Record<InstId, boolean>;
}
export const saveSampled = (on: Record<InstId, boolean>) => write(SAMPLED_KEY, on);
