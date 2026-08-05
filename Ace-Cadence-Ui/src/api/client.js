// Thin fetch wrapper every src/api/*.js module builds on. Hits nginx's
// /api/* path routing (see Ace-Cadence/nginx/nginx.conf) — same paths in
// dev (proxied by vite.config.js) and prod (proxied by nginx itself).

const DEFAULT_HEADERS = { 'Content-Type': 'application/json' };

function authHeaders() {
  // No service currently enforces this per-request (see login-svc/app —
  // it only exposes session validation for other callers), but sending it
  // now means nothing else has to change once that lands.
  const token = sessionStorage.getItem('cadence_session_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, { method = 'GET', body, params } = {}) {
  const url = new URL(`/api${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    });
  }

  const response = await fetch(url, {
    method,
    headers: { ...DEFAULT_HEADERS, ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const errBody = await response.json();
      detail = errBody.detail || detail;
    } catch {
      // response body wasn't JSON — fall back to statusText
    }
    throw new Error(detail);
  }

  if (response.status === 204) return null;
  return response.json();
}

export const apiGet = (path, params) => request(path, { params });
export const apiPost = (path, body) => request(path, { method: 'POST', body });
export const apiPatch = (path, body) => request(path, { method: 'PATCH', body });
export const apiPut = (path, body) => request(path, { method: 'PUT', body });
export const apiDelete = (path) => request(path, { method: 'DELETE' });
