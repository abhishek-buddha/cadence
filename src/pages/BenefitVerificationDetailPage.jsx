import { useParams } from 'react-router-dom';
import { User, FileDigit, Stethoscope, ClipboardList, Gauge, Percent, Shield, UserCheck, MessageSquare, ArrowRight, ShieldCheck } from 'lucide-react';
import CaseBackHeader from '../components/case/CaseBackHeader';
import DetailCard from '../components/case/DetailCard';
import InfoRow from '../components/case/InfoRow';
import CallTranscriptCard from '../components/case/CallTranscriptCard';
import EmptyState from '../components/EmptyState';
import { benefitVerifications } from '../data/staticCaseData';

export default function BenefitVerificationDetailPage() {
  const { id } = useParams();
  const record = benefitVerifications.find((r) => r.id === id);

  if (!record) {
    return (
      <div className="animate-fade-in">
        <EmptyState icon={ShieldCheck} title="Record not found" description="This benefit verification record does not exist." />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <CaseBackHeader
        backTo="/benefit-verification"
        backLabel="Back to Benefit Verification"
        title={record.patientName}
        subtitle={`${record.insurance} — DOS ${record.dos}`}
        status={record.status}
        priority={record.priority}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DetailCard icon={User} title="Patient Demographics">
          <InfoRow label="Name" value={record.patientName} />
          <InfoRow label="Date of Birth" value={record.dob} />
          <InfoRow label="Patient ID" value={record.patientId} mono />
        </DetailCard>

        <DetailCard icon={FileDigit} title="Policy Info">
          <InfoRow label="Member ID" value={record.memberId} mono />
          <InfoRow label="Group #" value={record.groupNumber} mono />
          <InfoRow label="Payer" value={record.payer} />
          <InfoRow label="Plan Name" value={record.planName} />
        </DetailCard>

        <DetailCard icon={Stethoscope} title="Provider Used for Verification">
          <InfoRow label="Provider NPI" value={record.providerNpi} mono />
          <InfoRow label="Provider TIN" value={record.providerTin} mono />
        </DetailCard>

        <DetailCard icon={ClipboardList} title="Service / CPT Codes Being Verified">
          <p className="text-sm text-gray-900 font-data">{record.serviceCodes}</p>
        </DetailCard>

        <DetailCard icon={Gauge} title="Plan Details">
          <InfoRow label="Plan Type" value={record.planType} />
          <InfoRow label="Effective Dates" value={record.effectiveDates} />
          <InfoRow label="Network Status" value={record.networkStatus} />
        </DetailCard>

        <DetailCard icon={Percent} title="Deductible & OOP">
          <InfoRow label="Deductible (Individual)" value={record.deductibleIndividual} />
          <InfoRow label="Deductible (Family)" value={record.deductibleFamily} />
          <InfoRow label="Deductible Met" value={record.deductibleMet} />
          <InfoRow label="Out-of-Pocket Max" value={record.oopMax} />
          <InfoRow label="Out-of-Pocket Met" value={record.oopMet} />
        </DetailCard>

        <DetailCard icon={Shield} title="Copay / Coinsurance">
          <InfoRow label="Copay" value={record.copay} />
          <InfoRow label="Coinsurance" value={record.coinsurance} />
          <InfoRow label="Referral Required" value={record.referralRequired} />
          <InfoRow label="Prior Auth Required" value={record.priorAuthRequired} />
        </DetailCard>

        <DetailCard icon={UserCheck} title="Representative & Reference">
          <InfoRow label="Representative" value={record.repName} />
          <InfoRow label="Reference / Call ID" value={record.referenceId} mono />
        </DetailCard>
      </div>

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
