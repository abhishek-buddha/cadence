export default function InfoRow({ label, value, mono = false }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-muted">{label}</span>
      <span className={`text-sm text-gray-900 text-right ${mono ? 'font-data' : ''}`}>
        {value || value === 0 ? value : <span className="text-muted/50 italic">--</span>}
      </span>
    </div>
  );
}
