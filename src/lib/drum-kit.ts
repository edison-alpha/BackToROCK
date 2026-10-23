// Sampled drum kit (MuldjordKit, CC BY 4.0). It replaces the synth for the drum notes it knows: those notes are taken
// out of the MIDI before the synth sees it (engine.ts) and are played here from recorded samples instead.
//
// Timing: alphaTab plays everything else, and reports its position (in MIDI ticks) while it plays. The drum hits are
// scheduled slightly ahead on the same AudioContext, so they stay in step with the synth. `syncMs` shifts them for
// output latency that differs between devices.
//
// Each drum (kick, snare, every tom, hi-hat, every cymbal) has its own channel strip: level, 3-band EQ, compressor and a
// send to a shared room reverb.
import { renderScheduled } from "./clock";
import { DRUM_PIECES, type DrumFx, type DrumLevels, type DrumPiece, type KitVariant, type PieceFx } from "./drums";

type Layer = { lo: number; hi: number; hits: number[] };
type Manifest = { pieces: Record<string, { layers: Layer[] }> };
type Target = { pieces: string[]; group: DrumPiece; gain?: number };
export type DrumHit = { tick: number; key: number; vel: number };

const KIT_URL = "/kits/muldjord";
const LOOKAHEAD = 0.15; // seconds scheduled ahead
const PUMP_MS = 25;
const JITTER = 0.06; // velocity variation on playback (fraction)

// The Vortex kit (WAV files in public/ALL MICS and public/DIRECT) has five hits per drum and no hi-hat or cymbals. Each
// has one velocity layer; the five are round-robin. It replaces these MuldjordKit pieces; everything else stays as is.
const VORTEX_DRUM: Record<string, string> = {
  KdrumL: "KD", KdrumR: "KD", Snare: "SN", Tom1: "RT1", Tom2: "RT2", Tom3: "FT1", Tom4: "FT2",
};
const VORTEX_DIR = { "vortex-all": "ALL MICS" } as const;
const VORTEX_HITS = [1, 2, 3, 4, 5];

// File of one Vortex hit.
function vortexUrl(variant: keyof typeof VORTEX_DIR, drum: string, hit: number) {
  return `/${encodeURIComponent(VORTEX_DIR[variant])}/${drum}_TMKD-Vortex_${hit}.wav`;
}

const KICK: Target = { pieces: ["KdrumL", "KdrumR"], group: "kick" };
const TOM = (n: number): Target => ({ pieces: [`Tom${n}`], group: `tom${n}` as DrumPiece });
// General MIDI percussion keys. Keys that are not listed (cowbell, claves...) stay on the synth.
const KEYMAP: Record<number, Target> = {
  35: KICK,
  36: KICK,
  37: { pieces: ["SnareRest"], group: "snare" },
  38: { pieces: ["Snare"], group: "snare" },
  39: { pieces: ["Snare"], group: "snare", gain: 0.6 },
  40: { pieces: ["Snare"], group: "snare" },
  41: TOM(4),
  43: TOM(4),
  45: TOM(3),
  47: TOM(2),
  48: TOM(1),
  50: TOM(1),
  42: { pieces: ["HihatClosed"], group: "hihat" },
  44: { pieces: ["HihatClosed"], group: "hihat", gain: 0.6 },
  46: { pieces: ["HihatOpen"], group: "hihat" },
  49: { pieces: ["CrashL"], group: "crashL" },
  57: { pieces: ["CrashR"], group: "crashR" },
  55: { pieces: ["CrashL"], group: "crashL", gain: 0.6 },
  52: { pieces: ["China"], group: "china" },
  51: { pieces: ["RideR"], group: "rideR" },
  59: { pieces: ["RideL"], group: "rideL" },
  53: { pieces: ["RideRBell"], group: "rideR" },
};

export const isKitKey = (key: number) => key in KEYMAP;

const GROUPS: DrumPiece[] = DRUM_PIECES.map((p) => p.id).filter((id) => id !== "other");

type Strip = {
  input: GainNode;
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
  comp: DynamicsCompressorNode;
  makeup: GainNode;
  pan: StereoPannerNode;
  send: GainNode;
};

type Voice = { piece: string; src: AudioBufferSourceNode; gain: GainNode; end: number };
type Timed = { ms: number; key: number; vel: number };
type TempoSegment = { tick: number; ms: number; msPerTick: number };

const rand = (spread: number) => (Math.random() * 2 - 1) * spread;

export class DrumKit {
  private manifest: Manifest | null = null;
  private ctx: BaseAudioContext | null = null;
  private master: GainNode | null = null;
  private strips = new Map<DrumPiece, Strip>();
  private buffers = new Map<string, AudioBuffer>();
  private lastHit = new Map<string, number>();
  private kickSide = 0;
  private pitch = new Map<DrumPiece, number>();
  private room: ConvolverNode | null = null;
  private roomSeconds = 1.3;
  private voices = new Set<Voice>();
  private variant: KitVariant = "muldjord";
  private levels: DrumLevels | null = null;
  private fx: DrumFx | null = null;
  private trackGain = 1;

  private tempo: TempoSegment[] = [{ tick: 0, ms: 0, msPerTick: 0.5 }];
  private timeline: Timed[] = [];
  private pointer = 0;
  private offset: number | null = null;
  private lastTick: number | null = null;
  private speed = 1;
  private playing = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private syncMs = 0;
  private prepareId = 0;

  get available() {
    return this.manifest !== null;
  }

  async loadManifest() {
    if (this.manifest) return true;
    try {
      const res = await fetch(`${KIT_URL}/kit.json`);
      if (!res.ok) return false;
      const manifest: Manifest = await res.json();
      // Vortex pieces are named "<variant>/<drum>", so they never collide with a MuldjordKit piece.
      for (const variant of Object.keys(VORTEX_DIR))
        for (const drum of new Set(Object.values(VORTEX_DRUM)))
          manifest.pieces[`${variant}/${drum}`] = { layers: [{ lo: 1, hi: 127, hits: VORTEX_HITS }] };
      this.manifest = manifest;
      return true;
    } catch {
      return false;
    }
  }

  // Builds the channel strips on the context alphaTab plays through, ending in `destination` (the master effects).
  attach(ctx: BaseAudioContext, destination: AudioNode) {
    if (this.ctx === ctx) return;
    this.dispose();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(destination);

    const room = ctx.createConvolver();
    room.buffer = this.impulse(ctx, this.roomSeconds);
    room.connect(destination);
    this.room = room;

    for (const group of GROUPS) {
      const input = ctx.createGain();
      const low = ctx.createBiquadFilter();
      low.type = "lowshelf";
      low.frequency.value = 120;
      const mid = ctx.createBiquadFilter();
      mid.type = "peaking";
      mid.frequency.value = 1500;
      mid.Q.value = 0.9;
      const high = ctx.createBiquadFilter();
      high.type = "highshelf";
      high.frequency.value = 6000;
      const comp = ctx.createDynamicsCompressor();
      comp.knee.value = 10;
      comp.attack.value = 0.005;
      comp.release.value = 0.15;
      const makeup = ctx.createGain();
      const send = ctx.createGain();
      const pan = ctx.createStereoPanner();
      input.connect(low);
      low.connect(mid);
      mid.connect(high);
      high.connect(comp);
      comp.connect(makeup);
      makeup.connect(pan);
      pan.connect(this.master);
      makeup.connect(send);
      send.connect(room);
      this.strips.set(group, { input, low, mid, high, comp, makeup, pan, send });
    }
  }

  private impulse(ctx: BaseAudioContext, seconds: number) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
    }
    return buffer;
  }

  setLevels(levels: DrumLevels) {
    this.levels = levels;
    if (!this.ctx) return;
    for (const group of GROUPS) this.strips.get(group)?.input.gain.setTargetAtTime(levels[group], this.ctx.currentTime, 0.02);
  }

  setFx(fx: DrumFx) {
    this.fx = fx;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const group of GROUPS) {
      const s = this.strips.get(group);
      if (!s) continue;
      const p: PieceFx = fx[group];
      s.low.gain.setTargetAtTime(p.low, t, 0.02);
      s.mid.gain.setTargetAtTime(p.mid, t, 0.02);
      s.high.gain.setTargetAtTime(p.high, t, 0.02);
      s.comp.threshold.setTargetAtTime(-p.comp * 30, t, 0.02);
      s.comp.ratio.setTargetAtTime(1 + p.comp * 7, t, 0.02);
      s.makeup.gain.setTargetAtTime(1 + p.comp * 0.5, t, 0.02);
      s.send.gain.setTargetAtTime(p.reverb * 0.8, t, 0.02);
      s.pan.pan.setTargetAtTime(p.pan, t, 0.02);
      this.pitch.set(group, p.pitch ?? 0);
    }
  }

  /** Gain of the whole kit, from the drum track's mute, solo and volume in the track panel. */
  setTrackGain(gain: number) {
    this.trackGain = gain;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.02);
  }

  /** Length of the drum room reverb in seconds. */
  setRoom(seconds: number) {
    this.roomSeconds = seconds;
    if (this.ctx && this.room) this.room.buffer = this.impulse(this.ctx, seconds);
  }

  setSyncOffset(ms: number) {
    this.syncMs = ms;
  }

  /** Which recording plays kick, snare and toms. Call prepare() again afterwards to load its samples. */
  setVariant(variant: KitVariant) {
    this.variant = variant;
  }

  // The pieces that play a key: the MuldjordKit ones, or the Vortex drums that replace them.
  private piecesOf(target: Target) {
    if (this.variant === "muldjord") return target.pieces;
    const own = target.pieces.map((p) => (VORTEX_DRUM[p] ? `${this.variant}/${VORTEX_DRUM[p]}` : p));
    return [...new Set(own)];
  }

  // `key` is "<piece>/<hit>", where a Vortex piece is itself "<variant>/<drum>".
  private urlOf(key: string) {
    const parts = key.split("/");
    if (parts.length === 3) return vortexUrl(parts[0] as keyof typeof VORTEX_DIR, parts[1], +parts[2]);
    return `${KIT_URL}/${key}.m4a`;
  }

  setSpeed(speed: number) {
    this.speed = speed;
    this.offset = null; // the clock mapping changes with the speed; the next position event sets it again
  }

  private msOf(tick: number) {
    let seg = this.tempo[0];
    for (const s of this.tempo) {
      if (s.tick > tick) break;
      seg = s;
    }
    return seg.ms + (tick - seg.tick) * seg.msPerTick;
  }

  /**
   * Loads the samples the song needs and builds the timeline. `division` is the MIDI ticks per quarter note and
   * `tempos` the tempo changes (bpm) by tick.
   */
  async prepare(
    hits: DrumHit[],
    division: number,
    tempos: { tick: number; bpm: number }[],
    onProgress: (fraction: number) => void,
  ) {
    const ctx = this.ctx;
    const manifest = this.manifest;
    const id = ++this.prepareId;
    this.stopVoices();
    this.pointer = 0;
    this.offset = null;
    if (!ctx || !manifest) return;

    const sorted = [...tempos].sort((a, b) => a.tick - b.tick);
    if (sorted.length === 0 || sorted[0].tick > 0) sorted.unshift({ tick: 0, bpm: sorted[0]?.bpm ?? 120 });
    this.tempo = [];
    let ms = 0;
    for (let i = 0; i < sorted.length; i++) {
      const msPerTick = 60000 / (sorted[i].bpm * division);
      this.tempo.push({ tick: sorted[i].tick, ms, msPerTick });
      if (sorted[i + 1]) ms += (sorted[i + 1].tick - sorted[i].tick) * msPerTick;
    }
    this.timeline = hits
      .map((h) => ({ ms: this.msOf(h.tick), key: h.key, vel: h.vel }))
      .sort((a, b) => a.ms - b.ms);

    await this.loadSamples(hits, onProgress, id);
  }

  /** Loads every round-robin hit of every velocity layer the given hits reach, so repeats never wait on a download. */
  async loadSamples(hits: DrumHit[], onProgress: (fraction: number) => void = () => {}, id = this.prepareId) {
    const ctx = this.ctx;
    if (!ctx || !this.manifest) return;
    const wanted = new Set<string>();
    for (const h of hits) {
      const target = KEYMAP[h.key];
      if (!target) continue;
      for (const piece of this.piecesOf(target)) {
        // The velocity is varied slightly on playback, so a hit near a layer boundary can land in the next layer.
        for (const vel of [h.vel * (1 - JITTER), h.vel, h.vel * (1 + JITTER)]) {
          const layer = this.layerFor(piece, Math.max(1, Math.min(127, vel)));
          if (layer) for (const hit of layer.hits) wanted.add(`${piece}/${hit}`);
        }
      }
    }
    const todo = [...wanted].filter((k) => !this.buffers.has(k));
    let done = 0;
    onProgress(todo.length === 0 ? 1 : 0);
    const queue = [...todo];
    const worker = async () => {
      for (let key = queue.pop(); key !== undefined; key = queue.pop()) {
        if (id !== this.prepareId) return;
        try {
          const res = await fetch(this.urlOf(key));
          const data = await res.arrayBuffer();
          this.buffers.set(key, await ctx.decodeAudioData(data));
        } catch {
          // A missing sample only silences that hit.
        }
        onProgress(++done / todo.length);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
  }

  /**
   * Renders the drums of the prepared song to audio, faster than realtime, with the same levels, tone and room as in
   * playback (but not the timing offset, which only compensates for live output latency). Null when there is nothing to
   * render. `gain` is the drum track's volume, after mute and solo.
   */
  async renderOffline(
    seconds: number,
    sampleRate: number,
    gain: number,
    signal: AbortSignal,
    onProgress: (f: number) => void,
  ) {
    if (!this.manifest || !this.levels || !this.fx || this.timeline.length === 0) return null;
    const offline = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
    const kit = new DrumKit();
    kit.manifest = this.manifest;
    kit.variant = this.variant;
    kit.roomSeconds = this.roomSeconds;
    kit.attach(offline, offline.destination);
    kit.setLevels(this.levels);
    kit.setFx(this.fx);
    kit.setTrackGain(gain);
    // Samples decoded for playback work in any context, so only the missing ones are fetched again.
    for (const [key, buffer] of this.buffers) kit.buffers.set(key, buffer);
    await kit.loadSamples(this.timeline.map((e) => ({ tick: 0, key: e.key, vel: e.vel })));
    return renderScheduled(offline, this.timeline, (e, when) => kit.trigger(e, when), onProgress, signal);
  }

  /** Plays one hit right away (for trying a drum's tone), loading its samples first if needed. */
  async audition(key: number, vel: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    await this.loadSamples([{ tick: 0, key, vel }]);
    this.trigger({ ms: 0, key, vel }, ctx.currentTime);
  }

  private layerFor(piece: string, vel: number) {
    const layers = this.manifest?.pieces[piece]?.layers;
    if (!layers) return null;
    return layers.find((l) => vel >= l.lo && vel <= l.hi) ?? layers.at(vel < layers[0].lo ? 0 : -1) ?? null;
  }

  /** Called with every position update from alphaTab while it plays. */
  position(tick: number, isSeek: boolean) {
    const ctx = this.ctx;
    if (!ctx) return;
    const ms = this.msOf(tick);
    // The same song position maps to the same offset on the audio clock for as long as playback runs undisturbed.
    // Position events arrive late, never early, so the smallest offset seen is the accurate one.
    const sample = ctx.currentTime - ms / (1000 * this.speed);
    const jumped = isSeek || this.lastTick === null || tick < this.lastTick;
    this.lastTick = tick;
    if (jumped || this.offset === null) {
      this.offset = sample;
      this.pointer = this.firstAtOrAfter(ms);
      this.stopVoices();
    } else {
      this.offset = Math.min(this.offset + 0.00005, sample);
    }
  }

  private firstAtOrAfter(ms: number) {
    let lo = 0;
    let hi = this.timeline.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.timeline[mid].ms < ms) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  setPlaying(playing: boolean) {
    if (playing === this.playing) return;
    this.playing = playing;
    clearInterval(this.timer);
    if (playing) {
      this.lastTick = null;
      this.offset = null;
      this.timer = setInterval(() => this.pump(), PUMP_MS);
    } else {
      this.stopVoices();
    }
  }

  private pump() {
    const ctx = this.ctx;
    if (!ctx || this.offset === null) return;
    const rate = 1000 * this.speed;
    const horizon = (ctx.currentTime - this.offset + LOOKAHEAD) * rate;
    while (this.pointer < this.timeline.length && this.timeline[this.pointer].ms < horizon) {
      const e = this.timeline[this.pointer++];
      const when = this.offset + e.ms / rate + this.syncMs / 1000 + rand(0.002);
      if (when < ctx.currentTime - 0.06) continue; // too late to be useful
      this.trigger(e, Math.max(when, ctx.currentTime));
    }
  }

  private trigger(e: Timed, when: number) {
    const ctx = this.ctx;
    const target = KEYMAP[e.key];
    if (!ctx || !target) return;

    const pieces = this.piecesOf(target);
    let piece = pieces[0];
    if (pieces.length > 1) piece = pieces[this.kickSide++ % pieces.length]; // double kick, alternating

    // Humanise: a drummer never hits twice with exactly the same force.
    const vel = Math.max(1, Math.min(127, e.vel * (1 + rand(JITTER))));
    const found = this.loadedLayer(piece, vel);
    const strip = this.strips.get(target.group);
    if (!found || !strip) return;
    const { layer, buffer } = found;

    // Within a velocity layer the hit is quieter towards the bottom of the layer, as in the original mapping.
    const amp = (0.55 + 0.45 * Math.min(1, vel / layer.hi)) * (target.gain ?? 1);
    const gain = ctx.createGain();
    gain.gain.value = amp;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.detune.value = (this.pitch.get(target.group) ?? 0) * 100; // cents
    src.connect(gain);
    gain.connect(strip.input);
    const end = when + buffer.duration / 2 ** (src.detune.value / 1200);
    const voice: Voice = { piece, src, gain, end };
    this.voices.add(voice);
    src.onended = () => {
      this.voices.delete(voice);
      gain.disconnect();
    };

    // A hi-hat that closes cuts the open one, and an open hit replaces the previous open hit. Voices that are already
    // over are dropped here too: an offline render schedules ahead of the audio, before their `ended` event can fire.
    if (piece === "HihatClosed" || piece === "HihatOpen") {
      for (const v of this.voices) {
        if (v.end <= when) this.voices.delete(v);
        else if (v !== voice && v.piece === "HihatOpen") this.fadeOut(v, when, 0.03);
      }
    }
    src.start(when);
  }

  // The layer for this velocity, or the closest one that has samples loaded, with a round-robin pick from it.
  private loadedLayer(piece: string, vel: number) {
    const layers = this.manifest?.pieces[piece]?.layers;
    if (!layers) return null;
    const mid = (l: Layer) => (l.lo + l.hi) / 2;
    const ordered = [...layers].sort((a, b) => Math.abs(mid(a) - vel) - Math.abs(mid(b) - vel));
    for (const layer of ordered) {
      const ready = layer.hits.filter((h) => this.buffers.has(`${piece}/${h}`));
      if (ready.length === 0) continue;
      const key = `${piece}/${layer.lo}`;
      const last = this.lastHit.get(key);
      const options = ready.length > 1 ? ready.filter((h) => h !== last) : ready;
      const hit = options[Math.floor(Math.random() * options.length)];
      this.lastHit.set(key, hit);
      return { layer, buffer: this.buffers.get(`${piece}/${hit}`)! };
    }
    return null;
  }

  private fadeOut(v: Voice, at: number, seconds: number) {
    v.gain.gain.setTargetAtTime(0, at, seconds / 3);
    try {
      v.src.stop(at + seconds * 2);
    } catch {}
  }

  private stopVoices() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const v of this.voices) this.fadeOut(v, now, 0.04);
  }

  dispose() {
    clearInterval(this.timer);
    this.playing = false;
    this.stopVoices();
    this.master?.disconnect();
    this.strips.clear();
    this.buffers.clear();
    this.voices.clear();
    this.ctx = null;
    this.master = null;
    this.offset = null;
  }
}

export const drumKit = new DrumKit();
