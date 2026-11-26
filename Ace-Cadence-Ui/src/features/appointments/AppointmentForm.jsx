import { useState } from 'react';
import { listPatients, listProviders } from '../../api/masterData';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { saveAppointment } from './api';

const inputClass = 'w-full mt-1 rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent';
const fields = [
  ['patient_phone', 'Patient mobile (with country code)', 'tel', 20],
  ['appointment_type', 'Appointment type', 'text', 100],
  ['scheduled_at', 'Appointment date and time', 'datetime-local'],
  ['timezone', 'Clinic timezone (e.g. America/New_York)', 'text', 64],
  ['location', 'Location', 'text', 255],
];

export default function AppointmentForm({ record, onSaved, onCancel }) {
  const { data, error } = useLiveQuery(() => Promise.all([listPatients(), listProviders()]), [], 'master-data');
  const [values, setValues] = useState(() => ({
    patient_id: record?.patient_id ?? '', provider_id: record?.provider_id ?? '',
    patient_phone: record?.patient_phone ?? '', appointment_type: record?.appointment_type ?? '',
    scheduled_at: record?.scheduled_at?.slice(0, 16) ?? '', timezone: record?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    location: record?.location ?? '', instructions: record?.instructions ?? '', notes: record?.notes ?? '', status: record?.status ?? 'scheduled',
  }));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const change = (key, value) => setValues(previous => ({ ...previous, [key]: value }));

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setNotice('');
    try {
      const saved = await saveAppointment(record?.id, { ...values, patient_id: Number(values.patient_id), provider_id: Number(values.provider_id) });
      onSaved(saved);
    } catch (error) { setNotice(error.message); }
    finally { setSaving(false); }
  }

  return <form onSubmit={submit} className="bg-white border border-border rounded-xl p-5 space-y-4">
    <h2 className="font-display text-lg font-semibold">{record ? 'Edit appointment' : 'Create appointment'}</h2>
    {error && <p role="alert" className="text-danger">Could not load patients and providers. Close this form and retry.</p>}
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium">Patient
        <select autoFocus required value={values.patient_id} onChange={e => {
          const patient = data?.[0].find(p => String(p.id) === e.target.value);
          setValues(previous => ({ ...previous, patient_id: e.target.value, patient_phone: patient?.phone || '' }));
        }} className={inputClass}>
          <option value="">Select an existing patient</option>
          {data?.[0].map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name} · {p.member_id}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium">Provider
        <select required value={values.provider_id} onChange={e => change('provider_id', e.target.value)} className={inputClass}>
          <option value="">Select an existing provider</option>
          {data?.[1].map(p => <option key={p.id} value={p.id}>{p.practice_name}</option>)}
        </select>
      </label>
      {fields.map(([key, label, type, maxLength]) => <label key={key} className="text-sm font-medium">{label}
        <input required type={type} maxLength={maxLength} value={values[key]} onChange={e => change(key, e.target.value)} className={inputClass} />
        {key === 'patient_phone' && <span className="block mt-1 text-xs font-normal text-muted">Changing this number also updates Master Data and this patient's other appointments.</span>}
      </label>)}
      <label className="text-sm font-medium">Status
        <select value={values.status} onChange={e => change('status', e.target.value)} className={inputClass}>
          <option value="scheduled">Scheduled</option><option value="rescheduled">Rescheduled</option><option value="cancelled">Cancelled</option>
        </select>
      </label>
      <label className="text-sm font-medium sm:col-span-2">Voice agent context
        <textarea rows={3} maxLength={5000} aria-describedby="voice-agent-context-help" value={values.instructions} onChange={e => change('instructions', e.target.value)} className={inputClass} />
        <span id="voice-agent-context-help" className="block mt-1 text-xs font-normal text-muted">Add appointment-specific information for the voice agent to use during the call, such as arrival instructions or documents to bring. The agent may share this with the patient. Save before starting the call.</span>
      </label>
      <label className="text-sm font-medium sm:col-span-2">Internal notes
        <textarea rows={2} maxLength={5000} value={values.notes} onChange={e => change('notes', e.target.value)} className={inputClass} />
      </label>
    </div>
    {notice && <p role="alert" className="text-danger text-sm">{notice}</p>}
    <div className="flex justify-end gap-3">
      <button type="button" onClick={onCancel} disabled={saving} className="px-4 py-2 rounded-lg border border-border">Cancel</button>
      <button disabled={saving || !data} className="px-4 py-2 rounded-lg bg-accent text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save appointment'}</button>
    </div>
  </form>;
}
