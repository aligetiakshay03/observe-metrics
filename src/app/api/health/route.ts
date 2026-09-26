import { NextResponse } from "next/server";
import { prisma } from "@/server/db";

/** Liveness/readiness probe. Reports database reachability only. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, database: "up" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, database: "down" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export const dynamic = "force-dynamic";
