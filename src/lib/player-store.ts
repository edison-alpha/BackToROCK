import { create } from "zustand";
import { DRUM_DEFAULT, type DrumLevels } from "./drums";
import { FX_DEFAULT, type FxSettings } from "./fx";
import type { SongMeta } from "./songbook";

export type InstrumentKind = "piano" | "guitar" | "bass" | "drums" | "other";

export type TrackInfo = {
  index: number;
  name: string;
  kind: InstrumentKind;
  stringed: boolean;
  percussion: boolean;
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
