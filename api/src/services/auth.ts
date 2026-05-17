import { config } from '../config';
import { db, one } from '../db/client';
import { fail } from '../http/errors';
import type { Actor } from '../types/admin';

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
