"use client";

import Avatar from "boring-avatars";

// Brand palette: red, light red, paper white and two neutrals.
const COLORS = ["#d9202b", "#ff7b83", "#f5f5f3", "#4a4a4a", "#1a1a1a"];

export function UserAvatar({ seed, size = 40 }: { seed: string; size?: number }) {
  return <Avatar name={seed} variant="beam" size={size} colors={COLORS} />;
}
