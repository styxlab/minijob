import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

/**
 * GET /api/health — checks Redis connectivity.
 * Use from inside the container: curl -s http://localhost:3000/api/health
 */
export async function GET() {
  try {
    const redis = getRedis();
    await redis.ping();
    return NextResponse.json({ redis: "ok" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { redis: "error", message },
      { status: 503 }
    );
  }
}
