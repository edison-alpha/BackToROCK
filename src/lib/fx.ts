// Master effects for playback: 3-band EQ, compressor and reverb.
//
// alphaTab mixes every track into one stereo stream and connects it straight to `context.destination`, so effects
// cannot be applied per instrument. To insert a chain anyway, the AudioContext class is wrapped so that
// `destination` is the input of our chain, which ends in the real destination.
//
// Offline export (exportAudio) renders in the synth and does not pass through this chain.

export type FxSettings = {
  low: number; // dB, low shelf at 200 Hz
  mid: number; // dB, peaking at 1 kHz
  high: number; // dB, high shelf at 4 kHz
  compressor: number; // 0 = off, 1 = heavy
  reverb: number; // wet level, 0 = dry
  room: number; // reverb length in seconds
};

const FX_FLAT: FxSettings = { low: 0, mid: 0, high: 0, compressor: 0, reverb: 0, room: 1.8 };
const FX_ROCK: FxSettings = { low: 2, mid: -2, high: 7, compressor: 0.6, reverb: 0.85, room: 2 };

// Rock is the default sound.
export const FX_DEFAULT = FX_ROCK;

export const FX_PRESETS: { id: string; label: string; fx: FxSettings }[] = [
  { id: "flat", label: "Flat", fx: FX_FLAT },
  { id: "rock", label: "Rock", fx: FX_ROCK },
  { id: "warm", label: "Warm", fx: { low: 4, mid: 0, high: -3, compressor: 0.2, reverb: 0.2, room: 1.8 } },
  { id: "bright", label: "Bright", fx: { low: -1, mid: 1, high: 5, compressor: 0.2, reverb: 0.15, room: 1.5 } },
  { id: "hall", label: "Hall", fx: { low: 1, mid: 0, high: 1, compressor: 0.1, reverb: 0.5, room: 3.2 } },
];

const STORAGE_KEY = "btr-fx";

export function loadFx(): FxSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...FX_DEFAULT, ...JSON.parse(raw) };
  } catch {}
  return FX_DEFAULT;
}

let current: FxSettings = FX_DEFAULT;

class Chain {
  readonly input: GainNode;
  private low: BiquadFilterNode;
  private mid: BiquadFilterNode;
  private high: BiquadFilterNode;
  private comp: DynamicsCompressorNode;
  private makeup: GainNode;
  private convolver: ConvolverNode;
  private wet: GainNode;
  private room = 0;

  constructor(private ctx: AudioContext, out: AudioNode) {
    this.input = ctx.createGain();
    this.low = ctx.createBiquadFilter();
    this.low.type = "lowshelf";
    this.low.frequency.value = 200;
    this.mid = ctx.createBiquadFilter();
    this.mid.type = "peaking";
    this.mid.frequency.value = 1000;
    this.mid.Q.value = 0.8;
    this.high = ctx.createBiquadFilter();
    this.high.type = "highshelf";
    this.high.frequency.value = 4000;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.knee.value = 12;
    this.comp.attack.value = 0.01;
    this.comp.release.value = 0.2;
    this.makeup = ctx.createGain();
    this.convolver = ctx.createConvolver();
    this.wet = ctx.createGain();

    this.input.connect(this.low);
    this.low.connect(this.mid);
    this.mid.connect(this.high);
    this.high.connect(this.comp);
    this.comp.connect(this.makeup);
    this.makeup.connect(out);
    this.makeup.connect(this.convolver);
    this.convolver.connect(this.wet);
    this.wet.connect(out);
    this.apply(current);
  }

  apply(fx: FxSettings) {
    const t = this.ctx.currentTime;
    this.low.gain.setTargetAtTime(fx.low, t, 0.02);
    this.mid.gain.setTargetAtTime(fx.mid, t, 0.02);
    this.high.gain.setTargetAtTime(fx.high, t, 0.02);
    // One knob drives the compressor: lower threshold and higher ratio, with make-up gain to keep the level.
    this.comp.threshold.setTargetAtTime(-fx.compressor * 36, t, 0.02);
    this.comp.ratio.setTargetAtTime(1 + fx.compressor * 7, t, 0.02);
    this.makeup.gain.setTargetAtTime(1 + fx.compressor * 0.6, t, 0.02);
    this.wet.gain.setTargetAtTime(fx.reverb, t, 0.02);
    if (fx.room !== this.room) {
      this.room = fx.room;
      this.convolver.buffer = this.impulse(fx.room);
    }
  }

  // Synthetic room: stereo noise with an exponential decay. Good enough for a smooth tail without shipping a sample.
  private impulse(seconds: number) {
    const rate = this.ctx.sampleRate;
    const length = Math.max(1, Math.floor(rate * seconds));
    const buffer = this.ctx.createBuffer(2, length, rate);
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
    }
    return buffer;
  }
}

const chains = new Set<Chain>();

export function setFx(fx: FxSettings) {
  current = fx;
  for (const chain of chains) chain.apply(fx);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fx));
  } catch {}
}

let installed = false;

// Must run before alphaTab creates its AudioContext.
export function installFx() {
  if (installed || typeof window === "undefined" || !window.AudioContext) return;
  installed = true;
  current = loadFx();
  const Native = window.AudioContext;
  const getDestination = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, "destination")?.get;
  if (!getDestination) return;
  const realDestination = (ctx: AudioContext) => getDestination.call(ctx) as AudioNode;

  class FxContext extends Native {
    constructor(options?: AudioContextOptions) {
      super(options);
      let chain: Chain | undefined;
      Object.defineProperty(this, "destination", {
        get: () => {
          if (!chain) {
            chain = new Chain(this, realDestination(this));
            chains.add(chain);
          }
          return chain.input;
        },
      });
    }
  }
  window.AudioContext = FxContext;
}
