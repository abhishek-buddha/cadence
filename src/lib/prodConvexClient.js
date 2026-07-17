import { ConvexReactClient } from 'convex/react';

// The same production client the rest of the app uses (see main.jsx). Exported
// here so features scoped to the dev deployment (DevConvexScope) can still
// read real reference data — e.g. the actual insurance company list — instead
// of the dev deployment's separate, smaller dataset.
const prodConvexUrl = import.meta.env.VITE_CONVEX_URL || 'https://rapid-pheasant-510.convex.cloud';

export const prodConvex = new ConvexReactClient(prodConvexUrl);
