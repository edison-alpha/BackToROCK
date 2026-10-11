// Builds the web drum kit from the DrumGizmo MuldjordKit (sfzinstruments v1.0, CC-BY 4.0).
//
//   node scripts/build-drum-kit.mjs <kit dir> <ffmpeg binary> <output dir>
//
// <kit dir> is DrumGizmo.MuldjordKit/DrumGizmo/MuldjordKit. Every hit is recorded on ~16 microphones. This mixes the
// microphones of each hit into one stereo file (close mics panned like a drummer's view, overheads and room wide) and
// encodes it as AAC, so the browser only has to decode one file per hit. It also writes kit.json with the velocity
// layers and round-robin hits of every kit piece.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [kitDir, ffmpeg, outDir] = process.argv.slice(2);
if (!kitDir || !ffmpeg || !outDir) {
  console.error("usage: node build-drum-kit.mjs <kit dir> <ffmpeg> <out dir>");
  process.exit(1);
}

// [pan from -1 (left) to 1 (right), gain in dB]. Snare bottom and the kick trigger are left out on purpose: the bottom
// mic is out of phase with the top one, and the trigger is not a sound.
const MICS = {
  KdrumL: [0, 0],
  KdrumR: [0, 0],
  Snare_top: [0, 0],
  Tom1: [-0.6, 0],
  Tom2: [-0.2, 0],
  Tom3: [0.2, 0],
  Tom4: [0.6, 0],
  Hihat: [-0.4, 0],
  RideL: [-0.5, 0],
  RideR: [0.5, 0],
  OHL: [-1, 0],
  OHR: [1, 0],
  AmbL: [-1, -4],
  AmbR: [1, -4],
};

// Longest tail kept per piece, in seconds.
const LENGTH = {
  KdrumL: 1.4, KdrumR: 1.4, Snare: 1.6, SnareRest: 0.8,
  Tom1: 2.5, Tom2: 2.5, Tom3: 3, Tom4: 3.5,
  HihatClosed: 0.7, HihatOpen: 2.5,
  RideL: 5, RideR: 5, RideLBell: 4, RideRBell: 4,
  CrashL: 6, CrashR: 6, China: 5,
};

const macro = readFileSync(join(kitDir, "Data/macro.txt"), "utf8");
const vel = {};
for (const m of macro.matchAll(/#define \$(v\d+[lh]) (\d+)/g)) vel[m[1]] = +m[2];

function layersOf(piece) {
  const text = readFileSync(join(kitDir, "Data/region", `${piece}.txt`), "utf8");
  const layers = new Map();
  for (const m of text.matchAll(/lovel=\$(v\d+l) hivel=\$(v\d+h).*?sample=\$instr\/(\d+)-/g)) {
    const key = `${vel[m[1]]}-${vel[m[2]]}`;
    if (!layers.has(key)) layers.set(key, { lo: vel[m[1]], hi: vel[m[2]], hits: [] });
    layers.get(key).hits.push(+m[3]);
  }
  return [...layers.values()].sort((a, b) => a.lo - b.lo);
}

// ffmpeg arguments that read every microphone of a hit and mix them to stereo; `tail` is appended to the filter graph.
function mixArgs(piece, hit, tail) {
  const mics = Object.keys(MICS);
  const args = [];
  for (const mic of mics) args.push("-i", join(kitDir, "Samples", piece, `${hit}-${piece}-${mic}.flac`));
  const pans = mics.map((mic, i) => {
    const [pan, db] = MICS[mic];
    const angle = ((pan + 1) * Math.PI) / 4; // constant-power pan law
    const g = 10 ** (db / 20);
    return `[${i}:a]pan=stereo|c0=${(Math.cos(angle) * g).toFixed(4)}*c0|c1=${(Math.sin(angle) * g).toFixed(4)}*c0[m${i}]`;
  });
  const sum = `${mics.map((_, i) => `[m${i}]`).join("")}amix=inputs=${mics.length}:normalize=0`;
  return [...args, "-filter_complex", `${pans.join(";")};${sum},${tail}`];
}

function run(args) {
  const res = spawnSync(ffmpeg, ["-y", "-hide_banner", "-nostats", ...args], { encoding: "utf8" });
  if (res.status !== 0) throw new Error(res.stderr);
  return res.stderr;
}

function peak(piece, hit) {
  const report = run([...mixArgs(piece, hit, "volumedetect"), "-f", "null", "-"]);
  return +report.match(/max_volume: (-?[\d.]+) dB/)[1];
}

function encode(piece, hit, gainDb, dest) {
  const len = LENGTH[piece] ?? 3;
  const tail = `atrim=0:${len},afade=t=out:st=${Math.max(0, len - 0.2)}:d=0.2,volume=${gainDb}dB`;
  run([...mixArgs(piece, hit, tail), "-c:a", "aac", "-b:a", "160k", dest]);
}

const pieces = readdirSync(join(kitDir, "Samples")).filter((p) => existsSync(join(kitDir, "Data/region", `${p}.txt`)));
if (existsSync(outDir)) rmSync(outDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const manifest = { format: "m4a", pieces: {} };
for (const piece of pieces) manifest.pieces[piece] = { layers: layersOf(piece) };

// The loudest hit of the whole kit decides one shared gain (peak at about -1 dBFS). Normalising each hit on its own
// would flatten the dynamics.
let loudest = -100;
for (const piece of pieces) for (const hit of manifest.pieces[piece].layers.at(-1).hits) loudest = Math.max(loudest, peak(piece, hit));
const gainDb = Math.round((-1 - loudest) * 10) / 10;
console.log(`loudest peak ${loudest} dB, applying ${gainDb} dB`);

let count = 0;
for (const piece of pieces) {
  mkdirSync(join(outDir, piece));
  for (const layer of manifest.pieces[piece].layers)
    for (const hit of layer.hits) {
      encode(piece, hit, gainDb, join(outDir, piece, `${hit}.m4a`));
      count++;
    }
  console.log(`${piece} done`);
}
writeFileSync(join(outDir, "kit.json"), JSON.stringify(manifest));
console.log(`${count} files`);
