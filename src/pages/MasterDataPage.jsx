import { useState } from 'react';
import { Users, Building2, Stethoscope } from 'lucide-react';
import PatientsPage from './PatientsPage';
import InsuranceDirectory from './InsuranceDirectory';
import ProvidersPage from './ProvidersPage';

const TABS = [
  { key: 'patients', icon: Users, label: 'Patients' },
  { key: 'insurance', icon: Building2, label: 'Insurance' },
  { key: 'providers', icon: Stethoscope, label: 'Providers' },
];

export default function MasterDataPage() {
  const [activeKey, setActiveKey] = useState('patients');

  return (
    <div className="animate-fade-in">
      {/* Sub-tabs — Patients / Insurance / Providers have no sidebar equivalent, kept here */}
      <div className="bg-white border border-border rounded-xl shadow-sm">
        <div className="border-b border-border flex items-center gap-1 px-4">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeKey === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveKey(tab.key)}
                className={`relative inline-flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive ? 'text-accent' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-t" />
                )}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {activeKey === 'patients' && <PatientsPage />}
          {activeKey === 'insurance' && <InsuranceDirectory />}
          {activeKey === 'providers' && <ProvidersPage />}
        </div>
      </div>
    </div>
  );
}
