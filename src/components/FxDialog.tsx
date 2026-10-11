"use client";

import { Slider } from "@/components/ui/slider";
import { BottomSheet } from "./BottomSheet";
import { usePlayer } from "@/lib/player-store";
import { FX_DEFAULT, FX_PRESETS, type FxSettings } from "@/lib/fx";
import { DRUM_PIECES } from "@/lib/drums";
import { resetDrums, setDrumLevel, setEffects } from "@/lib/engine";
import { cn } from "@/lib/utils";

function Control({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1 py-2">
      <div className="flex items-baseline justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">{display}</span>
      </div>
      <Slider
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
      />
    </div>
  );
}

const db = (v: number) => `${v > 0 ? "+" : ""}${v} dB`;
const percent = (v: number) => `${Math.round(v * 100)}%`;
const same = (a: FxSettings, b: FxSettings) => (Object.keys(a) as (keyof FxSettings)[]).every((k) => a[k] === b[k]);

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="py-3">
      <h3 className="pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

// EQ, compressor and reverb for the whole mix (alphaTab outputs one mixed stream, so not per instrument), plus the
// level of each piece of the drum kit.
export function FxDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const fx = usePlayer((s) => s.fx);
  const drums = usePlayer((s) => s.drums);

  return (
    <BottomSheet open={open} onClose={onClose} title="Sound">
      <div className="divide-y divide-white/8 pb-2">
        <Group title="Preset">
          <div className="flex flex-wrap gap-2">
            {FX_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setEffects(p.fx)}
                aria-pressed={same(fx, p.fx)}
                className={cn(
                  "h-10 rounded-lg px-4 text-sm",
                  same(fx, p.fx) ? "bg-white/12 text-white" : "bg-black/30 text-muted-foreground hover:text-white",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </Group>
        <Group title="Equalizer">
          <Control label="Bass" value={fx.low} display={db(fx.low)} min={-12} max={12} step={1} onChange={(v) => setEffects({ low: v })} />
          <Control label="Mid" value={fx.mid} display={db(fx.mid)} min={-12} max={12} step={1} onChange={(v) => setEffects({ mid: v })} />
          <Control label="Treble" value={fx.high} display={db(fx.high)} min={-12} max={12} step={1} onChange={(v) => setEffects({ high: v })} />
        </Group>
        <Group title="Compressor">
          <Control
            label="Amount"
            value={fx.compressor}
            display={fx.compressor === 0 ? "Off" : percent(fx.compressor)}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => setEffects({ compressor: v })}
          />
        </Group>
        <Group title="Reverb">
          <Control
            label="Level"
            value={fx.reverb}
            display={fx.reverb === 0 ? "Off" : percent(fx.reverb)}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => setEffects({ reverb: v })}
          />
          <Control
            label="Room size"
            value={fx.room}
            display={`${fx.room.toFixed(1)} s`}
            min={0.4}
            max={5}
            step={0.2}
            onChange={(v) => setEffects({ room: v })}
          />
        </Group>
        <Group title="Drum kit">
          {DRUM_PIECES.map((p) => (
            <Control
              key={p.id}
              label={p.label}
              value={drums[p.id]}
              display={drums[p.id] === 0 ? "Mute" : percent(drums[p.id])}
              min={0}
              max={1.5}
              step={0.05}
              onChange={(v) => setDrumLevel(p.id, v)}
            />
          ))}
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-xs text-muted-foreground">
              Level per piece only. Changing it restarts the song at the same position.
            </p>
            <button
              onClick={resetDrums}
              className="h-10 shrink-0 rounded-lg bg-white/10 px-4 text-sm hover:bg-white/15"
            >
              Reset
            </button>
          </div>
        </Group>
        <div className="flex items-center justify-between gap-3 pt-3">
          <p className="text-xs text-muted-foreground">
            Applies to the whole mix and to playback only, not to exported files.
          </p>
          <button
            onClick={() => setEffects(FX_DEFAULT)}
            className="h-10 shrink-0 rounded-lg bg-white/10 px-4 text-sm hover:bg-white/15"
          >
            Reset
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
