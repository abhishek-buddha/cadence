import { useParams } from 'react-router-dom';
import { User, Receipt, History, PhoneCall, CreditCard, MessageSquare, ArrowRight, Wallet } from 'lucide-react';
import CaseBackHeader from '../components/case/CaseBackHeader';
import DetailCard from '../components/case/DetailCard';
import InfoRow from '../components/case/InfoRow';
import CallTranscriptCard from '../components/case/CallTranscriptCard';
import EmptyState from '../components/EmptyState';
import { patientBalanceReminders } from '../data/staticCaseData';

export default function PatientBalanceReminderDetailPage() {
  const { id } = useParams();
  const record = patientBalanceReminders.find((r) => r.id === id);

  if (!record) {
    return (
      <div className="animate-fade-in">
        <EmptyState icon={Wallet} title="Record not found" description="This balance reminder record does not exist." />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <CaseBackHeader
        backTo="/patient-balance-reminder"
        backLabel="Back to Patient Balance Reminder"
        title={record.patientName}
        subtitle={`Balance ${record.balance} — ${record.agingBucket} days`}
        status={record.status}
        priority={record.priority}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DetailCard icon={User} title="Patient Contact Info">
          <InfoRow label="Name" value={record.patientName} />
          <InfoRow label="Patient ID" value={record.patientId} mono />
          <InfoRow label="Phone" value={record.phone} mono />
          <InfoRow label="Email" value={record.email} />
          <InfoRow label="Insurance" value={record.insurance} />
        </DetailCard>

        <DetailCard icon={PhoneCall} title="Reminder Activity">
          <InfoRow label="Last Attempt" value={record.lastAttempt} />
          <InfoRow label="Next Attempt" value={record.nextAttempt} />
          <InfoRow label="Assigned To" value={record.assignedTo} />
          <InfoRow label="Outcome" value={record.outcome} />
        </DetailCard>
      </div>

      <DetailCard icon={Receipt} title="Balance Breakdown">
        <div className="overflow-x-auto -mx-5 -mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-2 text-left text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">DOS</th>
                <th className="px-4 py-2 text-left text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Service</th>
                <th className="px-4 py-2 text-right text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Charge</th>
                <th className="px-4 py-2 text-right text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Insurance Paid</th>
                <th className="px-5 py-2 text-right text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Patient Resp.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {record.balanceBreakdown.map((line, i) => (
                <tr key={i}>
                  <td className="px-5 py-2.5 whitespace-nowrap text-gray-700">{line.dos}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-gray-700">{line.service}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-right font-data text-gray-900">{line.charge}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-right font-data text-gray-700">{line.insurancePaid}</td>
                  <td className="px-5 py-2.5 whitespace-nowrap text-right font-data text-gray-900">{line.patientResp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DetailCard>

      <DetailCard icon={History} title="Payment History">
        {record.paymentHistory.length === 0 ? (
          <p className="text-sm text-muted italic">No payments recorded yet.</p>
        ) : (
          <div className="divide-y divide-border/50">
            {record.paymentHistory.map((p, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm text-gray-900">{p.date}</span>
                <span className="text-sm text-gray-700">{p.method}</span>
                <span className="text-sm font-data text-gray-900">{p.amount}</span>
              </div>
            ))}
          </div>
        )}
      </DetailCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DetailCard icon={CreditCard} title="Call Outcome & Payment Plan">
          <InfoRow label="Call Outcome" value={record.callOutcome} />
          <InfoRow label="Promised Amount" value={record.promisedAmount} />
          <InfoRow label="Promised Date" value={record.promisedDate} />
          <InfoRow label="Payment Plan Terms" value={record.paymentPlanTerms} />
        </DetailCard>
        <DetailCard icon={ArrowRight} title="Next Action">
          <p className="text-sm text-gray-700 leading-relaxed">{record.nextAction}</p>
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
