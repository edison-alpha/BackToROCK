export const INSTRUMENTS = ["gitar", "bass", "piano", "drum"] as const;

export type Instrument = (typeof INSTRUMENTS)[number];

export type Profile = { instrument: Instrument };

export function isProfile(v: unknown): v is Profile {
  if (!v || typeof v !== "object") return false;
  return INSTRUMENTS.includes((v as Record<string, unknown>).instrument as Instrument);
}
