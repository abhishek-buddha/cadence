// useSoftphone — browser softphone lifecycle for the live AI→human handoff.
//
// Wraps the Twilio Voice JS SDK (@twilio/voice-sdk). It lazily fetches a Voice
// access token from Convex (/twilio-voice-token), registers a Device, and
// exposes connect(callId) / disconnect(). connect() places an outgoing call
// through our TwiML App, which joins the Twilio conference `cadence-<callId>`
// (see /twiml-softphone-outgoing) so the agent talks to the parked insurance
// rep.
//
// Degrades gracefully: if the token endpoint returns 503 (Twilio API Key /
// TwiML App SID not configured yet), status becomes "unconfigured" and the UI
// shows guidance instead of a broken call button. Nothing throws.

import { useCallback, useEffect, useRef, useState } from 'react';

// Convex HTTP Actions base — the ...convex.site origin. Prefer an explicit env
// var; otherwise derive from VITE_CONVEX_URL (…convex.cloud → …convex.site).
function convexSiteUrl() {
  const explicit = import.meta.env.VITE_CONVEX_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const cloud = import.meta.env.VITE_CONVEX_URL || '';
  return cloud.replace('.convex.cloud', '.convex.site').replace(/\/$/, '');
}

export function useSoftphone() {
  // idle | loading | ready | unconfigured | error | connecting | on_call
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [activeCallId, setActiveCallId] = useState(null);
  const deviceRef = useRef(null);
  const callRef = useRef(null);
  const DeviceCtorRef = useRef(null);

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      try {
        callRef.current?.disconnect?.();
      } catch {
        /* noop */
      }
      try {
        deviceRef.current?.destroy?.();
      } catch {
        /* noop */
      }
      deviceRef.current = null;
      callRef.current = null;
    };
  }, []);

  // Fetch a token and (re)initialize the Device. Idempotent-ish: reuses an
  // existing ready device.
  const ensureDevice = useCallback(async () => {
    if (deviceRef.current && status === 'ready') return deviceRef.current;
    setStatus('loading');
    setError(null);
    try {
      const res = await fetch(`${convexSiteUrl()}/twilio-voice-token`, { method: 'GET' });
      if (res.status === 503) {
        setStatus('unconfigured');
        return null;
      }
      if (!res.ok) throw new Error(`Token request failed (${res.status})`);
      const { token } = await res.json();

      // Lazy-import so the SDK isn't in the initial bundle for users who never
      // open Live Calls.
      if (!DeviceCtorRef.current) {
        const mod = await import('@twilio/voice-sdk');
        DeviceCtorRef.current = mod.Device;
      }
      const Device = DeviceCtorRef.current;

      // Destroy a stale device before making a new one.
      try {
        deviceRef.current?.destroy?.();
      } catch {
        /* noop */
      }

      const device = new Device(token, { codecPreferences: ['opus', 'pcmu'] });
      device.on('error', (e) => {
        setError(e?.message || 'Softphone error');
        setStatus('error');
      });
      device.on('tokenWillExpire', async () => {
        try {
          const r = await fetch(`${convexSiteUrl()}/twilio-voice-token`, { method: 'GET' });
          if (r.ok) {
            const { token: fresh } = await r.json();
            device.updateToken(fresh);
          }
        } catch {
          /* noop */
        }
      });
      await device.register();
      deviceRef.current = device;
      setStatus('ready');
      return device;
    } catch (e) {
      setError(e?.message || String(e));
      setStatus('error');
      return null;
    }
  }, [status]);

  // Join the conference for a given callId (the accepted handoff).
  const connect = useCallback(
    async (callId) => {
      const device = await ensureDevice();
      if (!device) return; // unconfigured / error — status already set
      setStatus('connecting');
      try {
        const call = await device.connect({ params: { callId } });
        callRef.current = call;
        setActiveCallId(callId);
        call.on('accept', () => setStatus('on_call'));
        call.on('disconnect', () => {
          setStatus('ready');
          setActiveCallId(null);
          callRef.current = null;
        });
        call.on('cancel', () => {
          setStatus('ready');
          setActiveCallId(null);
          callRef.current = null;
        });
        call.on('error', (e) => {
          setError(e?.message || 'Call error');
          setStatus('error');
        });
      } catch (e) {
        setError(e?.message || String(e));
        setStatus('error');
      }
    },
    [ensureDevice]
  );

  const disconnect = useCallback(() => {
    try {
      callRef.current?.disconnect?.();
    } catch {
      /* noop */
    }
    callRef.current = null;
    setActiveCallId(null);
    if (status === 'on_call' || status === 'connecting') setStatus('ready');
  }, [status]);

  return { status, error, activeCallId, ensureDevice, connect, disconnect };
}
