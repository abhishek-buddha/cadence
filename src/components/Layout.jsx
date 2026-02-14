import { useState, useRef, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { Building2, ChevronDown, Check } from 'lucide-react';
import { useProviderFilter } from '../context/ProviderFilterContext';

function HospitalDropdown() {
  const { selectedProviderId, setSelectedProviderId, providers, selectedProvider } = useProviderFilter();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const options = [
    { id: null, label: 'All Hospitals' },
    ...providers.map((p) => ({ id: p._id, label: p.practiceName })),
  ];

  const selectedLabel = selectedProvider ? selectedProvider.practiceName : 'All Hospitals';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 bg-surface/80 border border-border-light rounded-lg pl-3 pr-2.5 py-1.5 text-sm text-white cursor-pointer hover:border-accent/40 focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-colors min-w-[180px]"
      >
        <span className="flex-1 text-left truncate">{selectedLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-full min-w-[200px] bg-panel border border-border-light rounded-lg shadow-xl shadow-black/40 py-1 z-50 animate-fade-in">
          {options.map((opt) => {
            const isActive = opt.id === selectedProviderId;
            return (
              <button
                key={opt.id ?? '__all'}
                onClick={() => {
                  setSelectedProviderId(opt.id);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                  isActive
                    ? 'bg-accent/10 text-accent'
                    : 'text-gray-300 hover:bg-white/[0.05] hover:text-white'
                }`}
              >
                <Building2 className="w-3.5 h-3.5 shrink-0 opacity-50" />
                <span className="flex-1 truncate">{opt.label}</span>
                {isActive && <Check className="w-3.5 h-3.5 text-accent shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="shrink-0 h-14 bg-panel/80 backdrop-blur-md border-b border-border flex items-center justify-end px-6 lg:px-8 gap-4 relative z-20">
          {/* Hospital selector */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2 text-xs text-muted uppercase tracking-wider font-medium">
              <Building2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Hospital</span>
            </div>
            <HospitalDropdown />
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto grid-bg">
          <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
