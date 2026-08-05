import { useParams } from 'react-router-dom';
import { User, MessageCircle, Receipt, CheckCircle2, AlertTriangle, PhoneCall, MessageSquare, PhoneIncoming } from 'lucide-react';
import CaseBackHeader from '../components/case/CaseBackHeader';
import DetailCard from '../components/case/DetailCard';
import InfoRow from '../components/case/InfoRow';
import CallTranscriptCard from '../components/case/CallTranscriptCard';
import EmptyState from '../components/EmptyState';
import { inboundBillingCases } from '../data/staticCaseData';

export default function InboundBillingDetailPage() {
  const { id } = useParams();
  const record = inboundBillingCases.find((r) => r.id === id);

  if (!record) {
    return (
      <div className="animate-fade-in">
        <EmptyState icon={PhoneIncoming} title="Call not found" description="This inbound billing call does not exist." />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <CaseBackHeader
        backTo="/inbound-billing"
        backLabel="Back to Inbound Billing"
        title={record.callerName}
        subtitle={`${record.callId} — ${record.callDateTime}`}
        status={record.status}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DetailCard icon={User} title="Caller / Patient Info">
          <InfoRow label="Name" value={record.callerName} />
          <InfoRow label="Phone" value={record.phone} mono />
          <InfoRow label="Verified Via" value={record.verifiedVia} />
          <InfoRow label="Assigned To" value={record.assignedTo} />
          <InfoRow label="Duration" value={record.duration} mono />
        </DetailCard>

        <DetailCard icon={MessageCircle} title="Reason for Call">
          <p className="text-sm text-gray-700 leading-relaxed">{record.reason}</p>
        </DetailCard>

        <DetailCard icon={Receipt} title="Account / Balance Details Discussed">
          <p className="text-sm text-gray-700 leading-relaxed">{record.accountDetails}</p>
        </DetailCard>

        <DetailCard icon={CheckCircle2} title="Resolution">
          <p className="text-sm text-gray-700 leading-relaxed">
            {record.resolution && record.resolution !== '--' ? record.resolution : <span className="text-muted italic">Not yet resolved.</span>}
          </p>
        </DetailCard>

        <DetailCard icon={AlertTriangle} title="Escalation">
          <p className="text-sm text-gray-700 leading-relaxed">
            {record.escalationReason && record.escalationReason !== '--' ? record.escalationReason : <span className="text-muted italic">Not escalated.</span>}
          </p>
        </DetailCard>

        <DetailCard icon={PhoneCall} title="Callback">
          <InfoRow label="Callback Required" value={record.callbackRequired} />
          <InfoRow label="Preferred Time" value={record.callbackPreferredTime} />
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
