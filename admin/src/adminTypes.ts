import type {
  AuditLog,
  Customer,
  EmailSettings,
  EmailTemplate,
  EntitlementDefinition,
  EntitlementGrant,
  PriceTier,
  Promotion,
  Subscription,
  SystemUser,
} from './api/client';

export type View = 'users' | 'customers' | 'subscriptions' | 'promotions' | 'tiers' | 'entitlements' | 'emails' | 'audit' | 'profile';

export type AdminData = {
  overview: { systemUsers: number; customers: number; activeSubscriptions: number; activePromotions: number; activeTiers: number };
  systemUsers: SystemUser[];
  customers: Customer[];
  subscriptions: Subscription[];
  promotions: Promotion[];
  tiers: PriceTier[];
  entitlementDefinitions: EntitlementDefinition[];
  entitlementGrants: EntitlementGrant[];
  emailSettings: EmailSettings | null;
  emailTemplates: EmailTemplate[];
  auditLogs: AuditLog[];
};

export type SelectOption = {
  value: string;
  label: string;
};
