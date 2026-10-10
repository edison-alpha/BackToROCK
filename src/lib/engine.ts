import type * as AT from "@coderline/alphatab";
import { usePlayer, type ActiveNote, type InstrumentKind, type TrackInfo } from "./player-store";

type AlphaTabNs = typeof AT;
declare global {
  interface Window {
    alphaTab?: AlphaTabNs;
  }
}

const BASE = "/alphatab";
let api: AT.AlphaTabApi | null = null;
let scriptPromise: Promise<AlphaTabNs> | null = null;

// alphaTab's UMD build is served from /public so its workers and audio worklet resolve without bundler plugins.
function loadScript(): Promise<AlphaTabNs> {
  if (window.alphaTab) return Promise.resolve(window.alphaTab);
  scriptPromise ??= new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = `${BASE}/alphaTab.min.js`;
    el.onload = () => (window.alphaTab ? resolve(window.alphaTab) : reject(new Error("alphaTab tidak termuat")));
    el.onerror = () => reject(new Error("Could not load alphaTab"));
    document.head.appendChild(el);
  });
  return scriptPromise;
}

const set = usePlayer.getState().set;

const KIND_LABEL: Record<InstrumentKind, string> = {
  piano: "Piano",
  guitar: "Guitar",
  bass: "Bass",
  drums: "Drum",
  other: "Track",
};

// General MIDI program ranges: 0-23 keyboards, 24-31 guitars, 32-39 basses.
function kindOf(program: number, percussion: boolean, stringed: boolean): InstrumentKind {
  if (percussion) return "drums";
  if (program <= 23) return "piano";
  if (program <= 31) return "guitar";
  if (program <= 39) return "bass";
  return stringed ? "guitar" : "other";
}

function noteRange(track: AT.model.Track): [number, number] {
  let lo = 127;
  let hi = 0;
  for (const staff of track.staves)
    for (const bar of staff.bars)
      for (const voice of bar.voices)
        for (const beat of voice.beats)
          for (const n of beat.notes) {
            lo = Math.min(lo, n.realValue);
            hi = Math.max(hi, n.realValue);
          }
  return lo > hi ? [21, 108] : [lo, hi];
}

function readTracks(score: AT.model.Score): TrackInfo[] {
  const counts: Partial<Record<InstrumentKind, number>> = {};
  return score.tracks.map((t) => {
    const staff = t.staves[0];
    const kind = kindOf(t.playbackInfo.program, t.isPercussion, !!staff?.isStringed);
    // Any pitched track with a tuning can be shown on a fretboard. Keyboards still carry a default tuning, so skip those.
    const stringed = !!staff?.isStringed && !t.isPercussion && kind !== "piano";
    // Staff.tuning is top line first, so reverse it to get the lowest string first.
    const tuning = stringed ? [...staff.tuning].reverse() : [];
    counts[kind] = (counts[kind] ?? 0) + 1;
    const generic = !t.name || /^track\s*\d+$/i.test(t.name.trim());
    return {
      index: t.index,
      name: generic ? `${KIND_LABEL[kind]} ${counts[kind]}` : t.name,
      kind,
      stringed,
      percussion: t.isPercussion,
      tuning,
      range: noteRange(t),
      muted: t.playbackInfo.isMute,
      solo: t.playbackInfo.isSolo,
      gain: 1,
    };
  });
}

let initId = 0;
let lastTimeUpdate = 0;

export async function initEngine(container: HTMLElement, viewport: HTMLElement) {
  // React StrictMode mounts twice in dev; only the latest call may create the player, or two audio engines run at once.
  const id = ++initId;
  const alphaTab = await loadScript();
  if (id !== initId) return;
  api?.destroy();

  // Workers and the audio worklet run from blob URLs, where root-relative paths do not resolve, so use absolute URLs.
  const origin = `${location.origin}${BASE}`;
  api = new alphaTab.AlphaTabApi(container, {
    core: { scriptFile: `${origin}/alphaTab.min.js`, fontDirectory: `${origin}/font/` },
    player: {
      enablePlayer: true,
      soundFont: `${origin}/soundfont/sonivox.sf2`,
      scrollElement: viewport,
    },
    display: { scale: usePlayer.getState().zoom },
  });

  api.scoreLoaded.on((score) => {
    const tracks = readTracks(score);
    set({
      tracks,
      selected: 0,
      title: score.title || null,
      activeByTrack: {},
      playing: false,
      time: 0,
    });
    // Fallback in case renderFinished is late, so the UI never stays on the loading screen.
    setTimeout(() => {
      if (usePlayer.getState().status === "loading") set({ status: "ready" });
    }, 4000);
  });
  api.renderFinished.on(() => {
    if (usePlayer.getState().status === "loading") set({ status: "ready" });
  });
  api.soundFontLoad.on((e) => set({ soundProgress: e.total ? e.loaded / e.total : 0 }));
  api.playerReady.on(() => set({ soundReady: true, soundProgress: 1 }));
  api.playerStateChanged.on((e) => {
    // state 1 = playing
    set({ playing: e.state === 1 });
    if (e.stopped) set({ activeByTrack: {} });
  });
  // The position event fires many times per second, so only push to the UI about 4 times per second.
  api.playerPositionChanged.on((e) => {
    if (Math.abs(e.currentTime - lastTimeUpdate) < 250 && e.currentTime < e.endTime) return;
    lastTimeUpdate = e.currentTime;
    set({ time: e.currentTime, end: e.endTime });
  });
  // activeBeats covers every track, so the guitar, bass and piano panels can all light up together.
  api.activeBeatsChanged.on((e) => {
    const tracks = usePlayer.getState().tracks;
    const byTrack: Record<number, ActiveNote[]> = {};
    for (const beat of e.activeBeats) {
      const index = beat.voice.bar.staff.track.index;
      const stringed = tracks[index]?.stringed;
      const list = (byTrack[index] ??= []);
      for (const n of beat.notes) {
        if (n.isDead) continue;
        list.push({ midi: n.realValue, string: stringed ? n.string : 0, fret: n.fret });
      }
    }
    set({ activeByTrack: byTrack });
  });
  api.error.on((e) => {
    set({ status: "error", error: e.message || "Something went wrong while reading the file" });
  });
  set({ engineReady: true });
}

let loadId = 0;

export function loadFile(name: string, data: ArrayBuffer) {
  if (!api) return;
  const id = ++loadId;
  set({ status: "loading", error: null, fileName: name, activeByTrack: {} });
  // The score container is display:none until React has re-rendered with status "loading". Loading right now would
  // make alphaTab lay the score out at zero width, and the first track would stay blank until another render.
  // Wait two frames so the container is visible and measured first.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (!api || id !== loadId) return;
      try {
        api.load(new Uint8Array(data));
      } catch (e) {
        set({ status: "error", error: e instanceof Error ? e.message : "Unsupported file format" });
      }
    }),
  );
}

export function togglePlay() {
  api?.playPause();
}
export function stop() {
  api?.stop();
}
export function setSpeed(v: number) {
  if (api) api.playbackSpeed = v;
  set({ speed: v });
}
export function setLooping(v: boolean) {
  if (api) api.isLooping = v;
  set({ looping: v });
}
export function setMetronome(v: boolean) {
  if (api) api.metronomeVolume = v ? 1 : 0;
  set({ metronome: v });
}
export function setZoom(v: number) {
  if (!api) return;
  api.settings.display.scale = v;
  api.updateSettings();
  api.render();
  set({ zoom: v });
}
export function selectTrack(index: number) {
  const track = api?.score?.tracks[index];
  if (!api || !track) return;
  api.renderTracks([track]);
  set({ selected: index, activeByTrack: {} });
}
export function setMute(index: number, v: boolean) {
  const track = api?.score?.tracks[index];
  if (!api || !track) return;
  api.changeTrackMute([track], v);
  usePlayer.getState().patchTrack(index, { muted: v });
}
export function setSolo(index: number, v: boolean) {
  const track = api?.score?.tracks[index];
  if (!api || !track) return;
  api.changeTrackSolo([track], v);
  usePlayer.getState().patchTrack(index, { solo: v });
}
export function setTrackVolume(index: number, v: number) {
  const track = api?.score?.tracks[index];
  if (!api || !track) return;
  api.changeTrackVolume([track], v);
  usePlayer.getState().patchTrack(index, { gain: v });
}
export function setMasterVolume(v: number) {
  if (api) api.masterVolume = v;
  set({ masterVolume: v });
}
export function seek(ms: number) {
  if (api) api.timePosition = ms;
  set({ time: ms });
}
export function destroyEngine() {
  initId++;
  api?.destroy();
  api = null;
}
