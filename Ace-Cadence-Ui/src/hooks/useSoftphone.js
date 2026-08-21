// useSoftphone Ã¢â‚¬â€ browser softphone lifecycle for the live AIÃ¢â€ â€™human handoff.
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

function softphoneBaseUrl() {
  return window.location.origin.replace(/\/$/, '');
}

// The Device's connection to Twilio's signaling servers is a browser<->Twilio
// WebSocket that never touches our backend, and idle WebSockets get dropped by
// browsers/OS/wifi power-saving fairly routinely. The SDK is supposed to
// recover on its own; when it can't, it emits device.on('error') (observed as
// Twilio error 31005 "ConnectionError") and just stops — nothing re-registers
// it. Without the retry below, an operator who leaves My Queue open for a
// while ends up silently unable to receive calls while the UI still says
// "You're marked available", with no way to notice short of a manual refresh.
const RECONNECT_MAX_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 3000;
const RECONNECT_MAX_DELAY_MS = 30000;

export function useSoftphone() {
  // idle | loading | ready | unconfigured | error | connecting | on_call | reconnecting
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [activeCallId, setActiveCallId] = useState(null);
  const [muted, setMuted] = useState(false);
  const deviceRef = useRef(null);
  const callRef = useRef(null);
  const DeviceCtorRef = useRef(null);
  const ensureDeviceRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef(null);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  // Scheduled from the Device's error handler, never from call errors — a live
  // call is left alone rather than torn out from under the operator, and a
  // fatal token/config error is capped rather than hammering the token
  // endpoint forever.
  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) return; // already counting down
    if (reconnectAttemptsRef.current >= RECONNECT_MAX_ATTEMPTS) {
      setStatus('error');
      setError('Softphone disconnected and could not reconnect. Refresh the page.');
      return;
    }
    const attempt = reconnectAttemptsRef.current;
    reconnectAttemptsRef.current += 1;
    const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** attempt, RECONNECT_MAX_DELAY_MS);
    setStatus('reconnecting');
    setError(null);
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      ensureDeviceRef.current?.();
    }, delay);
  }, []);

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      clearReconnectTimer();
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
  }, [clearReconnectTimer]);

  // Fetch a token and (re)initialize the Device. Idempotent-ish: reuses an
  // existing ready device.
  const ensureDevice = useCallback(async () => {
    if (deviceRef.current && status === 'ready') return deviceRef.current;
    setStatus('loading');
    setError(null);
    try {
      const res = await fetch(`${softphoneBaseUrl()}/twilio-voice-token`, { method: 'GET' });
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
        // A call in progress is left alone — recreating the Device mid-call
        // would clobber it. Idle is exactly the case that bit us: the
        // operator sees "available" while the signaling connection is dead.
        if (callRef.current) {
          setStatus('error');
        } else {
          scheduleReconnect();
        }
      });
      device.on('registered', () => {
        reconnectAttemptsRef.current = 0;
        clearReconnectTimer();
      });
      device.on('tokenWillExpire', async () => {
        try {
          const r = await fetch(`${softphoneBaseUrl()}/twilio-voice-token`, { method: 'GET' });
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

  // scheduleReconnect's setTimeout fires outside React's render cycle, so it
  // needs a stable way to reach whichever ensureDevice closure is current
  // rather than capturing one at schedule time.
  useEffect(() => {
    ensureDeviceRef.current = ensureDevice;
  }, [ensureDevice]);

  // Join the conference for a given callId (the accepted handoff).
  // Resolves only after Twilio accepts the browser leg, so callers can avoid
  // redirecting the payer/dropping the AI until a human is really connected.
  const connect = useCallback(
    async (callId) => {
      const device = await ensureDevice();
      if (!device) return { ok: false, error: 'softphone_unconfigured' };

      // Acquire the microphone explicitly, before dialling.
      //
      // The SDK would otherwise request it lazily inside device.connect(), and
      // if the browser blocks or never resolves that prompt the call still
      // connects — the operator hears the rep, the rep hears silence, and
      // nothing anywhere says why. Doing it here also means the permission
      // prompt happens under the Accept click (a real user gesture), which is
      // what lets the audio pipeline start at all.
      try {
        const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Release immediately; the SDK opens its own capture. Permission for
        // the origin persists, so this is only a gate, not the live stream.
        probe.getTracks().forEach((track) => track.stop());
      } catch (e) {
        const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
        setError(
          denied
            ? 'Microphone blocked. Allow mic access for this site, then accept the call again — the payer cannot hear you until you do.'
            : `No microphone available: ${e?.message || e?.name || 'unknown error'}`
        );
        setStatus('error');
        return { ok: false, error: denied ? 'microphone_blocked' : 'microphone_unavailable' };
      }

      setStatus('connecting');
      setMuted(false);
      try {
        const call = await device.connect({ params: { callId } });
        callRef.current = call;
        setActiveCallId(callId);

        return await new Promise((resolve) => {
          let settled = false;
          const settle = (result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            resolve(result);
          };

          const timeout = setTimeout(() => {
            setError('Softphone did not connect in time');
            setStatus('error');
            settle({ ok: false, error: 'softphone_accept_timeout' });
          }, 15000);

          call.on('accept', () => {
            setStatus('on_call');
            settle({ ok: true, call });
          });
          call.on('disconnect', () => {
            setStatus('ready');
            setActiveCallId(null);
            callRef.current = null;
            setMuted(false);
            settle({ ok: false, error: 'softphone_disconnected_before_accept' });
          });
          call.on('cancel', () => {
            setStatus('ready');
            setActiveCallId(null);
            callRef.current = null;
            setMuted(false);
            settle({ ok: false, error: 'softphone_cancelled' });
          });
          call.on('error', (e) => {
            const message = e?.message || 'Call error';
            setError(message);
            setStatus('error');
            setMuted(false);
            settle({ ok: false, error: message });
          });
        });
      } catch (e) {
        const message = e?.message || String(e);
        setError(message);
        setStatus('error');
        setMuted(false);
        return { ok: false, error: message };
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
    setMuted(false);
    if (status === 'on_call' || status === 'connecting') setStatus('ready');
  }, [status]);

  const toggleMute = useCallback(() => {
    const call = callRef.current;
    if (!call || status !== 'on_call') return false;
    const nextMuted = !muted;
    try {
      call.mute?.(nextMuted);
      setMuted(nextMuted);
      return true;
    } catch (e) {
      setError(e?.message || 'Could not change microphone mute');
      return false;
    }
  }, [muted, status]);

  return { status, error, activeCallId, muted, ensureDevice, connect, disconnect, toggleMute };
}
