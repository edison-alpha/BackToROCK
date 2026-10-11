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
    el.onload = () => (window.alphaTab ? resolve(window.alphaTab) : reject(new Error("alphaTab did not load")));
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
  // The song length is known as soon as playback data is built, so the time display and the export dialog do not
  // have to wait for the first play.
  api.midiLoaded.on((e) => set({ end: e.endTime }));
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
const EXPORT_RATE = 44100;
const CHUNK_MS = 1000;
const MP3_BLOCK = 4608;

export type ExportFormat = "mp3" | "wav";
export type ExportProgress = { fraction: number; renderedMs: number; totalMs: number };
export type ExportOptions = {
  format: ExportFormat;
  /** MP3 bitrate in kbps; ignored for WAV. */
  kbps: number;
  metronome: boolean;
  onProgress: (p: ExportProgress) => void;
  signal: AbortSignal;
};

function toInt16(samples: Float32Array, offset: number, count: number) {
  const left = new Int16Array(count);
  const right = new Int16Array(count);
  for (let i = 0; i < count; i++) {
    // Samples are interleaved stereo: left, right, left, right...
    const l = Math.max(-1, Math.min(1, samples[offset + i * 2]));
    const r = Math.max(-1, Math.min(1, samples[offset + i * 2 + 1]));
    left[i] = l < 0 ? l * 0x8000 : l * 0x7fff;
    right[i] = r < 0 ? r * 0x8000 : r * 0x7fff;
  }
  return [left, right] as const;
}

function wavHeader(dataBytes: number) {
  const view = new DataView(new ArrayBuffer(44));
  const text = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true); // PCM block size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 2, true); // channels
  view.setUint32(24, EXPORT_RATE, true);
  view.setUint32(28, EXPORT_RATE * 4, true); // byte rate: 2 channels x 2 bytes
  view.setUint16(32, 4, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  text(36, "data");
  view.setUint32(40, dataBytes, true);
  return new Uint8Array(view.buffer);
}

// Renders the loaded song with the synthesizer (faster than realtime) and encodes it. The mix follows the track
// panel: muted tracks are silent, solo keeps only the soloed ones, and track and master volume carry over.
// Playback speed is not part of the file. Rejects with an AbortError when `signal` is aborted.
export async function exportAudio({ format, kbps, metronome, onProgress, signal }: ExportOptions): Promise<Blob> {
  const alphaTab = window.alphaTab;
  if (!api || !alphaTab || !api.score) throw new Error("Open a song first");
  const { tracks, masterVolume } = usePlayer.getState();

  const options = new alphaTab.synth.AudioExportOptions();
  options.sampleRate = EXPORT_RATE;
  options.useSyncPoints = false;
  options.masterVolume = masterVolume;
  options.metronomeVolume = metronome ? 1 : 0;
  const anySolo = tracks.some((t) => t.solo);
  options.trackVolume = new Map(tracks.map((t) => [t.index, t.muted || (anySolo && !t.solo) ? 0 : t.gain]));

  const encoder =
    format === "mp3" ? new (await import("@breezystack/lamejs")).Mp3Encoder(2, EXPORT_RATE, kbps) : null;
  const parts: BlobPart[] = [];
  let wavBytes = 0;

  const exporter = await api.exportAudio(options);
  try {
    for (;;) {
      if (signal.aborted) throw new DOMException("Export cancelled", "AbortError");
      const chunk = await exporter.render(CHUNK_MS);
      if (!chunk) break;
      const frames = Math.floor(chunk.samples.length / 2);
      if (encoder) {
        // The encoder is fed in blocks of a few thousand frames so its internal buffer does not grow.
        for (let at = 0; at < frames; at += MP3_BLOCK) {
          const [l, r] = toInt16(chunk.samples, at * 2, Math.min(MP3_BLOCK, frames - at));
          const bytes = encoder.encodeBuffer(l, r);
          if (bytes.length) parts.push(new Uint8Array(bytes));
        }
      } else {
        const pcm = new Int16Array(frames * 2);
        const [l, r] = toInt16(chunk.samples, 0, frames);
        for (let i = 0; i < frames; i++) {
          pcm[i * 2] = l[i];
          pcm[i * 2 + 1] = r[i];
        }
        parts.push(pcm);
        wavBytes += pcm.byteLength;
      }
      onProgress({
        fraction: chunk.endTime ? Math.min(1, chunk.currentTime / chunk.endTime) : 0,
        renderedMs: chunk.currentTime,
        totalMs: chunk.endTime,
      });
    }
  } finally {
    exporter.destroy();
  }

  if (encoder) {
    const tail = encoder.flush();
    if (tail.length) parts.push(new Uint8Array(tail));
    return new Blob(parts, { type: "audio/mpeg" });
  }
  return new Blob([wavHeader(wavBytes), ...parts], { type: "audio/wav" });
}

export function destroyEngine() {
  initId++;
  api?.destroy();
  api = null;
}
