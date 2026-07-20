import { History } from 'lucide-react';
import DetailCard from './DetailCard';

export default function AttemptHistoryCard({ attempts = [], title = 'Call Attempt History' }) {
  return (
    <DetailCard icon={History} title={title}>
      {attempts.length === 0 ? (
        <p className="text-sm text-muted italic">No attempts logged yet.</p>
      ) : (
        <div className="divide-y divide-border/50">
          {attempts.map((a, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm text-gray-900">{a.date}</p>
                {a.notes && <p className="text-xs text-muted mt-0.5">{a.notes}</p>}
              </div>
              <span className="text-xs font-medium text-gray-600 whitespace-nowrap shrink-0">{a.outcome}</span>
            </div>
          ))}
        </div>
      )}
    </DetailCard>
  );
}
