"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { Slider } from "@/components/ui/slider";
import { DrumMixer } from "./DrumMixer";
import { GROOVES, disposePreview, initPreview, playGroove, setPreviewVariant, stopGroove } from "@/lib/drum-preview";
import { KIT_VARIANTS } from "@/lib/drums";
import { usePlayer } from "@/lib/player-store";
import { cn } from "@/lib/utils";

// The drum mixer on a page of its own, with built-in beats to listen to. While a song plays, the same mixer is in the
// Drums panel of the player.
export function DrumStudio() {
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [groove, setGroove] = useState(GROOVES[0].id);
  const [bpm, setBpm] = useState(GROOVES[0].bpm);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(1);
  const playingRef = useRef(false);
  const variant = usePlayer((s) => s.drumVariant);

  useEffect(() => {
    let cancelled = false;
    void initPreview().then((ok) => {
      if (!cancelled) setState(ok ? "ready" : "missing");
    });
    return () => {
      cancelled = true;
      disposePreview();
    };
  }, []);

  const start = (id: string, tempo: number) => {
    const g = GROOVES.find((x) => x.id === id);
    if (!g) return;
    playingRef.current = true;
    setPlaying(true);
    void playGroove(g, tempo, setProgress).then(() => setProgress(1));
  };
  const stop = () => {
    playingRef.current = false;
    setPlaying(false);
    stopGroove();
  };

  const pickVariant = (id: (typeof KIT_VARIANTS)[number]["id"]) => {
    setPreviewVariant(id);
    if (playingRef.current) start(groove, bpm);
  };

  const pickGroove = (id: string) => {
    const g = GROOVES.find((x) => x.id === id);
    if (!g) return;
    setGroove(id);
    setBpm(g.bpm);
    if (playingRef.current) start(id, g.bpm);
  };

  return (
    <main className="h-dvh overflow-y-auto overscroll-contain bg-background">
      <div className="mx-auto w-full max-w-5xl space-y-6 px-5 pb-24 pt-6">
        <Link
          href="/"
          className="flex min-h-11 w-fit items-center gap-2 rounded-xl pr-3 text-sm text-muted-foreground hover:text-white"
        >
          <Icon icon="solar:alt-arrow-left-linear" width={20} />
          Back to player
        </Link>

        <header className="space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">Drum mixer</h1>
          <p className="max-w-2xl text-muted-foreground">
            Set the level, pan, EQ, compressor and reverb of every drum, then press Save. To change them while a song
            plays, use the Drums panel in the player. Here you can listen with a built-in beat.
          </p>
        </header>

        {state === "missing" && (
          <p role="alert" className="rounded-xl bg-white/5 px-4 py-3 text-[#ff7b83]">
            The drum samples could not be loaded, so there is nothing to hear here. Check your connection and reload.
          </p>
        )}

        <section className="space-y-4 rounded-2xl border border-white/8 bg-white/4 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={playing ? stop : () => start(groove, bpm)}
              disabled={state !== "ready"}
              aria-label={playing ? "Stop beat" : "Play beat"}
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-white hover:bg-[#ee3340] disabled:opacity-40"
            >
              <Icon icon={playing ? "solar:stop-bold" : "solar:play-bold"} width={22} />
            </button>
            <div role="group" aria-label="Beat" className="flex flex-wrap rounded-xl bg-black/30 p-1">
              {GROOVES.map((g) => (
                <button
                  key={g.id}
                  onClick={() => pickGroove(g.id)}
                  aria-pressed={groove === g.id}
                  className={cn(
                    "h-10 rounded-lg px-3 text-sm",
                    groove === g.id ? "bg-white/12 text-white" : "text-muted-foreground hover:text-white",
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>
            {progress < 1 && (
              <span className="text-sm text-muted-foreground">Loading drums {Math.round(progress * 100)}%</span>
            )}
          </div>
          <div role="group" aria-label="Drum kit" className="flex flex-wrap rounded-xl bg-black/30 p-1 w-fit">
            {KIT_VARIANTS.map((v) => (
              <button
                key={v.id}
                onClick={() => pickVariant(v.id)}
                aria-pressed={variant === v.id}
                className={cn(
                  "h-10 rounded-lg px-3 text-sm",
                  variant === v.id ? "bg-white/12 text-white" : "text-muted-foreground hover:text-white",
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-sm tabular-nums">Tempo {bpm} bpm</span>
            <Slider
              aria-label="Tempo"
              min={60}
              max={220}
              step={1}
              value={[bpm]}
              onValueChange={(v) => setBpm(Array.isArray(v) ? v[0] : v)}
              onValueCommitted={(v) => {
                if (playingRef.current) start(groove, Array.isArray(v) ? v[0] : v);
              }}
            />
          </div>
        </section>

        <DrumMixer />

        <p className="text-xs text-muted-foreground">
          Drum samples: MuldjordKit by Lars Muldjord, mapped by kinwie, CC BY 4.0. Vortex kick, snare and toms: TMKD Vortex. Percussion the kit has no sample for
          (cowbell, tambourine and the like) stays on the synth and is set in the player.
        </p>
      </div>
    </main>
  );
}
