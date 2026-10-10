import type { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { GOOGLE_LOGIN } from "@/lib/features";

const off = () => new Response("Not found", { status: 404 });

// Closed while Google login is switched off (src/lib/features.ts).
export const GET = (req: NextRequest) => (GOOGLE_LOGIN ? handlers.GET(req) : off());
export const POST = (req: NextRequest) => (GOOGLE_LOGIN ? handlers.POST(req) : off());
