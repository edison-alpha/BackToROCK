"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import { signOut } from "next-auth/react";
import { useAuth } from "@/lib/use-auth";
import { GOOGLE_LOGIN } from "@/lib/features";
import { UserAvatar } from "./UserAvatar";
import { useGuest } from "@/lib/guest";
import { isProfile, type Instrument, type Profile } from "@/lib/profile";

const INSTRUMENT_LABEL: Record<Instrument, string> = { gitar: "Gitar", bass: "Bass", piano: "Piano", drum: "Drum" };

// Works for both kinds of user. Signed-in users keep their instrument in a cookie (via /api/profile), guests in
// localStorage. Someone who has not chosen yet is sent to /onboarding once.
export function useProfile(redirectToOnboarding = false) {
  const router = useRouter();
  const { status } = useAuth();
  const guest = useGuest();
  const [account, setAccount] = useState<Profile | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { profile?: unknown } | null) => {
        if (cancelled || !body) return;
        if (isProfile(body.profile)) setAccount(body.profile);
        else if (redirectToOnboarding) router.replace("/onboarding");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status, router, redirectToOnboarding]);

  const guestUndecided = guest !== undefined && (!guest || (!guest.instrument && !guest.skipped));
  useEffect(() => {
    if (status === "unauthenticated" && redirectToOnboarding && guestUndecided) router.replace("/onboarding");
  }, [status, redirectToOnboarding, guestUndecided, router]);

  if (status === "authenticated") return account;
  return guest?.instrument ? { instrument: guest.instrument } : null;
}

export function AccountPanel() {
  const { data, status } = useAuth();
  const guest = useGuest();
  const profile = useProfile();

  if (status === "loading") return <div className="h-14" aria-hidden />;

  const authed = status === "authenticated";
  const user = data?.user;
  const subtitle = profile ? INSTRUMENT_LABEL[profile.instrument] : authed ? "Mengatur profil..." : "Pilih instrumen";

  return (
    <div className="flex items-center gap-1 rounded-2xl bg-white/[0.04] p-2">
      <Link
        href="/onboarding"
        title="Ubah instrumen"
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 hover:bg-white/5"
      >
        {authed && user?.image ? (
          // Google avatars come from a remote host, so a plain img avoids configuring next/image domains.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" referrerPolicy="no-referrer" className="size-10 shrink-0 rounded-full" />
        ) : (
          <span className="shrink-0 overflow-hidden rounded-full">
            <UserAvatar seed={authed ? (user?.email ?? "pengguna") : (guest?.id ?? "tamu")} />
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">
            {authed ? (user?.name ?? user?.email) : "Tamu"}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
        </span>
      </Link>

      {authed ? (
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          aria-label="Keluar"
          title="Keluar"
          className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-white/10 hover:text-white"
        >
          <Icon icon="solar:logout-2-linear" width={20} />
        </button>
      ) : GOOGLE_LOGIN ? (
        <Link
          href="/login"
          aria-label="Masuk dengan Google"
          title="Masuk dengan Google"
          className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-white/10 hover:text-white"
        >
          <Icon icon="solar:login-2-linear" width={20} />
        </Link>
      ) : null}
    </div>
  );
}
