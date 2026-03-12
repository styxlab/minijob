#!/usr/bin/env npx tsx
/**
 * Standalone Redis connection test. Use when Redis runs in the same container
 * or same network. Exits 0 if Redis is reachable, 1 otherwise.
 *
 * From repo: REDIS_URL=redis://localhost:6379 pnpm exec tsx scripts/check-redis.ts
 * In container:  REDIS_URL=redis://localhost:6379 node -e "..."  (or run this if tsx is in image)
 */
import Redis from "ioredis";

const url = process.env.REDIS_URL || "redis://localhost:6379";

async function main() {
  const redis = new Redis(url, { maxRetriesPerRequest: 2 });
  try {
    const pong = await redis.ping();
    console.log("Redis OK:", pong);
    process.exit(0);
  } catch (err) {
    console.error("Redis connection failed:", err);
    process.exit(1);
  } finally {
    await redis.quit();
  }
}

main();
