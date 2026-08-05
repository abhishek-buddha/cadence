import { apiDelete, apiGet, apiPatch, apiPost } from './client';

const BASE = '/master-data';

export const listProviders = () => apiGet(`${BASE}/providers`);
export const getProvider = (id) => apiGet(`${BASE}/providers/${id}`);
export const createProvider = (body) => apiPost(`${BASE}/providers`, body);
export const updateProvider = (id, body) => apiPatch(`${BASE}/providers/${id}`, body);
export const deleteProvider = (id) => apiDelete(`${BASE}/providers/${id}`);

export const listInsuranceContacts = (params) => apiGet(`${BASE}/insurance-contacts`, params);
export const getInsuranceContact = (id) => apiGet(`${BASE}/insurance-contacts/${id}`);
export const createInsuranceContact = (body) => apiPost(`${BASE}/insurance-contacts`, body);
export const updateInsuranceContact = (id, body) => apiPatch(`${BASE}/insurance-contacts/${id}`, body);
export const deleteInsuranceContact = (id) => apiDelete(`${BASE}/insurance-contacts/${id}`);
export const markIvrVerified = (id) => apiPost(`${BASE}/insurance-contacts/${id}/mark-ivr-verified`);

export const listPatients = (params) => apiGet(`${BASE}/patients`, params);
export const getPatient = (id) => apiGet(`${BASE}/patients/${id}`);
export const createPatient = (body) => apiPost(`${BASE}/patients`, body);
export const updatePatient = (id, body) => apiPatch(`${BASE}/patients/${id}`, body);
export const deletePatient = (id) => apiDelete(`${BASE}/patients/${id}`);
