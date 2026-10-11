"use client";

import Link from "next/link";
import { BottomSheet } from "./BottomSheet";
import { Control, db, percent } from "./FxControl";
import { usePlayer } from "@/lib/player-store";
import { FX_DEFAULT, FX_PRESETS, type FxSettings } from "@/lib/fx";
import { setDrumKit, setDrumSync, setDrumVariant, setEffects } from "@/lib/engine";
import { KIT_VARIANTS } from "@/lib/drums";
import { cn } from "@/lib/utils";

// Slider steps like 0.2 produce values such as 1.2000000000000002, so compare with a tolerance.
const same = (a: FxSettings, b: FxSettings) =>
  (Object.keys(a) as (keyof FxSettings)[]).every((k) => Math.abs(a[k] - b[k]) < 0.001);
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
  const kitOn = usePlayer((s) => s.drumKitOn);
  const sync = usePlayer((s) => s.drumSync);
  const variant = usePlayer((s) => s.drumVariant);
  const synthKeys = usePlayer((s) => s.drumSynthKeys);

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
        <Group title="Drums">
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 py-1">
            <span className="text-sm">Recorded drum samples</span>
            <input
              type="checkbox"
              checked={kitOn}
              onChange={(e) => setDrumKit(e.target.checked)}
              className="size-5 accent-[#ff4d57]"
            />
          </label>
          {kitOn && (
            <>
              <div role="group" aria-label="Drum kit" className="flex flex-wrap gap-2 pb-1">
                {KIT_VARIANTS.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setDrumVariant(v.id)}
                    aria-pressed={variant === v.id}
                    className={cn(
                      "h-10 rounded-lg px-3 text-sm",
                      variant === v.id ? "bg-white/12 text-white" : "bg-black/30 text-muted-foreground hover:text-white",
                    )}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <p className="pb-2 text-xs text-muted-foreground">
                {KIT_VARIANTS.find((v) => v.id === variant)?.note}
                {variant !== "muldjord" && " Hi-hat and cymbals still come from the Muldjord kit."}
              </p>
              <Control
                label="Timing of recorded instruments"
                value={sync}
                display={`${sync > 0 ? "+" : ""}${sync} ms`}
                min={-200}
                max={200}
                step={5}
                onChange={setDrumSync}
              />
              <p className="pb-2 text-xs text-muted-foreground">
                If the recorded drums or bass sound early or late against the rest, move this.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    onClose();
                    usePlayer.getState().set({ drumMixerOpen: true });
                  }}
                  className="flex h-11 flex-1 items-center justify-center rounded-xl bg-white/10 text-sm font-medium hover:bg-white/15"
                >
                  Open drum mixer
                </button>
                <Link
                  href="/drums"
                  className="flex h-11 flex-1 items-center justify-center rounded-xl bg-white/10 text-sm font-medium hover:bg-white/15"
                >
                  Drum mixer page
                </Link>
              </div>
            </>
          )}
          {kitOn && synthKeys.length > 0 && (
            <p className="pt-2 text-xs text-muted-foreground">
              Not in the sampled kit, so the synth plays them: {synthKeys.join(", ")}.
            </p>
          )}
          <p className="pt-2 text-xs text-muted-foreground">
            Drum samples: MuldjordKit by Lars Muldjord, mapped by kinwie, CC BY 4.0.
          </p>
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
