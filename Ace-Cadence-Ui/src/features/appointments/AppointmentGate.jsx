import { useLiveQuery } from '../../hooks/useLiveQuery';
import { getConfig } from './api';

export default function AppointmentGate({ children, fallback }) {
  const { data, error } = useLiveQuery(getConfig, [], 'appointment-config');
  if (error) return <p role="alert" className="text-danger">Could not load appointment settings. Refresh to retry.</p>;
  if (!data) return <p role="status" className="text-muted">Loading appointments…</p>;
  return data.enabled ? children : fallback;
}
