// Builds the web piano and string section.
//
//   node scripts/build-piano-strings-kits.mjs <piano dir> <strings dir> <ffmpeg binary> <piano out> <strings out>
//
// Piano: Salamander Grand Piano V3 by Alexander Holm (CC BY 3.0, sfzinstruments). <piano dir> holds the flac files
// (A0v3.flac, C1v6.flac ...). Six of the sixteen velocity layers are kept.
//
// Strings: VS Chamber Orchestra Community Edition by Versilian Studios (CC0). <strings dir> holds the folders violin,
// viola and cello with the sustained vibrato samples. The sections are joined by pitch: cellos below C4, violas for the
// octave from C4, violins above that. Their note names are an octave below the pitch they sound.
//
// Both are written as stereo AAC with a kit.json that describes the zones, like the bass kit.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [pianoDir, stringsDir, ffmpeg, pianoOut, stringsOut] = process.argv.slice(2);
if (!pianoDir || !stringsDir || !ffmpeg || !pianoOut || !stringsOut) {
  console.error("usage: node build-piano-strings-kits.mjs <piano dir> <strings dir> <ffmpeg> <piano out> <strings out>");
  process.exit(1);
}

const SEMITONE = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
const midi = (name, octaveShift = 0) => {
  const m = name.match(/^([A-G]#?)(\d)$/);
  return (Number(m[2]) + 1 + octaveShift) * 12 + SEMITONE[m[1]];
};
const safe = (s) => s.replace("#", "s");

function run(args) {
  const res = spawnSync(ffmpeg, ["-y", "-hide_banner", "-nostats", ...args], { encoding: "utf8" });
  if (res.status !== 0) throw new Error(res.stderr);
  return res.stderr;
}
const level = (file) => {
  const out = run(["-i", file, "-af", "volumedetect", "-f", "null", "-"]);
  return { mean: +out.match(/mean_volume: (-?[\d.]+) dB/)[1], max: +out.match(/max_volume: (-?[\d.]+) dB/)[1] };
};

// Splits [from, to] among sample centres: each zone reaches halfway to its neighbours.
function zonesFor(centres, from, to) {
  const sorted = [...centres].sort((a, b) => a.center - b.center);
  return sorted.map((c, i) => ({
    ...c,
    lo: i === 0 ? from : Math.floor((sorted[i - 1].center + c.center) / 2) + 1,
    hi: i === sorted.length - 1 ? to : Math.floor((c.center + sorted[i + 1].center) / 2),
  }));
}

function encode(input, output, seconds, fade, gainDb, bitrate) {
  run([
    "-i", input,
    "-af", `atrim=0:${seconds},afade=t=out:st=${seconds - fade}:d=${fade},volume=${gainDb}dB`,
    "-c:a", "aac", "-b:a", bitrate, output,
  ]);
}

const fresh = (dir) => {
  if (existsSync(dir)) rmSync(dir, { recursive: true });
  mkdirSync(dir, { recursive: true });
};

// ---- piano -------------------------------------------------------------------------------------------------------
{
  const NOTES = [];
  for (let octave = 0; octave <= 8; octave++)
    for (const n of ["C", "D#", "F#", "A"]) {
      const name = `${n}${octave}`;
      const m = midi(name);
      if (m >= 21 && m <= 108) NOTES.push(name);
    }
  // Source layer -> velocity range.
  const LAYERS = [
    { v: 3, lo: 1, hi: 30 },
    { v: 6, lo: 31, hi: 55 },
    { v: 9, lo: 56, hi: 78 },
    { v: 12, lo: 79, hi: 100 },
    { v: 14, lo: 101, hi: 116 },
    { v: 16, lo: 117, hi: 127 },
  ];
  const source = (name, v) => join(pianoDir, `${name}v${v}.flac`);
  let loudest = -100;
  for (const n of NOTES) loudest = Math.max(loudest, level(source(n, 16)).max);
  const gain = Math.round((-1 - loudest) * 10) / 10;
  console.log(`piano: loudest peak ${loudest} dB, gain ${gain} dB`);

  fresh(pianoOut);
  const zones = zonesFor(NOTES.map((name) => ({ name, center: midi(name) })), 21, 108).map((z) => {
    const layers = LAYERS.map((l) => {
      const file = `${safe(z.name)}_v${l.v}`;
      encode(source(z.name, l.v), join(pianoOut, `${file}.m4a`), 10, 1, gain, "128k");
      return { lo: l.lo, hi: l.hi, files: [file] };
    });
    return { lo: z.lo, hi: z.hi, center: z.center, layers };
  });
  writeFileSync(join(pianoOut, "kit.json"), JSON.stringify({ format: "m4a", release: 0.3, zones }));
  console.log(`piano: ${zones.length * LAYERS.length} files`);
}

// ---- strings -----------------------------------------------------------------------------------------------------
{
  // [section, file name of a note and layer, sounding-pitch range it serves]
  const SECTIONS = [
    { id: "cello", from: 21, to: 59, file: (n, l) => `susvib_${n}_${l === 1 ? "v1" : "v3"}_1.wav` },
    { id: "viola", from: 60, to: 71, file: (n, l) => `ViolaEns_susvib_${n}_v${l}_1.wav` },
    { id: "violin", from: 72, to: 108, file: (n, l) => `VlnEns_susVib_${n}_v${l}.wav` },
  ];
  const NAMES = {
    cello: ["C1", "E1", "G1", "B1", "D2", "F2", "A2", "C3", "E3", "G3", "B3", "D4", "F4"],
    viola: ["C2", "D2", "E2", "G2", "B2", "D3", "F3", "A3", "C4", "E4", "G4", "B4", "D5"],
    violin: ["G2", "A2", "B2", "D3", "F#3", "A3", "C4", "E4", "G4", "B4", "D5"],
  };
  // Soft layer v1, loud layer v2 (the cello calls its loud layer v3).
  const LAYERS = [
    { n: 1, lo: 1, hi: 80 },
    { n: 2, lo: 81, hi: 127 },
  ];

  fresh(stringsOut);
  const zones = [];
  for (const s of SECTIONS) {
    const src = (name, l) => join(stringsDir, s.id, s.file(name, l));
    // One gain per section, so the three sections sit at the same loudness: mean about -22 dB, peaks under -1 dB.
    const levels = NAMES[s.id].flatMap((n) => LAYERS.map((l) => level(src(n, l.n))));
    const mean = levels.reduce((a, b) => a + b.mean, 0) / levels.length;
    const gain = Math.round(Math.min(-22 - mean, -1 - Math.max(...levels.map((x) => x.max))) * 10) / 10;
    console.log(`${s.id}: mean ${mean.toFixed(1)} dB, gain ${gain} dB`);
    const centres = NAMES[s.id].map((name) => ({ name, center: midi(name, 1) })); // the library names are an octave low
    // Each section's own zones, cut to the pitch span it serves here; the lowest and highest zone reach beyond.
    const own = zonesFor(centres, 0, 127)
      .map((z) => ({ ...z, lo: Math.max(z.lo, s.from), hi: Math.min(z.hi, s.to) }))
      .filter((z) => z.lo <= z.hi);
    for (const z of own) {
      const layers = LAYERS.map((l) => {
        const file = `${s.id}_${safe(z.name)}_v${l.n}`;
        encode(src(z.name, l.n), join(stringsOut, `${file}.m4a`), 10, 0.6, gain, "128k");
        return { lo: l.lo, hi: l.hi, files: [file] };
      });
      zones.push({ lo: z.lo, hi: z.hi, center: z.center, layers });
    }
  }
  writeFileSync(join(stringsOut, "kit.json"), JSON.stringify({ format: "m4a", release: 0.4, zones }));
  console.log(`strings: ${zones.length * LAYERS.length} files`);
}
