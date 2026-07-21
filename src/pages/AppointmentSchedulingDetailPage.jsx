import { useParams } from 'react-router-dom';
import { User, Shield, Stethoscope, CalendarCheck, MessageSquare, ArrowRight } from 'lucide-react';
import CaseBackHeader from '../components/case/CaseBackHeader';
import DetailCard from '../components/case/DetailCard';
import InfoRow from '../components/case/InfoRow';
import AttemptHistoryCard from '../components/case/AttemptHistoryCard';
import CallTranscriptCard from '../components/case/CallTranscriptCard';
import EmptyState from '../components/EmptyState';
import { appointmentScheduling } from '../data/staticCaseData';

export default function AppointmentSchedulingDetailPage() {
  const { id } = useParams();
  const record = appointmentScheduling.find((r) => r.id === id);

  if (!record) {
    return (
      <div className="animate-fade-in">
        <EmptyState icon={CalendarCheck} title="Appointment not found" description="This scheduling record does not exist." />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <CaseBackHeader
        backTo="/appointments"
        backLabel="Back to Appointments"
        title={record.patientName}
        subtitle={`${record.apptType} appointment — ${record.provider}`}
        status={record.status}
        priority={record.priority}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DetailCard icon={User} title="Patient Demographics">
          <InfoRow label="Name" value={record.patientName} />
          <InfoRow label="Date of Birth" value={record.dob} />
          <InfoRow label="Phone" value={record.phone} mono />
          <InfoRow label="Patient ID / MRN" value={record.mrn} mono />
        </DetailCard>

        <DetailCard icon={Shield} title="Insurance & Plan">
          <InfoRow label="Insurance" value={record.insurance} />
          <InfoRow label="Plan Name" value={record.planName} />
        </DetailCard>

        <DetailCard icon={Stethoscope} title="Provider / Location Requested">
          <InfoRow label="Provider" value={record.provider} />
          <InfoRow label="Location" value={record.location} />
          <InfoRow label="Reason for Visit" value={record.reasonForVisit} />
        </DetailCard>

        <DetailCard icon={CalendarCheck} title="Preferred Date/Time Options">
          {record.preferredOptions.length === 0 ? (
            <p className="text-sm text-muted italic">None provided.</p>
          ) : (
            <ul className="space-y-1.5">
              {record.preferredOptions.map((opt, i) => (
                <li key={i} className="text-sm text-gray-900">{opt}</li>
              ))}
            </ul>
          )}
        </DetailCard>
      </div>

      <AttemptHistoryCard attempts={record.attemptHistory} />

      <DetailCard icon={CalendarCheck} title="Confirmed Appointment">
        {record.confirmed ? (
          <>
            <InfoRow label="Date" value={record.confirmed.date} />
            <InfoRow label="Time" value={record.confirmed.time} />
            <InfoRow label="Provider" value={record.confirmed.provider} />
            <InfoRow label="Location" value={record.confirmed.location} />
            <InfoRow label="Confirmation Number" value={record.confirmed.confirmationNumber} mono />
          </>
        ) : (
          <p className="text-sm text-muted italic">Not yet confirmed.</p>
        )}
      </DetailCard>

      <CallTranscriptCard transcript={record.transcript} hasRecording={!!record.transcript} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DetailCard icon={MessageSquare} title="Notes">
          <p className="text-sm text-gray-700 leading-relaxed">
            {record.notes || <span className="text-muted italic">No notes.</span>}
          </p>
        </DetailCard>
        <DetailCard icon={ArrowRight} title="Next Action">
          <p className="text-sm text-gray-700 leading-relaxed">{record.nextAction}</p>
        </DetailCard>
      </div>
    </div>
  );
}
