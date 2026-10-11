// Built-in beats for trying the drum mixer without opening a song. They play through the same sampled kit and channel
// strips as a song does, on an audio context of their own.
import { drumKit, type DrumHit } from "./drum-kit";
import { effectiveLevels, loadDrumFx, loadDrums, loadKitPrefs, saveKitPrefs, type KitVariant } from "./drums";
import { usePlayer } from "./player-store";

const SIXTEENTH = 240; // ticks, with 960 ticks per quarter note
const LOOPS = 16; // the pattern is repeated this many times, then playback wraps around

export type Groove = { id: string; label: string; bpm: number; hits: () => DrumHit[] };

type Step = [sixteenth: number, key: number, vel: number];

// Builds a pattern from bars of [sixteenth, key, velocity] steps, repeated LOOPS times.
function pattern(bars: Step[][]): DrumHit[] {
  const loop = bars.length * 16 * SIXTEENTH;
  const hits: DrumHit[] = [];
  for (let n = 0; n < LOOPS; n++)
    bars.forEach((steps, bar) => {
      for (const [s, key, vel] of steps) hits.push({ tick: n * loop + (bar * 16 + s) * SIXTEENTH, key, vel });
    });
  return hits;
}

const eighths = (key: number, vel: number): Step[] => Array.from({ length: 8 }, (_, i) => [i * 2, key, i % 2 ? vel - 12 : vel]);
const sixteenths = (key: number, vel: number, from = 0, to = 16): Step[] =>
  Array.from({ length: to - from }, (_, i) => [from + i, key, i % 2 ? vel - 8 : vel]);

const ROCK: Step[][] = [
  [...eighths(42, 96), [0, 36, 112], [8, 36, 108], [4, 38, 112], [12, 38, 112], [0, 49, 120]],
  [...eighths(42, 96), [0, 36, 112], [8, 36, 108], [10, 36, 100], [4, 38, 112], [12, 38, 112]],
  [...eighths(42, 96), [0, 36, 112], [8, 36, 108], [4, 38, 112], [12, 38, 112]],
  [
    ...eighths(42, 96).filter(([s]) => s < 12),
    [0, 36, 112], [8, 36, 108], [4, 38, 112],
    [12, 48, 104], [13, 47, 102], [14, 45, 108], [15, 41, 112],
  ],
];

const METAL: Step[][] = [
  [...sixteenths(36, 108), ...eighths(42, 92), [4, 38, 120], [12, 38, 120], [0, 49, 124], [0, 52, 118]],
  [...sixteenths(36, 108), ...eighths(42, 92), [4, 38, 120], [12, 38, 120]],
  [...sixteenths(36, 108), ...eighths(51, 100), [4, 38, 120], [12, 38, 120], [0, 57, 122], [8, 52, 116]],
  [
    ...sixteenths(36, 108, 0, 8), ...eighths(42, 92).filter(([s]) => s < 8), [4, 38, 120],
    [8, 48, 112], [9, 48, 108], [10, 47, 112], [11, 47, 108], [12, 45, 114], [13, 45, 110], [14, 41, 116], [15, 41, 112],
  ],
];

// One hit of every drum in turn, to hear and tune each drum on its own.
const TOUR_KEYS = [36, 38, 48, 47, 45, 41, 42, 46, 49, 57, 59, 51, 52];
const TOUR: Step[][] = [0, 1, 2, 3].map((bar) =>
  TOUR_KEYS.slice(bar * 4, bar * 4 + 4).flatMap((key, i): Step[] => [[i * 4, key, 112]]),
);

export const GROOVES: Groove[] = [
  { id: "rock", label: "Rock beat", bpm: 110, hits: () => pattern(ROCK) },
  { id: "metal", label: "Metal double bass", bpm: 170, hits: () => pattern(METAL) },
  { id: "tour", label: "Every drum, one by one", bpm: 90, hits: () => pattern(TOUR) },
];

let ctx: AudioContext | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let startedAt = 0;
let runId = 0;
let initId = 0;

/** Loads the saved settings into the store and gets the kit ready. Returns false if the kit files are missing. */
export async function initPreview() {
  const id = ++initId;
  const prefs = loadKitPrefs();
  const saved = { drums: loadDrums(prefs.variant), drumFx: loadDrumFx(prefs.variant), room: prefs.room };
  usePlayer.getState().set({
    drums: saved.drums,
    drumFx: saved.drumFx,
    drumRoom: saved.room,
    drumSaved: saved,
    drumKitOn: prefs.on,
    drumVariant: prefs.variant,
    drumSync: prefs.sync,
  });
  const found = await drumKit.loadManifest();
  // The page may have been left while the manifest was loading.
  if (id !== initId || !found) return false;
  ctx ??= new AudioContext();
  drumKit.attach(ctx, ctx.destination);
  const { drums, drumFx, drumRoom } = usePlayer.getState();
  drumKit.setLevels(effectiveLevels(drums, drumFx, []));
  drumKit.setFx(drumFx);
  drumKit.setRoom(drumRoom);
  drumKit.setSyncOffset(0);
  drumKit.setVariant(prefs.variant);
  drumKit.setSpeed(1);
  return true;
}

/** Switches the preview to another recording of kick, snare and toms, and remembers the choice. */
export function setPreviewVariant(variant: KitVariant) {
  usePlayer.getState().set({ drumVariant: variant });
  saveKitPrefs({ ...loadKitPrefs(), variant });
  drumKit.setVariant(variant);
  const drums = loadDrums(variant);
  const drumFx = loadDrumFx(variant);
  usePlayer.getState().set({ drums, drumFx, drumSaved: { drums, drumFx, room: usePlayer.getState().drumRoom }, drumSolo: [] });
  drumKit.setLevels(effectiveLevels(drums, drumFx, []));
  drumKit.setFx(drumFx);
}

export async function playGroove(groove: Groove, bpm: number, onLoading: (fraction: number) => void) {
  if (!ctx) return;
  stopGroove();
  const id = ++runId;
  await ctx.resume();
  const hits = groove.hits();
  await drumKit.prepare(hits, 960, [{ tick: 0, bpm }], onLoading);
  if (id !== runId) return;

  const secondsPerTick = 60 / (bpm * 960);
  const end = Math.max(...hits.map((h) => h.tick)) + 4 * 960;
  startedAt = ctx.currentTime;
  drumKit.setPlaying(true);
  drumKit.position(0, true);
  // The kit follows the song position it is given; here that is the beat counted from the audio clock.
  timer = setInterval(() => {
    if (!ctx) return;
    const tick = (ctx.currentTime - startedAt) / secondsPerTick;
    if (tick < 0) return;
    if (tick >= end) {
      startedAt += end * secondsPerTick;
      drumKit.position(Math.max(0, (ctx.currentTime - startedAt) / secondsPerTick), true);
    } else drumKit.position(tick, false);
  }, 30);
}

export function stopGroove() {
  runId++;
  clearInterval(timer);
  drumKit.setPlaying(false);
}

export function disposePreview() {
  initId++;
  stopGroove();
  drumKit.dispose();
  void ctx?.close();
  ctx = null;
}
