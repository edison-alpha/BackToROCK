import type { Metadata } from "next";
import { DrumStudio } from "@/components/DrumStudio";

export const metadata: Metadata = { title: "Drum mixer - BackToRock" };

export default function DrumsPage() {
  return <DrumStudio />;
}
