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
    doctor_name: record?.doctor_name ?? '', estimated_patient_cost: record?.estimated_patient_cost ?? '',
    authorization_status: record?.authorization_status ?? '', authorization_reference: record?.authorization_reference ?? '',
    approved_visits: record?.approved_visits ?? '', remaining_visits: record?.remaining_visits ?? '',
    authorization_valid_from: record?.authorization_valid_from ?? '', authorization_valid_until: record?.authorization_valid_until ?? '',
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
      const details = Object.fromEntries(['doctor_name', 'estimated_patient_cost', 'authorization_status', 'authorization_reference', 'authorization_valid_from', 'authorization_valid_until'].map(key => [key, values[key] === '' ? null : values[key]]));
      for (const key of ['approved_visits', 'remaining_visits']) details[key] = values[key] === '' ? null : Number(values[key]);
      const saved = await saveAppointment(record?.id, { ...values, ...details, patient_id: Number(values.patient_id), provider_id: Number(values.provider_id) });
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
      <fieldset className="sm:col-span-2 border-t border-border pt-4">
        <legend className="font-semibold text-sm pr-2">Reminder details</legend>
        <p className="text-sm text-muted mb-4">Optional information the agent can share with this patient. Leave unknown details blank.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">Doctor name
            <input maxLength={255} value={values.doctor_name} onChange={e => change('doctor_name', e.target.value)} className={inputClass} />
          </label>
          <label className="text-sm font-medium">Estimated patient cost (USD)
            <input type="number" min="0" max="99999999.99" step="0.01" value={values.estimated_patient_cost} onChange={e => change('estimated_patient_cost', e.target.value)} className={inputClass} aria-describedby="patient-cost-help" />
            <span id="patient-cost-help" className="block mt-1 text-xs font-normal text-muted">Approximate out-of-pocket amount for this visit, not the total billed amount.</span>
          </label>
          <label className="text-sm font-medium">Prior authorization for this visit
            <select value={values.authorization_status} onChange={e => change('authorization_status', e.target.value)} className={inputClass}>
              <option value="">Not recorded</option><option value="not_required">Not required</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="denied">Denied</option>
            </select>
          </label>
          {values.authorization_status && values.authorization_status !== 'not_required' && <label className="text-sm font-medium">Authorization reference
            <input maxLength={100} value={values.authorization_reference} onChange={e => change('authorization_reference', e.target.value)} className={inputClass} />
          </label>}
          {values.authorization_status === 'approved' && <>
            {[['approved_visits', 'Approved visits', 1], ['remaining_visits', 'Visits remaining (including this visit)', 0]].map(([key, label, min]) => <label key={key} className="text-sm font-medium">{label}
              <input required type="number" min={min} max="65535" step="1" value={values[key]} onChange={e => change(key, e.target.value)} className={inputClass} />
            </label>)}
            {[['authorization_valid_from', 'Approval valid from'], ['authorization_valid_until', 'Approval valid until']].map(([key, label]) => <label key={key} className="text-sm font-medium">{label}
              <input required type="date" value={values[key]} onChange={e => change(key, e.target.value)} className={inputClass} />
            </label>)}
            <p className="text-xs text-muted sm:col-span-2">Use the approval for this appointment's service and doctor. The agent checks the appointment date and remaining visits before mentioning approval. Reminder calls do not consume visits.</p>
          </>}
        </div>
      </fieldset>
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
