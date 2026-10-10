"use client";

import { useState } from "react";
import Image from "next/image";
import { Icon } from "@iconify/react";
import { AccountPanel } from "./AccountPanel";
import { SongbookPanel } from "./SongbookPanel";
import { TrackList } from "./TrackList";
import { cn } from "@/lib/utils";

// Shared by the desktop sidebar and the mobile bottom sheet.
const TABS = [
  { id: "tracks", label: "Track", icon: "solar:music-notes-linear" },
  { id: "songbook", label: "Songbook", icon: "solar:music-library-2-linear" },
] as const;

export function SidebarBody({
  onOpenFile,
  onCollapse,
  onPick,
  showLogo = true,
}: {
  onOpenFile: () => void;
  onCollapse?: () => void;
  onPick?: () => void;
  showLogo?: boolean;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("tracks");
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {showLogo && (
        <div className="relative flex justify-center">
          {/* The logo has a solid black background; screen blending drops it so only the white and red show. */}
          <Image
            src="/logo.png"
            alt="BackToRock"
            width={240}
            height={240}
            priority
            className="h-32 w-auto mix-blend-screen"
          />
          {onCollapse && (
            <button
              onClick={onCollapse}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className="absolute right-0 top-0 flex size-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-white/10 hover:text-white"
            >
              <Icon icon="solar:sidebar-minimalistic-linear" width={22} />
            </button>
          )}
        </div>
      )}

      <button
        onClick={onOpenFile}
        className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-primary font-semibold text-white transition-colors hover:bg-[#ee3340]"
      >
        <Icon icon="solar:folder-open-linear" width={20} /> Open file
      </button>

      <div className="flex shrink-0 rounded-full bg-black/30 p-1" role="tablist" aria-label="Sidebar sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex h-10 flex-1 items-center justify-center gap-2 rounded-full text-sm font-medium transition-colors",
              tab === t.id ? "bg-white/12 text-white" : "text-muted-foreground hover:text-white",
            )}
          >
            <Icon icon={t.icon} width={18} />
            {t.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className="thin-scroll min-h-0 flex-1 overflow-y-auto"
      >
        {tab === "tracks" ? <TrackList /> : <SongbookPanel onPick={() => { setTab("tracks"); onPick?.(); }} />}
      </div>

      <AccountPanel />
    </div>
  );
}
