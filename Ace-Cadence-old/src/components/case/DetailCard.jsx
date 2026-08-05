export default function DetailCard({ icon: Icon, title, action, children }) {
  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
      <div className="border-b border-border px-5 py-3 flex items-center gap-2.5">
        <Icon className="w-4 h-4 text-accent" />
        <h3 className="text-sm font-display font-semibold text-gray-900 flex-1">{title}</h3>
        {action}
      </div>
      <div className="px-5 py-4">
        {children}
      </div>
    </div>
  );
}
