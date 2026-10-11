"use client";

import { Icon } from "@iconify/react";
import { Control, db, pan, percent } from "./FxControl";
import { usePlayer } from "@/lib/player-store";
import { drumKit } from "@/lib/drum-kit";
import { DRUM_PIECES, presetsFor, sameSettings, type DrumPiece } from "@/lib/drums";
import {
  applyDrumPreset,
  resetDrumSettings,
  revertDrumSettings,
  saveDrumSettings,
  setDrumFx,
  setDrumLevel,
  setDrumRoom,
  toggleDrumSolo,
} from "@/lib/engine";
import { cn } from "@/lib/utils";

// The General MIDI key played by a drum's Hit button.
const HIT_KEY: Partial<Record<DrumPiece, number>> = {
  kick: 36,
  snare: 38,
  tom1: 48,
  tom2: 47,
  tom3: 45,
  tom4: 41,
  hihat: 42,
  crashL: 49,
  crashR: 57,
  rideL: 59,
  rideR: 51,
  china: 52,
};

function Tone({ piece }: { piece: DrumPiece }) {
  const fx = usePlayer((s) => s.drumFx[piece]);
  const set = (patch: Partial<typeof fx>) => setDrumFx(piece, patch);
  return (
    <>
      <Control
        label="Pitch"
        value={fx.pitch}
        display={`${fx.pitch > 0 ? "+" : ""}${fx.pitch} st`}
        min={-12}
        max={12}
        step={0.5}
        onChange={(v) => set({ pitch: v })}
      />
      <Control label="Pan" value={fx.pan} display={pan(fx.pan)} min={-1} max={1} step={0.05} onChange={(v) => set({ pan: v })} />
      <Control label="Low" value={fx.low} display={db(fx.low)} min={-12} max={12} step={1} onChange={(v) => set({ low: v })} />
      <Control label="Mid" value={fx.mid} display={db(fx.mid)} min={-12} max={12} step={1} onChange={(v) => set({ mid: v })} />
      <Control label="High" value={fx.high} display={db(fx.high)} min={-12} max={12} step={1} onChange={(v) => set({ high: v })} />
      <Control
        label="Compressor"
        value={fx.comp}
        display={fx.comp === 0 ? "Off" : percent(fx.comp)}
        min={0}
        max={1}
        step={0.05}
        onChange={(v) => set({ comp: v })}
      />
      <Control
        label="Reverb"
        value={fx.reverb}
        display={fx.reverb === 0 ? "Off" : percent(fx.reverb)}
        min={0}
        max={1}
        step={0.05}
        onChange={(v) => set({ reverb: v })}
      />
    </>
  );
}

// One drum. In the compact layout (the panel over the player) only the level shows and the rest folds away.
function Strip({ piece, label, compact }: { piece: DrumPiece; label: string; compact: boolean }) {
  const level = usePlayer((s) => s.drums[piece]);
  const key = HIT_KEY[piece];
  const muted = usePlayer((s) => s.drumFx[piece].mute > 0);
  const soloed = usePlayer((s) => s.drumSolo.includes(piece));
  const levelControl = (
    <Control
      label="Level"
      value={level}
      display={level === 0 ? "Mute" : percent(level)}
      min={0}
      max={1.5}
      step={0.05}
      onChange={(v) => setDrumLevel(piece, v)}
    />
  );
  const hit = key !== undefined && (
    <button
      onClick={() => void drumKit.audition(key, 105)}
      aria-label={`Play a ${label} hit`}
      className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-sm hover:bg-white/15"
    >
      <Icon icon="solar:play-bold" width={14} /> Hit
    </button>
  );

  return (
    <section className="rounded-2xl border border-white/8 bg-white/4 px-4 pb-2 pt-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className={cn("font-semibold", muted && "text-muted-foreground line-through")}>{label}</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setDrumFx(piece, { mute: muted ? 0 : 1 })}
            aria-pressed={muted}
            aria-label={`Mute ${label}`}
            title="Mute"
            className={cn(
              "size-9 rounded-lg text-sm font-semibold",
              muted ? "bg-[#ff4d57] text-white" : "bg-white/10 text-muted-foreground hover:text-white",
            )}
          >
            M
          </button>
          <button
            onClick={() => toggleDrumSolo(piece)}
            aria-pressed={soloed}
            aria-label={`Solo ${label}`}
            title="Solo"
            className={cn(
              "size-9 rounded-lg text-sm font-semibold",
              soloed ? "bg-[#f5c542] text-black" : "bg-white/10 text-muted-foreground hover:text-white",
            )}
          >
            S
          </button>
          {hit}
        </div>
      </div>
      {levelControl}
      {compact ? (
        <details>
          <summary className="flex h-9 cursor-pointer items-center text-xs text-muted-foreground hover:text-white">
            Pitch, pan, EQ, compressor, reverb
          </summary>
          <Tone piece={piece} />
        </details>
      ) : (
        <Tone piece={piece} />
      )}
    </section>
  );
}

// Level, pan, EQ, compressor and reverb of every drum, with presets and Save. Changes are heard at once, also while a
// song plays, and are only kept after Save.
export function DrumMixer({ compact = false }: { compact?: boolean }) {
  const drums = usePlayer((s) => s.drums);
  const drumFx = usePlayer((s) => s.drumFx);
  const room = usePlayer((s) => s.drumRoom);
  const saved = usePlayer((s) => s.drumSaved);
  const variant = usePlayer((s) => s.drumVariant);

  const current = { drums, drumFx, room };
  const dirty = saved !== null && !sameSettings(current, saved);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {presetsFor(variant).map((p) => {
          const active = sameSettings(current, { drums: p.levels, drumFx: p.fx, room });
          return (
            <button
              key={p.id}
              onClick={() => applyDrumPreset(p.id)}
              aria-pressed={active}
              className={cn(
                "h-10 rounded-lg px-4 text-sm",
                active ? "bg-white/12 text-white" : "bg-black/30 text-muted-foreground hover:text-white",
              )}
            >
              {p.label}
            </button>
          );
        })}
        <button onClick={resetDrumSettings} className="h-10 rounded-lg bg-white/10 px-4 text-sm hover:bg-white/15">
          Reset
        </button>
      </div>

      <div className="max-w-md">
        <Control
          label="Room size (reverb length)"
          value={room}
          display={`${room.toFixed(1)} s`}
          min={0.3}
          max={4}
          step={0.1}
          onChange={setDrumRoom}
        />
      </div>

      <div className={cn("grid gap-3", !compact && "md:grid-cols-2 lg:grid-cols-3")}>
        {DRUM_PIECES.filter((p) => p.id !== "other").map((p) => (
          <Strip key={p.id} piece={p.id} label={p.label} compact={compact} />
        ))}
      </div>

      <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#202020] px-3 py-2">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground" role="status">
          {dirty ? (
            "Unsaved changes"
          ) : (
            <>
              <Icon icon="solar:check-circle-bold" width={16} className="text-[#6fd08c]" /> Saved
            </>
          )}
        </span>
        <div className="flex gap-2">
          <button
            onClick={revertDrumSettings}
            disabled={!dirty}
            className="h-10 rounded-lg bg-white/10 px-4 text-sm hover:bg-white/15 disabled:opacity-40"
          >
            Revert
          </button>
          <button
            onClick={saveDrumSettings}
            disabled={!dirty}
            className="h-10 rounded-lg bg-primary px-5 text-sm font-semibold text-white hover:bg-[#ee3340] disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
