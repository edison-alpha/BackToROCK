"use client";

import { Icon } from "@iconify/react";
import { usePlayer } from "@/lib/player-store";
import { INSTRUMENT_ICONS } from "@/lib/instrument-icons";
import { Slider } from "@/components/ui/slider";
import { selectTrack, setMute, setSolo, setTrackVolume } from "@/lib/engine";
import { cn } from "@/lib/utils";

const ICONS = {
  piano: INSTRUMENT_ICONS.piano,
  guitar: INSTRUMENT_ICONS.guitar,
  bass: INSTRUMENT_ICONS.bass,
  drums: INSTRUMENT_ICONS.drums,
  other: "solar:music-note-2-linear",
} as const;

function trackIcon(t: { kind: keyof typeof ICONS }) {
  return ICONS[t.kind];
}

export function TrackList() {
  const tracks = usePlayer((s) => s.tracks);
  const selected = usePlayer((s) => s.selected);

  if (tracks.length === 0) {
    return <p className="px-3 text-sm text-muted-foreground">Tracks will appear once a file is open.</p>;
  }

  return (
    <ul className="flex flex-col gap-1">
      {tracks.map((t) => (
        <li key={t.index}>
          <div
            className={cn(
              "flex items-center gap-1 rounded-xl pr-1 transition-colors",
              selected === t.index ? "bg-sidebar-accent" : "hover:bg-white/5",
            )}
          >
            <button
              onClick={() => selectTrack(t.index)}
              aria-current={selected === t.index}
              className="flex min-h-11 flex-1 items-center gap-3 rounded-xl px-3 text-left"
            >
              <Icon icon={trackIcon(t)} width={20} className={selected === t.index ? "text-[#ff7b83]" : "text-muted-foreground"} />
              <span className={cn("truncate text-sm", selected === t.index ? "font-semibold text-white" : "text-[#d4d4d4]")}>
                {t.name}
              </span>
            </button>
            <button
              onClick={() => setMute(t.index, !t.muted)}
              aria-label={t.muted ? `Unmute ${t.name}` : `Mute ${t.name}`}
              aria-pressed={t.muted}
              className={cn(
                "flex size-11 items-center justify-center rounded-lg hover:bg-white/10",
                t.muted ? "text-[#f2a66b]" : "text-muted-foreground",
              )}
            >
              <Icon icon={t.muted ? "solar:volume-cross-linear" : "solar:volume-loud-linear"} width={20} />
            </button>
            <button
              onClick={() => setSolo(t.index, !t.solo)}
              aria-label={`Solo ${t.name}`}
              aria-pressed={t.solo}
              className={cn(
                "flex size-11 items-center justify-center rounded-lg hover:bg-white/10",
                t.solo ? "text-[#ff7b83]" : "text-muted-foreground",
              )}
            >
              <Icon icon="solar:headphones-round-linear" width={20} />
            </button>
          </div>
          <div className="px-4 pb-2 pt-1">
            <Slider
              aria-label={`Volume ${t.name}`}
              min={0}
              max={1.5}
              step={0.05}
              value={[t.gain]}
              onValueChange={(v) => setTrackVolume(t.index, Array.isArray(v) ? v[0] : v)}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
