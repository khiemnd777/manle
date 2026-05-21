import type { ReactNode } from 'react';

export type IconName =
  | 'alert'
  | 'audit'
  | 'bold'
  | 'check'
  | 'customers'
  | 'edit'
  | 'emails'
  | 'entitlements'
  | 'eye'
  | 'info'
  | 'italic'
  | 'layers'
  | 'list'
  | 'listOrdered'
  | 'logout'
  | 'mail'
  | 'plus'
  | 'profile'
  | 'promotions'
  | 'redo'
  | 'refresh'
  | 'save'
  | 'search'
  | 'subscriptions'
  | 'sync'
  | 'tiers'
  | 'trash'
  | 'undo'
  | 'users'
  | 'x';

const icons: Record<IconName, ReactNode> = {
  alert: (
    <>
      <path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  audit: (
    <>
      <path d="M9 11h6" />
      <path d="M9 15h6" />
      <path d="M9 7h2" />
      <path d="M5 3h14v18H5z" />
    </>
  ),
  bold: (
    <>
      <path d="M7 5h6a4 4 0 0 1 0 8H7z" />
      <path d="M7 13h7a4 4 0 0 1 0 8H7z" />
      <path d="M7 5v16" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  customers: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  emails: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  entitlements: (
    <>
      <path d="M12 3 4 7v6c0 5 3.4 7.4 8 9 4.6-1.6 8-4 8-9V7Z" />
      <path d="m9 12 2 2 4-5" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </>
  ),
  italic: (
    <>
      <path d="M19 4h-9" />
      <path d="M14 20H5" />
      <path d="M15 4 9 20" />
    </>
  ),
  layers: (
    <>
      <path d="m12 2 9 5-9 5-9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </>
  ),
  listOrdered: (
    <>
      <path d="M10 6h11" />
      <path d="M10 12h11" />
      <path d="M10 18h11" />
      <path d="M4 6h1v4" />
      <path d="M4 10h2" />
      <path d="M3.5 16a1.5 1.5 0 1 1 3 0c0 .6-.4 1-1.5 2H6.5" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  profile: (
    <>
      <path d="M20 21a8 8 0 0 0-16 0" />
      <path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
    </>
  ),
  promotions: (
    <>
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" />
      <path d="M7.5 7.5h.01" />
    </>
  ),
  redo: (
    <>
      <path d="m17 7 4 4-4 4" />
      <path d="M3 18v-2a5 5 0 0 1 5-5h13" />
    </>
  ),
  refresh: (
    <>
      <path d="M21 12a9 9 0 0 1-15.3 6.4" />
      <path d="M3 12A9 9 0 0 1 18.3 5.6" />
      <path d="M21 4v6h-6" />
      <path d="M3 20v-6h6" />
    </>
  ),
  save: (
    <>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  subscriptions: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 15h3" />
      <path d="M14 15h3" />
    </>
  ),
  sync: (
    <>
      <path d="M21 12a9 9 0 0 1-2.6 6.4" />
      <path d="M18 21v-5h-5" />
      <path d="M3 12a9 9 0 0 1 2.6-6.4" />
      <path d="M6 3v5h5" />
    </>
  ),
  tiers: (
    <>
      <path d="M4 19h16" />
      <path d="M6 16h12" />
      <path d="M8 13h8" />
      <path d="M10 10h4" />
      <path d="M12 4v6" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 15H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>
  ),
  undo: (
    <>
      <path d="m7 7-4 4 4 4" />
      <path d="M21 18v-2a5 5 0 0 0-5-5H3" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    </>
  ),
  x: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
};

export function Icon({ name, className = 'icon', title }: { name: IconName; className?: string; title?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {icons[name]}
    </svg>
  );
}
