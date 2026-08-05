import { apiGet } from './client';

const BASE = '/reports';

export const getCallAnalytics = (params) => apiGet(`${BASE}/call-analytics`, params);
export const getSuccessRate = (params) => apiGet(`${BASE}/success-rate`, params);
export const getDataAccuracy = (params) => apiGet(`${BASE}/data-accuracy`, params);
export const getTurnaroundTime = (params) => apiGet(`${BASE}/turnaround-time`, params);
export const getHoldMetrics = (params) => apiGet(`${BASE}/hold-metrics`, params);
export const getOperationalKpis = (params) => apiGet(`${BASE}/operational-kpis`, params);
export const getExceptionReport = (params) => apiGet(`${BASE}/exceptions`, params);
export const getVolumeByTier = (params) => apiGet(`${BASE}/volume-by-tier`, params);
