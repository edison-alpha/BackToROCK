// Keeps events that are played by our own samplers in step with alphaTab's synth.
//
// alphaTab reports its position (in MIDI ticks) while it plays. Events are scheduled slightly ahead on the same
// AudioContext, at the time that position maps to on the audio clock.

type TempoSegment = { tick: number; ms: number; msPerTick: number };

const LOOKAHEAD = 0.15; // seconds scheduled ahead
const PUMP_MS = 25;

export class SongClock<T extends { ms: number }> {
  private tempo: TempoSegment[] = [{ tick: 0, ms: 0, msPerTick: 0.5 }];
  private events: T[] = [];
  private pointer = 0;
  private offset: number | null = null;
  private lastTick: number | null = null;
  private speed = 1;
  private playing = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private syncMs = 0;

  /**
   * `fire` plays an event at the given audio time. `stop` cuts what is sounding, when playback pauses or jumps.
   */
  constructor(
    private ctx: () => AudioContext | null,
    private fire: (e: T, when: number) => void,
    private stop: () => void,
  ) {}

  /** `division` is the MIDI ticks per quarter note and `tempos` the tempo changes (bpm) by tick. */
  setTiming(division: number, tempos: { tick: number; bpm: number }[]) {
    const sorted = [...tempos].sort((a, b) => a.tick - b.tick);
    if (sorted.length === 0 || sorted[0].tick > 0) sorted.unshift({ tick: 0, bpm: sorted[0]?.bpm ?? 120 });
    this.tempo = [];
    let ms = 0;
    for (let i = 0; i < sorted.length; i++) {
      const msPerTick = 60000 / (sorted[i].bpm * division);
      this.tempo.push({ tick: sorted[i].tick, ms, msPerTick });
      if (sorted[i + 1]) ms += (sorted[i + 1].tick - sorted[i].tick) * msPerTick;
    }
  }

  msOf(tick: number) {
    let seg = this.tempo[0];
    for (const s of this.tempo) {
      if (s.tick > tick) break;
      seg = s;
    }
    return seg.ms + (tick - seg.tick) * seg.msPerTick;
  }

  setEvents(events: T[]) {
    this.events = [...events].sort((a, b) => a.ms - b.ms);
    this.pointer = 0;
    this.offset = null;
  }

  setSpeed(speed: number) {
    this.speed = speed;
    this.offset = null; // the clock mapping changes with the speed; the next position event sets it again
  }

  /** Moves everything earlier or later (ms), to match the output latency of the device. */
  setSyncOffset(ms: number) {
    this.syncMs = ms;
  }

  /** Called with every position update from alphaTab while it plays. */
  position(tick: number, isSeek: boolean) {
    const ctx = this.ctx();
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
      this.stop();
    } else {
      this.offset = Math.min(this.offset + 0.00005, sample);
    }
  }

  private firstAtOrAfter(ms: number) {
    let lo = 0;
    let hi = this.events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.events[mid].ms < ms) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  get speedFactor() {
    return this.speed;
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
      this.stop();
    }
  }

  private pump() {
    const ctx = this.ctx();
    if (!ctx || this.offset === null) return;
    const rate = 1000 * this.speed;
    const horizon = (ctx.currentTime - this.offset + LOOKAHEAD) * rate;
    while (this.pointer < this.events.length && this.events[this.pointer].ms < horizon) {
      const e = this.events[this.pointer++];
      const when = this.offset + e.ms / rate + this.syncMs / 1000;
      if (when < ctx.currentTime - 0.06) continue; // too late to be useful
      this.fire(e, Math.max(when, ctx.currentTime));
    }
  }

  dispose() {
    clearInterval(this.timer);
    this.playing = false;
    this.offset = null;
  }
}
