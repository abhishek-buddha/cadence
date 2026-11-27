import InfoRow from '../../components/case/InfoRow';
import { patientDate } from './format';

export default function AppointmentCoverage({ appointment }) {
  const { estimated_patient_cost: cost, prior_authorization: auth } = appointment.reminder_context || {};
  const status = { not_required: 'Not required', pending: 'Pending', approved: 'Approved', denied: 'Denied' }[auth?.status] || 'Not recorded';
  return <div className="mt-3 border-t border-border pt-3">
    <InfoRow label="Estimated Patient Cost" value={cost ? `${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(cost.amount))} USD (approx.)` : 'Not recorded'} />
    {cost && <p className="text-xs text-muted mb-2">Out-of-pocket estimate for this visit. The final amount may vary.</p>}
    <InfoRow label="Prior Authorization" value={status} />
    {auth?.reference && <InfoRow label="Authorization Reference" value={auth.reference} />}
    {auth?.status === 'approved' && <>
      <InfoRow label="Approved / Remaining Visits" value={`${auth.approved_visits ?? '—'} / ${auth.remaining_visits ?? '—'}`} />
      <InfoRow label="Approval Validity" value={`${patientDate(auth.valid_from)} – ${patientDate(auth.valid_until)}`} />
      <p className={`mt-2 text-sm ${auth.applicable_to_appointment ? 'text-muted' : 'text-danger'}`}>
        {auth.applicable_to_appointment ? 'Applies to this appointment. Remaining visits include this visit; approval does not guarantee payment.' : auth.message}
      </p>
    </>}
  </div>;
}
