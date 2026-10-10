"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import { signIn, useSession } from "next-auth/react";

export default function LoginPage() {
  const router = useRouter();
  const { status } = useSession();
  const [busy, setBusy] = useState(false);
  const [clientFailed, setFailed] = useState(false);
  // Auth.js sends failed sign-ins back here with ?error=...
  const search = useSyncExternalStore(
    () => () => {},
    () => window.location.search,
    () => "",
  );
  const failed = clientFailed || new URLSearchParams(search).has("error");

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  const login = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await signIn("google", { callbackUrl: "/" });
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl border border-border bg-card md:grid-cols-2">
        <div className="flex items-center justify-center bg-black p-6 md:p-10">
          <Image
            src="/logo.png"
            alt="BackToRock"
            width={420}
            height={420}
            priority
            className="size-56 mix-blend-screen md:size-full md:max-w-sm"
          />
        </div>

        <div className="flex flex-col justify-center gap-6 p-6 md:p-10">
          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight">Masuk ke BackToRock</h1>
            <p className="text-muted-foreground">
              Masuk dengan Google supaya peran dan instrumenmu tersimpan. Tanpa masuk, kamu tetap bisa membuka file
              Guitar Pro dan memainkannya.
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={login}
              disabled={busy || status === "loading"}
              className="flex h-12 w-full items-center justify-center gap-3 rounded-full bg-white font-semibold text-[#1f1f1f] transition-colors hover:bg-[#ececec] disabled:opacity-60"
            >
              <Icon icon="logos:google-icon" width={20} />
              {busy ? "Mengalihkan ke Google..." : "Masuk dengan Google"}
            </button>

            {failed && (
              <p role="alert" className="text-sm text-[#ff7b83]">
                Gagal masuk dengan Google. Coba lagi, dan pastikan kunci Google OAuth sudah diisi di .env.local.
              </p>
            )}

            <Link
              href="/"
              className="flex h-12 w-full items-center justify-center rounded-full border border-border font-semibold hover:bg-white/5"
            >
              Lanjut sebagai tamu
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
