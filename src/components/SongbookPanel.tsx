"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import { usePlayer } from "@/lib/player-store";
import { deleteSong, getSongData, refreshSongs, type SongMeta } from "@/lib/songbook";
import { loadFile } from "@/lib/engine";
import { cn } from "@/lib/utils";

const DATE = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" });

function label(name: string) {
  return name.replace(/\.[^.]+$/, "");
}

function size(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function SongbookPanel({ onPick }: { onPick: () => void }) {
  const songs = usePlayer((s) => s.songs);
  const state = usePlayer((s) => s.songsState);
  const current = usePlayer((s) => s.fileName);
  const [error, setError] = useState<string | null>(null);

  const open = async (song: SongMeta) => {
    setError(null);
    try {
      const data = await getSongData(song.id);
      if (!data) throw new Error();
      loadFile(song.name, data);
      onPick();
    } catch {
      setError(`Could not open ${label(song.name)}. Try opening the original file again.`);
    }
  };

  const remove = async (song: SongMeta) => {
    setError(null);
    try {
      await deleteSong(song.id);
      await refreshSongs();
    } catch {
      setError(`Could not delete ${label(song.name)}.`);
    }
  };

  if (state === "loading") {
    return <p className="px-3 text-sm text-muted-foreground">Loading songbook...</p>;
  }
  if (state === "error") {
    return (
      <p role="alert" className="px-3 text-sm text-[#ff7b83]">
        Songbook tidak bisa dibuka di browser ini. Mode privat sering memblokir penyimpanan.
      </p>
    );
  }
  if (songs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
        <Icon icon="solar:music-library-2-linear" width={36} className="text-muted-foreground" />
        <p className="font-medium">Songbook masih kosong</p>
        <p className="text-sm text-muted-foreground">
          Every file you open is saved here and stays in this browser only.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {error && (
        <p role="alert" className="px-3 pb-1 text-sm text-[#ff7b83]">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-1">
        {songs.map((song) => {
          const active = song.name === current;
          return (
            <li key={song.id}>
              <div className={cn("flex items-center rounded-xl pr-1", active ? "bg-sidebar-accent" : "hover:bg-white/5")}>
                <button
                  onClick={() => open(song)}
                  aria-current={active}
                  className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 text-left"
                >
                  <Icon
                    icon="solar:music-notes-linear"
                    width={20}
                    className={cn("shrink-0", active ? "text-[#ff7b83]" : "text-muted-foreground")}
                  />
                  <span className="min-w-0">
                    <span className={cn("block truncate text-sm", active ? "font-semibold text-white" : "text-[#d4d4d4]")}>
                      {label(song.name)}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {DATE.format(song.addedAt)} · {size(song.size)}
                    </span>
                  </span>
                </button>
                <button
                  onClick={() => remove(song)}
                  aria-label={`Delete ${label(song.name)} from songbook`}
                  title="Delete from songbook"
                  className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/10 hover:text-white"
                >
                  <Icon icon="solar:trash-bin-minimalistic-linear" width={20} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
