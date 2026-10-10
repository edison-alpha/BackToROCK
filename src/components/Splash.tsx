"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { usePlayer } from "@/lib/player-store";

// Shown every time the app opens, and never shorter than this so it does not flash.
const MIN_MS = 1600;

export function Splash() {
  const engineReady = usePlayer((s) => s.engineReady);
  const onPlayer = usePathname() === "/";
  const [minElapsed, setMinElapsed] = useState(false);
  const [round, setRound] = useState(0);

  // (Re)start the minimum timer on first load, and again whenever the browser restores the page from its
  // back/forward cache or an installed app is brought back, so reopening the app always shows the splash.
  useEffect(() => {
    const id = setTimeout(() => setMinElapsed(true), MIN_MS);
    return () => clearTimeout(id);
  }, [round]);

  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      setMinElapsed(false);
      setRound((r) => r + 1);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  // The score engine only starts on the player page; other pages (login, onboarding) just wait out the minimum.
  const visible = !(minElapsed && (engineReady || !onPlayer));

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="splash"
          role="status"
          aria-live="polite"
          aria-label="Memuat BackToRock"
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-background"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          <motion.div
            className="flex flex-1 items-center justify-center"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          >
            {/* The logo has a solid black background; screen blending drops it so only the white and red show. */}
            <Image
              src="/logo.png"
              alt="BackToRock"
              width={480}
              height={480}
              priority
              className="size-64 mix-blend-screen sm:size-80"
            />
          </motion.div>

          <p className="pb-8 text-sm text-muted-foreground">
            Powered by <span className="font-semibold text-foreground">Bayu Mukti</span>
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
