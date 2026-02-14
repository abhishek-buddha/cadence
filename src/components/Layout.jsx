import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { Building2, ChevronDown } from 'lucide-react';
import { useProviderFilter } from '../context/ProviderFilterContext';

export default function Layout() {
  const { selectedProviderId, setSelectedProviderId, providers, selectedProvider } = useProviderFilter();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="shrink-0 h-14 bg-panel/80 backdrop-blur-md border-b border-border flex items-center justify-end px-6 lg:px-8 gap-4">
          {/* Hospital selector */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2 text-xs text-muted uppercase tracking-wider font-medium">
              <Building2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Hospital</span>
            </div>
            <div className="relative">
              <select
                value={selectedProviderId ?? ''}
                onChange={(e) => setSelectedProviderId(e.target.value || null)}
                className="bg-surface/80 border border-border-light rounded-lg pl-3 pr-8 py-1.5 text-sm text-white appearance-none cursor-pointer hover:border-accent/40 focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-colors min-w-[180px]"
              >
                <option value="">All Hospitals</option>
                {providers.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.practiceName}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
            </div>
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
