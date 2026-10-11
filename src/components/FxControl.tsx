"use client";

import { Slider } from "@/components/ui/slider";

export const db = (v: number) => `${v > 0 ? "+" : ""}${v} dB`;
export const percent = (v: number) => `${Math.round(v * 100)}%`;
export const pan = (v: number) =>
  Math.abs(v) < 0.025 ? "Center" : `${v < 0 ? "L" : "R"} ${Math.round(Math.abs(v) * 100)}`;

// A labelled slider with its current value on the right, shared by the sound dialog and the drum mixer.
export function Control({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1 py-2">
      <div className="flex items-baseline justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">{display}</span>
      </div>
      <Slider
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => onChange(+(Array.isArray(v) ? v[0] : v).toFixed(2))}
      />
    </div>
  );
}
