import { apiDelete, apiGet, apiPost } from './client';

export const verifyPin = (pin) => apiPost('/auth/verify-pin', { pin });

export const createSession = ({ userId, userEmail, userRole, userName }) =>
  apiPost('/auth/session', {
    user_id: userId,
    user_email: userEmail,
    user_role: userRole,
    user_name: userName,
  });

export const getSession = (token) => apiGet(`/auth/session/${token}`);

export const logout = (token) => apiDelete(`/auth/session/${token}`);
