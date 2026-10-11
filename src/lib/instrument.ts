// A pitched instrument played from recorded samples (the bass for now). Its notes are taken out of the MIDI before the
// synth sees it (engine.ts) and played here instead, in step with the synth through SongClock.
//
// Each note picks the sample zone for its pitch, a velocity layer and a round-robin take, and is shifted to the exact
// pitch. A note ends with a short release when its length is over. The instrument has its own channel strip: level,
// pitch, pan, 3-band EQ, compressor and a send to a room reverb.
import { SongClock } from "./clock";
import { INST_FLAT, type InstSettings } from "./instruments";

type Layer = { lo: number; hi: number; files: string[] };
type Zone = { lo: number; hi: number; center: number; layers: Layer[]; short?: string[] };
type Manifest = { zones: Zone[]; release?: number };

/** One note of a song: `ms` is when it starts and `endMs` when its length is over, both on the song's clock. */
export type InstNote = { ms: number; endMs: number; key: number; vel: number; track: number };
/** A note as it is in the MIDI file, in ticks. */
export type TickNote = { tick: number; endTick: number; key: number; vel: number; track: number };

const JITTER = 0.05; // velocity variation on playback (fraction)
const RELEASE = 0.12; // seconds a note takes to fade out when its length is over, unless the kit says otherwise
const MIN_LENGTH = 0.08; // seconds, so very short notes still speak
const SHORT_NOTE = 0.2; // seconds: shorter notes use the staccato takes

export class SampleInstrument {
  private manifest: Manifest | null = null;
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private lastTake = new Map<string, string>();
  private voices = new Set<{ src: AudioBufferSourceNode; gain: GainNode }>();
  private trackGain = new Map<number, number>();
  private prepareId = 0;
  private fx: InstSettings = INST_FLAT;

  private nodes: {
    input: GainNode;
    shaper: WaveShaperNode;
    cabinet: BiquadFilterNode;
    low: BiquadFilterNode;
    mid: BiquadFilterNode;
    high: BiquadFilterNode;
    comp: DynamicsCompressorNode;
    makeup: GainNode;
    pan: StereoPannerNode;
    send: GainNode;
    room: ConvolverNode;
  } | null = null;

  readonly clock = new SongClock<InstNote>(
    () => this.ctx,
    (note, when) => this.play(note, when),
    () => this.stopVoices(),
  );

  constructor(private url: string) {}

  get available() {
    return this.manifest !== null;
  }

  async loadManifest() {
    if (this.manifest) return true;
    try {
      const res = await fetch(`${this.url}/kit.json`);
      if (!res.ok) return false;
      this.manifest = await res.json();
      return true;
    } catch {
      return false;
    }
  }

  /** Builds the channel strip on the context alphaTab plays through, ending in `destination` (the master effects). */
  attach(ctx: AudioContext, destination: AudioNode) {
    if (this.ctx === ctx) return;
    this.dispose();
    this.ctx = ctx;
    const input = ctx.createGain();
    // High-pass first, so the rumble below the lowest string does not drive the saturation.
    const rumble = ctx.createBiquadFilter();
    rumble.type = "highpass";
    rumble.frequency.value = 28;
    const shaper = ctx.createWaveShaper();
    shaper.oversample = "2x";
    const cabinet = ctx.createBiquadFilter();
    cabinet.type = "lowpass";
    cabinet.Q.value = 0.7;
    const low = ctx.createBiquadFilter();
    low.type = "lowshelf";
    low.frequency.value = 120;
    const mid = ctx.createBiquadFilter();
    mid.type = "peaking";
    mid.frequency.value = 800;
    mid.Q.value = 0.9;
    const high = ctx.createBiquadFilter();
    high.type = "highshelf";
    high.frequency.value = 3500;
    const comp = ctx.createDynamicsCompressor();
    comp.knee.value = 10;
    comp.attack.value = 0.01;
    comp.release.value = 0.2;
    const makeup = ctx.createGain();
    const pan = ctx.createStereoPanner();
    const send = ctx.createGain();
    const room = ctx.createConvolver();
    room.buffer = this.impulse(ctx, 1.3);
    input.connect(rumble);
    rumble.connect(shaper);
    shaper.connect(cabinet);
    cabinet.connect(low);
    low.connect(mid);
    mid.connect(high);
    high.connect(comp);
    comp.connect(makeup);
    makeup.connect(pan);
    pan.connect(destination);
    makeup.connect(send);
    send.connect(room);
    room.connect(destination);
    this.nodes = { input, shaper, cabinet, low, mid, high, comp, makeup, pan, send, room };
    this.applySettings();
  }

  private impulse(ctx: AudioContext, seconds: number) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
    }
    return buffer;
  }

  setSettings(fx: InstSettings) {
    this.fx = fx;
    this.applySettings();
  }

  private applySettings() {
    const n = this.nodes;
    const ctx = this.ctx;
    if (!n || !ctx) return;
    const t = ctx.currentTime;
    const fx = this.fx;
    n.input.gain.setTargetAtTime(fx.mute > 0 ? 0 : fx.level, t, 0.02);
    n.low.gain.setTargetAtTime(fx.low, t, 0.02);
    n.mid.gain.setTargetAtTime(fx.mid, t, 0.02);
    n.high.gain.setTargetAtTime(fx.high, t, 0.02);
    n.comp.threshold.setTargetAtTime(-fx.comp * 30, t, 0.02);
    n.comp.ratio.setTargetAtTime(1 + fx.comp * 7, t, 0.02);
    n.makeup.gain.setTargetAtTime(1 + fx.comp * 0.5, t, 0.02);
    n.send.gain.setTargetAtTime(fx.reverb * 0.8, t, 0.02);
    n.pan.pan.setTargetAtTime(fx.pan, t, 0.02);
    // Tone sweeps the cabinet low-pass from 800 Hz (dark) to about 18 kHz (open).
    n.cabinet.frequency.setTargetAtTime(800 * 2 ** (fx.tone * 4.5), t, 0.02);
    n.shaper.curve = this.driveCurve(fx.drive);
  }

  private driveCurve(drive: number) {
    if (drive <= 0.01) return null;
    // Soft clipping: tanh, scaled so a full-level sample stays about as loud as before.
    const k = 1 + drive * 7;
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    return curve;
  }

  /** Gain of one track of the song, from its mute, solo and volume in the track panel. */
  setTrackGain(track: number, gain: number) {
    this.trackGain.set(track, gain);
  }

  private zoneFor(key: number) {
    const zones = this.manifest?.zones;
    if (!zones) return null;
    return (
      zones.find((z) => key >= z.lo && key <= z.hi) ??
      zones.reduce((best, z) => (Math.abs(z.center - key) < Math.abs(best.center - key) ? z : best))
    );
  }

  private layerFor(zone: Zone, vel: number) {
    return zone.layers.find((l) => vel >= l.lo && vel <= l.hi) ?? zone.layers.at(vel < zone.layers[0].lo ? 0 : -1)!;
  }

  /** Sets up the timeline and loads the samples the notes need (every take of every layer they can reach). */
  async prepare(
    ticks: TickNote[],
    division: number,
    tempos: { tick: number; bpm: number }[],
    onProgress: (fraction: number) => void,
  ) {
    const ctx = this.ctx;
    const id = ++this.prepareId;
    this.stopVoices();
    this.clock.setTiming(division, tempos);
    const notes: InstNote[] = ticks.map((n) => ({
      ms: this.clock.msOf(n.tick),
      endMs: this.clock.msOf(n.endTick),
      key: n.key,
      vel: n.vel,
      track: n.track,
    }));
    this.clock.setEvents(notes);
    if (!ctx || !this.manifest) return;

    const wanted = new Set<string>();
    for (const n of notes) {
      const zone = this.zoneFor(n.key);
      if (!zone) continue;
      // Velocity is varied slightly on playback, so a note near a layer boundary can land in the next layer.
      for (const vel of [n.vel * (1 - JITTER), n.vel, n.vel * (1 + JITTER)])
        for (const file of this.layerFor(zone, Math.max(1, Math.min(127, vel))).files) wanted.add(file);
      if ((n.endMs - n.ms) / 1000 < SHORT_NOTE * 1.5) for (const file of zone.short ?? []) wanted.add(file);
    }
    const todo = [...wanted].filter((f) => !this.buffers.has(f));
    let done = 0;
    onProgress(todo.length === 0 ? 1 : 0);
    const queue = [...todo];
    const worker = async () => {
      for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
        if (id !== this.prepareId) return;
        try {
          const res = await fetch(`${this.url}/${file}.m4a`);
          this.buffers.set(file, await ctx.decodeAudioData(await res.arrayBuffer()));
        } catch {
          // A missing sample only silences that note.
        }
        onProgress(++done / todo.length);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
  }

  private play(note: InstNote, when: number) {
    const ctx = this.ctx;
    const n = this.nodes;
    const zone = this.zoneFor(note.key);
    if (!ctx || !n || !zone) return;

    const vel = Math.max(1, Math.min(127, note.vel * (1 + (Math.random() * 2 - 1) * JITTER)));
    const layer = this.layerFor(zone, vel);
    const length = Math.max(MIN_LENGTH, (note.endMs - note.ms) / (1000 * this.clock.speedFactor));
    const shortTakes = length < SHORT_NOTE ? (zone.short ?? []).filter((f) => this.buffers.has(f)) : [];
    // The closest layer that has its samples loaded, so a note is never silent because of a boundary.
    const candidates = [layer, ...zone.layers.filter((l) => l !== layer)];
    let take: { file: string; buffer: AudioBuffer } | null = null;
    if (shortTakes.length > 0) {
      const key = `${zone.center}/short`;
      const options = shortTakes.length > 1 ? shortTakes.filter((f) => f !== this.lastTake.get(key)) : shortTakes;
      const file = options[Math.floor(Math.random() * options.length)];
      this.lastTake.set(key, file);
      take = { file, buffer: this.buffers.get(file)! };
    }
    for (const l of take ? [] : candidates) {
      const ready = l.files.filter((f) => this.buffers.has(f));
      if (ready.length === 0) continue;
      const key = `${zone.center}/${l.lo}`;
      const options = ready.length > 1 ? ready.filter((f) => f !== this.lastTake.get(key)) : ready;
      const file = options[Math.floor(Math.random() * options.length)];
      this.lastTake.set(key, file);
      take = { file, buffer: this.buffers.get(file)! };
      break;
    }
    if (!take) return;

    const trackGain = this.trackGain.get(note.track) ?? 1;
    const amp = (0.55 + 0.45 * Math.min(1, vel / layer.hi)) * trackGain;
    const gain = ctx.createGain();
    gain.gain.value = amp;
    const src = ctx.createBufferSource();
    src.buffer = take.buffer;
    // Shift the zone's sample to the exact pitch, plus the pitch control of the strip.
    src.detune.value = (note.key - zone.center + this.fx.pitch) * 100;
    src.connect(gain);
    gain.connect(n.input);

    const end = when + length;
    const release = this.manifest?.release ?? RELEASE;
    gain.gain.setValueAtTime(amp, end);
    gain.gain.setTargetAtTime(0, end, release / 3);
    src.start(when);
    src.stop(end + release * 3);
    const voice = { src, gain };
    this.voices.add(voice);
    src.onended = () => {
      this.voices.delete(voice);
      gain.disconnect();
    };
  }

  private stopVoices() {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const v of this.voices) {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setTargetAtTime(0, now, 0.015);
      try {
        v.src.stop(now + 0.1);
      } catch {}
    }
  }

  dispose() {
    this.clock.dispose();
    this.stopVoices();
    this.nodes?.pan.disconnect();
    this.nodes?.room.disconnect();
    this.nodes = null;
    this.buffers.clear();
    this.voices.clear();
    this.ctx = null;
  }
}
