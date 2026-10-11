// Drum kit balance. Each piece of the kit is a General MIDI percussion key, so its level is set by scaling the
// velocity of its notes when the MIDI for playback is generated (see engine.ts). A piece cannot get its own EQ or
// compressor, because the synth mixes the whole kit into one stream before the effects.

export type DrumPiece = "kick" | "snare" | "toms" | "hihat" | "cymbals" | "other";

export const DRUM_PIECES: { id: DrumPiece; label: string; keys: number[] }[] = [
  { id: "kick", label: "Kick", keys: [35, 36] },
  { id: "snare", label: "Snare", keys: [37, 38, 39, 40] },
  { id: "toms", label: "Toms", keys: [41, 43, 45, 47, 48, 50] },
  { id: "hihat", label: "Hi-hat", keys: [42, 44, 46] },
  { id: "cymbals", label: "Cymbals", keys: [49, 51, 52, 53, 55, 57, 59] },
  { id: "other", label: "Percussion", keys: [] },
];

export type DrumLevels = Record<DrumPiece, number>;

// Rock kit: punchy snare, quieter hi-hat and cymbals so they do not wash over the mix.
export const DRUM_DEFAULT: DrumLevels = { kick: 1, snare: 1.35, toms: 1, hihat: 0.2, cymbals: 0.55, other: 1 };

const PIECE_BY_KEY = new Map<number, DrumPiece>(DRUM_PIECES.flatMap((p) => p.keys.map((k) => [k, p.id] as const)));

export const pieceOf = (key: number): DrumPiece => PIECE_BY_KEY.get(key) ?? "other";

const STORAGE_KEY = "btr-drums";

export function loadDrums(): DrumLevels {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DRUM_DEFAULT, ...JSON.parse(raw) };
  } catch {}
  return DRUM_DEFAULT;
}

export function saveDrums(levels: DrumLevels) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(levels));
  } catch {}
}
