import { useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, PhoneForwarded, Info } from 'lucide-react';

const outcomeConfig = {
  successful: {
    bg: 'bg-success/10',
    text: 'text-success',
    dot: 'bg-success',
    label: 'Successful',
    icon: CheckCircle2,
  },
  partial: {
    bg: 'bg-warn/10',
    text: 'text-warn',
    dot: 'bg-warn',
    label: 'Partial',
    icon: AlertTriangle,
  },
  failed: {
    bg: 'bg-danger/10',
    text: 'text-danger',
    dot: 'bg-danger',
    label: 'Failed',
    icon: XCircle,
  },
  transferred_to_human: {
    bg: 'bg-accent/10',
    text: 'text-accent',
    dot: 'bg-accent',
    label: 'Transferred',
    icon: PhoneForwarded,
  },
  unknown: {
    bg: 'bg-gray-500/10',
    text: 'text-gray-500',
    dot: 'bg-gray-400',
    label: 'Unknown',
    icon: Info,
  },
};

export default function OutcomeBadge({ outcome, missingFields, size = 'sm' }) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const config = outcomeConfig[outcome] || outcomeConfig.unknown;
  const Icon = config.icon;
  const sizeClass = size === 'lg' ? 'px-3 py-1.5 text-sm' : 'px-2 py-0.5 text-xs';
  const iconSize = size === 'lg' ? 'w-3.5 h-3.5' : 'w-3 h-3';

  const showTooltip = outcome === 'partial' && missingFields && missingFields.length > 0;

  return (
    <span
      className={`relative inline-flex items-center gap-1.5 rounded-full font-medium ${config.bg} ${config.text} ${sizeClass}`}
      onMouseEnter={() => setTooltipVisible(true)}
      onMouseLeave={() => setTooltipVisible(false)}
    >
      <Icon className={iconSize} />
      {config.label}
      {showTooltip && tooltipVisible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 animate-fade-in">
          <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap max-w-xs">
            <p className="font-semibold mb-1">Missing fields:</p>
            <ul className="space-y-0.5 font-data">
              {missingFields.map((f, i) => (
                <li key={i} className="text-white/80">- {f}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </span>
  );
}
