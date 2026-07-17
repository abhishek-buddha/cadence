import { ConvexProvider } from 'convex/react';
import { prodConvex } from '../lib/prodConvexClient';

// Re-scopes useQuery/useMutation back to the production deployment for a
// subtree nested inside a DevConvexScope — used where real reference data
// (e.g. the actual insurance company list) is needed alongside dev-only data.
export default function ProdConvexScope({ children }) {
  return <ConvexProvider client={prodConvex}>{children}</ConvexProvider>;
}
