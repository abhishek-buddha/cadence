import { User, Shield, Stethoscope, CalendarCheck } from 'lucide-react';
import DetailCard from '../../components/case/DetailCard';
import InfoRow from '../../components/case/InfoRow';
import { appointmentTime } from './format';

export default function AppointmentSummary({ appointment: a }) {
  const attendance = a.status === 'cancelled' ? 'Not applicable' : a.confirmed_at ? 'Confirmed by patient' : 'Not confirmed';
  const original = { ...a, scheduled_at: a.original_scheduled_at || a.scheduled_at, timezone: a.original_timezone || a.timezone };
  return <>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <DetailCard icon={User} title="Patient Demographics">
        <InfoRow label="Name" value={a.patient_name} /><InfoRow label="Date of Birth" value={a.date_of_birth} />
        <InfoRow label="Phone" value={a.patient_phone} mono /><InfoRow label="Patient ID" value={a.patient_id} mono />
      </DetailCard>
      <DetailCard icon={Shield} title="Insurance & Plan">
        <InfoRow label="Member ID" value={a.member_id} /><InfoRow label="Group Number" value={a.group_number} />
        <InfoRow label="Policy Number" value={a.policy_number} /><InfoRow label="Subscriber" value={a.subscriber_name} />
        <InfoRow label="Relationship" value={a.relationship} />
      </DetailCard>
      <DetailCard icon={Stethoscope} title="Provider & Location">
        <InfoRow label="Provider" value={a.provider_name} /><InfoRow label="Location" value={a.location} />
        <InfoRow label="Appointment Type" value={a.appointment_type} /><InfoRow label="Clinic Phone" value={a.provider_phone} />
      </DetailCard>
      <DetailCard icon={CalendarCheck} title="Appointment Details">
      <InfoRow label="Current Booking" value={appointmentTime(a)} />
      <InfoRow label="Clinic Timezone" value={a.timezone} />
        {a.original_scheduled_at && <InfoRow label="Original Booking" value={appointmentTime(original)} />}
        <InfoRow label="Attendance" value={attendance} />
      </DetailCard>
    </div>
  </>;
}
