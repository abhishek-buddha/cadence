import { useParams } from 'react-router-dom';
import { User, CalendarCheck, PhoneCall, AlertTriangle, MessageSquare } from 'lucide-react';
import CaseBackHeader from '../components/case/CaseBackHeader';
import DetailCard from '../components/case/DetailCard';
import InfoRow from '../components/case/InfoRow';
import CallTranscriptCard from '../components/case/CallTranscriptCard';
import EmptyState from '../components/EmptyState';
import { appointmentReminders } from '../data/staticCaseData';

const RISK_STYLE = {
  Low: 'text-success bg-success/10',
  Medium: 'text-warn bg-warn/10',
  High: 'text-danger bg-danger/10',
};

export default function AppointmentReminderDetailPage() {
  const { id } = useParams();
  const record = appointmentReminders.find((r) => r.id === id);

  if (!record) {
    return (
      <div className="animate-fade-in">
        <EmptyState icon={PhoneCall} title="Reminder not found" description="This reminder record does not exist." />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <CaseBackHeader
        backTo="/appointments"
        backLabel="Back to Appointments"
        title={record.patientName}
        subtitle={`Reminder for ${record.apptType} appointment — ${record.provider}`}
        status={record.reminderStatus}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DetailCard icon={User} title="Patient Info">
          <InfoRow label="Name" value={record.patientName} />
          <InfoRow label="Call Attempts" value={record.callAttempts} />
          <InfoRow label="Last Attempt" value={record.lastAttempt} />
          <InfoRow label="Next Attempt" value={record.nextAttempt} />
          <InfoRow label="Assigned To" value={record.assignedTo} />
        </DetailCard>

        <DetailCard icon={CalendarCheck} title="Original Appointment Details">
          <InfoRow label="Date" value={record.originalAppt.date} />
          <InfoRow label="Time" value={record.originalAppt.time} />
          <InfoRow label="Provider" value={record.originalAppt.provider} />
          <InfoRow label="Location" value={record.originalAppt.location} />
        </DetailCard>

        <DetailCard icon={PhoneCall} title="Reminder Call Outcome">
          <InfoRow label="Outcome" value={record.callOutcome} />
          <InfoRow label="New Requested Date/Time" value={record.newRequestedDateTime} />
        </DetailCard>

        <DetailCard icon={AlertTriangle} title="No-Show Risk">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${RISK_STYLE[record.noShowRisk] || RISK_STYLE.Medium}`}>
            {record.noShowRisk} risk
          </span>
        </DetailCard>
      </div>

      <CallTranscriptCard transcript={record.transcript} hasRecording={!!record.transcript} />

      <DetailCard icon={MessageSquare} title="Notes">
        <p className="text-sm text-gray-700 leading-relaxed">
          {record.notes || <span className="text-muted italic">No notes.</span>}
        </p>
      </DetailCard>
    </div>
  );
}
