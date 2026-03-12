/**
 * Integration test: connects to Redis using REDIS_URL from .env.
 * Skips if REDIS_URL is not set. Run with: pnpm test lib/redis.integration.test.ts
 */
import "dotenv/config";

import Redis from "ioredis";
import { describe, it, expect, afterEach } from "vitest";
import {
  wasAlreadyProcessed,
  markProcessed,
  redisKey,
  closeRedis,
} from "./redis";

const hasRedisConfig = () => !!process.env.REDIS_URL;

/** Test period that is unlikely to conflict with real data. */
const TEST_YEAR = 2099;
const TEST_MONTH = 12;

describe("Redis (integration)", () => {
  afterEach(async () => {
    await closeRedis();
  });

  it.runIf(hasRedisConfig())(
    "connects to Redis from .env and wasAlreadyProcessed / markProcessed work",
    async () => {
      const key = redisKey(TEST_YEAR, TEST_MONTH);
      const redisUrl = process.env.REDIS_URL!;

      expect(await wasAlreadyProcessed(TEST_YEAR, TEST_MONTH)).toBe(false);

      await markProcessed(TEST_YEAR, TEST_MONTH);
      expect(await wasAlreadyProcessed(TEST_YEAR, TEST_MONTH)).toBe(true);

      // Clean up test key so the test is idempotent
      const client = new Redis(redisUrl);
      try {
        await client.del(key);
      } finally {
        await client.quit();
      }
    },
    10_000
  );
});
