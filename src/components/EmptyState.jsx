export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {Icon && (
        <div className="w-14 h-14 rounded-2xl bg-panel-light border border-border flex items-center justify-center mb-5">
          <Icon className="w-7 h-7 text-muted" />
        </div>
      )}
      <h3 className="font-display font-semibold text-white mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-muted max-w-sm mb-6">{description}</p>
      )}
      {action}
    </div>
  );
}
