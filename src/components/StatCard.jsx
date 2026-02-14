export default function StatCard({ icon: Icon, label, value, subValue, accent = false }) {
  return (
    <div className={`rounded-xl border p-5 transition-all duration-200 ${
      accent
        ? 'bg-accent/5 border-accent/20 glow-border'
        : 'bg-panel border-border hover:border-border-light'
    }`}>
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-wider text-muted font-medium">{label}</p>
          <p className="text-2xl font-display font-bold text-white">{value}</p>
          {subValue && (
            <p className="text-xs text-muted font-data">{subValue}</p>
          )}
        </div>
        {Icon && (
          <div className={`p-2.5 rounded-lg ${accent ? 'bg-accent/10' : 'bg-panel-light'}`}>
            <Icon className={`w-5 h-5 ${accent ? 'text-accent' : 'text-muted'}`} />
          </div>
        )}
      </div>
    </div>
  );
}
