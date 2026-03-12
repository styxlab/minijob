import Redis from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    logger.debug("Creating Redis client", { url: env.REDIS_URL.replace(/:[^:@]+@/, ":****@") });
    client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });
  }
  return client;
}

const KEY_PREFIX = "lohnabrechnung:";

/** Redis key for a given year/month (e.g. lohnabrechnung:2025:3). */
export function redisKey(year: number, month: number): string {
  return `${KEY_PREFIX}${year}:${month}`;
}

/** Returns true if this period was already successfully processed. */
export async function wasAlreadyProcessed(year: number, month: number): Promise<boolean> {
  const key = redisKey(year, month);
  const redis = getRedis();
  const value = await redis.get(key);
  const exists = value !== null && value !== undefined;
  logger.debug("Redis get", { key, exists, value: value ?? undefined });
  return exists;
}

/** Mark period as successfully processed. Value is ISO timestamp. */
export async function markProcessed(year: number, month: number): Promise<void> {
  const key = redisKey(year, month);
  const redis = getRedis();
  const value = new Date().toISOString();
  await redis.set(key, value);
  logger.info("Redis set", { key, value });
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
    logger.debug("Redis client closed");
  }
}
