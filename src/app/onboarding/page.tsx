"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Icon } from "@iconify/react";
import { useAuth } from "@/lib/use-auth";
import { saveGuest } from "@/lib/guest";
import { INSTRUMENT_ICONS } from "@/lib/instrument-icons";
import { INSTRUMENTS, type Instrument } from "@/lib/profile";
import { cn } from "@/lib/utils";

const INFO: Record<Instrument, { title: string; icon: string }> = {
  gitar: { title: "Gitar", icon: INSTRUMENT_ICONS.guitar },
  bass: { title: "Bass", icon: INSTRUMENT_ICONS.bass },
  piano: { title: "Piano", icon: INSTRUMENT_ICONS.piano },
  drum: { title: "Drum", icon: INSTRUMENT_ICONS.drums },
};

export default function OnboardingPage() {
  const router = useRouter();
  const { status, data } = useAuth();
  const [picked, setPicked] = useState<Instrument | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Picking an instrument is the whole step: it saves right away and moves on.
  const choose = async (instrument: Instrument) => {
    if (picked) return;
    setPicked(instrument);
    setError(null);
    if (status !== "authenticated") {
      // Guests keep their choice in this browser.
      saveGuest({ instrument });
      router.replace("/");
      return;
    }
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instrument }),
      });
      if (!res.ok) throw new Error();
      router.replace("/");
    } catch {
      setError("Gagal menyimpan. Periksa koneksi lalu pilih lagi.");
      setPicked(null);
    }
  };

  if (status === "loading") {
    return (
      <main className="grid min-h-dvh place-items-center bg-background" role="status">
        <p className="text-muted-foreground">Memuat...</p>
      </main>
    );
  }

  const firstName = data?.user?.name?.split(" ")[0];

  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6">
      <div className="w-full max-w-2xl space-y-12 text-center">
        <header className="space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            {firstName ? `Halo ${firstName}, instrumen utamamu?` : "Instrumen utamamu?"}
          </h1>
          <p className="text-muted-foreground">Yang paling sering kamu mainkan.</p>
        </header>

        <div role="radiogroup" aria-label="Instrumen utama" className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-4">
          {INSTRUMENTS.map((i) => {
            const selected = picked === i;
            return (
              <button
                key={i}
                role="radio"
                aria-checked={selected}
                disabled={picked !== null && !selected}
                onClick={() => choose(i)}
                className="group flex flex-col items-center gap-3 rounded-xl p-2 disabled:opacity-30"
              >
                <motion.span
                  animate={{ scale: selected ? 1.15 : 1 }}
                  transition={{ type: "spring", duration: 0.3, bounce: 0.3 }}
                  className={cn(
                    "transition-colors",
                    selected ? "text-[#ff4d57]" : "text-white/55 group-hover:text-white",
                  )}
                >
                  <Icon icon={INFO[i].icon} width={84} height={84} />
                </motion.span>
                <span
                  className={cn(
                    "text-base font-semibold transition-colors",
                    selected ? "text-white" : "text-muted-foreground group-hover:text-white",
                  )}
                >
                  {INFO[i].title}
                </span>
              </button>
            );
          })}
        </div>

        <p role={error ? "alert" : "status"} className="min-h-6 text-sm text-[#ff7b83]">
          {error}
          {picked && !error && <span className="text-muted-foreground">Menyimpan...</span>}
        </p>

        {status === "unauthenticated" && !picked && (
          <Link
            href="/"
            onClick={() => saveGuest({ skipped: true })}
            className="inline-block rounded-lg px-3 py-2 text-sm text-muted-foreground underline-offset-4 hover:text-white hover:underline"
          >
            Lewati dulu
          </Link>
        )}
      </div>
    </main>
  );
}
