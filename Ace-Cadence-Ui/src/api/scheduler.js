import { apiGet, apiPatch, apiPost } from './client';

export const listJobs = (params) => apiGet('/jobs', params);
export const getJob = (id) => apiGet(`/jobs/${id}`);
export const createJob = (body) => apiPost('/jobs', body);
export const updateJob = (id, body) => apiPatch(`/jobs/${id}`, body);
