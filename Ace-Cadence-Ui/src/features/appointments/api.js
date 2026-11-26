import { apiGet, apiPost, apiPut } from '../../api/client';

export const getConfig = () => apiGet('/appointments/config');
export const listAppointments = () => apiGet('/appointments');
export const getAppointment = id => apiGet(`/appointments/${id}`);
export const saveAppointment = (id, body) => id ? apiPut(`/appointments/${id}`, body) : apiPost('/appointments', body);
export const getCalls = id => apiGet(`/appointments/${id}/calls`);
export const callPatient = id => apiPost(`/appointments/${id}/calls`);
export const requestTakeover = id => apiPost(`/appointments/calls/${id}/takeover`);
export const completeCallback = id => apiPost(`/appointments/${id}/complete-callback`);
export const setPresence = ready => apiPost('/appointments/operators/presence', { ready });
