const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function noteName(midi: number) {
  return NAMES[((midi % 12) + 12) % 12];
}

export function isBlack(midi: number) {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}

export function formatTime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
