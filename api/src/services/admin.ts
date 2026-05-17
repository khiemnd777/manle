import { db, one } from '../db/client';
import { fail } from '../http/errors';
import type { Actor, CustomerInput, PromotionInput, SubscriptionInput, SystemUserInput, SystemUserRole, TierInput } from '../types/admin';

function cleanEmail(value?: string) {
  return (value || '').trim().toLowerCase();
}

function cleanText(value?: string) {
  return (value || '').trim();
}

function cleanSystemRole(value?: string): SystemUserRole {
  if (value === 'admin' || value === 'user') return value;
  fail(400, 'invalid_role', 'System user role must be admin or user.');
}

function cleanStatus(value?: string) {
  if (value === 'active' || value === 'disabled') return value;
  fail(400, 'invalid_status', 'Status must be active or disabled.');
}

function isoOrNull(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export async function audit(actor: Actor, action: string, targetType: string, targetId: string, metadata: Record<string, unknown> = {}) {
  const sql = db();
  await sql`
    insert into audit_logs (actor_id, action, target_type, target_id, metadata)
    values (${actor.id}, ${action}, ${targetType}, ${targetId}, ${JSON.stringify(metadata)})
  `;
}

export async function overview() {
  const sql = db();
  const [systemUsers, customers, subscriptions, promotions, tiers] = await Promise.all([
    one<{ count: string }>(sql`select count(*)::text as count from users where role in ('admin', 'user')`),
    one<{ count: string }>(sql`select count(*)::text as count from users where role = 'customer'`),
    one<{ count: string }>(sql`select count(*)::text as count from subscriptions where status in ('active', 'trialing')`),
    one<{ count: string }>(sql`select count(*)::text as count from promotions where active = true`),
    one<{ count: string }>(sql`select count(*)::text as count from price_tiers where active = true`),
  ]);
  return {
    systemUsers: Number(systemUsers?.count || 0),
    customers: Number(customers?.count || 0),
    activeSubscriptions: Number(subscriptions?.count || 0),
    activePromotions: Number(promotions?.count || 0),
    activeTiers: Number(tiers?.count || 0),
  };
}

export async function listSystemUsers(search = '') {
  const sql = db();
  const pattern = `%${search.trim().toLowerCase()}%`;
  return await sql`
    select
      id,
      email,
      name,
      role,
      status,
      created_at as "createdAt",
      updated_at as "updatedAt"
    from users
    where role in ('admin', 'user')
      and (${search.trim()} = '' or lower(email) like ${pattern} or lower(name) like ${pattern})
    order by created_at desc
    limit 200
  `;
}

export async function getSystemUser(id: string) {
  const sql = db();
  const row = await one(sql`
    select
      id,
      email,
      name,
      role,
      status,
      created_at as "createdAt",
      updated_at as "updatedAt"
    from users
    where id = ${id}
      and role in ('admin', 'user')
    limit 1
  `);
  if (!row) fail(404, 'system_user_not_found', 'System user not found.');
  return row;
}

export async function createSystemUser(actor: Actor, input: SystemUserInput) {
  const email = cleanEmail(input.email);
  const name = cleanText(input.name);
  const role = cleanSystemRole(input.role || 'user');
  const status = cleanStatus(input.status || 'active');
  const password = input.password || '';
  if (!email.includes('@')) fail(400, 'invalid_email', 'System user email is required.');
  if (!name) fail(400, 'invalid_name', 'System user name is required.');
  if (password.length < 10) fail(400, 'weak_password', 'Password must be at least 10 characters.');

  const sql = db();
  const existing = await one<{ id: string }>(sql`
    select id
    from users
    where lower(email) = ${email}
    limit 1
  `);
  if (existing) fail(409, 'email_exists', 'An account with this email already exists.');

  const passwordHash = await Bun.password.hash(password, { algorithm: 'argon2id' });
  const tierCode = role === 'admin' ? 'pro' : 'free';
  const row = await one(sql`
    insert into users (email, name, password_hash, role, status, current_tier_code)
    values (${email}, ${name}, ${passwordHash}, ${role}, ${status}, ${tierCode})
    returning id, email, name, role, status, created_at as "createdAt", updated_at as "updatedAt"
  `);
  if (!row) fail(500, 'system_user_create_failed', 'Could not create system user.');
  await audit(actor, 'system_user.create', 'user', String((row as any).id), { email, role, status });
  return row;
}

export async function updateSystemUser(actor: Actor, id: string, input: SystemUserInput) {
  if (id === actor.id) fail(400, 'self_update_not_allowed', 'Use the profile page to update your own account.');

  const sql = db();
  const current = await one<{ id: string; email: string; role: SystemUserRole; status: 'active' | 'disabled' }>(sql`
    select id, email, role, status
    from users
    where id = ${id}
      and role in ('admin', 'user')
    limit 1
  `);
  if (!current) fail(404, 'system_user_not_found', 'System user not found.');

  const email = input.email != null ? cleanEmail(input.email) : null;
  const name = input.name != null ? cleanText(input.name) : null;
  const role = input.role != null ? cleanSystemRole(input.role) : null;
  const status = input.status != null ? cleanStatus(input.status) : null;
  const password = input.password || '';

  if (email != null && !email.includes('@')) fail(400, 'invalid_email', 'System user email is required.');
  if (name != null && !name) fail(400, 'invalid_name', 'System user name is required.');
  if (password && password.length < 10) fail(400, 'weak_password', 'Password must be at least 10 characters.');

  const nextRole = role || current.role;
  const nextStatus = status || current.status;
  if (current.role === 'admin' && current.status === 'active' && (nextRole !== 'admin' || nextStatus !== 'active')) {
    const remainingAdmins = await one<{ count: string }>(sql`
      select count(*)::text as count
      from users
      where role = 'admin'
        and status = 'active'
        and id <> ${id}
    `);
    if (Number(remainingAdmins?.count || 0) < 1) {
      fail(400, 'last_admin_required', 'At least one active admin must remain.');
    }
  }

  if (email && cleanEmail(current.email) !== email) {
    const existing = await one<{ id: string }>(sql`
      select id
      from users
      where lower(email) = ${email}
        and id <> ${id}
      limit 1
    `);
    if (existing) fail(409, 'email_exists', 'An account with this email already exists.');
  }

  const passwordHash = password
    ? await Bun.password.hash(password, { algorithm: 'argon2id' })
    : null;

  const row = await one(sql`
    update users
    set
      email = coalesce(${email}, email),
      name = coalesce(${name}, name),
      role = coalesce(${role}, role),
      status = coalesce(${status}, status),
      password_hash = coalesce(${passwordHash}, password_hash),
      updated_at = now()
    where id = ${id}
    returning id, email, name, role, status, created_at as "createdAt", updated_at as "updatedAt"
  `);
  if (!row) fail(500, 'system_user_update_failed', 'Could not update system user.');

  if (passwordHash || status === 'disabled') {
    await Promise.all([
      sql`update sessions set revoked_at = coalesce(revoked_at, now()) where user_id = ${id}`,
      sql`update refresh_tokens set revoked_at = coalesce(revoked_at, now()) where user_id = ${id}`,
    ]);
  }

  await audit(actor, 'system_user.update', 'user', id, {
    email: email ?? undefined,
    name: name ?? undefined,
    role: role ?? undefined,
    status: status ?? undefined,
    passwordChanged: Boolean(passwordHash),
  });
  return row;
}

export async function listCustomers(search = '') {
  const sql = db();
  const pattern = `%${search.trim().toLowerCase()}%`;
  return await sql`
    select
      u.id,
      u.email,
      u.name,
      u.status,
      u.current_tier_code as "currentTierCode",
      u.paddle_customer_id as "paddleCustomerId",
      u.notes,
      u.created_at as "createdAt",
      coalesce(eu.export_count, 0) as "exportsToday",
      s.status as "subscriptionStatus",
      s.tier_code as "subscriptionTier"
    from users u
    left join export_usage eu on eu.user_id = u.id and eu.usage_date = current_date
    left join lateral (
      select status, tier_code
      from subscriptions
      where user_id = u.id
      order by created_at desc
      limit 1
    ) s on true
    where u.role = 'customer'
      and (${search.trim()} = '' or lower(u.email) like ${pattern} or lower(u.name) like ${pattern})
    order by u.created_at desc
    limit 200
  `;
}

export async function createCustomer(actor: Actor, input: CustomerInput) {
  const email = cleanEmail(input.email);
  const name = cleanText(input.name);
  if (!email.includes('@')) fail(400, 'invalid_email', 'Customer email is required.');
  if (!name) fail(400, 'invalid_name', 'Customer name is required.');
  const sql = db();
  const row = await one(sql`
    insert into users (email, name, role, status, current_tier_code, paddle_customer_id, notes)
    values (
      ${email},
      ${name},
      'customer',
      ${input.status || 'active'},
      ${input.currentTierCode || 'free'},
      ${input.paddleCustomerId || null},
      ${input.notes || ''}
    )
    returning id, email, name, status, current_tier_code as "currentTierCode", paddle_customer_id as "paddleCustomerId", notes
  `);
  await audit(actor, 'customer.create', 'user', String((row as any).id), { email });
  return row;
}

export async function updateCustomer(actor: Actor, id: string, input: CustomerInput) {
  const sql = db();
  const current = await one<{ id: string }>(sql`select id from users where id = ${id} and role = 'customer'`);
  if (!current) fail(404, 'customer_not_found', 'Customer not found.');
  const row = await one(sql`
    update users
    set
      email = coalesce(${input.email ? cleanEmail(input.email) : null}, email),
      name = coalesce(${input.name != null ? cleanText(input.name) : null}, name),
      status = coalesce(${input.status || null}, status),
      current_tier_code = coalesce(${input.currentTierCode || null}, current_tier_code),
      paddle_customer_id = coalesce(${input.paddleCustomerId ?? null}, paddle_customer_id),
      notes = coalesce(${input.notes ?? null}, notes),
      updated_at = now()
    where id = ${id}
    returning id, email, name, status, current_tier_code as "currentTierCode", paddle_customer_id as "paddleCustomerId", notes
  `);
  await audit(actor, 'customer.update', 'user', id, input as Record<string, unknown>);
  return row;
}

export async function listSubscriptions(userId?: string) {
  const sql = db();
  return await sql`
    select
      s.id,
      s.user_id as "userId",
      u.email as "customerEmail",
      u.name as "customerName",
      s.paddle_customer_id as "paddleCustomerId",
      s.paddle_subscription_id as "paddleSubscriptionId",
      s.status,
      s.tier_code as "tierCode",
      s.current_period_start as "currentPeriodStart",
      s.current_period_end as "currentPeriodEnd",
      s.cancel_at_period_end as "cancelAtPeriodEnd",
      s.manual_override as "manualOverride",
      s.created_at as "createdAt"
    from subscriptions s
    join users u on u.id = s.user_id
    where (${userId || ''} = '' or s.user_id = ${userId || null})
    order by s.created_at desc
    limit 300
  `;
}

export async function createSubscription(actor: Actor, input: SubscriptionInput) {
  if (!input.userId) fail(400, 'missing_user', 'Customer is required.');
  if (!input.tierCode) fail(400, 'missing_tier', 'Tier is required.');
  const sql = db();
  const row = await one(sql`
    insert into subscriptions (
      user_id, paddle_customer_id, paddle_subscription_id, status, tier_code,
      current_period_start, current_period_end, cancel_at_period_end, manual_override
    ) values (
      ${input.userId},
      ${input.paddleCustomerId || null},
      ${input.paddleSubscriptionId || null},
      ${input.status || 'active'},
      ${input.tierCode},
      ${isoOrNull(input.currentPeriodStart)},
      ${isoOrNull(input.currentPeriodEnd)},
      ${Boolean(input.cancelAtPeriodEnd)},
      ${input.manualOverride ?? true}
    )
    returning id
  `);
  await audit(actor, 'subscription.create', 'subscription', String((row as any).id), input as Record<string, unknown>);
  return row;
}

export async function updateSubscription(actor: Actor, id: string, input: SubscriptionInput) {
  const sql = db();
  const row = await one(sql`
    update subscriptions
    set
      paddle_customer_id = coalesce(${input.paddleCustomerId ?? null}, paddle_customer_id),
      paddle_subscription_id = coalesce(${input.paddleSubscriptionId ?? null}, paddle_subscription_id),
      status = coalesce(${input.status || null}, status),
      tier_code = coalesce(${input.tierCode || null}, tier_code),
      current_period_start = coalesce(${isoOrNull(input.currentPeriodStart)}, current_period_start),
      current_period_end = coalesce(${isoOrNull(input.currentPeriodEnd)}, current_period_end),
      cancel_at_period_end = coalesce(${input.cancelAtPeriodEnd ?? null}, cancel_at_period_end),
      manual_override = coalesce(${input.manualOverride ?? null}, manual_override),
      updated_at = now()
    where id = ${id}
    returning id
  `);
  if (!row) fail(404, 'subscription_not_found', 'Subscription not found.');
  await audit(actor, 'subscription.update', 'subscription', id, input as Record<string, unknown>);
  return row;
}

export async function listPromotions() {
  const sql = db();
  return await sql`
    select
      id,
      code,
      name,
      description,
      tier_code as "tierCode",
      discount_type as "discountType",
      discount_value as "discountValue",
      starts_at as "startsAt",
      ends_at as "endsAt",
      max_redemptions as "maxRedemptions",
      redemption_count as "redemptionCount",
      paddle_discount_id as "paddleDiscountId",
      active,
      created_at as "createdAt"
    from promotions
    order by created_at desc
  `;
}

export async function createPromotion(actor: Actor, input: PromotionInput) {
  const code = cleanText(input.code).toUpperCase();
  if (!code) fail(400, 'missing_code', 'Promotion code is required.');
  if (!input.name) fail(400, 'missing_name', 'Promotion name is required.');
  const sql = db();
  const row = await one(sql`
    insert into promotions (
      code, name, description, tier_code, discount_type, discount_value,
      starts_at, ends_at, max_redemptions, paddle_discount_id, active
    ) values (
      ${code},
      ${cleanText(input.name)},
      ${input.description || ''},
      ${input.tierCode || null},
      ${input.discountType || 'percent'},
      ${input.discountValue || 0},
      ${isoOrNull(input.startsAt)},
      ${isoOrNull(input.endsAt)},
      ${input.maxRedemptions ?? null},
      ${input.paddleDiscountId || null},
      ${input.active ?? true}
    )
    returning id
  `);
  await audit(actor, 'promotion.create', 'promotion', String((row as any).id), { code });
  return row;
}

export async function updatePromotion(actor: Actor, id: string, input: PromotionInput) {
  const sql = db();
  const row = await one(sql`
    update promotions
    set
      code = coalesce(${input.code ? cleanText(input.code).toUpperCase() : null}, code),
      name = coalesce(${input.name ? cleanText(input.name) : null}, name),
      description = coalesce(${input.description ?? null}, description),
      tier_code = coalesce(${input.tierCode ?? null}, tier_code),
      discount_type = coalesce(${input.discountType || null}, discount_type),
      discount_value = coalesce(${input.discountValue ?? null}, discount_value),
      starts_at = coalesce(${isoOrNull(input.startsAt)}, starts_at),
      ends_at = coalesce(${isoOrNull(input.endsAt)}, ends_at),
      max_redemptions = coalesce(${input.maxRedemptions ?? null}, max_redemptions),
      paddle_discount_id = coalesce(${input.paddleDiscountId ?? null}, paddle_discount_id),
      active = coalesce(${input.active ?? null}, active),
      updated_at = now()
    where id = ${id}
    returning id
  `);
  if (!row) fail(404, 'promotion_not_found', 'Promotion not found.');
  await audit(actor, 'promotion.update', 'promotion', id, input as Record<string, unknown>);
  return row;
}

export async function listPriceTiers() {
  const sql = db();
  return await sql`
    select
      code,
      name,
      pricing_badge as "pricingBadge",
      monthly_price_cents as "monthlyPriceCents",
      paddle_price_id as "paddlePriceId",
      export_limit_per_day as "exportLimitPerDay",
      watermark_enabled as "watermarkEnabled",
      branding_enabled as "brandingEnabled",
      style_editor_enabled as "styleEditorEnabled",
      benefit_editor_enabled as "benefitEditorEnabled",
      active,
      sort_order as "sortOrder"
    from price_tiers
    order by sort_order, monthly_price_cents
  `;
}

export async function listPublicPricing() {
  const sql = db();
  const rows = await sql`
    select
      pt.code,
      pt.name,
      nullif(pt.pricing_badge, '') as badge,
      (pt.pricing_badge <> '') as featured,
      pt.monthly_price_cents as "monthlyPriceCents",
      pt.export_limit_per_day as "exportLimitPerDay",
      coalesce(
        jsonb_object_agg(te.entitlement_key, case when te.enabled = false then 'false'::jsonb else te.value end)
          filter (where te.entitlement_key is not null),
        '{}'::jsonb
      ) as entitlements
    from price_tiers pt
    left join tier_entitlements te on te.tier_code = pt.code
    where pt.active = true
    group by pt.code
    order by pt.sort_order, pt.monthly_price_cents
  `;

  return { tiers: rows };
}

export async function upsertPriceTier(actor: Actor, input: TierInput) {
  const code = cleanText(input.code).toLowerCase();
  if (!code) fail(400, 'missing_code', 'Tier code is required.');
  const sql = db();
  const exportLimit = input.exportLimitPerDay ?? 0;
  const watermark = input.watermarkEnabled ?? true;
  const branding = input.brandingEnabled ?? false;
  const styleEditor = input.styleEditorEnabled ?? false;
  const benefitEditor = input.benefitEditorEnabled ?? false;
  const pricingBadge = cleanText(input.pricingBadge || '');
  const row = await one(sql`
    insert into price_tiers (
      code, name, pricing_badge, monthly_price_cents, paddle_price_id, export_limit_per_day,
      watermark_enabled, branding_enabled, style_editor_enabled, benefit_editor_enabled, active, sort_order
    ) values (
      ${code},
      ${input.name || code},
      ${pricingBadge},
      ${input.monthlyPriceCents ?? 0},
      ${input.paddlePriceId || null},
      ${exportLimit},
      ${watermark},
      ${branding},
      ${styleEditor},
      ${benefitEditor},
      ${input.active ?? true},
      ${input.sortOrder ?? 99}
    )
    on conflict (code) do update set
      name = excluded.name,
      pricing_badge = excluded.pricing_badge,
      monthly_price_cents = excluded.monthly_price_cents,
      paddle_price_id = excluded.paddle_price_id,
      export_limit_per_day = excluded.export_limit_per_day,
      watermark_enabled = excluded.watermark_enabled,
      branding_enabled = excluded.branding_enabled,
      style_editor_enabled = excluded.style_editor_enabled,
      benefit_editor_enabled = excluded.benefit_editor_enabled,
      active = excluded.active,
      sort_order = excluded.sort_order,
      updated_at = now()
    returning code
  `);
  await sql`
    insert into tier_entitlements (tier_code, entitlement_key, enabled, value) values
      (${code}, 'watermark', ${watermark}, ${JSON.stringify(watermark)}),
      (${code}, 'exports_per_day', true, ${JSON.stringify(exportLimit)}),
      (${code}, 'branding', ${branding}, ${JSON.stringify(branding)}),
      (${code}, 'style_editor', ${styleEditor}, ${JSON.stringify(styleEditor)}),
      (${code}, 'benefit_editor', ${benefitEditor}, ${JSON.stringify(benefitEditor)})
    on conflict (tier_code, entitlement_key) do update set
      enabled = excluded.enabled,
      value = excluded.value,
      updated_at = now()
  `;
  await audit(actor, 'tier.upsert', 'price_tier', code, input as Record<string, unknown>);
  return row;
}

export async function listEntitlements() {
  const sql = db();
  const [definitions, tiers, grants] = await Promise.all([
    sql`
      select key, label, description, value_type as "valueType", default_value as "defaultValue"
      from entitlements
      order by key
    `,
    listPriceTiers(),
    sql`
      select tier_code as "tierCode", entitlement_key as "entitlementKey", enabled, value
      from tier_entitlements
      order by tier_code, entitlement_key
    `,
  ]);
  return { definitions, tiers, grants };
}

export async function updateTierEntitlement(actor: Actor, tierCode: string, entitlementKey: string, input: { enabled?: boolean; value?: unknown }) {
  const sql = db();
  const row = await one(sql`
    insert into tier_entitlements (tier_code, entitlement_key, enabled, value)
    values (${tierCode}, ${entitlementKey}, ${input.enabled ?? true}, ${JSON.stringify(input.value ?? false)})
    on conflict (tier_code, entitlement_key) do update set
      enabled = excluded.enabled,
      value = excluded.value,
      updated_at = now()
    returning tier_code as "tierCode", entitlement_key as "entitlementKey"
  `);
  await audit(actor, 'entitlement.update', 'tier_entitlement', `${tierCode}:${entitlementKey}`, input as Record<string, unknown>);
  return row;
}

export async function effectiveEntitlementsForUser(userId: string) {
  const sql = db();
  const user = await one<{ id: string; currentTierCode: string }>(sql`
    select id, current_tier_code as "currentTierCode"
    from users
    where id = ${userId}
  `);
  if (!user) fail(404, 'user_not_found', 'User not found.');
  const sub = await one<{ tierCode: string }>(sql`
    select tier_code as "tierCode"
    from subscriptions
    where user_id = ${userId}
      and status in ('active', 'trialing')
      and (current_period_end is null or current_period_end > now())
    order by created_at desc
    limit 1
  `);
  const tierCode = sub?.tierCode || user.currentTierCode || 'free';
  const grants = await sql`
    select e.key, e.value_type as "valueType", e.default_value as "defaultValue", te.enabled, te.value
    from entitlements e
    left join tier_entitlements te on te.entitlement_key = e.key and te.tier_code = ${tierCode}
    order by e.key
  `;
  const entitlements: Record<string, unknown> = {};
  for (const grant of grants as any[]) {
    entitlements[grant.key] = grant.enabled === false ? false : (grant.value ?? grant.defaultValue);
  }
  return { userId, tierCode, entitlements };
}

export async function auditLogs() {
  const sql = db();
  return await sql`
    select
      a.id,
      a.action,
      a.target_type as "targetType",
      a.target_id as "targetId",
      a.metadata,
      a.created_at as "createdAt",
      u.email as "actorEmail"
    from audit_logs a
    left join users u on u.id = a.actor_id
    order by a.created_at desc
    limit 100
  `;
}
