"use client";

import { useState, type RefObject } from "react";
import { FloatingPanel } from "./FloatingPanel";
import { Fretboard } from "./Fretboard";
import { PianoKeyboard } from "./PianoKeyboard";
import { usePlayer, type InstrumentKind, type TrackInfo } from "@/lib/player-store";
import { INSTRUMENT_ICONS } from "@/lib/instrument-icons";

type PanelKind = "guitar" | "bass" | "piano";

const META: Record<PanelKind, { title: string; icon: string; position: string; prefer: InstrumentKind[] }> = {
  guitar: {
    title: "Gitar",
    icon: INSTRUMENT_ICONS.guitar,
    position: "bottom-40 left-3 md:bottom-[24rem]",
    prefer: ["guitar"],
  },
  bass: {
    title: "Bass",
    icon: INSTRUMENT_ICONS.bass,
    position: "bottom-40 left-3 md:bottom-[17rem]",
    prefer: ["bass"],
  },
  piano: {
    title: "Piano",
    icon: INSTRUMENT_ICONS.piano,
    position: "bottom-40 left-3 md:bottom-28",
    prefer: ["piano", "other"],
  },
};

// Every track can be picked in every panel; a view only works when the track fits it.
// Fretboards need a string tuning, the piano needs pitched notes (drums have none).
function supports(kind: PanelKind, t: TrackInfo) {
  return kind === "piano" ? t.kind !== "drums" : t.stringed;
}

function Panel({
  kind,
  bounds,
  open,
  onClose,
}: {
  kind: PanelKind;
  bounds: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
}) {
  const tracks = usePlayer((s) => s.tracks);
  const [picked, setPicked] = useState<number | null>(null);
  if (!open) return null;

  const meta = META[kind];
  const usable = tracks.filter((t) => supports(kind, t));
  // Start on the track that matches the panel (guitar for Gitar, ...), else the first one that works.
  const fallback = usable.find((t) => meta.prefer.includes(t.kind)) ?? usable[0];
  const current = usable.find((t) => t.index === picked) ?? fallback;

  return (
    <FloatingPanel
      title={meta.title}
      icon={meta.icon}
      bounds={bounds}
      headerExtra={
        tracks.length > 1 ? (
          <div className="flex items-center gap-1" role="group" aria-label={`Track untuk panel ${meta.title}`}>
            {tracks.map((t) => {
              const ok = supports(kind, t);
              const active = t.index === current?.index;
              return (
                <button
                  key={t.index}
                  onClick={() => setPicked(t.index)}
                  disabled={!ok}
                  aria-pressed={active}
                  title={ok ? t.name : `${t.name}: tidak didukung di tampilan ${meta.title}`}
                  className={`h-8 shrink-0 whitespace-nowrap rounded-lg px-3 text-sm disabled:cursor-not-allowed disabled:opacity-35 ${
                    active ? "bg-white/12 text-white" : "text-muted-foreground enabled:hover:text-white"
                  }`}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        ) : null
      }
      onClose={onClose}
      defaultWidth={kind === "piano" ? 880 : 760}
      className={meta.position}
    >
      {current ? (
        /* On a phone the board keeps a readable size and scrolls sideways; on desktop it scales to the panel width. */
        <div className="thin-scroll overflow-x-auto md:overflow-visible">
          <div className={kind === "piano" ? "min-w-[720px] md:min-w-0" : "min-w-[560px] md:min-w-0"}>
            {kind === "piano" ? (
              <PianoKeyboard trackIndex={current.index} />
            ) : (
              <Fretboard trackIndex={current.index} />
            )}
          </div>
        </div>
      ) : (
        <p className="px-2 py-6 text-center text-sm text-muted-foreground">
          Tidak ada track yang bisa ditampilkan di {meta.title.toLowerCase()} untuk lagu ini.
        </p>
      )}
    </FloatingPanel>
  );
}

export function InstrumentPanels({ bounds }: { bounds: RefObject<HTMLElement | null> }) {
  const hasTracks = usePlayer((s) => s.tracks.length > 0);
  const guitarOpen = usePlayer((s) => s.guitarOpen);
  const bassOpen = usePlayer((s) => s.bassOpen);
  const pianoOpen = usePlayer((s) => s.pianoOpen);
  const set = usePlayer((s) => s.set);
  if (!hasTracks) return null;

  return (
    <div className="pointer-events-none absolute inset-0">
      <Panel kind="guitar" bounds={bounds} open={guitarOpen} onClose={() => set({ guitarOpen: false })} />
      <Panel kind="bass" bounds={bounds} open={bassOpen} onClose={() => set({ bassOpen: false })} />
      <Panel kind="piano" bounds={bounds} open={pianoOpen} onClose={() => set({ pianoOpen: false })} />
    </div>
  );
}
