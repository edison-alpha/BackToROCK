"use client";

import { Icon } from "@iconify/react";
import { useShallow } from "zustand/react/shallow";
import { usePlayer } from "@/lib/player-store";
import { INSTRUMENT_ICONS } from "@/lib/instrument-icons";
import { cn } from "@/lib/utils";

export function InstrumentToggles() {
  const s = usePlayer(
    useShallow((st) => ({
      hasTracks: st.tracks.length > 0,
      guitarOpen: st.guitarOpen,
      bassOpen: st.bassOpen,
      pianoOpen: st.pianoOpen,
      set: st.set,
    })),
  );
  if (!s.hasTracks) return null;

  // On a phone only one panel fits above the transport, so opening one closes the others.
  const toggle = (key: "guitarOpen" | "bassOpen" | "pianoOpen") => {
    const open = !s[key];
    const phone = window.matchMedia("(max-width: 767px)").matches;
    s.set(phone ? { guitarOpen: false, bassOpen: false, pianoOpen: false, [key]: open } : { [key]: open });
  };

  const items = [
    { icon: INSTRUMENT_ICONS.guitar, label: "Panel gitar", on: s.guitarOpen, toggle: () => toggle("guitarOpen") },
    { icon: INSTRUMENT_ICONS.bass, label: "Panel bass", on: s.bassOpen, toggle: () => toggle("bassOpen") },
    { icon: INSTRUMENT_ICONS.piano, label: "Panel piano", on: s.pianoOpen, toggle: () => toggle("pianoOpen") },
  ];

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Instrument panels">
      {items.map((it) => (
        <button
          key={it.label}
          onClick={it.toggle}
          aria-label={it.label}
          aria-pressed={it.on}
          title={it.label}
          className={cn(
            "flex size-11 items-center md:size-10 justify-center rounded-full transition-colors",
            it.on ? "bg-primary/20 text-[#ff7b83]" : "text-white/80 hover:bg-white/10 hover:text-white",
          )}
        >
          <Icon icon={it.icon} width={22} />
        </button>
      ))}
    </div>
  );
}
