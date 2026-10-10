"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import { usePlayer } from "@/lib/player-store";
import { openSong, songLabel, songSize, type SongMeta } from "@/lib/songbook";

const SHOWN = 5;
const DATE = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" });

// Files saved in this browser, shown on the empty start screen so a song can be reopened without picking it again.
export function RecentSongs() {
  const songs = usePlayer((s) => s.songs);
  const [error, setError] = useState<string | null>(null);

  if (songs.length === 0) return null;

  const open = async (song: SongMeta) => {
    setError(null);
    try {
      await openSong(song);
    } catch {
      setError(`Could not open ${songLabel(song.name)}. Try opening the original file again.`);
    }
  };

  return (
    <section aria-labelledby="recent-heading" className="mt-4 w-full text-left">
      <h3 id="recent-heading" className="px-3 pb-1 text-sm font-medium text-muted-foreground">
        Recent
      </h3>
      {error && (
        <p role="alert" className="px-3 pb-1 text-sm text-[#ff7b83]">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-1">
        {songs.slice(0, SHOWN).map((song) => (
          <li key={song.id}>
            <button
              onClick={() => open(song)}
              className="flex min-h-14 w-full min-w-0 items-center gap-3 rounded-xl px-3 text-left hover:bg-white/5"
            >
              <Icon icon="solar:music-notes-linear" width={20} className="shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block truncate text-sm text-[#d4d4d4]">{songLabel(song.name)}</span>
                <span className="block text-xs text-muted-foreground">
                  {DATE.format(song.addedAt)} · {songSize(song.size)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
