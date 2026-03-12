#!/usr/bin/env npx tsx
/**
 * Removes all Redis entries used by this app (keys matching lohnabrechnung:*).
 * Uses SCAN to avoid blocking Redis. Exits 0 on success, 1 on connection error.
 *
 * Usage: REDIS_URL=redis://localhost:6379 pnpm exec tsx scripts/cleanup-redis.ts
 */
import "dotenv/config";
import Redis from "ioredis";

const KEY_PREFIX = "lohnabrechnung:";
const url = process.env.REDIS_URL || "redis://localhost:6379";

async function main() {
  const redis = new Redis(url, { maxRetriesPerRequest: 2 });
  try {
    const pattern = `${KEY_PREFIX}*`;
    let cursor = "0";
    let deleted = 0;

    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
        deleted += keys.length;
        console.log("Deleted", keys.length, "key(s):", keys.join(", "));
      }
    } while (cursor !== "0");

    console.log("Done. Total keys removed:", deleted);
    process.exit(0);
  } catch (err) {
    console.error("Redis cleanup failed:", err);
    process.exit(1);
  } finally {
    await redis.quit();
  }
}

main();
