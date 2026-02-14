const statusConfig = {
  pending: { bg: 'bg-warn/10', text: 'text-warn', dot: 'bg-warn', label: 'Pending' },
  in_progress: { bg: 'bg-accent/10', text: 'text-accent', dot: 'bg-accent', label: 'In Progress' },
  paid: { bg: 'bg-success/10', text: 'text-success', dot: 'bg-success', label: 'Paid' },
  denied: { bg: 'bg-danger/10', text: 'text-danger', dot: 'bg-danger', label: 'Denied' },
  appealing: { bg: 'bg-purple-500/10', text: 'text-purple-400', dot: 'bg-purple-400', label: 'Appealing' },
  write_off: { bg: 'bg-gray-500/10', text: 'text-gray-400', dot: 'bg-gray-400', label: 'Write Off' },
  // Call statuses
  initiating: { bg: 'bg-warn/10', text: 'text-warn', dot: 'bg-warn', label: 'Initiating' },
  ringing: { bg: 'bg-cyan/10', text: 'text-cyan', dot: 'bg-cyan', label: 'Ringing' },
  completed: { bg: 'bg-success/10', text: 'text-success', dot: 'bg-success', label: 'Completed' },
  failed: { bg: 'bg-danger/10', text: 'text-danger', dot: 'bg-danger', label: 'Failed' },
  // Claim result statuses
  processing: { bg: 'bg-accent/10', text: 'text-accent', dot: 'bg-accent', label: 'Processing' },
  pending_review: { bg: 'bg-warn/10', text: 'text-warn', dot: 'bg-warn', label: 'Pending Review' },
  no_record: { bg: 'bg-gray-500/10', text: 'text-gray-400', dot: 'bg-gray-400', label: 'No Record' },
  unknown: { bg: 'bg-gray-500/10', text: 'text-gray-400', dot: 'bg-gray-400', label: 'Unknown' },
};

export default function StatusBadge({ status, size = 'sm' }) {
  const config = statusConfig[status] || statusConfig.unknown;
  const sizeClass = size === 'lg' ? 'px-3 py-1.5 text-sm' : 'px-2 py-0.5 text-xs';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${config.bg} ${config.text} ${sizeClass}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot} ${status === 'in_progress' || status === 'initiating' ? 'status-dot-pulse' : ''}`} />
      {config.label}
    </span>
  );
}
