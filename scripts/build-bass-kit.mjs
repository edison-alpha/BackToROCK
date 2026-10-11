// Builds the web bass from Karoryfer Growlybass (Squier Jazz Bass, CC0, sfzinstruments).
//
//   node scripts/build-bass-kit.mjs <growlybass dir> <ffmpeg binary> <output dir>
//
// Reads the key ranges from growlybass_clean.sfz, converts the sustained notes (4 velocity layers x 4 round robins on
// 14 notes) to mono AAC and writes kit.json. The library names notes an octave above the pitch they sound (bass is
// written an octave up), so every pitch is moved down 12 semitones to the pitch alphaTab and MIDI files use.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [kitDir, ffmpeg, outDir] = process.argv.slice(2);
if (!kitDir || !ffmpeg || !outDir) {
  console.error("usage: node build-bass-kit.mjs <growlybass dir> <ffmpeg> <out dir>");
  process.exit(1);
}

const NOTE = { c: 0, db: 1, d: 2, eb: 3, e: 4, f: 5, gb: 6, g: 7, ab: 8, a: 9, bb: 10, b: 11 };
const midiOf = (name) => {
  const m = name.match(/^([a-g]b?)(\d)$/);
  return (Number(m[2]) + 1) * 12 + NOTE[m[1]];
};

const LAYERS = [
  { name: "pp", lo: 1, hi: 60 },
  { name: "p", lo: 61, hi: 95 },
  { name: "f", lo: 96, hi: 120 },
  { name: "ff", lo: 121, hi: 127 },
];
const ROUND_ROBINS = [1, 2, 3, 4];
const OCTAVE = 12;
const SECONDS = 6;
const STACCATO_ROUND_ROBINS = [1, 2, 3, 4, 5];
const STACCATO_SECONDS = 1.5;

// Key ranges of the sustain groups: [lokey, hikey] per note, in the library's written pitch.
const sfz = readFileSync(join(kitDir, "growlybass_clean.sfz"), "utf8");
const zones = [];
for (const group of sfz.split("<group>").slice(1)) {
  const lo = group.match(/lokey=(\d+)/);
  const hi = group.match(/hikey=(\d+)/);
  const sample = group.match(/sample=sustain\\([a-g]b?\d)_pp_rr1\.wav/);
  if (!lo || !hi || !sample) continue;
  zones.push({ note: sample[1], lo: +lo[1] - OCTAVE, hi: +hi[1] - OCTAVE, center: midiOf(sample[1]) - OCTAVE });
}
zones.sort((a, b) => a.lo - b.lo);

function run(args) {
  const res = spawnSync(ffmpeg, ["-y", "-hide_banner", "-nostats", ...args], { encoding: "utf8" });
  if (res.status !== 0) throw new Error(res.stderr);
  return res.stderr;
}

const src = (note, layer, rr) => join(kitDir, "sustain", `${note}_${layer}_rr${rr}.wav`);
const peak = (file) => +run(["-i", file, "-af", "volumedetect", "-f", "null", "-"]).match(/max_volume: (-?[\d.]+) dB/)[1];

// One shared gain from the loudest note, so the velocity layers keep their natural differences.
let loudest = -100;
for (const z of zones) loudest = Math.max(loudest, peak(src(z.note, "ff", 1)));
const gainDb = Math.round((-1 - loudest) * 10) / 10;
console.log(`loudest peak ${loudest} dB, applying ${gainDb} dB`);

if (existsSync(outDir)) rmSync(outDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

let count = 0;
const manifest = { format: "m4a", zones: [] };
for (const z of zones) {
  const layers = LAYERS.map((l) => ({ lo: l.lo, hi: l.hi, files: ROUND_ROBINS.map((rr) => `${z.note}_${l.name}_rr${rr}`) }));
  for (const layer of layers)
    for (const name of layer.files) {
      const [note, vel, rr] = name.split("_");
      run([
        "-i", src(note, vel, rr.replace("rr", "")),
        "-af", `atrim=0:${SECONDS},afade=t=out:st=${SECONDS - 0.3}:d=0.3,volume=${gainDb}dB`,
        "-ac", "1", "-c:a", "aac", "-b:a", "112k", join(outDir, `${name}.m4a`),
      ]);
      count++;
    }
  // Short plucks for notes that are brief or muted: sustained takes cut short sound like a different instrument.
  const short = STACCATO_ROUND_ROBINS.map((rr) => `${z.note}_staccato_rr${rr}`);
  for (const name of short) {
    run([
      "-i", join(kitDir, "staccato", `${name}.wav`),
      "-af", `atrim=0:${STACCATO_SECONDS},afade=t=out:st=${STACCATO_SECONDS - 0.2}:d=0.2,volume=${gainDb}dB`,
      "-ac", "1", "-c:a", "aac", "-b:a", "112k", join(outDir, `${name}.m4a`),
    ]);
    count++;
  }
  manifest.zones.push({ lo: z.lo, hi: z.hi, center: z.center, layers, short });
  console.log(`${z.note} -> ${z.lo}..${z.hi} (centre ${z.center})`);
}
writeFileSync(join(outDir, "kit.json"), JSON.stringify(manifest));
console.log(`${count} files`);
