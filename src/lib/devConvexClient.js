import { ConvexReactClient } from 'convex/react';

// Separate client for features still being built against the dev deployment
// (industrious-parakeet-351) while the rest of the app talks to production.
// Remove this once callAgents (and anything else built here) graduates to prod.
const devConvexUrl = import.meta.env.VITE_CONVEX_DEV_URL || 'https://industrious-parakeet-351.convex.cloud';

export const devConvex = new ConvexReactClient(devConvexUrl);
