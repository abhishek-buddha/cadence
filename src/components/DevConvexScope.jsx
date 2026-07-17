import { ConvexProvider } from 'convex/react';
import { devConvex } from '../lib/devConvexClient';

// Scopes useQuery/useMutation calls in its subtree to the dev Convex deployment
// instead of the production one the rest of the app uses.
export default function DevConvexScope({ children }) {
  return <ConvexProvider client={devConvex}>{children}</ConvexProvider>;
}
