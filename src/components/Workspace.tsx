"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { Icon } from "@iconify/react";
import { useProfile } from "./AccountPanel";
import { BottomSheet } from "./BottomSheet";
import { SidebarBody } from "./Sidebar";
import { Transport } from "./Transport";
import { InstrumentPanels } from "./InstrumentPanels";
import { InstrumentToggles } from "./InstrumentToggles";
import { usePlayer } from "@/lib/player-store";
import { destroyEngine, initEngine, loadFile, togglePlay } from "@/lib/engine";
import { refreshSongs, saveSong } from "@/lib/songbook";
import { useCompact } from "@/lib/use-compact";
import { cn } from "@/lib/utils";

const ACCEPT = ".gp,.gp3,.gp4,.gp5,.gpx,.gp7,.gp8,.musicxml,.mxl,.xml";

export function Workspace() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const compact = useCompact();
  // Two separate flags: the desktop sidebar starts open, the phone sheet starts closed even after a rotation.
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  useProfile(true);
  const status = usePlayer((s) => s.status);
  const error = usePlayer((s) => s.error);
  const fileName = usePlayer((s) => s.fileName);
  const title = usePlayer((s) => s.title);
  const hasTracks = usePlayer((s) => s.tracks.length > 0);
  const soundReady = usePlayer((s) => s.soundReady);
  const soundProgress = usePlayer((s) => s.soundProgress);

  useEffect(() => {
    if (!containerRef.current || !viewportRef.current) return;
    let cancelled = false;
    initEngine(containerRef.current, viewportRef.current).catch((e) => {
      // Release the splash too, otherwise a failed start would hide the error behind it.
      if (!cancelled) usePlayer.getState().set({ status: "error", error: String(e.message ?? e), engineReady: true });
    });
    return () => {
      cancelled = true;
      destroyEngine();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.code === "Space" && !["INPUT", "BUTTON", "TEXTAREA", "SELECT"].includes(tag)) {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    const data = await file.arrayBuffer();
    loadFile(file.name, data);
    // Keep a copy in the songbook. Storage can be blocked (private mode), and that must not stop playback.
    saveSong(file.name, data.slice(0))
      .then(refreshSongs)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshSongs();
  }, []);

  return (
    <div className="flex h-dvh gap-0 p-2 md:gap-2">
      {compact ? (
        <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Menu">
          <div className="pb-2">
            <SidebarBody
              showLogo={false}
              onPick={() => setSheetOpen(false)}
              onOpenFile={() => {
                setSheetOpen(false);
                inputRef.current?.click();
              }}
            />
          </div>
        </BottomSheet>
      ) : (
        <AnimatePresence initial={false}>
          {desktopOpen && (
            <motion.aside
              key="sidebar"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 288, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", duration: 0.4, bounce: 0 }}
              className="shrink-0 overflow-hidden rounded-2xl bg-sidebar"
            >
              <div className="h-full w-72 p-3">
                <SidebarBody
                  onOpenFile={() => inputRef.current?.click()}
                  onCollapse={() => setDesktopOpen(false)}
                />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        aria-label="Pilih file Guitar Pro"
        onChange={(e) => {
          openFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <main
        ref={mainRef}
        className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          openFile(e.dataTransfer.files[0]);
        }}
      >
        {/* Dark fade under the pills, same reason as the transport: glass and white text need a dark backdrop. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-card from-30% via-card/70 to-transparent" />

        {/* Floating glass pills over the score: title on the left, instrument toggles on the right. */}
        <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-2 md:p-3">
          <div className="glass pointer-events-auto flex h-12 min-w-0 items-center gap-1 rounded-full pl-1.5 pr-4">
            {/* Menu button: opens the bottom sheet on phones, shows or hides the sidebar on desktop. */}
            <button
              onClick={() => (compact ? setSheetOpen(true) : setDesktopOpen((v) => !v))}
              aria-label={compact ? "Buka menu" : desktopOpen ? "Ciutkan sidebar" : "Buka sidebar"}
              aria-expanded={compact ? sheetOpen : desktopOpen}
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-white/80 hover:bg-white/10"
            >
              <Icon icon={compact ? "solar:hamburger-menu-linear" : "solar:sidebar-minimalistic-linear"} width={22} />
            </button>
            <h1 className="min-w-0 truncate pl-1 text-base font-semibold md:pl-2">
              {title || fileName || "Belum ada file"}
            </h1>
          </div>
          {(hasTracks || (status === "ready" && !soundReady)) && (
            <div className="glass pointer-events-auto flex h-12 shrink-0 items-center gap-2 rounded-full px-2">
              {status === "ready" && !soundReady && (
                <span className="hidden pl-2 text-sm text-white/80 sm:inline">
                  Memuat suara {Math.round(soundProgress * 100)}%
                </span>
              )}
              <InstrumentToggles />
            </div>
          )}
        </header>

        <div ref={viewportRef} className="thin-scroll relative min-h-0 flex-1 overflow-auto px-2 pb-44 pt-[4.5rem] md:px-8 md:pb-[17rem]">
          <div
            className={cn(
              "mx-auto max-w-[1100px] rounded-xl bg-paper p-2 text-black md:p-4",
              // alphaTab needs a visible, laid-out container to render, so only hide it when nothing is loaded.
              (status === "empty" || status === "error") && "hidden",
            )}
          >
            <div ref={containerRef} />
          </div>

          {status === "empty" && (
            <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-4 text-center">
              <Icon icon="solar:music-library-2-linear" width={48} className="text-muted-foreground" />
              <h2 className="text-xl font-semibold">Buka file Guitar Pro</h2>
              <p className="text-muted-foreground">
                Tarik file ke sini atau pilih dari komputer. Format: .gp, .gp5, .gpx, dan MusicXML.
              </p>
              <button
                onClick={() => inputRef.current?.click()}
                className="flex h-11 items-center gap-2 rounded-full bg-primary px-6 font-semibold text-white hover:bg-[#ee3340]"
              >
                <Icon icon="solar:folder-open-linear" width={20} /> Pilih file
              </button>
            </div>
          )}

          {status === "loading" && (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-card text-muted-foreground"
              role="status"
            >
              <Image
                src="/logo.png"
                alt=""
                width={320}
                height={320}
                priority
                className="size-52 animate-pulse mix-blend-screen md:size-64"
              />
              <p className="max-w-[80%] truncate">Membaca {fileName}</p>
            </div>
          )}

          {status === "error" && (
            <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-3 text-center" role="alert">
              <Icon icon="solar:danger-circle-linear" width={44} className="text-destructive" />
              <h2 className="text-xl font-semibold">File tidak bisa dibuka</h2>
              <p className="text-muted-foreground">{error}</p>
              <p className="text-sm text-muted-foreground">
                Jika file dari Guitar Pro 8, coba simpan ulang sebagai .gp5 dari aplikasinya, lalu buka lagi.
              </p>
              <button
                onClick={() => inputRef.current?.click()}
                className="mt-1 flex h-11 items-center gap-2 rounded-full bg-secondary px-6 font-semibold hover:bg-white/15"
              >
                Pilih file lain
              </button>
            </div>
          )}
        </div>

        {dragging && (
          <div className="absolute inset-2 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-black/60 text-lg font-semibold">
            Lepas file di sini
          </div>
        )}

        {/* Dark fade under the transport: the glass needs something dark behind it, and white labels need the contrast. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-36 bg-gradient-to-t from-card from-35% via-card/70 to-transparent" />

        <InstrumentPanels bounds={mainRef} />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 px-3 pb-3">
          <Transport />
        </div>
      </main>
    </div>
  );
}
