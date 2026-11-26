import { useState } from 'react';
import { createPatient, updatePatient } from '../api/masterData';

const fields = [
  ['first_name', 'First Name', 'text', true, 255],
  ['last_name', 'Last Name', 'text', true, 255],
  ['date_of_birth', 'Date of Birth', 'date', true],
  ['relationship', 'Relationship', 'select'],
  ['member_id', 'Member ID', 'text', true, 100],
  ['group_number', 'Group Number', 'text', false, 100],
  ['policy_number', 'Policy Number', 'text', false, 100],
  ['subscriber_name', 'Subscriber Name', 'text', false, 255],
];
const inputClass = 'w-full bg-white border border-border-light rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-muted focus:border-accent focus:ring-1 focus:ring-accent outline-none';
const labelClass = 'block text-xs uppercase tracking-wider text-muted font-medium mb-1.5';

export default function PatientEditor({ patient, phoneEnabled, onSaved, onCancel }) {
  const [initial] = useState(() => Object.fromEntries(
    [...fields.map(([key]) => key), 'phone']
      .map(key => [key, patient?.[key] ?? (key === 'relationship' ? 'self' : '')]),
  ));
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const change = (key, value) => setForm(previous => ({ ...previous, [key]: value }));

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      // Send only edited fields so another screen's phone change is preserved.
      const payload = Object.fromEntries(Object.entries(form)
        .filter(([key, value]) => (key !== 'phone' || phoneEnabled) && (!patient || value !== initial[key]))
        .map(([key, value]) => [key, (key === 'phone' ? value.trim() : value) || null]));
      const saved = patient ? await updatePatient(patient.id, payload) : await createPatient(payload);
      await onSaved(saved);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return <form onSubmit={submit} className="space-y-5">
    {patient && <p className="text-sm text-muted">Changes update this patient's Master Data and all linked appointments.</p>}
    {phoneEnabled && <div>
      <label htmlFor="patient-mobile" className={labelClass}>Mobile number (with country code)</label>
      <input id="patient-mobile" type="tel" maxLength={20} pattern="\+[1-9][0-9]{7,14}" value={form.phone}
        onChange={event => change('phone', event.target.value)} className={inputClass} placeholder="+14155550123" />
      <p className="mt-1 text-xs text-muted">Use a country code. Replace rather than clear a number while appointments exist.</p>
    </div>}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {fields.map(([key, label, type, required, maxLength]) => <div key={key}>
        <label htmlFor={`patient-${key}`} className={labelClass}>{label}</label>
        {type === 'select' ? <select id={`patient-${key}`} value={form[key]} onChange={event => change(key, event.target.value)} className={inputClass}>
          <option value="self">Self</option><option value="spouse">Spouse</option><option value="child">Child</option><option value="other">Other</option>
        </select> : <input id={`patient-${key}`} type={type} required={required} maxLength={maxLength} value={form[key]}
          onChange={event => change(key, event.target.value)} className={inputClass} />}
      </div>)}
    </div>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
      <button type="button" disabled={saving} onClick={onCancel} className="px-4 py-2.5 text-sm text-muted hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-accent">Cancel</button>
      <button type="submit" disabled={saving} className="px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium text-sm disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-accent">
        {saving ? 'Saving...' : patient ? 'Update Patient' : 'Add Patient'}
      </button>
    </div>
  </form>;
}
