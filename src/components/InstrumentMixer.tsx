"use client";

import { Icon } from "@iconify/react";
import { Control, db, pan, percent } from "./FxControl";
import { usePlayer } from "@/lib/player-store";
import { INSTRUMENTS, INSTRUMENT_PRESETS, INST_FLAT, sameMix, type InstId, type InstSettings } from "@/lib/instruments";
import {
  applyInstrumentPreset,
  resetInstruments,
  revertInstruments,
  saveInstrumentMix,
  setInstrument,
  setSampled,
} from "@/lib/engine";
import { cn } from "@/lib/utils";

function Strip({ id, label, amp }: { id: InstId; label: string; amp: boolean }) {
  const fx = usePlayer((s) => s.inst[id]);
  const set = (patch: Partial<typeof fx>) => setInstrument(id, patch);
  const muted = fx.mute > 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h4 className={cn("font-semibold", muted && "text-muted-foreground line-through")}>{label}</h4>
        <button
          onClick={() => set({ mute: muted ? 0 : 1 })}
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
      </div>
      <div className="flex flex-wrap gap-2 pb-1 pt-2">
        {INSTRUMENT_PRESETS[id].map((p) => {
          const target = { ...INST_FLAT, ...p.fx, level: fx.level, mute: fx.mute };
          const active = (Object.keys(target) as (keyof InstSettings)[]).every((k) => Math.abs(target[k] - fx[k]) < 0.001);
          return (
            <button
              key={p.id}
              onClick={() => applyInstrumentPreset(id, p.id)}
              aria-pressed={active}
              className={cn(
                "h-9 rounded-lg px-3 text-sm",
                active ? "bg-white/12 text-white" : "bg-black/30 text-muted-foreground hover:text-white",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <Control
        label="Level"
        value={fx.level}
        display={percent(fx.level)}
        min={0}
        max={1.5}
        step={0.05}
        onChange={(v) => set({ level: v })}
      />
      <details>
        <summary className="flex h-9 cursor-pointer items-center text-xs text-muted-foreground hover:text-white">
          {amp ? "Amp, " : ""}pitch, pan, EQ, compressor, reverb
        </summary>
        {amp && (
          <>
        <Control
          label="Drive"
          value={fx.drive}
          display={fx.drive === 0 ? "Off" : percent(fx.drive)}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => set({ drive: v })}
        />
        <Control
          label="Tone"
          value={fx.tone}
          display={`${Math.round(800 * 2 ** (fx.tone * 4.5))} Hz`}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => set({ tone: v })}
        />
          </>
        )}
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
      </details>
    </div>
  );
}

// Mixer for the instruments of the open song that can play from recordings: level, pitch, pan, EQ, compressor and
// reverb. Changes are heard at once, also while the song plays, and are only kept after Save.
export function InstrumentMixer() {
  const tracks = usePlayer((s) => s.tracks);
  const sampledOn = usePlayer((s) => s.sampledOn);
  const active = usePlayer((s) => s.instActive);
  const inst = usePlayer((s) => s.inst);
  const saved = usePlayer((s) => s.instSaved);

  const present = INSTRUMENTS.filter((i) => tracks.some((t) => !t.percussion && i.programs.includes(t.program)));
  const dirty = saved !== null && !sameMix(inst, saved);

  if (present.length === 0)
    return <p className="px-2 py-6 text-center text-sm text-muted-foreground">This song has no instrument that can play from recordings.</p>;

  return (
    <div className="space-y-4">
      {present.map((i) => (
        <section key={i.id} className="rounded-2xl border border-white/8 bg-white/4 px-4 pb-2 pt-3">
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
            <span className="text-sm">Recorded {i.label.toLowerCase()} samples</span>
            <input
              type="checkbox"
              checked={sampledOn[i.id]}
              onChange={(e) => setSampled(i.id, e.target.checked)}
              className="size-5 accent-[#ff4d57]"
            />
          </label>
          {sampledOn[i.id] && active.includes(i.id) && <Strip id={i.id} label={i.label} amp={i.amp} />}
          {sampledOn[i.id] && !active.includes(i.id) && (
            <p className="py-2 text-xs text-muted-foreground">Loading {i.label.toLowerCase()} samples...</p>
          )}
          <p className="pb-1 pt-2 text-xs text-muted-foreground">{i.credit}</p>
        </section>
      ))}

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
          <button onClick={resetInstruments} className="h-10 rounded-lg bg-white/10 px-3 text-sm hover:bg-white/15">
            Reset
          </button>
          <button
            onClick={revertInstruments}
            disabled={!dirty}
            className="h-10 rounded-lg bg-white/10 px-3 text-sm hover:bg-white/15 disabled:opacity-40"
          >
            Revert
          </button>
          <button
            onClick={saveInstrumentMix}
            disabled={!dirty}
            className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-[#ee3340] disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
