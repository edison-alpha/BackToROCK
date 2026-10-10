import { useSession } from "next-auth/react";
import { GOOGLE_LOGIN } from "./features";

type Auth = Pick<ReturnType<typeof useSession>, "status" | "data">;

// With login off there is no SessionProvider and no network call: everyone is simply a guest.
const useNoSession = (): Auth => ({ status: "unauthenticated", data: null });

// Chosen once at module load from a constant, so the hook order never changes between renders.
export const useAuth: () => Auth = GOOGLE_LOGIN ? useSession : useNoSession;
