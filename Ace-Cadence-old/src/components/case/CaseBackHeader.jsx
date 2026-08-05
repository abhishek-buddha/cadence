import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import StatusBadge from '../StatusBadge';
import PriorityBadge from './PriorityBadge';

export default function CaseBackHeader({ backTo, backLabel, title, subtitle, status, priority, rightSlot }) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <Link
          to={backTo}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-gray-900 transition-colors mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {backLabel}
        </Link>

        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">{title}</h1>
          {status && <StatusBadge status={status} size="lg" />}
          {priority && <PriorityBadge priority={priority} />}
        </div>
        {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
      </div>
      {rightSlot}
    </div>
  );
}
