function splitOrigins(value?: string) {
  return (value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function loopbackAlias(origin: string) {
  try {
    const url = new URL(origin);
    if (url.hostname === '127.0.0.1') {
      url.hostname = 'localhost';
      return url.origin;
    }
    if (url.hostname === 'localhost') {
      url.hostname = '127.0.0.1';
      return url.origin;
    }
  } catch {
    return null;
  }
  return null;
}

function allowedCorsOrigins(...origins: string[]) {
  const values = new Set<string>();
  for (const origin of origins) {
    values.add(origin);
    const alias = loopbackAlias(origin);
    if (alias) values.add(alias);
  }
  return values;
}

const feOrigin = Bun.env.FE_ORIGIN || 'http://127.0.0.1:5173';
const adminOrigin = Bun.env.ADMIN_ORIGIN || 'http://127.0.0.1:5174';
const sessionCookieName = Bun.env.SESSION_COOKIE_NAME || 'manle_session';

export const config = {
  databaseUrl: Bun.env.DATABASE_URL || '',
  host: Bun.env.API_HOST || '127.0.0.1',
  port: Number(Bun.env.API_PORT || 8787),
  feOrigin,
  adminOrigin,
  allowedCorsOrigins: allowedCorsOrigins(feOrigin, adminOrigin, ...splitOrigins(Bun.env.CORS_ORIGINS)),
  redisUrl: Bun.env.REDIS_URL || 'redis://127.0.0.1:6379',
  sessionCookieName,
  refreshCookieName: Bun.env.REFRESH_COOKIE_NAME || 'manle_refresh',
  accessTokenMinutes: Number(Bun.env.ACCESS_TOKEN_MINUTES || 15),
  refreshTokenDays: Number(Bun.env.REFRESH_TOKEN_DAYS || Bun.env.SESSION_DAYS || 14),
  cookieSecure: (Bun.env.COOKIE_SECURE || 'false') === 'true',
  paddleApiKey: Bun.env.PADDLE_API_KEY || '',
  paddleWebhookSecret: Bun.env.PADDLE_WEBHOOK_SECRET || '',
  paddleClientToken: Bun.env.PADDLE_CLIENT_TOKEN || '',
  paddleEnv: (Bun.env.PADDLE_ENV || 'sandbox') as 'sandbox' | 'production',
  paddleWebhookToleranceSeconds: Number(Bun.env.PADDLE_WEBHOOK_TOLERANCE_SECONDS || 300),
  googleOAuthClientId: Bun.env.GOOGLE_OAUTH_CLIENT_ID || '',
  googleOAuthClientSecret: Bun.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
  googleOAuthRedirectUri: Bun.env.GOOGLE_OAUTH_REDIRECT_URI || '',
  appleOAuthClientId: Bun.env.APPLE_OAUTH_CLIENT_ID || '',
  appleOAuthTeamId: Bun.env.APPLE_OAUTH_TEAM_ID || '',
  appleOAuthKeyId: Bun.env.APPLE_OAUTH_KEY_ID || '',
  appleOAuthPrivateKey: Bun.env.APPLE_OAUTH_PRIVATE_KEY || '',
  appleOAuthClientSecret: Bun.env.APPLE_OAUTH_CLIENT_SECRET || '',
  appleOAuthRedirectUri: Bun.env.APPLE_OAUTH_REDIRECT_URI || '',
};

export const paddleApiBase = config.paddleEnv === 'production'
  ? 'https://api.paddle.com'
  : 'https://sandbox-api.paddle.com';

export function requireDatabaseUrl() {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required for MANLE API database access.');
  }
  return config.databaseUrl;
}
