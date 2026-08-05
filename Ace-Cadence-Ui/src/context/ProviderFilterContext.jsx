import { createContext, useContext, useState, useEffect } from 'react';
import { listProviders } from '../api/masterData';
import { useLiveQuery } from '../hooks/useLiveQuery';

const ProviderFilterContext = createContext({
  selectedProviderId: null,
  setSelectedProviderId: () => {},
  providers: [],
  selectedProvider: null,
});

export function ProviderFilterProvider({ children }) {
  const { data } = useLiveQuery(listProviders, [], 'provider');
  const providers = data ?? [];
  const [selectedProviderId, setSelectedProviderId] = useState(() => {
    return localStorage.getItem('cadence_provider_filter') || null;
  });

  // Persist selection
  useEffect(() => {
    if (selectedProviderId) {
      localStorage.setItem('cadence_provider_filter', selectedProviderId);
    } else {
      localStorage.removeItem('cadence_provider_filter');
    }
  }, [selectedProviderId]);

  // Clear selection if provider no longer exists
  useEffect(() => {
    if (selectedProviderId && providers.length > 0) {
      const exists = providers.some((p) => String(p.id) === String(selectedProviderId));
      if (!exists) setSelectedProviderId(null);
    }
  }, [selectedProviderId, providers]);

  const selectedProvider = providers.find((p) => String(p.id) === String(selectedProviderId)) || null;

  return (
    <ProviderFilterContext.Provider
      value={{ selectedProviderId, setSelectedProviderId, providers, selectedProvider }}
    >
      {children}
    </ProviderFilterContext.Provider>
  );
}

export function useProviderFilter() {
  return useContext(ProviderFilterContext);
}
