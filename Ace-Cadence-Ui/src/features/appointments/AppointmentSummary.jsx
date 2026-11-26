import { User, Shield, Stethoscope, CalendarCheck, PhoneCall, AlertTriangle } from 'lucide-react';
import DetailCard from '../../components/case/DetailCard';
import InfoRow from '../../components/case/InfoRow';
import AttemptHistoryCard from '../../components/case/AttemptHistoryCard';
import { appointmentTime, callTime } from './format';

export default function AppointmentSummary({ appointment: a, calls, variant }) {
  const last = calls[0];
  const attendance = a.status === 'cancelled' ? 'Cancelled' : a.confirmed_at ? 'Confirmed by patient' : 'Not yet confirmed';
  const original = { ...a, scheduled_at: a.original_scheduled_at || a.scheduled_at, timezone: a.original_timezone || a.timezone };
  if (variant === 'reminder') return <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <DetailCard icon={User} title="Patient Info">
      <InfoRow label="Name" value={a.patient_name} /><InfoRow label="Phone" value={a.patient_phone} mono />
      <InfoRow label="Call Attempts" value={calls.length} /><InfoRow label="Last Attempt" value={callTime(last?.started_at, a.timezone)} />
      <InfoRow label="Next Attempt" value="Not scheduled" /><InfoRow label="Assigned To" value={last?.assigned_agent_name || 'Unassigned'} />
    </DetailCard>
    <DetailCard icon={CalendarCheck} title="Original Appointment Details">
      <InfoRow label="Date / Time" value={appointmentTime(original)} /><InfoRow label="Provider" value={a.provider_name} />
      <InfoRow label="Clinic Timezone" value={original.timezone} />
      <InfoRow label="Location" value={a.location} /><InfoRow label="Appointment Type" value={a.appointment_type} />
    </DetailCard>
    <DetailCard icon={PhoneCall} title="Reminder Call Outcome">
      <InfoRow label="Outcome" value={last?.outcome?.replaceAll('_', ' ') || 'No outcome recorded'} />
      <InfoRow label="Current Date / Time" value={appointmentTime(a)} />
      <InfoRow label="Clinic Timezone" value={a.timezone} />
      <InfoRow label="Attendance" value={attendance} />
      {a.original_scheduled_at && <InfoRow label="Rescheduled Date / Time" value={appointmentTime(a)} />}
    </DetailCard>
    <DetailCard icon={AlertTriangle} title="No-Show Risk"><p className="text-sm text-muted">Not assessed. No risk score has been recorded for this appointment.</p></DetailCard>
  </div>;
  return <>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <DetailCard icon={User} title="Patient Demographics">
        <InfoRow label="Name" value={a.patient_name} /><InfoRow label="Date of Birth" value={a.date_of_birth} />
        <InfoRow label="Phone" value={a.patient_phone} mono /><InfoRow label="Patient ID" value={a.patient_id} mono />
      </DetailCard>
      <DetailCard icon={Shield} title="Insurance & Plan">
        <InfoRow label="Member ID" value={a.member_id} /><InfoRow label="Group Number" value={a.group_number} />
        <InfoRow label="Policy Number" value={a.policy_number} /><InfoRow label="Subscriber" value={a.subscriber_name} />
        <p className="text-xs text-muted mt-2">Insurance company and plan name are not recorded in the patient master data.</p>
      </DetailCard>
      <DetailCard icon={Stethoscope} title="Provider / Location Requested">
        <InfoRow label="Provider" value={a.provider_name} /><InfoRow label="Location" value={a.location} />
        <InfoRow label="Appointment Type" value={a.appointment_type} /><InfoRow label="Clinic Phone" value={a.provider_phone} />
      </DetailCard>
      <DetailCard icon={CalendarCheck} title="Preferred Date/Time Options">
      <InfoRow label="Current Booking" value={appointmentTime(a)} />
      <InfoRow label="Clinic Timezone" value={a.timezone} />
        {a.original_scheduled_at && <InfoRow label="Original Booking" value={appointmentTime(original)} />}
        <p className="text-xs text-muted mt-2">No alternative time preferences recorded.</p>
      </DetailCard>
    </div>
    <AttemptHistoryCard attempts={calls.map(c => ({ date: callTime(c.started_at, a.timezone), outcome: (c.outcome || c.status).replaceAll('_', ' '), notes: c.assigned_agent_name }))} />
    <DetailCard icon={CalendarCheck} title="Confirmed Appointment">
      <InfoRow label="Attendance" value={attendance} /><InfoRow label="Date / Time" value={appointmentTime(a)} />
      <InfoRow label="Provider" value={a.provider_name} /><InfoRow label="Location" value={a.location} />
    </DetailCard>
  </>;
}
