import { AlertTriangle } from 'lucide-react';

const priorityConfig = {
  high: { bg: 'bg-danger/10', text: 'text-danger', label: 'High' },
  medium: { bg: 'bg-warn/10', text: 'text-warn', label: 'Medium' },
  low: { bg: 'bg-success/10', text: 'text-success', label: 'Low' },
};

export default function PriorityBadge({ priority }) {
  const config = priorityConfig[priority] || priorityConfig.medium;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bg} ${config.text}`}>
      <AlertTriangle className="w-3 h-3" />
      {config.label}
    </span>
  );
}
