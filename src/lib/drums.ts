// Drum kit balance and tone. Every drum of the kit is its own channel in the sampled kit (drum-kit.ts), with a level
// and a strip of EQ, compressor and reverb. "other" is every percussion note the kit has no sample for; those stay on
// the synth, so only their level can be set (by scaling the velocity of their notes in the generated MIDI).

export type DrumPiece =
  | "kick"
  | "snare"
  | "tom1"
  | "tom2"
  | "tom3"
  | "tom4"
  | "hihat"
  | "crashL"
  | "crashR"
  | "rideL"
  | "rideR"
  | "china"
  | "other";

// `keys` are the General MIDI percussion keys, used to find the drum of a note on the synth.
export const DRUM_PIECES: { id: DrumPiece; label: string; keys: number[] }[] = [
  { id: "kick", label: "Kick", keys: [35, 36] },
  { id: "snare", label: "Snare", keys: [37, 38, 39, 40] },
  { id: "tom1", label: "Tom 1 (high)", keys: [48, 50] },
  { id: "tom2", label: "Tom 2", keys: [47] },
  { id: "tom3", label: "Tom 3", keys: [45] },
  { id: "tom4", label: "Tom 4 (floor)", keys: [41, 43] },
  { id: "hihat", label: "Hi-hat", keys: [42, 44, 46] },
  { id: "crashL", label: "Crash left", keys: [49, 55] },
  { id: "crashR", label: "Crash right", keys: [57] },
  { id: "rideL", label: "Ride left", keys: [59] },
  { id: "rideR", label: "Ride right", keys: [51, 53] },
  { id: "china", label: "China", keys: [52] },
  { id: "other", label: "Percussion", keys: [] },
];

const IDS = DRUM_PIECES.map((p) => p.id);

// Before every drum had its own channel, settings were kept per group. Older saved values carry over to the drums of
// their group.
const LEGACY: Partial<Record<DrumPiece, string>> = {
  tom1: "toms",
  tom2: "toms",
  tom3: "toms",
  tom4: "toms",
  crashL: "cymbals",
  crashR: "cymbals",
  rideL: "cymbals",
  rideR: "cymbals",
  china: "cymbals",
};

function build<T>(fallback: Record<DrumPiece, T>, saved: Record<string, T> | null, merge: (base: T, saved: T) => T) {
  return Object.fromEntries(
    IDS.map((id) => {
      const own = saved?.[id] ?? (LEGACY[id] ? saved?.[LEGACY[id]!] : undefined);
      return [id, own === undefined ? fallback[id] : merge(fallback[id], own)];
    }),
  ) as Record<DrumPiece, T>;
}

function read(key: string): Record<string, never> | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export type DrumLevels = Record<DrumPiece, number>;

const levels = (v: Partial<DrumLevels>): DrumLevels => ({
  kick: 1, snare: 1, tom1: 1, tom2: 1, tom3: 1, tom4: 1, hihat: 1, crashL: 1, crashR: 1, rideL: 1, rideR: 1, china: 1, other: 1,
  ...v,
});

// Rock kit: punchy snare, quieter hi-hat and cymbals so they do not wash over the mix.
export const DRUM_DEFAULT: DrumLevels = levels({
  kick: 1.35, snare: 1.35, tom1: 0.65, tom2: 0.65, tom3: 0.7, tom4: 0.7, hihat: 0.4,
  crashL: 0.35, crashR: 0.35, rideL: 0.5, rideR: 0.5, china: 0.3,
});

const PIECE_BY_KEY = new Map<number, DrumPiece>(DRUM_PIECES.flatMap((p) => p.keys.map((k) => [k, p.id] as const)));

export const pieceOf = (key: number): DrumPiece => PIECE_BY_KEY.get(key) ?? "other";

// Each kit keeps its own saved balance and tone: the Muldjord kit under the original keys, the Vortex kits under keys
// of their own, so tuning one never changes the other.
const keyOf = (base: string, variant: KitVariant) => (variant === "muldjord" ? base : `${base}-${variant}`);

export const loadDrums = (variant: KitVariant = "muldjord"): DrumLevels =>
  build(defaultsFor(variant).levels, read(keyOf("btr-drums", variant)), (_base, saved) => saved);
export const saveDrums = (value: DrumLevels, variant: KitVariant = "muldjord") => write(keyOf("btr-drums", variant), value);

// Tone of one drum.
export type PieceFx = {
  low: number; // dB, low shelf at 120 Hz
  mid: number; // dB, peaking at 1.5 kHz
  high: number; // dB, high shelf at 6 kHz
  comp: number; // 0 = off, 1 = heavy
  reverb: number; // send to the drum room, 0 = dry
  pan: number; // -1 left to 1 right, moves the drum from where the recording places it
  pitch: number; // semitones, tunes the drum up or down (a higher pitch also shortens the sound)
  mute: number; // 1 = muted, 0 = not (a number, like the rest, so settings compare and save the same way)
};

export type DrumFx = Record<DrumPiece, PieceFx>;

const strip = (low: number, mid: number, high: number, comp: number, reverb: number): PieceFx => ({
  low, mid, high, comp, reverb, pan: 0, pitch: 0, mute: 0,
});
const flat = strip(0, 0, 0, 0, 0);

const fxOf = (v: Partial<DrumFx>): DrumFx => ({
  kick: flat, snare: flat, tom1: flat, tom2: flat, tom3: flat, tom4: flat, hihat: flat,
  crashL: flat, crashR: flat, rideL: flat, rideR: flat, china: flat, other: flat,
  ...v,
});

const tone = (v: Partial<PieceFx>): PieceFx => ({ ...flat, ...v });

export const DRUM_FX_DEFAULT: DrumFx = fxOf({
  kick: tone({ mid: -5, high: 6, pitch: 3 }),
  snare: tone({ mid: -1, high: 1, pitch: 1.5 }),
  tom1: tone({ high: 3, comp: 0.15, pan: -0.1, pitch: 2.5 }),
  tom2: tone({ mid: -8, comp: 0.1, pitch: 3 }),
  tom3: tone({ mid: -5, comp: 0.15, pan: 0.25, pitch: 2 }),
  tom4: tone({ mid: -5, comp: 0.15, pan: 0.25, pitch: 3 }),
  hihat: tone({ mid: -7 }),
  crashL: tone({ mid: -8, reverb: 0.2, pitch: 1 }),
  crashR: tone({ mid: -8, reverb: 0.05, pitch: 2 }),
  rideL: tone({ mid: -6, pitch: 2 }),
  rideR: tone({ mid: -5, pitch: 1 }),
  china: tone({ mid: -7, pan: 0.3 }),
});

export const loadDrumFx = (variant: KitVariant = "muldjord"): DrumFx =>
  build(
    defaultsFor(variant).fx,
    read(keyOf("btr-drum-fx", variant)) as Record<string, PieceFx> | null,
    (base, saved) => ({ ...base, ...saved }),
  );
export const saveDrumFx = (value: DrumFx, variant: KitVariant = "muldjord") => write(keyOf("btr-drum-fx", variant), value);

// The Vortex recordings are already tight and dry, so they need no pitch-up and less EQ than the Muldjord kit; the
// kick sits lower, the snare is up front, and hi-hat and cymbals are a little louder.
const VORTEX_LEVELS: DrumLevels = levels({
  kick: 0.5, snare: 0.4, tom1: 0.55, tom2: 0.45, tom3: 0.45, tom4: 0.45, hihat: 1.3,
  crashL: 0.7, crashR: 0.7, rideL: 0.75, rideR: 0.85, china: 0.7,
});

const VORTEX_FX: DrumFx = fxOf({
  kick: tone({ mid: -5, comp: 0.15, reverb: 0.15 }),
  snare: tone({ high: 2, comp: 0.35, reverb: 0.2, pan: -0.2, pitch: 3 }),
  tom1: tone({ high: 1, comp: 0.05, reverb: 0.1, pan: -0.7, pitch: 2 }),
  tom2: tone({ mid: -8, comp: 0.15, pan: -0.35, pitch: 2 }),
  tom3: tone({ mid: -5, comp: 0.15, pan: 0.25, pitch: 1 }),
  tom4: tone({ mid: -5, comp: 0.15, reverb: 0.2, pan: 0.55, pitch: 1 }),
  hihat: tone({ mid: -6, high: -1, reverb: 0.2 }),
  crashL: tone({ mid: -8, reverb: 0.2, pitch: 1 }),
  crashR: tone({ mid: -8, reverb: 0.05, pitch: 2 }),
  rideL: tone({ mid: -6, pitch: 2 }),
  rideR: tone({ mid: -5, pitch: 1 }),
  china: tone({ mid: -7, reverb: 0.2, pan: 0.3 }),
});

/** The balance and tone a kit starts with, and returns to on Reset. */
export function defaultsFor(variant: KitVariant) {
  return variant === "muldjord"
    ? { levels: DRUM_DEFAULT, fx: DRUM_FX_DEFAULT }
    : { levels: VORTEX_LEVELS, fx: VORTEX_FX };
}

export const DEFAULT_ROOM = 0.3;

// Everything the drum mixer edits and saves together.
export type DrumSettings = { drums: DrumLevels; drumFx: DrumFx; room: number };

const close = (a: number, b: number) => Math.abs(a - b) < 0.001;

// Slider steps like 0.2 produce values such as 1.2000000000000002, so settings are compared with a tolerance.
export function sameSettings(a: DrumSettings, b: DrumSettings) {
  return (
    close(a.room, b.room) &&
    DRUM_PIECES.every(
      (p) =>
        close(a.drums[p.id], b.drums[p.id]) &&
        (Object.keys(a.drumFx[p.id]) as (keyof PieceFx)[]).every((k) => close(a.drumFx[p.id][k], b.drumFx[p.id][k])),
    )
  );
}

// The level each drum plays at: its level, or silence when it is muted or another drum is soloed.
export function effectiveLevels(levels: DrumLevels, fx: DrumFx, solo: DrumPiece[]): DrumLevels {
  const out = { ...levels };
  for (const p of DRUM_PIECES)
    if (p.id !== "other" && (fx[p.id].mute > 0 || (solo.length > 0 && !solo.includes(p.id)))) out[p.id] = 0;
  return out;
}

// Sampled kit on/off, the timing offset (ms) that lines it up with the synth on this device, and the drum room size (s).
export type KitPrefs = { on: boolean; sync: number; room: number; variant: KitVariant };

// Which recording plays kick, snare and toms. "muldjord" is the original kit; the two Vortex kits only replace those
// drums (they have no hi-hat or cymbals), the rest stays on the MuldjordKit.
export type KitVariant = "muldjord" | "vortex-all";

export const KIT_VARIANTS: { id: KitVariant; label: string; note: string }[] = [
  { id: "muldjord", label: "Muldjord", note: "The original kit." },
  { id: "vortex-all", label: "Vortex · all mics", note: "Kick, snare and toms with room sound." },
];

export function loadKitPrefs(): KitPrefs {
  const prefs = {
    on: true,
    sync: 0,
    room: DEFAULT_ROOM,
    variant: "vortex-all",
    ...(read("btr-drum-kit") as Partial<KitPrefs> | null),
  } as KitPrefs;
  if (!KIT_VARIANTS.some((v) => v.id === prefs.variant)) prefs.variant = "muldjord";
  return prefs;
}

export const saveKitPrefs = (prefs: KitPrefs) => write("btr-drum-kit", prefs);

// General MIDI percussion names, to tell the user which drum notes of a song the sampled kit cannot play.
const GM_NAMES: Record<number, string> = {
  27: "High Q", 28: "Slap", 29: "Scratch", 30: "Scratch", 31: "Sticks", 32: "Square click", 33: "Metronome click",
  34: "Metronome bell", 54: "Tambourine", 56: "Cowbell", 58: "Vibraslap", 60: "Bongo", 61: "Bongo", 62: "Conga",
  63: "Conga", 64: "Conga", 65: "Timbale", 66: "Timbale", 67: "Agogo", 68: "Agogo", 69: "Cabasa", 70: "Maracas",
  71: "Whistle", 72: "Whistle", 73: "Guiro", 74: "Guiro", 75: "Claves", 76: "Woodblock", 77: "Woodblock",
  78: "Cuica", 79: "Cuica", 80: "Triangle", 81: "Triangle", 82: "Shaker", 83: "Jingle bell", 84: "Bell tree",
  85: "Castanets", 86: "Surdo", 87: "Surdo",
};

export const gmName = (key: number) => GM_NAMES[key] ?? `Note ${key}`;

// Drum balance and tone in one click. "Metal" is tight and punchy: scooped, clicky kick, cracking snare, dark and
// short cymbals, and enough compression to keep fast double-bass even.
export type DrumPreset = { id: string; label: string; levels: DrumLevels; fx: DrumFx };

const metalTom = strip(3, -2, 4, 0.5, 0.1);
const metalCymbal = strip(-5, -2, 2, 0.35, 0.1);

export const DRUM_PRESETS: DrumPreset[] = [
  { id: "natural", label: "Natural", levels: DRUM_DEFAULT, fx: DRUM_FX_DEFAULT },
  {
    id: "metal",
    label: "Metal",
    levels: levels({
      kick: 1.3, snare: 1.4, tom1: 1.15, tom2: 1.15, tom3: 1.15, tom4: 1.15, hihat: 0.45,
      crashL: 0.6, crashR: 0.6, rideL: 0.6, rideR: 0.6, china: 0.6,
    }),
    fx: fxOf({
      kick: strip(3, -4, 6, 0.65, 0),
      snare: strip(1, 3, 4, 0.6, 0.15),
      tom1: metalTom, tom2: metalTom, tom3: metalTom, tom4: metalTom,
      hihat: strip(-6, 0, 2, 0.3, 0),
      crashL: metalCymbal, crashR: metalCymbal, rideL: metalCymbal, rideR: metalCymbal, china: metalCymbal,
    }),
  },
];

/** The presets of a kit: "Natural" is that kit's own defaults. */
export const presetsFor = (variant: KitVariant): DrumPreset[] =>
  DRUM_PRESETS.map((p) => {
    if (p.id !== "natural") return p;
    const d = defaultsFor(variant);
    return { ...p, levels: d.levels, fx: d.fx };
  });
