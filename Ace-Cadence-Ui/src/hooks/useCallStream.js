import { useEffect, useRef, useState } from 'react';

/**
 * Live audio/transcript subscription for one call, via
 * telephony-bridge-svc's /listen/{callId} socket (nginx-proxied at
 * /ws/listen/{callId}). Replaces the pre-rewrite app's bridge `/listen/:id`
 * socket + Convex polling combo.
 */
export function useCallStream(callId) {
  const [messages, setMessages] = useState([]);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!callId) return undefined;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/listen/${callId}`);
    socketRef.current = socket;
    setMessages([]);

    function onMessage(event) {
      setMessages((prev) => [...prev, event.data]);
    }
    socket.addEventListener('message', onMessage);

    return () => {
      socket.removeEventListener('message', onMessage);
      socket.close();
    };
  }, [callId]);

  return messages;
}
