import { useEffect } from 'react';
import { getConfig, setPresence } from './api';

export default function useAppointmentPresence(status) {
  useEffect(() => {
    let stopped = false;
    let enabled = false;
    const ready = status === 'ready';
    const update = () => { if (enabled && !stopped) setPresence(ready).catch(() => {}); };
    getConfig().then(config => { enabled = config.enabled; update(); }).catch(() => {});
    const timer = setInterval(update, 15000);
    return () => {
      stopped = true;
      clearInterval(timer);
      if (enabled) setPresence(false).catch(() => {});
    };
  }, [status]);
}
