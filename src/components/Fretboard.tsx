"use client";

import { usePlayer } from "@/lib/player-store";
import { noteName } from "@/lib/music";

const FRETS = 22;
const FRET_W = 56;
const NUT_X = 44;
const ROW_H = 26;
const PAD_Y = 18;
const NONE: never[] = [];
const INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];

// The string count comes from the track's tuning, so a 4 or 5 string bass draws 4 or 5 lines.
export function Fretboard({ trackIndex }: { trackIndex: number }) {
  const track = usePlayer((s) => s.tracks[trackIndex]);
  const active = usePlayer((s) => s.activeByTrack[trackIndex]) ?? NONE;
  if (!track?.stringed) return null;

  const strings = track.tuning.length;
  const width = NUT_X + FRETS * FRET_W + 12;
  const height = PAD_Y * 2 + (strings - 1) * ROW_H;
  // String 1 is the lowest, drawn at the bottom like the tab.
  const y = (s: number) => PAD_Y + (strings - s) * ROW_H;
  const midY = PAD_Y + ((strings - 1) * ROW_H) / 2;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label="Fretboard gitar"
    >
      <rect x={NUT_X} y={PAD_Y - 8} width={FRETS * FRET_W} height={height - PAD_Y * 2 + 16} rx={6} fill="#1d1a17" />
      {INLAYS.map((f) => (
        <circle key={f} cx={NUT_X + (f - 0.5) * FRET_W} cy={midY} r={4.5} fill="#ffffff" opacity={0.12} />
      ))}
      {[12, 24].map((f) =>
        f <= FRETS ? (
          <g key={f} fill="#ffffff" opacity={0.12}>
            <circle cx={NUT_X + (f - 0.5) * FRET_W} cy={midY - ROW_H} r={4.5} />
            <circle cx={NUT_X + (f - 0.5) * FRET_W} cy={midY + ROW_H} r={4.5} />
          </g>
        ) : null,
      )}
      {Array.from({ length: FRETS + 1 }, (_, f) => (
        <line
          key={f}
          x1={NUT_X + f * FRET_W}
          x2={NUT_X + f * FRET_W}
          y1={PAD_Y - 8}
          y2={height - PAD_Y + 8}
          stroke={f === 0 ? "#d8d4cc" : "#6b665e"}
          strokeWidth={f === 0 ? 5 : 1.5}
        />
      ))}
      {Array.from({ length: strings }, (_, i) => i + 1).map((s) => (
        <line
          key={s}
          x1={NUT_X}
          x2={NUT_X + FRETS * FRET_W}
          y1={y(s)}
          y2={y(s)}
          stroke="#c9c5bd"
          strokeWidth={0.8 + (s <= 3 ? (4 - s) * 0.5 : 0)}
          opacity={0.75}
        />
      ))}
      {[0, 3, 5, 7, 9, 12, 15, 17, 19, 21].map((f) => (
        <text
          key={f}
          x={f === 0 ? NUT_X - 20 : NUT_X + (f - 0.5) * FRET_W}
          y={height - 1}
          textAnchor="middle"
          fontSize={9}
          fill="#a3a3a3"
        >
          {f === 0 ? "" : f}
        </text>
      ))}
      {active
        .filter((n) => n.string >= 1 && n.string <= strings && n.fret <= FRETS)
        .map((n, i) => {
          const cx = n.fret === 0 ? NUT_X - 20 : NUT_X + (n.fret - 0.5) * FRET_W;
          const midi = track.tuning[n.string - 1] + n.fret;
          return (
            <g key={`${n.string}-${n.fret}-${i}`}>
              <circle cx={cx} cy={y(n.string)} r={11} fill="#d9202b" stroke="#ffffff" strokeWidth={1.5} />
              <text x={cx} y={y(n.string) + 3.5} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff">
                {noteName(midi)}
              </text>
            </g>
          );
        })}
    </svg>
  );
}
