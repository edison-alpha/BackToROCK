"use client";

import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Icon } from "@iconify/react";
import { useShallow } from "zustand/react/shallow";
import { Slider } from "@/components/ui/slider";
import { BottomSheet } from "./BottomSheet";
import { ExportDialog } from "./ExportDialog";
import { FxDialog } from "./FxDialog";
import { usePlayer } from "@/lib/player-store";
import { formatTime } from "@/lib/music";
import { cn } from "@/lib/utils";
import { seek, setLooping, setMasterVolume, setMetronome, setSpeed, setZoom, togglePlay } from "@/lib/engine";

const SPEEDS = [0.5, 0.75, 1];

function IconBtn({
  icon,
  label,
  on,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  on?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={on}
      title={label}
      className={cn(
        "flex size-11 items-center justify-center rounded-xl transition-colors disabled:opacity-40",
        on ? "bg-primary/20 text-[#ff7b83]" : "text-white/80 hover:bg-white/10 hover:text-white",
      )}
    >
      <Icon icon={icon} width={22} />
    </button>
  );
}

function ActionBtn({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return <IconBtn icon={icon} label={label} onClick={onClick} />;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

// Playback options. Inline row on desktop, stacked inside the bottom sheet on a phone.
function Options({
  stacked,
  onExport,
  exportDisabled,
  onSound,
}: {
  stacked: boolean;
  onExport: () => void;
  exportDisabled: boolean;
  onSound: () => void;
}) {
  const s = usePlayer(
    useShallow((st) => ({
      speed: st.speed,
      masterVolume: st.masterVolume,
      zoom: st.zoom,
      looping: st.looping,
      metronome: st.metronome,
    })),
  );

  const speed = (
    <div className="flex items-center rounded-xl bg-black/30 p-1" role="group" aria-label="Speed">
      {SPEEDS.map((v) => (
        <button
          key={v}
          onClick={() => setSpeed(v)}
          aria-pressed={s.speed === v}
          className={cn(
            "h-10 min-w-11 rounded-lg px-2 text-sm tabular-nums",
            stacked && "flex-1",
            s.speed === v ? "bg-white/12 text-white" : "text-muted-foreground hover:text-white",
          )}
        >
          {Math.round(v * 100)}%
        </button>
      ))}
    </div>
  );

  const volume = (
    <div className={cn("flex items-center gap-2 px-1", stacked ? "w-full" : "w-28")}>
      <Icon
        icon={s.masterVolume === 0 ? "solar:volume-cross-linear" : "solar:volume-loud-linear"}
        width={20}
        className="shrink-0 text-muted-foreground"
      />
      <Slider
        aria-label="Master volume"
        min={0}
        max={1.5}
        step={0.05}
        value={[s.masterVolume]}
        onValueChange={(v) => setMasterVolume(Array.isArray(v) ? v[0] : v)}
      />
    </div>
  );

  const toggles = (
    <>
      <IconBtn icon="solar:repeat-linear" label="Loop song" on={s.looping} onClick={() => setLooping(!s.looping)} />
      <IconBtn icon="mdi:metronome" label="Metronom" on={s.metronome} onClick={() => setMetronome(!s.metronome)} />
    </>
  );

  const zoom = (
    <>
      <IconBtn
        icon="solar:magnifer-zoom-out-linear"
        label="Zoom out score"
        onClick={() => setZoom(Math.max(0.6, +(s.zoom - 0.1).toFixed(1)))}
      />
      <IconBtn
        icon="solar:magnifer-zoom-in-linear"
        label="Zoom in score"
        onClick={() => setZoom(Math.min(1.8, +(s.zoom + 0.1).toFixed(1)))}
      />
    </>
  );

  if (!stacked) {
    return (
      <div className="flex items-center gap-1">
        {speed}
        {volume}
        {toggles}
        {zoom}
        <IconBtn icon="solar:tuning-2-linear" label="Sound: EQ, compressor, reverb" onClick={onSound} />
        <IconBtn icon="solar:download-minimalistic-linear" label="Export audio" disabled={exportDisabled} onClick={onExport} />
      </div>
    );
  }

  return (
    <div className="divide-y divide-white/8">
      <Row label="Speed">{speed}</Row>
      <Row label="Master volume">{volume}</Row>
      <Row label="Practice">
        <div className="flex items-center gap-1">
          {toggles}
          <span className="px-2 text-sm text-muted-foreground">Loop and metronome</span>
        </div>
      </Row>
      <Row label={`Score size (${Math.round(s.zoom * 100)}%)`}>
        <div className="flex items-center gap-1">{zoom}</div>
      </Row>
      <Row label="Sound">
        <button
          onClick={onSound}
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-white/10 text-sm font-medium hover:bg-white/15"
        >
          <Icon icon="solar:tuning-2-linear" width={20} />
          EQ, compressor, reverb...
        </button>
      </Row>
      <Row label="Export">
        <button
          onClick={onExport}
          disabled={exportDisabled}
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-white/10 text-sm font-medium hover:bg-white/15 disabled:opacity-50"
        >
          <Icon icon="solar:download-minimalistic-linear" width={20} />
          Export audio...
        </button>
      </Row>
    </div>
  );
}

export function Transport() {
  const s = usePlayer(
    useShallow((st) => ({
      status: st.status,
      soundReady: st.soundReady,
      playing: st.playing,
      time: st.time,
      end: st.end,
    })),
  );
  const name = usePlayer((st) => st.title || st.fileName);
  const [collapsed, setCollapsed] = useState(false);
  const [sheet, setSheet] = useState(false);
  const disabled = s.status !== "ready" || !s.soundReady;
  const [exportOpen, setExportOpen] = useState(false);
  const [fxOpen, setFxOpen] = useState(false);

  const playButton = (size: string) => (
    <button
      onClick={togglePlay}
      disabled={disabled}
      aria-label={s.playing ? "Pause" : "Play"}
      className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-[#ee3340] disabled:opacity-40`}
    >
      <Icon icon={s.playing ? "solar:pause-bold" : "solar:play-bold"} width={22} />
    </button>
  );

  // Mini player, like a music app: play, what is playing, and a thin progress line.
  if (collapsed) {
    return (
      <motion.div
        layout layoutDependency={collapsed}
        transition={{ type: "spring", duration: 0.4, bounce: 0 }}
        style={{ borderRadius: 32 }}
        className="glass pointer-events-auto relative flex w-full max-w-sm flex-col gap-1 px-3 pb-2 pt-3"
      >
        <div className="flex items-center gap-3">
          {playButton("size-11")}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{name ?? "No file yet"}</p>
            <p className="text-xs text-white/70">{s.playing ? "Playing" : "Paused"}</p>
          </div>
          <IconBtn icon="solar:alt-arrow-up-linear" label="Expand player" onClick={() => setCollapsed(false)} />
        </div>
        {/* A real slider with a full-size touch area, kept in the layout (not pinned to the edge) so it can be dragged. */}
        <div className="flex items-center gap-3 px-1">
          <span className="w-9 shrink-0 text-right text-xs tabular-nums text-white/80">{formatTime(s.time)}</span>
          <Slider
            aria-label="Song position"
            min={0}
            max={Math.max(s.end, 1)}
            value={[Math.min(s.time, s.end)]}
            disabled={disabled}
            onValueChange={(v) => seek(Array.isArray(v) ? v[0] : v)}
          />
          <span className="w-9 shrink-0 text-xs tabular-nums text-white/80">{formatTime(s.end)}</span>
        </div>
      </motion.div>
    );
  }

  return (
    <>
      <motion.div
        layout layoutDependency={collapsed}
        transition={{ type: "spring", duration: 0.4, bounce: 0 }}
        style={{ borderRadius: 9999 }}
        className="glass pointer-events-auto flex w-full max-w-5xl items-center gap-2 px-3 py-2 md:gap-3"
      >
        {playButton("size-12")}
        <span className="w-10 shrink-0 text-right text-sm tabular-nums text-white/80">{formatTime(s.time)}</span>
        <Slider
          aria-label="Song position"
          min={0}
          max={Math.max(s.end, 1)}
          value={[Math.min(s.time, s.end)]}
          disabled={disabled}
          onValueChange={(v) => seek(Array.isArray(v) ? v[0] : v)}
        />
        <span className="w-10 shrink-0 text-sm tabular-nums text-white/80">{formatTime(s.end)}</span>

        {/* Desktop shows the options inline; on a phone they live behind the menu button. */}
        <div className="hidden md:block">
          <Options stacked={false} onExport={() => setExportOpen(true)} exportDisabled={disabled} onSound={() => setFxOpen(true)} />
        </div>
        <div className="md:hidden">
          <ActionBtn icon="solar:settings-linear" label="Player settings" onClick={() => setSheet(true)} />
        </div>
        <IconBtn icon="solar:alt-arrow-down-linear" label="Collapse player" onClick={() => setCollapsed(true)} />
      </motion.div>

      <BottomSheet open={sheet} onClose={() => setSheet(false)} title="Player settings">
        <Options
          stacked
          onExport={() => {
            setSheet(false);
            setExportOpen(true);
          }}
          exportDisabled={disabled}
          onSound={() => {
            setSheet(false);
            setFxOpen(true);
          }}
        />
      </BottomSheet>

      <FxDialog open={fxOpen} onClose={() => setFxOpen(false)} />
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </>
  );
}
