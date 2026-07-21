// Dark navy action toolbar for list-view pages, matching the mock
// (list view themes 3.html — `.action-toolbar`): a pill-shaped search input
// with a trailing "Search" button, an optional priority legend, and a row of
// pill-shaped accent action buttons — all on a dark `--toolbar-bg` band.
// Copy (placeholder, button label) matches the mock exactly.

import { Search } from 'lucide-react';

export function ListToolbarButton({ icon: Icon, label, onClick, active, variant = 'accent', disabled }) {
  const variantClass =
    variant === 'danger'
      ? 'bg-danger hover:bg-danger/90'
      : variant === 'white'
        ? 'bg-white text-gray-700 hover:border-accent hover:text-accent border border-border-light'
        : 'bg-accent hover:bg-accent-hover';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-xs font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap ${
        active ? 'bg-danger hover:bg-danger/90' : variantClass
      } ${variant === 'white' ? '!text-gray-700' : ''}`}
    >
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {label}
    </button>
  );
}

export default function ListToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search across all visible columns...',
  onSearchSubmit,
  legend,
  children,
}) {
  return (
    <div className="sticky top-0 z-20 flex items-center justify-between flex-wrap gap-4 bg-toolbar rounded-xl px-4 py-3 shadow-md">
      <div className="relative flex items-center flex-1 max-w-[380px] min-w-[220px]">
        <Search className="absolute left-3.5 w-4 h-4 text-white/50 pointer-events-none" />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSearchSubmit?.();
          }}
          placeholder={searchPlaceholder}
          className="w-full pl-9 pr-[70px] py-2 bg-white border border-border-light rounded-full text-xs text-gray-700 placeholder:text-gray-400 outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="button"
          onClick={onSearchSubmit}
          className="absolute right-1 inline-flex items-center px-3.5 py-1.5 rounded-full bg-accent hover:bg-accent-hover text-white text-[11px] font-medium transition-colors"
        >
          Search
        </button>
      </div>

      <div className="flex items-center gap-3.5 flex-wrap">
        {legend && (
          <div className="flex items-center gap-4 mr-1">
            {legend.map(({ label, dotClass }) => (
              <div key={label} className="flex items-center gap-1.5 text-xs text-white font-medium whitespace-nowrap">
                <span className={`w-2 h-2 rounded-full ${dotClass}`} />
                {label}
              </div>
            ))}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
