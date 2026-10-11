import { create } from "zustand";
import { DEFAULT_ROOM, DRUM_DEFAULT, DRUM_FX_DEFAULT, type DrumFx, type DrumLevels, type DrumPiece, type DrumSettings, type KitVariant } from "./drums";
import { FX_DEFAULT, type FxSettings } from "./fx";
import { INSTRUMENTS, INST_DEFAULT, type InstId, type InstMix } from "./instruments";
import type { SongMeta } from "./songbook";

export type InstrumentKind = "piano" | "guitar" | "bass" | "drums" | "other";

export type TrackInfo = {
  index: number;
  name: string;
  kind: InstrumentKind;
  stringed: boolean;
  percussion: boolean;
  program: number; // General MIDI program, 0-based
  // Open-string MIDI pitches, lowest string first (string 1 = lowest in alphaTab).
  tuning: number[];
  // Lowest and highest MIDI note the track plays, used to grey out unreachable piano keys.
  range: [number, number];
  muted: boolean;
  solo: boolean;
  gain: number; // multiplier on the track's own volume: 1 = as authored, 0 = silent
};

export type ActiveNote = { midi: number; string: number; fret: number };

type Status = "empty" | "loading" | "ready" | "error";

type PlayerState = {
  status: Status;
  engineReady: boolean;
  error: string | null;
  fileName: string | null;
  title: string | null;
  tracks: TrackInfo[];
  selected: number;
  playing: boolean;
  time: number;
  end: number;
  speed: number;
  masterVolume: number;
  zoom: number;
  looping: boolean;
  metronome: boolean;
  soundReady: boolean;
  soundProgress: number;
  fx: FxSettings;
  drums: DrumLevels;
  drumFx: DrumFx;
  drumKitOn: boolean;
  drumVariant: KitVariant;
  drumSync: number;
  drumRoom: number;
  // The drum settings as last saved; the three fields above are the live ones, which may differ until saved.
  drumSaved: DrumSettings | null;
  drumMixerOpen: boolean;
  // Drums soloed in the mixer; not saved, so a forgotten solo never silences the kit next session.
  drumSolo: DrumPiece[];
  // Instruments played from samples. `inst` is the live mixer, `instSaved` the last saved copy, `sampledOn` the switches,
  // `instActive` the ones the open song uses.
  inst: InstMix;
  instSaved: InstMix | null;
  sampledOn: Record<InstId, boolean>;
  instActive: InstId[];
  instMixerOpen: boolean;
  drumsLoading: boolean;
  drumSynthKeys: string[];
  drumsProgress: number;
  songs: SongMeta[];
  songsState: "loading" | "ready" | "error";
  // Notes sounding right now, keyed by track index, so every panel can follow its own track.
  activeByTrack: Record<number, ActiveNote[]>;
  guitarOpen: boolean;
  bassOpen: boolean;
  pianoOpen: boolean;
  set: (patch: Partial<PlayerState>) => void;
  patchTrack: (index: number, patch: Partial<TrackInfo>) => void;
};

export const usePlayer = create<PlayerState>((set) => ({
  status: "empty",
  engineReady: false,
  error: null,
  fileName: null,
  title: null,
  tracks: [],
  selected: 0,
  playing: false,
  time: 0,
  end: 0,
  speed: 1,
  masterVolume: 1,
  zoom: 1,
  looping: false,
  metronome: false,
  soundReady: false,
  soundProgress: 0,
  fx: FX_DEFAULT,
  drums: DRUM_DEFAULT,
  drumFx: DRUM_FX_DEFAULT,
  drumKitOn: true,
  drumVariant: "muldjord",
  drumSync: 0,
  drumRoom: DEFAULT_ROOM,
  drumSaved: null,
  drumMixerOpen: false,
  drumSolo: [],
  inst: INST_DEFAULT,
  instSaved: null,
  sampledOn: Object.fromEntries(INSTRUMENTS.map((i) => [i.id, i.defaultOn])) as Record<InstId, boolean>,
  instActive: [],
  instMixerOpen: false,
  drumsLoading: false,
  drumSynthKeys: [],
  drumsProgress: 1,
  songs: [],
  songsState: "loading",
  activeByTrack: {},
  guitarOpen: false,
  bassOpen: false,
  pianoOpen: false,
  set: (patch) => set(patch),
  patchTrack: (index, patch) =>
    set((s) => ({
      tracks: s.tracks.map((t) => (t.index === index ? { ...t, ...patch } : t)),
    })),
}));
