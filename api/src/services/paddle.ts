import { config, paddleApiBase } from '../config';
import { db, one } from '../db/client';
import { fail } from '../http/errors';
import type { Actor } from '../types/admin';
import { audit } from './admin';
import { sendTemplateEmailQuietly } from './email';

type PaddleEvent = {
  event_id?: string;
  event_type?: string;
  id?: string;
  type?: string;
  data?: Record<string, any>;
};

function requirePaddleApiKey() {
  if (!config.paddleApiKey) {
    fail(501, 'paddle_not_configured', 'Paddle API key is not configured.');
  }
  return config.paddleApiKey;
}

function requirePaddleClientToken() {
  if (!config.paddleClientToken) {
    fail(501, 'paddle_not_configured', 'Paddle client token is not configured.');
  }
  return config.paddleClientToken;
}

function cleanCode(value?: string) {
  return (value || '').trim().toLowerCase();
}

function cleanPromotion(value?: string) {
  return (value || '').trim().toUpperCase();
}

function isoOrNull(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function firstPriceId(data: Record<string, any>) {
  const item = Array.isArray(data.items) ? data.items[0] : null;
  return item?.price?.id || item?.price_id || data.price_id || data.items?.[0]?.priceId || null;
}

function eventId(payload: PaddleEvent) {
  return payload.event_id || payload.id || '';
}

function eventType(payload: PaddleEvent) {
  return payload.event_type || payload.type || '';
}

async function hmacSha256Hex(secret: string, value: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return Array.from(new Uint8Array(signed)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function parseSignatureHeader(header: string) {
  const fields = new Map<string, string>();
  header.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    fields.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim());
  });
  return {
    timestamp: fields.get('ts') || '',
    signature: fields.get('h1') || '',
  };
}

async function paddleFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(`${paddleApiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${requirePaddleApiKey()}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    fail(response.status, 'paddle_request_failed', payload?.error?.detail || payload?.error?.message || 'Paddle request failed.');
  }
  return payload;
}

export async function getPaddleCheckoutConfig(actor: Actor, input: { tierCode?: string; promotionCode?: string }) {
  const tierCode = cleanCode(input.tierCode);
  if (!tierCode || tierCode === 'free') {
    fail(400, 'invalid_tier', 'Paid checkout requires Basic, Plus, or Pro tier.');
  }
  const sql = db();
  const tier = await one<{
    code: string;
    name: string;
    paddlePriceId: string | null;
  }>(sql`
    select code, name, paddle_price_id as "paddlePriceId"
    from price_tiers
    where code = ${tierCode}
      and active = true
    limit 1
  `);
  if (!tier) fail(404, 'tier_not_found', 'Price tier not found.');
  if (!tier.paddlePriceId) fail(409, 'tier_missing_paddle_price', 'This tier does not have a Paddle price ID yet.');

  let discountId: string | null = null;
  const promotionCode = cleanPromotion(input.promotionCode);
  if (promotionCode) {
    const promo = await one<{ id: string; paddleDiscountId: string | null }>(sql`
      select id, paddle_discount_id as "paddleDiscountId"
      from promotions
      where code = ${promotionCode}
        and active = true
        and (tier_code is null or tier_code = ${tierCode})
        and (starts_at is null or starts_at <= now())
        and (ends_at is null or ends_at >= now())
        and (max_redemptions is null or redemption_count < max_redemptions)
      limit 1
    `);
    if (!promo) fail(404, 'promotion_not_found', 'Promotion is not valid for this tier.');
    if (!promo.paddleDiscountId) fail(409, 'promotion_missing_paddle_discount', 'Promotion does not have a Paddle discount ID yet.');
    discountId = promo.paddleDiscountId;
  }

  return {
    environment: config.paddleEnv,
    clientToken: requirePaddleClientToken(),
    priceId: tier.paddlePriceId,
    tierCode: tier.code,
    tierName: tier.name,
    discountId,
    customer: {
      email: actor.email,
      name: actor.name,
    },
    customData: {
      userId: actor.id,
      tierCode: tier.code,
      promotionCode: promotionCode || undefined,
    },
  };
}

export async function createCustomerPortalSession(actor: Actor) {
  const sql = db();
  const user = await one<{ paddleCustomerId: string | null }>(sql`
    select paddle_customer_id as "paddleCustomerId"
    from users
    where id = ${actor.id}
    limit 1
  `);
  if (!user?.paddleCustomerId) {
    fail(409, 'missing_paddle_customer', 'No Paddle customer is linked to this account yet.');
  }
  return await paddleFetch(`/customers/${encodeURIComponent(user.paddleCustomerId)}/portal-sessions`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function verifyPaddleWebhook(rawBody: string, signatureHeader: string | null) {
  if (!config.paddleWebhookSecret) {
    fail(501, 'paddle_webhook_not_configured', 'Paddle webhook secret is not configured.');
  }
  if (!signatureHeader) fail(401, 'missing_paddle_signature', 'Missing Paddle signature.');
  const { timestamp, signature } = parseSignatureHeader(signatureHeader);
  if (!timestamp || !signature) fail(401, 'invalid_paddle_signature', 'Invalid Paddle signature.');

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) fail(401, 'invalid_paddle_signature', 'Invalid Paddle signature timestamp.');
  const ageSeconds = Math.abs(Date.now() / 1000 - ts);
  if (ageSeconds > config.paddleWebhookToleranceSeconds) {
    fail(401, 'stale_paddle_signature', 'Paddle webhook signature is too old.');
  }

  const expected = await hmacSha256Hex(config.paddleWebhookSecret, `${timestamp}:${rawBody}`);
  if (!timingSafeEqual(expected, signature)) {
    fail(401, 'invalid_paddle_signature', 'Invalid Paddle signature.');
  }
}

async function findUserForPaddleData(data: Record<string, any>) {
  const customUserId = data.custom_data?.userId || data.customData?.userId;
  const customerId = data.customer_id || data.customer?.id || data.id;
  const email = data.email || data.customer?.email;
  const sql = db();

  if (customUserId) {
    const row = await one<{ id: string }>(sql`select id from users where id = ${customUserId} limit 1`);
    if (row) return row.id;
  }
  if (customerId) {
    const row = await one<{ id: string }>(sql`select id from users where paddle_customer_id = ${customerId} limit 1`);
    if (row) return row.id;
  }
  if (email) {
    const row = await one<{ id: string }>(sql`select id from users where lower(email) = ${String(email).toLowerCase()} limit 1`);
    if (row) return row.id;
  }
  return null;
}

async function tierFromPaddleData(data: Record<string, any>) {
  const customTier = cleanCode(data.custom_data?.tierCode || data.customData?.tierCode);
  const priceId = firstPriceId(data);
  const sql = db();
  if (customTier) {
    const row = await one<{ code: string }>(sql`select code from price_tiers where code = ${customTier} limit 1`);
    if (row) return row.code;
  }
  if (priceId) {
    const row = await one<{ code: string }>(sql`
      select code
      from price_tiers
      where paddle_price_id = ${priceId}
      limit 1
    `);
    if (row) return row.code;
  }
  return 'free';
}

async function upsertPaddleCustomer(data: Record<string, any>) {
  const customerId = data.id || data.customer_id;
  if (!customerId) return;
  const userId = await findUserForPaddleData(data);
  if (!userId) return;
  const email = data.email || data.customer?.email || null;
  const name = data.name || data.customer?.name || null;
  const sql = db();
  await sql`
    update users
    set
      paddle_customer_id = ${customerId},
      email = coalesce(${email ? String(email).toLowerCase() : null}, email),
      name = coalesce(${name || null}, name),
      updated_at = now()
    where id = ${userId}
  `;
}

async function upsertPaddleSubscription(data: Record<string, any>) {
  const subscriptionId = data.id || data.subscription_id;
  const customerId = data.customer_id || data.customer?.id || null;
  if (!subscriptionId && !customerId) return;

  const userId = await findUserForPaddleData(data);
  if (!userId) return;
  const tierCode = await tierFromPaddleData(data);
  const status = data.status || 'active';
  const period = data.current_billing_period || data.billing_period || {};
  const cancelAtPeriodEnd = Boolean(data.scheduled_change?.action === 'cancel' || data.cancel_at_period_end);
  const sql = db();

  if (customerId) {
    await sql`
      update users
      set paddle_customer_id = ${customerId}, updated_at = now()
      where id = ${userId}
    `;
  }

  if (subscriptionId) {
    await sql`
      insert into subscriptions (
        user_id, paddle_customer_id, paddle_subscription_id, status, tier_code,
        current_period_start, current_period_end, cancel_at_period_end, manual_override, metadata
      ) values (
        ${userId},
        ${customerId},
        ${subscriptionId},
        ${status},
        ${tierCode},
        ${isoOrNull(period.starts_at || period.startsAt)},
        ${isoOrNull(period.ends_at || period.endsAt)},
        ${cancelAtPeriodEnd},
        false,
        ${JSON.stringify(data)}
      )
      on conflict (paddle_subscription_id) do update set
        user_id = excluded.user_id,
        paddle_customer_id = excluded.paddle_customer_id,
        status = excluded.status,
        tier_code = excluded.tier_code,
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = excluded.cancel_at_period_end,
        manual_override = false,
        metadata = excluded.metadata,
        updated_at = now()
    `;
  }

  if (['active', 'trialing'].includes(status)) {
    await sql`
      update users
      set current_tier_code = ${tierCode}, updated_at = now()
      where id = ${userId}
    `;
  } else {
    await sql`
      update users
      set current_tier_code = 'free', updated_at = now()
      where id = ${userId}
        and current_tier_code = ${tierCode}
    `;
  }
}

async function updatePromotionRedemption(data: Record<string, any>) {
  const promotionCode = cleanPromotion(data.custom_data?.promotionCode || data.customData?.promotionCode);
  if (!promotionCode) return;
  const sql = db();
  await sql`
    update promotions
    set redemption_count = redemption_count + 1,
        updated_at = now()
    where code = ${promotionCode}
      and active = true
  `;
}

function paddleAmount(data: Record<string, any>) {
  const raw = data.details?.totals?.total
    || data.totals?.total
    || data.total
    || data.amount
    || '';
  const amount = Number(raw);
  if (Number.isFinite(amount) && String(raw).trim() !== '') {
    return Math.abs(amount) >= 100 ? (amount / 100).toFixed(2) : amount.toFixed(2);
  }
  return String(raw || '');
}

async function sendPaymentConfirmation(data: Record<string, any>) {
  const userId = await findUserForPaddleData(data);
  if (!userId) return;
  const sql = db();
  const user = await one<{ email: string; name: string; currentTierCode: string }>(sql`
    select email, name, current_tier_code as "currentTierCode"
    from users
    where id = ${userId}
    limit 1
  `);
  if (!user) return;
  const tierCode = await tierFromPaddleData(data);
  await sendTemplateEmailQuietly('payment_confirmation', user.email, {
    name: user.name || user.email,
    email: user.email,
    tierCode: tierCode || user.currentTierCode || 'free',
    amount: paddleAmount(data),
    currency: data.currency_code || data.currency || data.details?.totals?.currency_code || '',
    transactionId: data.id || data.transaction_id || '',
    subscriptionId: data.subscription_id || data.subscription?.id || '',
    paymentDate: data.billed_at || data.created_at || new Date().toISOString(),
  });
}

export async function handlePaddleWebhook(rawBody: string, signatureHeader: string | null) {
  await verifyPaddleWebhook(rawBody, signatureHeader);
  const payload = JSON.parse(rawBody) as PaddleEvent;
  const id = eventId(payload);
  const type = eventType(payload);
  if (!id || !type) fail(400, 'invalid_paddle_event', 'Paddle webhook event is missing an ID or type.');

  const sql = db();
  const inserted = await one<{ paddleEventId: string }>(sql`
    insert into paddle_events (paddle_event_id, event_type, payload)
    values (${id}, ${type}, ${rawBody})
    on conflict (paddle_event_id) do nothing
    returning paddle_event_id as "paddleEventId"
  `);
  if (!inserted) return { ok: true, duplicate: true };

  const data = payload.data || {};
  if (type.startsWith('customer.')) {
    await upsertPaddleCustomer(data);
  }
  if (type.startsWith('subscription.')) {
    await upsertPaddleSubscription(data);
    if (type === 'subscription.created' || type === 'subscription.updated') {
      await updatePromotionRedemption(data);
    }
  }
  if (type === 'transaction.completed' || type === 'transaction.paid') {
    void sendPaymentConfirmation(data).catch(error => console.error('Payment confirmation email failed', error));
  }

  return { ok: true, duplicate: false, eventId: id, eventType: type };
}

export async function syncPaddleSubscription(actor: Actor, input: { subscriptionId?: string; customerId?: string }) {
  const subscriptionId = (input.subscriptionId || '').trim();
  const customerId = (input.customerId || '').trim();
  if (!subscriptionId && !customerId) fail(400, 'missing_paddle_id', 'Paddle subscription ID or customer ID is required.');

  if (subscriptionId) {
    const payload = await paddleFetch(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
    const data = payload?.data || payload;
    await upsertPaddleSubscription(data);
    await audit(actor, 'paddle.subscription.sync', 'paddle_subscription', subscriptionId, { source: 'api' });
    return { ok: true, subscriptionId };
  }

  const payload = await paddleFetch(`/subscriptions?customer_id=${encodeURIComponent(customerId)}`);
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  for (const row of rows) {
    await upsertPaddleSubscription(row);
  }
  await audit(actor, 'paddle.customer.sync', 'paddle_customer', customerId, { subscriptions: rows.length });
  return { ok: true, customerId, subscriptions: rows.length };
}
