import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export const listClaims = (params) => apiGet('/claims', params);
export const getClaim = (id) => apiGet(`/claims/${id}`);
export const createClaim = (body) => apiPost('/claims', body);
export const updateClaim = (id, body) => apiPatch(`/claims/${id}`, body);
export const updateClaimStatus = (id, status) => apiPatch(`/claims/${id}/status`, { status });
export const deleteClaim = (id) => apiDelete(`/claims/${id}`);

export const getClaimFollowup = (id) => apiGet(`/claims/${id}/followup`);
export const updateClaimFollowup = (id, body) => apiPatch(`/claims/${id}/followup`, body);

export const listCallSessions = (params) => apiGet('/call-sessions', params);
export const getCallSession = (id) => apiGet(`/call-sessions/${id}`);
export const createCallSession = (body) => apiPost('/call-sessions', body);
export const updateCallSession = (id, body) => apiPatch(`/call-sessions/${id}`, body);

export const listCalls = (params) => apiGet('/calls', params);
export const getCall = (id) => apiGet(`/calls/${id}`);
export const createCall = (body) => apiPost('/calls', body);
export const updateCall = (id, body) => apiPatch(`/calls/${id}`, body);

export const listCallResults = (params) => apiGet('/call-results', params);
export const createCallResult = (body) => apiPost('/call-results', body);

export const listCallEvents = (callId) => apiGet('/call-events', { call_id: callId });
