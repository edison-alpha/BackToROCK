"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { BottomSheet } from "./BottomSheet";
import { usePlayer } from "@/lib/player-store";
import { exportAudio, type ExportFormat, type ExportProgress } from "@/lib/engine";
import { formatTime } from "@/lib/music";
import { cn } from "@/lib/utils";

const FORMATS: { id: ExportFormat; label: string; note: string }[] = [
  { id: "mp3", label: "MP3", note: "Small file, plays everywhere" },
  { id: "wav", label: "WAV", note: "Lossless, large file" },
];
const QUALITIES = [128, 192, 320];
const WAV_BYTES_PER_SECOND = 44100 * 4;

type Phase =
  | { name: "idle" }
  | { name: "running"; progress: ExportProgress; startedAt: number; now: number }
  | { name: "done"; url: string; fileName: string; bytes: number; seconds: number }
  | { name: "error"; message: string };

function megabytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function baseName() {
  const { title, fileName } = usePlayer.getState();
  return (title || fileName || "backtorock").replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "-");
}

function save(url: string, fileName: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center rounded-xl bg-black/30 p-1" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          disabled={disabled}
          aria-pressed={value === o.id}
          className={cn(
            "h-10 flex-1 rounded-lg px-2 text-sm tabular-nums",
            value === o.id ? "bg-white/12 text-white" : "text-muted-foreground hover:text-white",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Export like a DAW bounce: choose the format, watch the mixdown progress, cancel if needed, save when done.
export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const end = usePlayer((s) => s.end);
  const [format, setFormat] = useState<ExportFormat>("mp3");
  const [kbps, setKbps] = useState(192);
  const [metronome, setMetronome] = useState(false);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const abort = useRef<AbortController | null>(null);
  const doneUrl = useRef<string | null>(null);

  const running = phase.name === "running";

  const discardResult = () => {
    if (doneUrl.current) URL.revokeObjectURL(doneUrl.current);
    doneUrl.current = null;
  };

  // Opening the dialog again starts from the settings, unless a mixdown is still going.
  useEffect(() => {
    if (!open || abort.current) return;
    discardResult();
    setPhase({ name: "idle" });
  }, [open]);

  useEffect(
    () => () => {
      abort.current?.abort();
      discardResult();
    },
    [],
  );

  const start = async () => {
    if (abort.current) return;
    const controller = new AbortController();
    abort.current = controller;
    const startedAt = Date.now();
    setPhase({
      name: "running",
      progress: { fraction: 0, renderedMs: 0, totalMs: end, stage: "Mixing down" },
      startedAt,
      now: startedAt,
    });
    try {
      const blob = await exportAudio({
        format,
        kbps,
        metronome,
        signal: controller.signal,
        onProgress: (progress) => setPhase({ name: "running", progress, startedAt, now: Date.now() }),
      });
      const fileName = `${baseName()}.${format}`;
      const url = URL.createObjectURL(blob);
      doneUrl.current = url;
      setPhase({ name: "done", url, fileName, bytes: blob.size, seconds: (Date.now() - startedAt) / 1000 });
      save(url, fileName);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") setPhase({ name: "idle" });
      else setPhase({ name: "error", message: e instanceof Error ? e.message : "Export failed" });
    } finally {
      abort.current = null;
    }
  };

  const estimate =
    format === "mp3" ? ((kbps * 1000) / 8) * (end / 1000) : WAV_BYTES_PER_SECOND * (end / 1000);

  return (
    // A running mixdown ignores outside taps and Esc; it only stops with Cancel.
    <BottomSheet open={open} onClose={() => !running && onClose()} title="Export audio">
      <div className="pb-2">
        {phase.name === "idle" || phase.name === "error" ? (
          <div className="divide-y divide-white/8">
            <div className="flex flex-col gap-2 py-3">
              <span className="text-sm text-muted-foreground">Format</span>
              <Segmented label="Format" value={format} options={FORMATS} onChange={setFormat} />
              <span className="text-xs text-muted-foreground">{FORMATS.find((f) => f.id === format)?.note}</span>
            </div>
            {format === "mp3" && (
              <div className="flex flex-col gap-2 py-3">
                <span className="text-sm text-muted-foreground">Quality</span>
                <Segmented
                  label="MP3 quality"
                  value={kbps}
                  options={QUALITIES.map((q) => ({ id: q, label: `${q} kbps` }))}
                  onChange={setKbps}
                />
              </div>
            )}
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 py-3">
              <span className="text-sm">Include metronome click</span>
              <input
                type="checkbox"
                checked={metronome}
                onChange={(e) => setMetronome(e.target.checked)}
                className="size-5 accent-[#ff4d57]"
              />
            </label>
            <p className="py-3 text-xs text-muted-foreground">
              The mix follows the Track panel: muted tracks stay silent, solo keeps only soloed tracks, and track and
              master volume apply. Sampled drums and instruments are included with their mixer settings. Playback
              speed and the master effects are not included.
            </p>
            {phase.name === "error" && (
              <p role="alert" className="py-3 text-sm text-[#ff7b83]">
                {phase.message}
              </p>
            )}
          </div>
        ) : null}

        {phase.name === "running" && <Mixdown phase={phase} />}

        {phase.name === "done" && (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Icon icon="solar:check-circle-bold" width={44} className="text-[#6fd08c]" />
            <p className="font-semibold">Export complete</p>
            <p className="max-w-full truncate text-sm text-muted-foreground">{phase.fileName}</p>
            <p className="text-sm text-muted-foreground">
              {megabytes(phase.bytes)} · mixed in {phase.seconds.toFixed(1)} s
            </p>
          </div>
        )}

        <div className="flex gap-2 pt-3">
          {phase.name === "running" ? (
            <button
              onClick={() => abort.current?.abort()}
              className="h-12 flex-1 rounded-xl bg-white/10 font-semibold hover:bg-white/15"
            >
              Cancel
            </button>
          ) : phase.name === "done" ? (
            <>
              <button
                onClick={() => save(phase.url, phase.fileName)}
                className="h-12 flex-1 rounded-xl bg-white/10 font-semibold hover:bg-white/15"
              >
                Save again
              </button>
              <button
                onClick={onClose}
                className="h-12 flex-1 rounded-xl bg-primary font-semibold text-white hover:bg-[#ee3340]"
              >
                Done
              </button>
            </>
          ) : (
            <button
              onClick={start}
              disabled={end <= 0}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-white hover:bg-[#ee3340] disabled:opacity-50"
            >
              <Icon icon="solar:download-minimalistic-linear" width={20} />
              Export {format.toUpperCase()}
              {end > 0 && <span className="font-normal text-white/80">· about {megabytes(estimate)}</span>}
            </button>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}

function Mixdown({ phase }: { phase: Extract<Phase, { name: "running" }> }) {
  const { progress, startedAt, now } = phase;
  const percent = Math.round(progress.fraction * 100);
  const elapsed = (now - startedAt) / 1000;
  // Speed relative to the song length, like a DAW's "x realtime", across every stage of the export.
  const speed = elapsed > 0.5 ? (progress.fraction * progress.totalMs) / 1000 / elapsed : 0;
  const remaining =
    progress.fraction > 0.02 && elapsed > 0.5 ? (elapsed / progress.fraction) * (1 - progress.fraction) : null;

  return (
    <div className="flex flex-col gap-3 py-6">
      <div className="flex items-baseline justify-between">
        <p className="font-semibold">{progress.stage}...</p>
        <p className="text-2xl font-extrabold tabular-nums">{percent}%</p>
      </div>
      <div
        role="progressbar"
        aria-label="Mixdown progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-3 overflow-hidden rounded-full bg-white/10"
      >
        <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${percent}%` }} />
      </div>
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs tabular-nums text-muted-foreground">
        <span>
          {formatTime(progress.renderedMs)} of {formatTime(progress.totalMs)} rendered
        </span>
        <span>
          Elapsed {elapsed.toFixed(0)} s
          {remaining !== null && ` · about ${Math.max(1, Math.round(remaining))} s left`}
          {speed > 0 && ` · ${speed.toFixed(1)}× realtime`}
        </span>
      </div>
    </div>
  );
}
