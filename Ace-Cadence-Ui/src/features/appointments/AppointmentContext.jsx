import { Link } from 'react-router-dom';
import { appointmentTime } from './format';

export default function AppointmentContext({ call }) {
  const record = call.appointment;
  if (!record) return null;
  return <section className="bg-white rounded-xl border border-border p-5 space-y-3">
    <h2 className="font-semibold">Appointment · {call.patientName || `${record.patient_first_name} ${record.patient_last_name}`}</h2>
    <p className="text-sm">{record.appointment_type} · {appointmentTime(record)}</p>
    <p className="text-sm">Clinic timezone: {record.timezone}</p>
    <p className="text-sm">{record.provider_name} · {record.location}</p>
    <p className="text-sm">Mobile: {record.patient_phone}</p>
    {record.instructions && <p className="text-sm whitespace-pre-wrap">{record.instructions}</p>}
    {call.handoffReason && <p className="text-sm"><strong>Patient needs help with:</strong> {call.handoffReason}</p>}
    {call.transcript && <details><summary className="cursor-pointer text-sm text-accent">Conversation so far</summary><p className="mt-2 text-sm whitespace-pre-wrap max-h-64 overflow-auto">{call.transcript}</p></details>}
    <Link to={`/appointments/scheduling/${record.id}`} target="_blank" rel="noreferrer" className="inline-block text-sm text-accent underline">Open appointment in a new tab</Link>
  </section>;
}
