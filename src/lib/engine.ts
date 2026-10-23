import type * as AT from "@coderline/alphatab";
import { drumKit, isKitKey, type DrumHit } from "./drum-kit";
import { SampleInstrument, type TickNote } from "./instrument";
import {
  INSTRUMENTS,
  INSTRUMENT_PRESETS,
  INST_DEFAULT,
  INST_FLAT,
  loadInstruments,
  loadSampled,
  saveInstruments,
  saveSampled,
  type InstId,
  type InstMix,
  type InstSettings,
} from "./instruments";
import {
  DEFAULT_ROOM,
  defaultsFor,
  presetsFor,
  effectiveLevels,
  gmName,
  loadDrumFx,
  loadDrums,
  loadKitPrefs,
  pieceOf,
  saveDrumFx,
  saveDrums,
  saveKitPrefs,
  type DrumPiece,
  type DrumSettings,
  type KitVariant,
  type PieceFx,
} from "./drums";
import { installFx, loadFx, setFx, type FxSettings } from "./fx";
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
      program: t.playbackInfo.program,
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

  // The effects chain hooks into the AudioContext class, so it has to be installed before alphaTab creates one.
  installFx();
  const prefs = loadKitPrefs();
  const saved: DrumSettings = { drums: loadDrums(prefs.variant), drumFx: loadDrumFx(prefs.variant), room: prefs.room };
  set({
    fx: loadFx(),
    drums: saved.drums,
    drumFx: saved.drumFx,
    drumRoom: saved.room,
    drumSaved: saved,
    drumKitOn: prefs.on,
    drumVariant: prefs.variant,
    drumSync: prefs.sync,
  });
  const mix = loadInstruments();
  set({ inst: mix, instSaved: mix, sampledOn: loadSampled() });
  for (const i of INSTRUMENTS) {
    void sampled.get(i.id)!.loadManifest().then((ok) => {
      if (ok && id === initId && api?.score && usePlayer.getState().sampledOn[i.id]) reloadMidi();
    });
  }
  drumKit.setSyncOffset(prefs.sync);
  drumKit.setVariant(prefs.variant);
  for (const i of sampled.values()) i.clock.setSyncOffset(prefs.sync);
  drumKit.setRoom(prefs.room);
  void drumKit.loadManifest().then((ok) => {
    // Songs opened before the kit finished loading played with the synth drums; switch them over.
    if (ok && id === initId && api?.score && kitWanted()) reloadMidi();
  });

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
  api.midiLoaded.on((e) => {
    set({ end: e.endTime });
    if (resume && api) {
      const { time, play } = resume;
      resume = null;
      api.timePosition = time;
      if (play) api.play();
    }
  });
  // Scale the velocity of drum notes by the level of their kit piece. The file is generated fresh for every load, so
  // the scaling never stacks.
  // The sampled drum kit takes over the drum notes it knows. They are cut out of the MIDI so the synth does not play
  // them as well, and handed to the kit. Everything else on the percussion channel stays with the synth.
  api.midiLoad.on((file) => {
    set({ instActive: [] });
    const levels = usePlayer.getState().drums;
    const channels = new Set(
      (api?.score?.tracks ?? []).filter((t) => t.isPercussion).map((t) => t.playbackInfo.primaryChannel),
    );
    const { NoteOnEvent, NoteOffEvent, TempoChangeEvent } = alphaTab.midi;
    const useKit = kitWanted() && file.tracks.length === 1 && channels.size > 0 && attachKit();
    kitActive = useKit;
    const scale = !Object.values(levels).every((v) => v === 1);
    if (!useKit) set({ drumSynthKeys: [] });

    // Pitched instruments that play from samples: which MIDI channel belongs to which instrument and track.
    const byChannel = new Map<number, { inst: InstId; track: number }>();
    for (const i of INSTRUMENTS) {
      const inst = sampled.get(i.id)!;
      const wanted = usePlayer.getState().sampledOn[i.id] && inst.available && file.tracks.length === 1;
      if (!wanted || !attachInstrument(i.id)) continue;
      for (const t of api?.score?.tracks ?? []) {
        if (t.isPercussion || !i.programs.includes(t.playbackInfo.program)) continue;
        byChannel.set(t.playbackInfo.primaryChannel, { inst: i.id, track: t.index });
        byChannel.set(t.playbackInfo.secondaryChannel, { inst: i.id, track: t.index });
      }
    }
    const notes = new Map<InstId, TickNote[]>();
    const open = new Map<string, TickNote>();
    const usesInst = byChannel.size > 0;
    if (!useKit && !scale && !usesInst) {
      set({ instActive: [] });
      return;
    }

    const hits: DrumHit[] = [];
    const synthKeys = new Set<number>();
    const tempos: { tick: number; bpm: number }[] = [];
    const kept: AT.midi.MidiEvent[] = [];
    const events = file.events;
    for (const ev of events) {
      if ((useKit || usesInst) && ev instanceof TempoChangeEvent) tempos.push({ tick: ev.tick, bpm: ev.beatsPerMinute });
      if (usesInst && (ev instanceof NoteOnEvent || ev instanceof NoteOffEvent) && byChannel.has(ev.channel)) {
        const owner = byChannel.get(ev.channel)!;
        const id = `${ev.channel}:${ev.noteKey}`;
        const current = open.get(id);
        if (current) {
          current.endTick = ev.tick;
          open.delete(id);
        }
        if (ev instanceof NoteOnEvent && ev.noteVelocity > 0) {
          const note: TickNote = { tick: ev.tick, endTick: ev.tick + 480, key: ev.noteKey, vel: ev.noteVelocity, track: owner.track };
          open.set(id, note);
          if (!notes.has(owner.inst)) notes.set(owner.inst, []);
          notes.get(owner.inst)!.push(note);
        }
        continue;
      }
      if (useKit && (ev instanceof NoteOnEvent || ev instanceof NoteOffEvent) && channels.has(ev.channel) && isKitKey(ev.noteKey)) {
        if (ev instanceof NoteOnEvent && ev.noteVelocity > 0) hits.push({ tick: ev.tick, key: ev.noteKey, vel: ev.noteVelocity });
        continue;
      }
      if (useKit && ev instanceof NoteOnEvent && channels.has(ev.channel) && ev.noteVelocity > 0) synthKeys.add(ev.noteKey);
      // Drum notes that stay on the synth still follow the level sliders.
      if (scale && ev instanceof NoteOnEvent && channels.has(ev.channel) && ev.noteVelocity > 0) {
        const level = levels[pieceOf(ev.noteKey)];
        ev.noteVelocity = level === 0 ? 0 : Math.max(1, Math.min(127, Math.round(ev.noteVelocity * level)));
      }
      kept.push(ev);
    }
    if (!useKit && !usesInst) return;
    events.length = 0;
    for (const ev of kept) events.push(ev);
    if (useKit) set({ drumSynthKeys: [...new Set([...synthKeys].map(gmName))] });
    set({ instActive: [...notes.keys()] });

    if (useKit) trackLoading("drums", drumKit.prepare(hits, file.division, tempos, (p) => loadProgress("drums", p)));
    for (const [id, list] of notes)
      trackLoading(id, sampled.get(id)!.prepare(list, file.division, tempos, (p) => loadProgress(id, p)));
  });
  api.playerReady.on(() => set({ soundReady: true, soundProgress: 1 }));
  api.playerStateChanged.on((e) => {
    // state 1 = playing
    set({ playing: e.state === 1 });
    drumKit.setPlaying(e.state === 1);
    for (const id of usePlayer.getState().instActive) sampled.get(id)?.clock.setPlaying(e.state === 1);
    if (e.stopped) set({ activeByTrack: {} });
  });
  // The position event fires many times per second, so only push to the UI about 4 times per second.
  api.playerPositionChanged.on((e) => {
    if (kitActive) drumKit.position(e.currentTick, e.isSeek);
    for (const id of usePlayer.getState().instActive) sampled.get(id)?.clock.position(e.currentTick, e.isSeek);
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
  drumKit.setSpeed(v);
  for (const i of sampled.values()) i.clock.setSpeed(v);
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
  syncDrumTrack();
}
export function setSolo(index: number, v: boolean) {
  const track = api?.score?.tracks[index];
  if (!api || !track) return;
  api.changeTrackSolo([track], v);
  usePlayer.getState().patchTrack(index, { solo: v });
  syncDrumTrack();
}
export function setTrackVolume(index: number, v: number) {
  const track = api?.score?.tracks[index];
  if (!api || !track) return;
  api.changeTrackVolume([track], v);
  usePlayer.getState().patchTrack(index, { gain: v });
  syncDrumTrack();
}
export function setMasterVolume(v: number) {
  if (api) api.masterVolume = v;
  set({ masterVolume: v });
}
let resume: { time: number; play: boolean } | null = null;
let drumTimer: ReturnType<typeof setTimeout> | undefined;

// Whether the drums of the current song are played by the sampled kit (decided each time the MIDI is generated).
let kitActive = false;

const kitWanted = () => usePlayer.getState().drumKitOn && drumKit.available;

const sampled = new Map<InstId, SampleInstrument>(INSTRUMENTS.map((i) => [i.id, new SampleInstrument(i.url)]));

// Loading of the sampled drums and instruments is shown as one: the player waits until every one has its samples.
const loading = new Map<string, number>();
function loadProgress(name: string, fraction: number) {
  loading.set(name, fraction);
  const all = [...loading.values()];
  set({ drumsLoading: all.some((p) => p < 1), drumsProgress: Math.min(...all) });
}
const loadToken = new Map<string, number>();
function trackLoading(name: string, work: Promise<void>) {
  const token = (loadToken.get(name) ?? 0) + 1;
  loadToken.set(name, token);
  loadProgress(name, 0);
  void work.finally(() => {
    // A newer song may have started loading the same instrument meanwhile; only the latest one reports.
    if (loadToken.get(name) !== token) return;
    loadProgress(name, 1);
    syncDrumTrack();
  });
}

// Hands an instrument the audio context alphaTab plays through, and its saved mixer settings.
function attachInstrument(id: InstId) {
  const output = (api?.player as unknown as { output?: { context?: AudioContext | null } } | null)?.output;
  const ctx = output?.context;
  if (!ctx) return false;
  const inst = sampled.get(id)!;
  inst.attach(ctx, ctx.destination);
  inst.setSettings(usePlayer.getState().inst[id]);
  return true;
}

// Hands the kit the audio context alphaTab plays through, so both share one clock and the master effects.
function attachKit() {
  const output = (api?.player as unknown as { output?: { context?: AudioContext | null } } | null)?.output;
  const ctx = output?.context;
  if (!ctx) return false;
  drumKit.attach(ctx, ctx.destination);
  const { drums, drumFx, drumSolo } = usePlayer.getState();
  drumKit.setLevels(effectiveLevels(drums, drumFx, drumSolo));
  drumKit.setFx(drumFx);
  return true;
}

// The kit follows the mute, solo and volume of the drum track in the track panel.
// Each sampled instrument follows the mute, solo and volume of its tracks in the track panel.
function syncSampledTracks() {
  const { tracks } = usePlayer.getState();
  const anySolo = tracks.some((t) => t.solo);
  for (const t of tracks) {
    const owner = INSTRUMENTS.find((i) => !t.percussion && i.programs.includes(t.program));
    if (owner) sampled.get(owner.id)?.setTrackGain(t.index, t.muted || (anySolo && !t.solo) ? 0 : t.gain);
  }
}

function syncDrumTrack() {
  syncSampledTracks();
  const { tracks } = usePlayer.getState();
  const drumTrack = tracks.find((t) => t.percussion);
  if (!drumTrack) return;
  const anySolo = tracks.some((t) => t.solo);
  drumKit.setTrackGain(drumTrack.muted || (anySolo && !drumTrack.solo) ? 0 : drumTrack.gain);
}

// Drum settings are a draft: they change the sound at once but are only kept after saveDrumSettings(). The saved copy
// is in the store as drumSaved, so the mixer can show unsaved changes and go back to it.
//
// Without the sampled kit, drum levels live in the generated MIDI, so a change regenerates it. That stops playback;
// the position is restored afterwards and playback continues if it was running. Reloading waits until the slider has
// stopped moving. With the kit, the level is just a channel gain and changes at once.
export function setDrumLevel(piece: DrumPiece, v: number) {
  const drums = { ...usePlayer.getState().drums, [piece]: v };
  set({ drums });
  pushKitLevels();
  if (kitActive && piece !== "other") return;
  clearTimeout(drumTimer);
  drumTimer = setTimeout(reloadMidi, 350);
}
export function setDrumFx(piece: DrumPiece, patch: Partial<PieceFx>) {
  const current = usePlayer.getState().drumFx;
  const drumFx = { ...current, [piece]: { ...current[piece], ...patch } };
  set({ drumFx });
  drumKit.setFx(drumFx);
  if (patch.mute !== undefined) pushKitLevels();
}
export function toggleDrumSolo(piece: DrumPiece) {
  const solo = usePlayer.getState().drumSolo;
  set({ drumSolo: solo.includes(piece) ? solo.filter((p) => p !== piece) : [...solo, piece] });
  pushKitLevels();
}
function pushKitLevels() {
  const { drums, drumFx, drumSolo } = usePlayer.getState();
  drumKit.setLevels(effectiveLevels(drums, drumFx, drumSolo));
}
// Length of the drum room reverb that every drum's reverb send feeds.
export function setDrumRoom(seconds: number) {
  set({ drumRoom: seconds });
  drumKit.setRoom(seconds);
}
function applyDrumSettings(settings: DrumSettings) {
  set({ drums: settings.drums, drumFx: settings.drumFx, drumRoom: settings.room });
  pushKitLevels();
  drumKit.setFx(settings.drumFx);
  drumKit.setRoom(settings.room);
  if (!kitActive) reloadMidi();
}
export function applyDrumPreset(id: string) {
  const preset = presetsFor(usePlayer.getState().drumVariant).find((p) => p.id === id);
  if (preset) applyDrumSettings({ drums: preset.levels, drumFx: preset.fx, room: usePlayer.getState().drumRoom });
}
export function resetDrumSettings() {
  set({ drumSolo: [] });
  const d = defaultsFor(usePlayer.getState().drumVariant);
  applyDrumSettings({ drums: d.levels, drumFx: d.fx, room: DEFAULT_ROOM });
}
export function saveDrumSettings() {
  const { drums, drumFx, drumRoom, drumKitOn, drumSync, drumVariant } = usePlayer.getState();
  saveDrums(drums, drumVariant);
  saveDrumFx(drumFx, drumVariant);
  saveKitPrefs({ on: drumKitOn, sync: drumSync, room: drumRoom, variant: drumVariant });
  set({ drumSaved: { drums, drumFx, room: drumRoom } });
}
export function revertDrumSettings() {
  const saved = usePlayer.getState().drumSaved;
  if (saved) applyDrumSettings(saved);
}
// Moves the sampled drums earlier or later (ms) against the synth, to match the output latency of this device.
export function setDrumSync(ms: number) {
  set({ drumSync: ms });
  const { drumKitOn, drumSaved, drumVariant } = usePlayer.getState();
  saveKitPrefs({ on: drumKitOn, sync: ms, room: drumSaved?.room ?? DEFAULT_ROOM, variant: drumVariant });
  drumKit.setSyncOffset(ms);
  for (const i of sampled.values()) i.clock.setSyncOffset(ms);
}
export function setDrumKit(on: boolean) {
  set({ drumKitOn: on });
  const { drumSync, drumSaved, drumVariant } = usePlayer.getState();
  saveKitPrefs({ on, sync: drumSync, room: drumSaved?.room ?? DEFAULT_ROOM, variant: drumVariant });
  reloadMidi();
}
// Picks which recording plays kick, snare and toms. The song's samples are loaded again for the new kit.
export function setDrumVariant(variant: KitVariant) {
  set({ drumVariant: variant });
  const { drumKitOn, drumSync, drumSaved } = usePlayer.getState();
  saveKitPrefs({ on: drumKitOn, sync: drumSync, room: drumSaved?.room ?? DEFAULT_ROOM, variant });
  drumKit.setVariant(variant);
  // Each kit has its own balance and tone.
  const room = usePlayer.getState().drumRoom;
  const saved: DrumSettings = { drums: loadDrums(variant), drumFx: loadDrumFx(variant), room };
  set({ drumSaved: saved, drumSolo: [] });
  applyDrumSettings(saved);
  reloadMidi();
}
// Instrument settings are a draft like the drums: heard at once, kept only after saveInstruments().
export function setInstrument(id: InstId, patch: Partial<InstSettings>) {
  const current = usePlayer.getState().inst;
  const inst = { ...current, [id]: { ...current[id], ...patch } };
  set({ inst });
  sampled.get(id)?.setSettings(inst[id]);
}
export function applyInstrumentPreset(id: InstId, presetId: string) {
  const preset = INSTRUMENT_PRESETS[id].find((p) => p.id === presetId);
  // A preset replaces everything about the sound except the level and the mute.
  if (preset) {
    const { level, mute } = usePlayer.getState().inst[id];
    setInstrument(id, { ...INST_FLAT, ...preset.fx, level, mute });
  }
}
function applyMix(mix: InstMix) {
  set({ inst: mix });
  for (const i of INSTRUMENTS) sampled.get(i.id)?.setSettings(mix[i.id]);
}
export const resetInstruments = () => applyMix(INST_DEFAULT);
export function revertInstruments() {
  const saved = usePlayer.getState().instSaved;
  if (saved) applyMix(saved);
}
export function saveInstrumentMix() {
  const inst = usePlayer.getState().inst;
  saveInstruments(inst);
  set({ instSaved: inst });
}
// Plays an instrument from samples or from the synth. The song restarts at the same position.
export function setSampled(id: InstId, on: boolean) {
  const sampledOn = { ...usePlayer.getState().sampledOn, [id]: on };
  set({ sampledOn });
  saveSampled(sampledOn);
  reloadMidi();
}

function reloadMidi() {
  if (!api?.score) return;
  const { time, playing } = usePlayer.getState();
  resume = { time, play: playing };
  api.loadMidiForScore();
}

export function setEffects(patch: Partial<FxSettings>) {
  const fx = { ...usePlayer.getState().fx, ...patch };
  setFx(fx);
  set({ fx });
}
export function seek(ms: number) {
  if (api) api.timePosition = ms;
  set({ time: ms });
}
const EXPORT_RATE = 44100;
const CHUNK_MS = 1000;
const MP3_BLOCK = 4608;

export type ExportFormat = "mp3" | "wav";
/** `stage` is what is rendering: a sampled drum kit or instrument, or the final mix with the synth. */
export type ExportProgress = { fraction: number; renderedMs: number; totalMs: number; stage: string };
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
  const { tracks, masterVolume, instActive, end: total } = usePlayer.getState();

  const options = new alphaTab.synth.AudioExportOptions();
  options.sampleRate = EXPORT_RATE;
  options.useSyncPoints = false;
  options.masterVolume = masterVolume;
  options.metronomeVolume = metronome ? 1 : 0;
  const anySolo = tracks.some((t) => t.solo);
  const volume = (t: (typeof tracks)[number]) => (t.muted || (anySolo && !t.solo) ? 0 : t.gain);

  // The export synth builds its own MIDI, so the notes the sampled kit and instruments play are still in it. Their
  // tracks are silenced on the synth, and each sampler renders its part separately (a stem) to be mixed in.
  const renders: { stage: string; tracks: number[]; render: (p: (f: number) => void) => Promise<AudioBuffer | null> }[] =
    [];
  const seconds = total / 1000 + 2;
  const drumTrack = tracks.find((t) => t.percussion);
  if (kitActive && drumTrack && total > 0) {
    renders.push({
      stage: "Rendering drums",
      tracks: [drumTrack.index],
      render: (p) => drumKit.renderOffline(seconds, EXPORT_RATE, volume(drumTrack), signal, p),
    });
  }
  for (const id of total > 0 ? instActive : []) {
    const inst = INSTRUMENTS.find((i) => i.id === id)!;
    renders.push({
      stage: `Rendering ${inst.label.toLowerCase()}`,
      tracks: tracks.filter((t) => !t.percussion && inst.programs.includes(t.program)).map((t) => t.index),
      render: (p) => sampled.get(id)!.renderOffline(seconds, EXPORT_RATE, signal, p),
    });
  }
  // Each sampler counts as one step of the progress bar, the final mix as two.
  const steps = renders.length + 2;
  const stems: { left: Float32Array; right: Float32Array }[] = [];
  const silenced = new Set<number>();
  for (const [i, r] of renders.entries()) {
    const report = (f: number) =>
      onProgress({ fraction: (i + f) / steps, renderedMs: f * total, totalMs: total, stage: r.stage });
    report(0);
    const audio = await r.render(report);
    if (!audio) continue;
    stems.push({ left: audio.getChannelData(0), right: audio.getChannelData(1) });
    for (const t of r.tracks) silenced.add(t);
  }
  options.trackVolume = new Map(tracks.map((t) => [t.index, silenced.has(t.index) ? 0 : volume(t)]));

  const encoder =
    format === "mp3" ? new (await import("@breezystack/lamejs")).Mp3Encoder(2, EXPORT_RATE, kbps) : null;
  const parts: BlobPart[] = [];
  let wavBytes = 0;
  let frameAt = 0; // frames of the song rendered so far, to find the same place in the stems

  if (signal.aborted) throw new DOMException("Export cancelled", "AbortError");
  const exporter = await api.exportAudio(options);
  try {
    for (;;) {
      if (signal.aborted) throw new DOMException("Export cancelled", "AbortError");
      const chunk = await exporter.render(CHUNK_MS);
      if (!chunk) break;
      const frames = Math.floor(chunk.samples.length / 2);
      for (const { left, right } of stems) {
        for (let i = 0; i < frames && frameAt + i < left.length; i++) {
          chunk.samples[i * 2] += left[frameAt + i];
          chunk.samples[i * 2 + 1] += right[frameAt + i];
        }
      }
      frameAt += frames;
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
      const mixed = chunk.endTime ? Math.min(1, chunk.currentTime / chunk.endTime) : 0;
      onProgress({
        fraction: (renders.length + mixed * 2) / steps,
        renderedMs: chunk.currentTime,
        totalMs: chunk.endTime,
        stage: "Mixing down",
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
  drumKit.dispose();
  for (const i of sampled.values()) i.dispose();
  kitActive = false;
  api?.destroy();
  api = null;
}
