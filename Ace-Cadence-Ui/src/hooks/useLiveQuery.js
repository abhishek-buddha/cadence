import { useCallback, useEffect, useRef, useState } from 'react';

// One shared socket for the whole app — every useLiveQuery call subscribes
// to the same /ws/updates stream and filters by entityType itself, instead
// of opening a socket per query (see architecture plan: "invalidate +
// refetch" pattern, the deliberate simplification of Convex's per-query
// reactivity).
let sharedSocket = null;
const listeners = new Set();

function getSocket() {
  if (sharedSocket && sharedSocket.readyState <= WebSocket.OPEN) return sharedSocket;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  sharedSocket = new WebSocket(`${protocol}//${window.location.host}/ws/updates`);
  sharedSocket.addEventListener('message', (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    listeners.forEach((listener) => listener(payload));
  });
  sharedSocket.addEventListener('close', () => {
    sharedSocket = null;
  });
  return sharedSocket;
}

/**
 * Fetch-on-mount + refetch-on-invalidation, shaped to be a near drop-in
 * replacement for Convex's `useQuery` (returns `undefined` while loading,
 * so existing `x === undefined` loading checks keep working).
 *
 * @param {() => Promise<any>} fetcher
 * @param {any[]} deps - like useEffect deps; changing these re-fetches
 * @param {string|null} entityType - only refetch on /ws/updates events for
 *   this entity type; omit to refetch on every invalidation event
 */
export function useLiveQuery(fetcher, deps = [], entityType = null) {
  const [data, setData] = useState(undefined);
  const [error, setError] = useState(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refetch = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    getSocket();
    function onMessage(payload) {
      if (!entityType || payload.entity_type === entityType) refetch();
    }
    listeners.add(onMessage);
    return () => listeners.delete(onMessage);
  }, [entityType, refetch]);

  return { data, loading: data === undefined && !error, error, refetch };
}
