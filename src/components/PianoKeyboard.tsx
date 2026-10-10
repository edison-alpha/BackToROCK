"use client";

import { usePlayer } from "@/lib/player-store";
import { isBlack, noteName } from "@/lib/music";

// Full 88 keys (A0 to C8), like Guitar Pro. Keys outside the track's range are greyed out.
const LOW = 21;
const HIGH = 108;
const WHITE_W = 24;
const WHITE_H = 150;
const BLACK_W = 15;
const BLACK_H = 92;

const whites: number[] = [];
for (let m = LOW; m <= HIGH; m++) if (!isBlack(m)) whites.push(m);
const blacks = Array.from({ length: HIGH - LOW + 1 }, (_, i) => LOW + i).filter(isBlack);

const NONE: never[] = [];

export function PianoKeyboard({ trackIndex }: { trackIndex: number }) {
  const range = usePlayer((s) => s.tracks[trackIndex]?.range);
  const active = usePlayer((s) => s.activeByTrack[trackIndex]) ?? NONE;
  const on = new Set(active.map((n) => n.midi));
  const [lo, hi] = range ?? [LOW, HIGH];
  const inRange = (m: number) => m >= lo && m <= hi;
  const width = whites.length * WHITE_W;

  return (
    <svg viewBox={`0 0 ${width} ${WHITE_H}`} className="block h-auto w-full" role="img" aria-label="Keyboard piano">
      <defs>
        <linearGradient id="key-white" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#dcdcd8" />
        </linearGradient>
        <linearGradient id="key-white-off" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9a9a9a" />
          <stop offset="1" stopColor="#7e7e7e" />
        </linearGradient>
        <linearGradient id="key-black" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a3c46" />
          <stop offset="1" stopColor="#15161b" />
        </linearGradient>
        <linearGradient id="key-black-off" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a4b52" />
          <stop offset="1" stopColor="#2e2f35" />
        </linearGradient>
      </defs>
      {whites.map((m, i) => (
        <g key={m}>
          <rect
            x={i * WHITE_W + 0.5}
            y={0}
            width={WHITE_W - 1}
            height={WHITE_H}
            rx={2.5}
            fill={on.has(m) ? "#d9202b" : inRange(m) ? "url(#key-white)" : "url(#key-white-off)"}
          />
          {(on.has(m) || m % 12 === 0) && (
            <text
              x={i * WHITE_W + WHITE_W / 2}
              y={WHITE_H - 7}
              textAnchor="middle"
              fontSize={9}
              fontWeight={600}
              fill={on.has(m) ? "#fff" : "#5b5b5b"}
            >
              {m % 12 === 0 ? `C${Math.floor(m / 12) - 1}` : noteName(m)}
            </text>
          )}
        </g>
      ))}
      {blacks.map((m) => {
        const whiteIndex = whites.filter((w) => w < m).length;
        return (
          <rect
            key={m}
            x={whiteIndex * WHITE_W - BLACK_W / 2}
            y={0}
            width={BLACK_W}
            height={BLACK_H}
            rx={2}
            fill={on.has(m) ? "#ff4d57" : inRange(m) ? "url(#key-black)" : "url(#key-black-off)"}
          />
        );
      })}
    </svg>
  );
}
