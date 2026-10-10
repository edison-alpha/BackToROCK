"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { cn } from "@/lib/utils";

type Lang = "en" | "id";
type Section = { icon: string; title: string; steps: string[] };

const KEY = "btr_lang";

const COPY: Record<
  Lang,
  { back: string; title: string; intro: string; sections: Section[]; tipTitle: string; tips: string[] }
> = {
  en: {
    back: "Back to player",
    title: "How to use BackToRock",
    intro: "BackToRock plays Guitar Pro tablature so you can practice along. Everything runs in your browser.",
    sections: [
      {
        icon: "solar:folder-open-linear",
        title: "1. Open a song",
        steps: [
          "Tap Choose file (or Open file in the menu) and pick a .gp, .gp3, .gp4, .gp5, .gpx, .gp7, .gp8, MusicXML or .zip file.",
          "On a computer you can also drag a file onto the player.",
          "Songs you opened before are listed under Recent on the start screen and in the Songbook tab. Tap one to open it again.",
        ],
      },
      {
        icon: "solar:play-bold",
        title: "2. Play and navigate",
        steps: [
          "Press Play to start. The same button turns into Pause while the song is playing.",
          "Drag the position slider to jump to another part of the song.",
          "The arrow on the right collapses the player into a small bar, and expands it again.",
        ],
      },
      {
        icon: "solar:settings-linear",
        title: "3. Practice settings",
        steps: [
          "Speed: slow the song down to 75% or 50% to learn a hard passage.",
          "Master volume: change the overall loudness.",
          "Loop song repeats the song, and the metronome gives you a click to play along with.",
          "Zoom buttons make the score smaller or larger.",
          "On a phone these live behind the gear button. On larger screens they sit in the player bar.",
        ],
      },
      {
        icon: "solar:music-notes-linear",
        title: "4. Tracks",
        steps: [
          "Open the menu (the three lines at the top left) and choose the Track tab.",
          "Tap a track to show its notation. Use the speaker button to mute it and the headphones button to hear only that track (solo).",
          "Each track has its own volume slider, so you can turn down the part you want to play yourself.",
        ],
      },
      {
        icon: "solar:music-library-2-linear",
        title: "5. Guitar, bass and piano panels",
        steps: [
          "Use the instrument buttons at the top right to show a fretboard or keyboard that lights up the notes being played.",
          "Drag a panel by its title to move it, and drag the corner to resize it.",
          "If the song has several tracks, pick which one a panel follows from the track buttons in its header.",
        ],
      },
      {
        icon: "solar:user-circle-linear",
        title: "6. Your instrument and account",
        steps: [
          "Tap your name at the bottom of the menu to change your main instrument.",
          "Without an account, your choice and your songs are saved in this browser only.",
        ],
      },
    ],
    tipTitle: "Good to know",
    tips: [
      "Songs are stored on this device. They do not sync to other devices, and clearing the site data removes them.",
      "Private browsing and some in-app browsers block storage, so songs may not be saved there.",
      "You can install BackToRock from your browser menu (Add to Home Screen) and open it offline once it has loaded.",
      "A file from Guitar Pro 8 that will not open? Save it again as .gp5 from Guitar Pro and retry.",
    ],
  },
  id: {
    back: "Kembali ke pemutar",
    title: "Cara memakai BackToRock",
    intro:
      "BackToRock memutar tablature Guitar Pro supaya kamu bisa berlatih sambil bermain. Semuanya berjalan di browser kamu.",
    sections: [
      {
        icon: "solar:folder-open-linear",
        title: "1. Buka lagu",
        steps: [
          "Ketuk Choose file (atau Open file di menu) lalu pilih file .gp, .gp3, .gp4, .gp5, .gpx, .gp7, .gp8, MusicXML, atau .zip.",
          "Di komputer, kamu juga bisa menarik file langsung ke pemutar.",
          "Lagu yang pernah dibuka muncul di bagian Recent pada layar awal dan di tab Songbook. Ketuk salah satunya untuk membukanya lagi.",
        ],
      },
      {
        icon: "solar:play-bold",
        title: "2. Memutar dan berpindah posisi",
        steps: [
          "Tekan Play untuk mulai. Tombol yang sama berubah menjadi Pause saat lagu sedang diputar.",
          "Geser slider posisi untuk loncat ke bagian lain lagu.",
          "Panah di sisi kanan mengecilkan pemutar menjadi bar kecil, dan membukanya lagi.",
        ],
      },
      {
        icon: "solar:settings-linear",
        title: "3. Pengaturan latihan",
        steps: [
          "Speed: perlambat lagu ke 75% atau 50% untuk mempelajari bagian yang sulit.",
          "Master volume: atur kekerasan suara secara keseluruhan.",
          "Loop song mengulang lagu, dan metronome memberi ketukan untuk mengiringi permainanmu.",
          "Tombol zoom memperkecil atau memperbesar partitur.",
          "Di HP semua ini ada di balik tombol roda gigi. Di layar yang lebih besar, semuanya ada di bar pemutar.",
        ],
      },
      {
        icon: "solar:music-notes-linear",
        title: "4. Track",
        steps: [
          "Buka menu (tiga garis di kiri atas) lalu pilih tab Track.",
          "Ketuk sebuah track untuk menampilkan notasinya. Tombol speaker membisukannya, dan tombol headphone memutar hanya track itu (solo).",
          "Setiap track punya slider volume sendiri, jadi kamu bisa mengecilkan bagian yang ingin kamu mainkan sendiri.",
        ],
      },
      {
        icon: "solar:music-library-2-linear",
        title: "5. Panel gitar, bass, dan piano",
        steps: [
          "Pakai tombol instrumen di kanan atas untuk menampilkan fretboard atau keyboard yang menyala sesuai nada yang sedang dimainkan.",
          "Geser panel lewat judulnya untuk memindahkannya, dan tarik pojoknya untuk mengubah ukuran.",
          "Kalau lagu punya beberapa track, pilih track yang diikuti panel lewat tombol track di header panel.",
        ],
      },
      {
        icon: "solar:user-circle-linear",
        title: "6. Instrumen dan akun",
        steps: [
          "Ketuk namamu di bagian bawah menu untuk mengganti instrumen utama.",
          "Tanpa akun, pilihan dan lagumu hanya tersimpan di browser ini.",
        ],
      },
    ],
    tipTitle: "Perlu diketahui",
    tips: [
      "Lagu disimpan di perangkat ini. Lagu tidak ikut ke perangkat lain, dan menghapus data situs akan menghapusnya.",
      "Mode privat dan sebagian browser di dalam aplikasi memblokir penyimpanan, jadi lagu bisa tidak tersimpan di sana.",
      "Kamu bisa memasang BackToRock dari menu browser (Add to Home Screen) dan membukanya tanpa internet setelah pernah dimuat.",
      "File dari Guitar Pro 8 tidak bisa dibuka? Simpan ulang sebagai .gp5 dari Guitar Pro lalu coba lagi.",
    ],
  },
};

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "en" || saved === "id") return saved;
  } catch {
    // storage blocked: fall through to the browser language
  }
  return navigator.language.toLowerCase().startsWith("id") ? "id" : "en";
}

export default function GuidePage() {
  // English on the server and the first render; the saved or browser language is applied right after hydration.
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    setLang(initialLang());
  }, []);

  const choose = (next: Lang) => {
    setLang(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // storage blocked: the choice just lasts until the page closes
    }
  };

  const t = COPY[lang];

  return (
    <main lang={lang} className="h-dvh overflow-y-auto overscroll-contain bg-background">
      <div className="mx-auto w-full max-w-2xl space-y-8 px-5 pb-16 pt-6">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="flex min-h-11 items-center gap-2 rounded-xl pr-3 text-sm text-muted-foreground hover:text-white"
          >
            <Icon icon="solar:alt-arrow-left-linear" width={20} />
            {t.back}
          </Link>
          <div role="group" aria-label="Language" className="flex rounded-full bg-black/30 p-1">
            {(["en", "id"] as const).map((l) => (
              <button
                key={l}
                onClick={() => choose(l)}
                aria-pressed={lang === l}
                className={cn(
                  "h-10 min-w-12 rounded-full px-3 text-sm font-medium transition-colors",
                  lang === l ? "bg-white/12 text-white" : "text-muted-foreground hover:text-white",
                )}
              >
                {l === "en" ? "EN" : "ID"}
              </button>
            ))}
          </div>
        </div>

        <header className="space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">{t.title}</h1>
          <p className="text-muted-foreground">{t.intro}</p>
        </header>

        <div className="space-y-6">
          {t.sections.map((s) => (
            <section key={s.title} className="rounded-2xl bg-white/[0.04] p-5">
              <h2 className="flex items-center gap-3 text-lg font-semibold">
                <Icon icon={s.icon} width={22} className="shrink-0 text-[#ff7b83]" />
                {s.title}
              </h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-[#d4d4d4] marker:text-muted-foreground">
                {s.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <section className="rounded-2xl border border-border p-5">
          <h2 className="text-lg font-semibold">{t.tipTitle}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[#d4d4d4] marker:text-muted-foreground">
            {t.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
