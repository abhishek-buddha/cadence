import { createContext, useContext, useState, useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

const ProviderFilterContext = createContext({
  selectedProviderId: null,
  setSelectedProviderId: () => {},
  providers: [],
  selectedProvider: null,
});

export function ProviderFilterProvider({ children }) {
  const providers = useQuery(api.providers.list) ?? [];
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
      const exists = providers.some((p) => p._id === selectedProviderId);
      if (!exists) setSelectedProviderId(null);
    }
  }, [selectedProviderId, providers]);

  const selectedProvider = providers.find((p) => p._id === selectedProviderId) || null;

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
