import { config } from '../config';
import { db, one } from '../db/client';
import { fail } from '../http/errors';
import type { Actor } from '../types/admin';
import { sendTemplateEmailQuietly } from './email';

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | 'customer';
  status: 'active' | 'disabled';
  password_hash: string | null;
};

type RefreshTokenRow = UserRow & {
  refreshTokenId: string;
  familyId: string;
  refreshExpiresAt: Date;
  refreshRevokedAt: Date | null;
};

type TokenPair = {
  accessToken: string;
  accessTokenHash: string;
  accessExpires: Date;
  refreshToken: string;
  refreshTokenHash: string;
  refreshExpires: Date;
};

type AuthSession = {
  actor: Actor;
  accessToken: string;
  accessExpires: Date;
  refreshToken: string;
  refreshExpires: Date;
};

export type OAuthProvider = 'google' | 'apple';

type OAuthState = {
  provider: OAuthProvider;
  state: string;
  nonce: string;
  next: string;
  checkoutTier?: string;
  createdAt: number;
};

type OAuthCallbackInput = {
  code?: string;
  state?: string;
  error?: string;
  user?: string;
};

type OAuthProfile = {
  provider: OAuthProvider;
  providerUserId: string;
  email: string;
  emailVerified: boolean;
  name: string;
};

type OAuthSession = AuthSession & {
  created: boolean;
  redirectUrl: string;
};

type JwtParts = {
  header: Record<string, any>;
  payload: Record<string, any>;
  signingInput: string;
  signature: Uint8Array;
};

const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;
const OAUTH_STATE_COOKIE_PATH = '/api/auth/oauth';
const PROVIDER_AUTH_URLS: Record<OAuthProvider, string> = {
  google: 'https://accounts.google.com/o/oauth2/v2/auth',
  apple: 'https://appleid.apple.com/auth/authorize',
};
const PROVIDER_TOKEN_URLS: Record<OAuthProvider, string> = {
  google: 'https://oauth2.googleapis.com/token',
  apple: 'https://appleid.apple.com/auth/token',
};
const PROVIDER_JWKS_URLS: Record<OAuthProvider, string> = {
  google: 'https://www.googleapis.com/oauth2/v3/certs',
  apple: 'https://appleid.apple.com/auth/keys',
};
const jwksCache = new Map<OAuthProvider, { expiresAt: number; keys: any[] }>();

function toActor(row: UserRow): Actor {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
  };
}

export function parseCookies(request: Request) {
  const header = request.headers.get('cookie') || '';
  const cookies = new Map<string, string>();
  header.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) cookies.set(key, decodeURIComponent(value));
  });
  return cookies;
}

export function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function sha256Hex(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function expiresInMinutes(minutes: number) {
  const date = new Date();
  date.setMinutes(date.getMinutes() + minutes);
  return date;
}

function expiresInDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function cleanEmail(value?: string) {
  return (value || '').trim().toLowerCase();
}

function cleanName(value?: string) {
  return (value || '').trim();
}

function authCookie(name: string, token: string, expires: Date) {
  const parts = [
    `${name}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expires.toUTCString()}`,
  ];
  if (config.cookieSecure) parts.push('Secure');
  return parts.join('; ');
}

function clearAuthCookie(name: string) {
  const parts = [
    `${name}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (config.cookieSecure) parts.push('Secure');
  return parts.join('; ');
}

function oauthStateCookieName() {
  return `${config.sessionCookieName}_oauth_state`;
}

function oauthStateSameSite() {
  return config.cookieSecure ? 'SameSite=None' : 'SameSite=Lax';
}

function oauthStateCookie(value: string, maxAgeSeconds: number) {
  const parts = [
    `${oauthStateCookieName()}=${encodeURIComponent(value)}`,
    `Path=${OAUTH_STATE_COOKIE_PATH}`,
    'HttpOnly',
    oauthStateSameSite(),
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (config.cookieSecure) parts.push('Secure');
  return parts.join('; ');
}

export function clearOAuthStateCookie() {
  const parts = [
    `${oauthStateCookieName()}=`,
    `Path=${OAUTH_STATE_COOKIE_PATH}`,
    'HttpOnly',
    oauthStateSameSite(),
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (config.cookieSecure) parts.push('Secure');
  return parts.join('; ');
}

function base64UrlEncode(value: string | Uint8Array) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeJsonPart(value: string) {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(value)));
}

function encodeOAuthState(record: OAuthState) {
  return base64UrlEncode(JSON.stringify(record));
}

function decodeOAuthState(value?: string): OAuthState | null {
  if (!value) return null;
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(value))) as OAuthState;
  } catch {
    return null;
  }
}

function providerConfig(provider: OAuthProvider) {
  if (provider === 'google') {
    return {
      clientId: config.googleOAuthClientId,
      clientSecret: config.googleOAuthClientSecret,
      redirectUri: config.googleOAuthRedirectUri,
    };
  }
  return {
    clientId: config.appleOAuthClientId,
    clientSecret: config.appleOAuthClientSecret,
    redirectUri: config.appleOAuthRedirectUri,
  };
}

function requireProviderConfig(provider: OAuthProvider) {
  const providerCfg = providerConfig(provider);
  if (!providerCfg.clientId) {
    fail(503, 'oauth_provider_unconfigured', `${provider} login is not configured.`);
  }
  if (provider === 'google' && !providerCfg.clientSecret) {
    fail(503, 'oauth_provider_unconfigured', 'Google login is not configured.');
  }
  if (
    provider === 'apple'
    && !providerCfg.clientSecret
    && (!config.appleOAuthTeamId || !config.appleOAuthKeyId || !config.appleOAuthPrivateKey)
  ) {
    fail(503, 'oauth_provider_unconfigured', 'Apple login is not configured.');
  }
  return providerCfg;
}

function forwardedOrigin(request: Request) {
  const url = new URL(request.url);
  const forwardedHost = (request.headers.get('x-forwarded-host') || '').split(',')[0]?.trim();
  const forwardedProto = (request.headers.get('x-forwarded-proto') || '').split(',')[0]?.trim();
  if (forwardedHost) {
    return `${forwardedProto || url.protocol.replace(':', '')}://${forwardedHost}`;
  }
  return url.origin;
}

function providerRedirectUri(provider: OAuthProvider, request: Request) {
  const configured = providerConfig(provider).redirectUri;
  return configured || `${forwardedOrigin(request)}/api/auth/oauth/${provider}/callback`;
}

function cleanFrontendTarget(value?: string | null) {
  try {
    const url = new URL(value || '/generator', config.feOrigin);
    if (url.origin !== config.feOrigin) return '/generator';
    return `${url.pathname}${url.search}${url.hash}` || '/generator';
  } catch {
    return '/generator';
  }
}

function cleanCheckoutTier(value?: string | null) {
  const tier = String(value || '').trim().toLowerCase();
  return /^[a-z][a-z0-9_-]{0,40}$/.test(tier) ? tier : undefined;
}

function successRedirectUrl(record: OAuthState) {
  const url = new URL(record.next || '/generator', config.feOrigin);
  if (record.checkoutTier) url.searchParams.set('checkout_tier', record.checkoutTier);
  return url.toString();
}

export function oauthFailureRedirectUrl(request: Request, provider: OAuthProvider, code = 'oauth_failed') {
  const cookies = parseCookies(request);
  const record = decodeOAuthState(cookies.get(oauthStateCookieName()));
  const url = new URL(cleanFrontendTarget(record?.next), config.feOrigin);
  url.searchParams.set('auth_error', code);
  url.searchParams.set('auth_provider', provider);
  return url.toString();
}

function readOAuthState(request: Request, provider: OAuthProvider, returnedState?: string) {
  const cookies = parseCookies(request);
  const record = decodeOAuthState(cookies.get(oauthStateCookieName()));
  if (!record || !returnedState || record.state !== returnedState || record.provider !== provider) {
    fail(401, 'oauth_state_invalid', 'Login session expired. Please try again.');
  }
  if (Date.now() - Number(record.createdAt || 0) > OAUTH_STATE_MAX_AGE_SECONDS * 1000) {
    fail(401, 'oauth_state_invalid', 'Login session expired. Please try again.');
  }
  return record;
}

function parseJwt(token: string): JwtParts {
  const parts = token.split('.');
  if (parts.length !== 3) fail(401, 'oauth_token_invalid', 'Identity token is invalid.');
  return {
    header: decodeJsonPart(parts[0]),
    payload: decodeJsonPart(parts[1]),
    signingInput: `${parts[0]}.${parts[1]}`,
    signature: base64UrlDecode(parts[2]),
  };
}

async function providerKeys(provider: OAuthProvider) {
  const cached = jwksCache.get(provider);
  if (cached && cached.expiresAt > Date.now()) return cached.keys;

  const response = await fetch(PROVIDER_JWKS_URLS[provider]);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(payload.keys)) {
    fail(502, 'oauth_jwks_failed', 'Could not verify identity token.');
  }

  const cacheControl = response.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  jwksCache.set(provider, {
    keys: payload.keys,
    expiresAt: Date.now() + Math.max(60, maxAgeSeconds) * 1000,
  });
  return payload.keys;
}

async function verifyProviderJwt(provider: OAuthProvider, token: string) {
  const parts = parseJwt(token);
  if (parts.header.alg !== 'RS256') {
    fail(401, 'oauth_token_invalid', 'Identity token signature is not supported.');
  }
  const keys = await providerKeys(provider);
  const jwk = keys.find(key => key.kid === parts.header.kid && key.kty === 'RSA');
  if (!jwk) fail(401, 'oauth_token_invalid', 'Identity token signing key was not found.');
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    parts.signature,
    new TextEncoder().encode(parts.signingInput),
  );
  if (!ok) fail(401, 'oauth_token_invalid', 'Identity token signature is invalid.');
  return parts.payload;
}

function boolish(value: unknown) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function requireTokenClaims(
  provider: OAuthProvider,
  payload: Record<string, any>,
  clientId: string,
  nonce: string,
  appleUser?: string,
): OAuthProfile {
  const issuer = provider === 'google' ? ['https://accounts.google.com', 'accounts.google.com'] : ['https://appleid.apple.com'];
  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  const exp = Number(payload.exp || 0);

  if (!issuer.includes(String(payload.iss || ''))) fail(401, 'oauth_token_invalid', 'Identity token issuer is invalid.');
  if (!audience.includes(clientId)) fail(401, 'oauth_token_invalid', 'Identity token audience is invalid.');
  if (!payload.sub) fail(401, 'oauth_token_invalid', 'Identity token subject is missing.');
  if (exp * 1000 <= Date.now()) fail(401, 'oauth_token_invalid', 'Identity token has expired.');
  if (payload.nonce !== nonce) fail(401, 'oauth_token_invalid', 'Identity token nonce is invalid.');

  let appleName = '';
  try {
    const parsed = appleUser ? JSON.parse(appleUser) : null;
    const firstName = cleanName(parsed?.name?.firstName);
    const lastName = cleanName(parsed?.name?.lastName);
    appleName = cleanName(`${firstName} ${lastName}`);
  } catch {
    appleName = '';
  }

  const email = cleanEmail(payload.email);
  return {
    provider,
    providerUserId: String(payload.sub),
    email,
    emailVerified: boolish(payload.email_verified),
    name: cleanName(payload.name) || appleName || (email ? email.split('@')[0] : ''),
  };
}

async function postProviderForm(provider: OAuthProvider, values: Record<string, string>) {
  const response = await fetch(PROVIDER_TOKEN_URLS[provider], {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    fail(502, 'oauth_token_exchange_failed', payload.error_description || payload.error || 'Could not complete social login.');
  }
  return payload;
}

function pemToBytes(pem: string) {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function ecdsaSignatureToJose(signature: ArrayBuffer) {
  const bytes = new Uint8Array(signature);
  if (bytes.length === 64) return bytes;
  if (bytes[0] !== 0x30) fail(500, 'apple_client_secret_failed', 'Apple client secret signature failed.');
  let offset = 2;
  if (bytes[1] & 0x80) offset = 2 + (bytes[1] & 0x7f);
  if (bytes[offset] !== 0x02) fail(500, 'apple_client_secret_failed', 'Apple client secret signature failed.');
  const rLength = bytes[offset + 1];
  const r = bytes.slice(offset + 2, offset + 2 + rLength);
  offset = offset + 2 + rLength;
  if (bytes[offset] !== 0x02) fail(500, 'apple_client_secret_failed', 'Apple client secret signature failed.');
  const sLength = bytes[offset + 1];
  const s = bytes.slice(offset + 2, offset + 2 + sLength);

  const out = new Uint8Array(64);
  out.set(r.slice(Math.max(0, r.length - 32)), 32 - Math.min(32, r.length));
  out.set(s.slice(Math.max(0, s.length - 32)), 64 - Math.min(32, s.length));
  return out;
}

async function appleClientSecret() {
  if (config.appleOAuthClientSecret) return config.appleOAuthClientSecret;
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: config.appleOAuthKeyId };
  const payload = {
    iss: config.appleOAuthTeamId,
    iat: now,
    exp: now + 30 * 24 * 60 * 60,
    aud: 'https://appleid.apple.com',
    sub: config.appleOAuthClientId,
  };
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToBytes(config.appleOAuthPrivateKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlEncode(ecdsaSignatureToJose(signature))}`;
}

async function tokenPair(): Promise<TokenPair> {
  const accessToken = randomToken();
  const refreshToken = randomToken();
  return {
    accessToken,
    accessTokenHash: await sha256Hex(accessToken),
    accessExpires: expiresInMinutes(config.accessTokenMinutes),
    refreshToken,
    refreshTokenHash: await sha256Hex(refreshToken),
    refreshExpires: expiresInDays(config.refreshTokenDays),
  };
}

export function authCookieHeaders(session: AuthSession) {
  return {
    'Set-Cookie': [
      authCookie(config.sessionCookieName, session.accessToken, session.accessExpires),
      authCookie(config.refreshCookieName, session.refreshToken, session.refreshExpires),
    ],
  };
}

export function clearAuthCookieHeaders() {
  return {
    'Set-Cookie': [
      clearAuthCookie(config.sessionCookieName),
      clearAuthCookie(config.refreshCookieName),
    ],
  };
}

async function createSession(row: UserRow): Promise<AuthSession> {
  const tokens = await tokenPair();
  const sql = db();
  await sql.begin(async (tx: any) => {
    await tx`
      insert into sessions (user_id, token_hash, expires_at)
      values (${row.id}, ${tokens.accessTokenHash}, ${tokens.accessExpires.toISOString()})
    `;
    await tx`
      insert into refresh_tokens (user_id, token_hash, expires_at)
      values (${row.id}, ${tokens.refreshTokenHash}, ${tokens.refreshExpires.toISOString()})
    `;
  });
  return {
    actor: toActor(row),
    accessToken: tokens.accessToken,
    accessExpires: tokens.accessExpires,
    refreshToken: tokens.refreshToken,
    refreshExpires: tokens.refreshExpires,
  };
}

async function rotateSession(row: RefreshTokenRow): Promise<AuthSession> {
  const tokens = await tokenPair();
  const sql = db();
  await sql.begin(async (tx: any) => {
    const rotated = await one<{ id: string }>(tx`
      update refresh_tokens
      set revoked_at = now(),
          replaced_by_token_hash = ${tokens.refreshTokenHash}
      where id = ${row.refreshTokenId}
        and revoked_at is null
      returning id
    `);
    if (!rotated) fail(401, 'invalid_refresh', 'Login required.');

    await tx`
      insert into sessions (user_id, token_hash, expires_at)
      values (${row.id}, ${tokens.accessTokenHash}, ${tokens.accessExpires.toISOString()})
    `;
    await tx`
      insert into refresh_tokens (user_id, token_hash, family_id, expires_at)
      values (${row.id}, ${tokens.refreshTokenHash}, ${row.familyId}, ${tokens.refreshExpires.toISOString()})
    `;
  });
  return {
    actor: toActor(row),
    accessToken: tokens.accessToken,
    accessExpires: tokens.accessExpires,
    refreshToken: tokens.refreshToken,
    refreshExpires: tokens.refreshExpires,
  };
}

type LoginRole = UserRow['role'];
type LoginScope = LoginRole | 'system';

async function findLoginUser(email: string, scope?: LoginScope) {
  const sql = db();
  if (scope === 'system') {
    return await one<UserRow>(sql`
      select id, email, name, role, status, password_hash
      from users
      where lower(email) = ${email}
        and role in ('admin', 'user')
      limit 1
    `);
  }
  return await one<UserRow>(sql`
    select id, email, name, role, status, password_hash
    from users
    where lower(email) = ${email}
      and (${scope || ''} = '' or role = ${scope || null})
    limit 1
  `);
}

export async function getAdminBootstrapStatus() {
  const sql = db();
  const row = await one<{ count: string }>(sql`
    select count(*)::text as count
    from users
    where role = 'admin'
  `);
  return { hasAdmin: Number(row?.count || 0) > 0 };
}

export async function createInitialAdmin(input: { name?: string; email?: string; password?: string }) {
  const email = cleanEmail(input.email);
  const name = cleanName(input.name) || 'MANLE Admin';
  const password = input.password || '';
  if (!email.includes('@')) fail(400, 'invalid_email', 'Valid admin email is required.');
  if (password.length < 10) fail(400, 'weak_password', 'Password must be at least 10 characters.');

  const status = await getAdminBootstrapStatus();
  if (status.hasAdmin) fail(409, 'admin_exists', 'Initial admin already exists.');

  const sql = db();
  const passwordHash = await Bun.password.hash(password, { algorithm: 'argon2id' });
  const row = await one<UserRow>(sql`
    insert into users (email, name, password_hash, role, status, current_tier_code)
    values (${email}, ${name}, ${passwordHash}, 'admin', 'active', 'pro')
    returning id, email, name, role, status, password_hash
  `);
  if (!row) fail(500, 'admin_create_failed', 'Could not create initial admin.');
  return toActor(row);
}

export async function signupCustomer(input: { name?: string; email?: string; password?: string }) {
  const email = cleanEmail(input.email);
  const name = cleanName(input.name);
  const password = input.password || '';
  if (!email.includes('@')) fail(400, 'invalid_email', 'Valid email is required.');
  if (!name) fail(400, 'missing_name', 'Name is required.');
  if (password.length < 8) fail(400, 'weak_password', 'Password must be at least 8 characters.');

  const existing = await findLoginUser(email);
  if (existing) fail(409, 'email_exists', 'An account with this email already exists.');

  const passwordHash = await Bun.password.hash(password, { algorithm: 'argon2id' });
  const sql = db();
  const row = await one<UserRow>(sql`
    insert into users (email, name, password_hash, role, status, current_tier_code)
    values (${email}, ${name}, ${passwordHash}, 'customer', 'active', 'free')
    returning id, email, name, role, status, password_hash
  `);
  if (!row) fail(500, 'signup_failed', 'Could not create account.');
  return await createSession(row);
}

async function login(input: { email?: string; password?: string }, scope?: LoginScope) {
  const email = cleanEmail(input.email);
  const password = input.password || '';
  const row = await findLoginUser(email, scope);
  if (!row || row.status !== 'active' || !row.password_hash) {
    fail(401, 'invalid_login', 'Invalid email or password.');
  }
  const ok = await Bun.password.verify(password, row.password_hash);
  if (!ok) fail(401, 'invalid_login', 'Invalid email or password.');
  return await createSession(row);
}

export async function loginAdmin(input: { email?: string; password?: string }) {
  return await login(input, 'system');
}

export async function loginCustomer(input: { email?: string; password?: string }) {
  return await login(input, 'customer');
}

export function startCustomerOAuth(
  provider: OAuthProvider,
  request: Request,
  input: { next?: string | null; checkoutTier?: string | null } = {},
) {
  const providerCfg = requireProviderConfig(provider);
  const record: OAuthState = {
    provider,
    state: randomToken(),
    nonce: randomToken(),
    next: cleanFrontendTarget(input.next),
    checkoutTier: cleanCheckoutTier(input.checkoutTier),
    createdAt: Date.now(),
  };
  const redirectUri = providerRedirectUri(provider, request);
  const url = new URL(PROVIDER_AUTH_URLS[provider]);
  url.searchParams.set('client_id', providerCfg.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', record.state);
  url.searchParams.set('nonce', record.nonce);
  if (provider === 'google') {
    url.searchParams.set('prompt', 'select_account');
  } else {
    url.searchParams.set('scope', 'name email');
    url.searchParams.set('response_mode', 'form_post');
  }

  return {
    redirectUrl: url.toString(),
    stateCookie: oauthStateCookie(encodeOAuthState(record), OAUTH_STATE_MAX_AGE_SECONDS),
  };
}

async function exchangeOAuthCode(
  provider: OAuthProvider,
  request: Request,
  code: string,
  state: OAuthState,
  appleUser?: string,
) {
  const providerCfg = requireProviderConfig(provider);
  const redirectUri = providerRedirectUri(provider, request);
  const clientSecret = provider === 'apple' ? await appleClientSecret() : providerCfg.clientSecret;
  const tokenPayload = await postProviderForm(provider, {
    grant_type: 'authorization_code',
    code,
    client_id: providerCfg.clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });
  const idToken = String(tokenPayload.id_token || '');
  if (!idToken) fail(401, 'oauth_token_invalid', 'Identity token is missing.');
  const claims = await verifyProviderJwt(provider, idToken);
  return requireTokenClaims(provider, claims, providerCfg.clientId, state.nonce, appleUser);
}

async function sessionFromOAuthProfile(profile: OAuthProfile): Promise<AuthSession & { created: boolean }> {
  const sql = db();
  const linked = await one<UserRow>(sql`
    select u.id, u.email, u.name, u.role, u.status, u.password_hash
    from oauth_accounts oa
    join users u on u.id = oa.user_id
    where oa.provider = ${profile.provider}
      and oa.provider_user_id = ${profile.providerUserId}
    limit 1
  `);

  if (linked) {
    if (linked.role !== 'customer' || linked.status !== 'active') {
      fail(401, 'oauth_account_disabled', 'This account cannot login with social auth.');
    }
    await sql`
      update oauth_accounts
      set email = ${profile.email || linked.email},
          email_verified = ${profile.emailVerified},
          updated_at = now()
      where provider = ${profile.provider}
        and provider_user_id = ${profile.providerUserId}
    `;
    return { ...(await createSession(linked)), created: false };
  }

  if (!profile.email) fail(400, 'oauth_email_missing', 'Social login did not provide an email address.');
  if (!profile.emailVerified) fail(400, 'oauth_email_unverified', 'Social login email must be verified.');

  let row = await one<UserRow>(sql`
    select id, email, name, role, status, password_hash
    from users
    where lower(email) = ${profile.email}
    limit 1
  `);

  let created = false;
  if (row) {
    if (row.role !== 'customer') {
      fail(409, 'oauth_email_unavailable', 'This email cannot be used for customer social login.');
    }
    if (row.status !== 'active') {
      fail(401, 'oauth_account_disabled', 'This account is disabled.');
    }
  } else {
    const name = cleanName(profile.name) || profile.email.split('@')[0] || 'MANLE Customer';
    row = await one<UserRow>(sql`
      insert into users (email, name, password_hash, role, status, current_tier_code)
      values (${profile.email}, ${name}, null, 'customer', 'active', 'free')
      returning id, email, name, role, status, password_hash
    `);
    if (!row) fail(500, 'signup_failed', 'Could not create account.');
    created = true;
  }

  await sql`
    insert into oauth_accounts (user_id, provider, provider_user_id, email, email_verified)
    values (${row.id}, ${profile.provider}, ${profile.providerUserId}, ${profile.email}, ${profile.emailVerified})
    on conflict (provider, provider_user_id) do update set
      email = excluded.email,
      email_verified = excluded.email_verified,
      updated_at = now()
  `;

  return { ...(await createSession(row)), created };
}

export async function completeCustomerOAuth(
  provider: OAuthProvider,
  request: Request,
  input: OAuthCallbackInput,
): Promise<OAuthSession> {
  if (input.error) {
    fail(401, input.error === 'access_denied' ? 'oauth_access_denied' : 'oauth_failed', 'Social login was not completed.');
  }
  const state = readOAuthState(request, provider, input.state);
  const code = String(input.code || '').trim();
  if (!code) fail(400, 'oauth_code_missing', 'Social login code is missing.');

  const profile = await exchangeOAuthCode(provider, request, code, state, input.user);
  const session = await sessionFromOAuthProfile(profile);
  return {
    ...session,
    redirectUrl: successRedirectUrl(state),
  };
}

export async function requestPasswordReset(
  input: { email?: string },
  options: { resetOrigin?: string; scope?: LoginScope } = {},
) {
  const email = cleanEmail(input.email);
  if (!email.includes('@')) return { ok: true };

  const row = await findLoginUser(email, options.scope);
  if (!row || row.status !== 'active' || !row.password_hash) return { ok: true };

  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const expires = expiresInMinutes(60);
  const sql = db();
  await sql.begin(async (tx: any) => {
    await tx`
      update password_reset_tokens
      set used_at = coalesce(used_at, now())
      where user_id = ${row.id}
        and used_at is null
    `;
    await tx`
      insert into password_reset_tokens (user_id, token_hash, expires_at)
      values (${row.id}, ${tokenHash}, ${expires.toISOString()})
    `;
  });

  const resetUrl = new URL(options.resetOrigin || config.feOrigin);
  resetUrl.searchParams.set('reset_token', token);
  await sendTemplateEmailQuietly('password_reset', row.email, {
    name: row.name || row.email,
    email: row.email,
    resetUrl: resetUrl.toString(),
    expiresMinutes: '60',
  });
  return { ok: true };
}

export async function resetPassword(
  input: { token?: string; password?: string },
  options: { scope?: LoginScope } = {},
) {
  const token = (input.token || '').trim();
  const password = input.password || '';
  if (token.length < 20) fail(400, 'invalid_reset_token', 'Password reset token is invalid or expired.');
  if (password.length < 8) fail(400, 'weak_password', 'Password must be at least 8 characters.');

  const tokenHash = await sha256Hex(token);
  const scope = options.scope || '';
  const role = options.scope && options.scope !== 'system' ? options.scope : null;
  const sql = db();
  const row = await one<{ tokenId: string; userId: string }>(sql`
    select
      p.id as "tokenId",
      u.id as "userId"
    from password_reset_tokens p
    join users u on u.id = p.user_id
    where p.token_hash = ${tokenHash}
      and p.used_at is null
      and p.expires_at > now()
      and u.status = 'active'
      and (
        ${scope} = ''
        or (${scope} = 'system' and u.role in ('admin', 'user'))
        or u.role = ${role}
      )
    limit 1
  `);
  if (!row) fail(400, 'invalid_reset_token', 'Password reset token is invalid or expired.');

  const passwordHash = await Bun.password.hash(password, { algorithm: 'argon2id' });
  await sql.begin(async (tx: any) => {
    await tx`
      update users
      set password_hash = ${passwordHash},
          updated_at = now()
      where id = ${row.userId}
    `;
    await tx`
      update password_reset_tokens
      set used_at = now()
      where id = ${row.tokenId}
        and used_at is null
    `;
    await tx`
      update sessions
      set revoked_at = coalesce(revoked_at, now())
      where user_id = ${row.userId}
    `;
    await tx`
      update refresh_tokens
      set revoked_at = coalesce(revoked_at, now())
      where user_id = ${row.userId}
    `;
  });
  return { ok: true };
}

async function refreshSession(request: Request, allowedRoles: LoginRole[]) {
  const refreshToken = parseCookies(request).get(config.refreshCookieName);
  if (!refreshToken) fail(401, 'refresh_required', 'Login required.');

  const refreshTokenHash = await sha256Hex(refreshToken);
  const sql = db();
  const row = await one<RefreshTokenRow>(sql`
    select
      u.id,
      u.email,
      u.name,
      u.role,
      u.status,
      u.password_hash,
      r.id as "refreshTokenId",
      r.family_id::text as "familyId",
      r.expires_at as "refreshExpiresAt",
      r.revoked_at as "refreshRevokedAt"
    from refresh_tokens r
    join users u on u.id = r.user_id
    where r.token_hash = ${refreshTokenHash}
    limit 1
  `);

  if (!row) fail(401, 'invalid_refresh', 'Login required.');
  if (row.refreshRevokedAt) {
    await sql`
      update refresh_tokens
      set revoked_at = coalesce(revoked_at, now())
      where family_id = ${row.familyId}
    `;
    fail(401, 'refresh_reused', 'Login required.');
  }
  if (new Date(row.refreshExpiresAt).getTime() <= Date.now()) {
    fail(401, 'refresh_expired', 'Login required.');
  }
  if (row.status !== 'active' || !allowedRoles.includes(row.role)) {
    fail(401, 'invalid_refresh', 'Login required.');
  }

  return await rotateSession(row);
}

export async function refreshCustomerSession(request: Request) {
  return await refreshSession(request, ['customer']);
}

export async function refreshAdminSession(request: Request) {
  return await refreshSession(request, ['admin', 'user']);
}

export async function updateProfile(
  actor: Actor,
  input: { name?: string; email?: string; currentPassword?: string; newPassword?: string },
) {
  const name = cleanName(input.name);
  const email = cleanEmail(input.email);
  const currentPassword = input.currentPassword || '';
  const newPassword = input.newPassword || '';

  if (!name) fail(400, 'missing_name', 'Name is required.');
  if (name.length > 120) fail(400, 'name_too_long', 'Name must be 120 characters or fewer.');
  if (!email.includes('@')) fail(400, 'invalid_email', 'Valid email is required.');
  if (newPassword && newPassword.length < 8) fail(400, 'weak_password', 'Password must be at least 8 characters.');

  const sql = db();
  const current = await one<UserRow>(sql`
    select id, email, name, role, status, password_hash
    from users
    where id = ${actor.id}
    limit 1
  `);
  if (!current || current.status !== 'active') fail(401, 'not_authenticated', 'Login required.');

  const emailChanged = cleanEmail(current.email) !== email;
  const passwordChanged = Boolean(newPassword);
  if (emailChanged || passwordChanged) {
    if (!current.password_hash || !currentPassword) {
      fail(400, 'current_password_required', 'Current password is required to change email or password.');
    }
    const ok = await Bun.password.verify(currentPassword, current.password_hash);
    if (!ok) fail(401, 'invalid_current_password', 'Current password is incorrect.');
  }

  if (emailChanged) {
    const existing = await one<{ id: string }>(sql`
      select id
      from users
      where lower(email) = ${email}
        and id <> ${actor.id}
      limit 1
    `);
    if (existing) fail(409, 'email_exists', 'An account with this email already exists.');
  }

  let row: UserRow | null;
  if (passwordChanged) {
    const passwordHash = await Bun.password.hash(newPassword, { algorithm: 'argon2id' });
    row = await one<UserRow>(sql`
      update users
      set name = ${name},
          email = ${email},
          password_hash = ${passwordHash},
          updated_at = now()
      where id = ${actor.id}
      returning id, email, name, role, status, password_hash
    `);
  } else {
    row = await one<UserRow>(sql`
      update users
      set name = ${name},
          email = ${email},
          updated_at = now()
      where id = ${actor.id}
      returning id, email, name, role, status, password_hash
    `);
  }

  if (!row) fail(500, 'profile_update_failed', 'Could not update profile.');
  return toActor(row);
}

export async function currentUser(request: Request): Promise<Actor | null> {
  const token = parseCookies(request).get(config.sessionCookieName);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const accessCutoff = new Date(Date.now() - config.accessTokenMinutes * 60 * 1000);
  const sql = db();
  const row = await one<UserRow>(sql`
    select u.id, u.email, u.name, u.role, u.status, u.password_hash
    from sessions s
    join users u on u.id = s.user_id
    where s.token_hash = ${tokenHash}
      and s.revoked_at is null
      and s.expires_at > now()
      and s.created_at > ${accessCutoff.toISOString()}
      and u.status = 'active'
    limit 1
  `);
  return row ? toActor(row) : null;
}

export async function requireUser(request: Request): Promise<Actor> {
  const actor = await currentUser(request);
  if (!actor) fail(401, 'not_authenticated', 'Login required.');
  return actor;
}

export async function requireAdmin(request: Request): Promise<Actor> {
  const actor = await currentUser(request);
  if (!actor || actor.role !== 'admin') fail(401, 'not_authenticated', 'Admin login required.');
  return actor;
}

export async function requireSystemUser(request: Request): Promise<Actor> {
  const actor = await currentUser(request);
  if (!actor || !['admin', 'user'].includes(actor.role)) fail(401, 'not_authenticated', 'Admin login required.');
  return actor;
}

export async function logoutSession(request: Request) {
  const cookies = parseCookies(request);
  const accessToken = cookies.get(config.sessionCookieName);
  const refreshToken = cookies.get(config.refreshCookieName);
  const sql = db();
  if (accessToken) {
    const tokenHash = await sha256Hex(accessToken);
    await sql`
      update sessions
      set revoked_at = now()
      where token_hash = ${tokenHash}
        and revoked_at is null
    `;
  }
  if (refreshToken) {
    const refreshTokenHash = await sha256Hex(refreshToken);
    await sql`
      update refresh_tokens
      set revoked_at = now()
      where token_hash = ${refreshTokenHash}
        and revoked_at is null
    `;
  }
}

export const logoutAdmin = logoutSession;
