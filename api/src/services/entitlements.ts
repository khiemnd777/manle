import { db, one } from '../db/client';
import { fail } from '../http/errors';
import type { Actor } from '../types/admin';
import { effectiveEntitlementsForUser } from './admin';

type EffectiveEntitlements = {
  userId?: string;
  tierCode: string;
  entitlements: Record<string, unknown>;
};

const FEATURE_ENTITLEMENT_KEYS = {
  branding: 'branding',
  style_editor: 'style_editor',
  benefit_editor: 'benefit_editor',
  custom_template: 'custom_template',
} as const;

type FeatureKey = keyof typeof FEATURE_ENTITLEMENT_KEYS;

function numericEntitlement(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function booleanEntitlement(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

export async function effectiveEntitlementsForTier(tierCode = 'free'): Promise<EffectiveEntitlements> {
  const sql = db();
  const tier = await one<{ code: string }>(sql`
    select code
    from price_tiers
    where code = ${tierCode}
      and active = true
    limit 1
  `);
  const resolvedTier = tier?.code || 'free';
  const grants = await sql`
    select e.key, e.default_value as "defaultValue", te.enabled, te.value
    from entitlements e
    left join tier_entitlements te on te.entitlement_key = e.key and te.tier_code = ${resolvedTier}
    order by e.key
  `;
  const entitlements: Record<string, unknown> = {};
  for (const grant of grants as any[]) {
    entitlements[grant.key] = grant.enabled === false
      ? false
      : (grant.value ?? grant.defaultValue);
  }
  return { tierCode: resolvedTier, entitlements };
}

async function usageToday(userId: string) {
  const sql = db();
  const row = await one<{ exportCount: string | number }>(sql`
    select export_count as "exportCount"
    from export_usage
    where user_id = ${userId}
      and usage_date = current_date
    limit 1
  `);
  return Number(row?.exportCount || 0);
}

export async function accountEntitlements(actor: Actor | null) {
  const effective = actor
    ? await effectiveEntitlementsForUser(actor.id)
    : await effectiveEntitlementsForTier('free');
  const limit = numericEntitlement(effective.entitlements.exports_per_day, 0);
  const used = actor ? await usageToday(actor.id) : 0;
  return {
    actor,
    tierCode: effective.tierCode,
    entitlements: effective.entitlements,
    quota: {
      // The quota window is Postgres current_date. Docker Postgres defaults to UTC,
      // which keeps quota reset deterministic across FE/API containers.
      limit,
      used,
      remaining: Math.max(0, limit - used),
    },
    requiresLogin: !actor,
  };
}

export async function authorizeExport(actor: Actor, input: { format?: string }) {
  const format = String(input.format || '').toLowerCase();
  if (!['pdf', 'png', 'jpg', 'jpeg'].includes(format)) {
    fail(400, 'invalid_export_format', 'Export format must be pdf, png, or jpg.');
  }

  const effective = await effectiveEntitlementsForUser(actor.id);
  const limit = numericEntitlement(effective.entitlements.exports_per_day, 0);
  if (limit <= 0) fail(403, 'export_not_allowed', 'Your current tier does not allow exports.');

  const sql = db();
  const row = await one<{ exportCount: string | number }>(sql`
    insert into export_usage (user_id, usage_date, export_count, tier_code)
    values (${actor.id}, current_date, 1, ${effective.tierCode})
    on conflict (user_id, usage_date) do update set
      export_count = export_usage.export_count + 1,
      tier_code = excluded.tier_code,
      updated_at = now()
    where export_usage.export_count < ${limit}
    returning export_count as "exportCount"
  `);

  if (!row) {
    fail(429, 'export_quota_exceeded', `Daily export limit reached for the ${effective.tierCode} tier.`);
  }

  const used = Number(row.exportCount);
  return {
    ok: true,
    tierCode: effective.tierCode,
    format,
    entitlements: effective.entitlements,
    quota: {
      limit,
      used,
      remaining: Math.max(0, limit - used),
    },
    watermark: booleanEntitlement(effective.entitlements.watermark, true),
    branding: booleanEntitlement(effective.entitlements.branding, false),
    styleEditor: booleanEntitlement(effective.entitlements.style_editor, false),
    benefitEditor: booleanEntitlement(effective.entitlements.benefit_editor, false),
  };
}

export async function authorizeFeature(actor: Actor, input: { feature?: string }) {
  const feature = String(input.feature || '').toLowerCase();
  const entitlementKey = FEATURE_ENTITLEMENT_KEYS[feature as FeatureKey];
  if (!entitlementKey) {
    fail(400, 'invalid_feature', 'Feature must be branding, style_editor, benefit_editor, or custom_template.');
  }

  const effective = await effectiveEntitlementsForUser(actor.id);
  if (!booleanEntitlement(effective.entitlements[entitlementKey], false)) {
    fail(403, 'feature_not_allowed', 'Your current tier does not allow this feature.');
  }

  return {
    ok: true,
    feature,
    tierCode: effective.tierCode,
    entitlements: effective.entitlements,
  };
}
