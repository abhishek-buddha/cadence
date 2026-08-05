import { useParams } from 'react-router-dom';
import { User, Stethoscope, FileText, Shield, XCircle, PhoneCall, CalendarClock, UserCheck, ArrowRight, ClipboardCheck } from 'lucide-react';
import CaseBackHeader from '../components/case/CaseBackHeader';
import DetailCard from '../components/case/DetailCard';
import InfoRow from '../components/case/InfoRow';
import CallTranscriptCard from '../components/case/CallTranscriptCard';
import EmptyState from '../components/EmptyState';
import { priorAuthorizations } from '../data/staticCaseData';

export default function PriorAuthorizationDetailPage() {
  const { id } = useParams();
  const record = priorAuthorizations.find((r) => r.id === id);

  if (!record) {
    return (
      <div className="animate-fade-in">
        <EmptyState icon={ClipboardCheck} title="Record not found" description="This prior authorization record does not exist." />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <CaseBackHeader
        backTo="/prior-authorization"
        backLabel="Back to Prior Authorization"
        title={record.patientName}
        subtitle={record.procedure}
        status={record.status}
        priority={record.priority}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DetailCard icon={User} title="Patient & Ordering Provider">
          <InfoRow label="Patient" value={record.patientName} />
          <InfoRow label="Patient ID" value={record.patientId} mono />
          <InfoRow label="Ordering Provider" value={record.orderingProvider} />
        </DetailCard>

        <DetailCard icon={Stethoscope} title="Service / Procedure Requested">
          <InfoRow label="Procedure (CPT/ICD)" value={record.procedure} mono />
          <InfoRow label="Insurance / Payer" value={record.insurance} />
        </DetailCard>

        <DetailCard icon={FileText} title="Clinical Justification">
          <p className="text-sm text-gray-700 leading-relaxed">{record.clinicalJustification}</p>
        </DetailCard>

        <DetailCard icon={Shield} title="Authorization Status">
          <InfoRow label="Auth Status" value={record.authStatus} />
          <InfoRow label="Auth Number" value={record.authNumber} mono />
          <InfoRow label="Approved Units / Visits" value={record.approvedUnits} />
          <InfoRow label="Effective Date" value={record.effectiveDate} />
          <InfoRow label="Expiration Date" value={record.expirationDate} />
        </DetailCard>

        <DetailCard icon={XCircle} title="Denial Details">
          <InfoRow label="Denial Reason" value={record.denialReason} />
          <InfoRow label="Appeal Deadline" value={record.appealDeadline} />
        </DetailCard>

        <DetailCard icon={PhoneCall} title="Peer-to-Peer">
          <p className="text-sm text-gray-700 leading-relaxed">{record.peerToPeer}</p>
        </DetailCard>

        <DetailCard icon={UserCheck} title="Representative & Reference">
          <InfoRow label="Representative" value={record.repName} />
          <InfoRow label="Reference ID" value={record.referenceId} mono />
        </DetailCard>

        <DetailCard icon={CalendarClock} title="Request Timeline">
          <InfoRow label="Request Date" value={record.requestDate} />
          <InfoRow label="Auth Expiration" value={record.authExpiration} />
        </DetailCard>
      </div>

      <CallTranscriptCard transcript={record.transcript} hasRecording={!!record.transcript} />

      <DetailCard icon={ArrowRight} title="Next Action">
        <p className="text-sm text-gray-700 leading-relaxed">{record.nextAction}</p>
      </DetailCard>
    </div>
  );
}
