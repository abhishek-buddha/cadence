import { createContext, useContext } from 'react';

// Demo auth — RBAC hardcoded until real auth/session layer lands.
// When swapping to real auth, replace the hardcoded object with a useQuery
// against api.users.getByEmail keyed off the session email.
const DEFAULT_AUTH = {
  email: 'demo@cadence.app',
  role: 'admin', // 'admin' | 'manager' | 'viewer'
  name: 'Demo Admin',
};

const AuthContext = createContext(DEFAULT_AUTH);

export function AuthProvider({ children, value }) {
  return (
    <AuthContext.Provider value={value ?? DEFAULT_AUTH}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

/**
 * Role hierarchy check. admin ⊇ manager ⊇ viewer
 *
 * Temporarily always true: now that logins pick a real user + role, every
 * role sees every screen until per-role screen restrictions are actually
 * designed and built. Restore the real comparison below when that happens.
 */
export function hasRole(_role, _minimum) {
  return true;
  // const order = { viewer: 0, manager: 1, admin: 2 };
  // return (order[role] ?? -1) >= (order[minimum] ?? 0);
}
