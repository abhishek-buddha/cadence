import { useParams } from 'react-router-dom';
import { Activity, Gauge, Percent, UserCheck, MessageSquare } from 'lucide-react';
import CaseBackHeader from '../components/case/CaseBackHeader';
import DetailCard from '../components/case/DetailCard';
import InfoRow from '../components/case/InfoRow';
import CallTranscriptCard from '../components/case/CallTranscriptCard';
import EmptyState from '../components/EmptyState';
import { eligibilityVerifications } from '../data/staticCaseData';

export default function EligibilityVerificationDetailPage() {
  const { id } = useParams();
  const record = eligibilityVerifications.find((r) => r.id === id);

  if (!record) {
    return (
      <div className="animate-fade-in">
        <EmptyState icon={Activity} title="Record not found" description="This eligibility verification record does not exist." />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <CaseBackHeader
        backTo="/eligibility-verification"
        backLabel="Back to Eligibility Verification"
        title={record.patientName}
        subtitle={`${record.insurance} — DOS ${record.dos}`}
        status={record.status}
        priority={record.priority}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DetailCard icon={Gauge} title="Eligibility & Plan">
          <InfoRow label="Plan Type" value={record.planType} />
          <InfoRow label="Coverage Dates" value={record.coverageDates} />
        </DetailCard>

        <DetailCard icon={Percent} title="Deductible & Cost Share">
          <InfoRow label="Deductible Remaining" value={record.deductibleRemaining} />
          <InfoRow label="Copay" value={record.copay} />
          <InfoRow label="Coinsurance" value={record.coinsurance} />
        </DetailCard>

        <DetailCard icon={Activity} title="Requirements">
          <InfoRow label="PCP Requirement" value={record.pcpRequirement} />
          <InfoRow label="Referral Needed" value={record.referralNeeded} />
          <InfoRow label="Prior Authorization Needed" value={record.priorAuthNeeded} />
        </DetailCard>

        <DetailCard icon={UserCheck} title="Representative & Reference">
          <InfoRow label="Representative" value={record.repName} />
          <InfoRow label="Reference ID" value={record.referenceId} mono />
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
