import { apiDelete, apiGet, apiPost } from './client';

export const verifyPin = (pin) => apiPost('/auth/verify-pin', { pin });

// Takes the app's user object as it actually exists -- { userId, email, name,
// role }, the shape LoginSelectPage builds and AuthContext consumes. This used
// to destructure userEmail/userRole/userName, which no caller ever passed, so
// those keys serialized as undefined, were dropped from the JSON body, and
// login-svc rejected every request with 422 "Missing field: user_email".
// App.jsx catches that and clears the token, so every login silently fell back
// to a local-only session with no server-side session row at all.
export const createSession = ({ userId, email, name, role }) =>
  apiPost('/auth/session', {
    user_id: userId,
    user_email: email,
    user_role: role,
    user_name: name,
  });

export const getSession = (token) => apiGet(`/auth/session/${token}`);

export const logout = (token) => apiDelete(`/auth/session/${token}`);
