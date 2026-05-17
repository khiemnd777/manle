type RateLimitResult = {
  allowed: boolean;
  count: number;
  remaining: number;
  resetSeconds: number;
};

function client() {
  return (Bun as any).redis as {
    incr?: (key: string) => Promise<number> | number;
    expire?: (key: string, seconds: number) => Promise<unknown> | unknown;
  } | undefined;
}

export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<RateLimitResult> {
  const redis = client();
  if (!redis?.incr || !redis?.expire) {
    return { allowed: true, count: 0, remaining: max, resetSeconds: windowSeconds };
  }

  try {
    const count = Number(await redis.incr(key));
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }
    return {
      allowed: count <= max,
      count,
      remaining: Math.max(0, max - count),
      resetSeconds: windowSeconds,
    };
  } catch (error) {
    console.warn('Redis rate limit bypassed:', error);
    return { allowed: true, count: 0, remaining: max, resetSeconds: windowSeconds };
  }
}
