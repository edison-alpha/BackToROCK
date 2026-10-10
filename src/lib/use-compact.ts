import { useSyncExternalStore } from "react";

// Phones in portrait, and phones rotated sideways (touch plus a short screen). Tablets, laptops and desktops
// keep the side sidebar, even when they have a touch screen.
const QUERY = "(max-width: 767px), (pointer: coarse) and (max-height: 500px)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function useCompact() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => true, // server render: assume compact so a closed sheet, not an open sidebar, flashes first
  );
}
