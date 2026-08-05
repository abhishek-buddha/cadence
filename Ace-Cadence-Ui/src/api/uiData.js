import { apiGet, apiPost } from './client';

const BASE = '/ui-data';

export const getClaimFullDetail = (claimId) => apiGet(`${BASE}/claims/${claimId}/full`);

export const publishInvalidation = (entityType, entityId) =>
  apiPost(`${BASE}/invalidate`, { entity_type: entityType, entity_id: entityId });
