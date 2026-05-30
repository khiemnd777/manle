import type { IconName } from './icons';
import type { AdminData, View } from './adminTypes';

export const viewMeta: Record<View, { label: string; icon: IconName; description: string }> = {
  users: {
    label: 'System Users',
    icon: 'users',
    description: 'Manage internal MANLE admin and normal user accounts.',
  },
  customers: {
    label: 'Customers',
    icon: 'customers',
    description: 'Manage customer access, tiers, subscription state, and support notes.',
  },
  subscriptions: {
    label: 'Subscriptions',
    icon: 'subscriptions',
    description: 'Inspect Paddle billing state, manual overrides, and subscription sync.',
  },
  promotions: {
    label: 'Promotions',
    icon: 'promotions',
    description: 'Manage promo codes, Paddle discounts, redemptions, and active offers.',
  },
  tiers: {
    label: 'Price Tiers',
    icon: 'tiers',
    description: 'Configure pricing, export limits, product controls, and Paddle price IDs.',
  },
  entitlements: {
    label: 'Entitlements',
    icon: 'entitlements',
    description: 'Control feature access resolved server-side from customer tier state.',
  },
  paddle: {
    label: 'Paddle Settings',
    icon: 'key',
    description: 'Manage backend Paddle API credentials.',
  },
  emails: {
    label: 'Email Templates',
    icon: 'emails',
    description: 'Manage Resend delivery settings, reusable templates, and test sends.',
  },
  illustrations: {
    label: 'Illustration Profiles',
    icon: 'layers',
    description: 'Train and publish carrier/product extraction profiles for supported illustration PDFs.',
  },
  audit: {
    label: 'Audit Log',
    icon: 'audit',
    description: 'Review recent admin mutations and system-level activity.',
  },
  profile: {
    label: 'Profile',
    icon: 'profile',
    description: 'Manage your account identity and password.',
  },
};

export const adminNavItems: View[] = ['users', 'customers', 'subscriptions', 'promotions', 'tiers', 'entitlements', 'paddle', 'emails', 'illustrations', 'audit'];

export const emptyData: AdminData = {
  overview: { systemUsers: 0, customers: 0, activeSubscriptions: 0, activePromotions: 0, activeTiers: 0 },
  systemUsers: [],
  customers: [],
  subscriptions: [],
  promotions: [],
  tiers: [],
  entitlementDefinitions: [],
  entitlementGrants: [],
  paddleSettings: null,
  emailSettings: null,
  emailTemplates: [],
  illustrationProfiles: [],
  auditLogs: [],
};
