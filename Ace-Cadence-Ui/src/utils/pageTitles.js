// Maps the current route to a human page title for the top header bar,
// matching the mock's `.tb-title` (page name shown top-left of the topbar).
// Longest-prefix match so detail routes (e.g. /claims/:id) inherit their
// list page's title.
const PAGE_TITLES = [
  ['/dashboard', 'My Dashboard'],
  ['/appointments', 'Appointments'],
  ['/benefit-verification', 'Benefit Verification'],
  ['/eligibility-verification', 'Eligibility Verification'],
  ['/prior-authorization', 'Prior Authorization'],
  ['/claims', 'Claim Management'],
  ['/patient-balance-reminder', 'Patient Balance Reminder'],
  ['/inbound-billing', 'Inbound Billing'],
  ['/patients', 'Patients'],
  ['/insurance', 'Payer Directory'],
  ['/providers', 'Providers'],
  ['/master-data', 'Master Data'],
  ['/call-audit', 'Call Audit'],
  ['/calls', 'Call History'],
  ['/live', 'Live Calls'],
  ['/settings', 'Settings'],
  ['/eligibility', 'Dental Eligibility Verification'],
  ['/sessions', 'Sessions'],
  ['/reports', 'Reports'],
  ['/audit', 'Audit Log'],
  ['/users', 'User Management'],
  ['/api-keys', 'API Keys'],
  ['/webhooks', 'Webhooks'],
  ['/transfers', 'Transfer Destinations'],
];

export function getPageTitle(pathname, defaultTitle) {
  // Exact "/" root is layout-specific (Dashboard vs My Queue) — caller supplies it.
  if (pathname === '/') return defaultTitle;
  let best = null;
  for (const [prefix, title] of PAGE_TITLES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      if (!best || prefix.length > best[0].length) best = [prefix, title];
    }
  }
  return best ? best[1] : defaultTitle;
}
