import { useState, useEffect } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  Settings,
  Database,
  Key,
  Phone,
  Mic,
  CheckCircle2,
  Info,
  Loader2,
  RotateCcw,
} from 'lucide-react';

function Section({ title, icon: Icon, children }) {
  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
        <Icon className="w-4 h-4 text-accent" />
        <h2 className="font-display font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}


const RETRY_SETTINGS = [
  { key: 'retry:maxAttempts', label: 'Max Attempts', defaultValue: '3', suffix: 'attempts' },
  { key: 'retry:delayMinutes', label: 'Retry Delay', defaultValue: '15', suffix: 'minutes' },
  { key: 'retry:windowHours', label: 'Retry Window', defaultValue: '24', suffix: 'hours' },
  { key: 'retry:concurrencyLimit', label: 'Concurrency Limit', defaultValue: '10', suffix: 'calls' },
];

function RetryPolicySettings() {
  const setCallSetting = useMutation(api.calls.setCallSetting);
  const maxAttempts = useQuery(api.calls.getCallSetting, { key: 'retry:maxAttempts' });
  const delayMinutes = useQuery(api.calls.getCallSetting, { key: 'retry:delayMinutes' });
  const windowHours = useQuery(api.calls.getCallSetting, { key: 'retry:windowHours' });
  const concurrencyLimit = useQuery(api.calls.getCallSetting, { key: 'retry:concurrencyLimit' });
  const values = [maxAttempts, delayMinutes, windowHours, concurrencyLimit];
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function currentValue(setting, index) {
    return drafts[setting.key] ?? values[index] ?? setting.defaultValue;
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      for (let i = 0; i < RETRY_SETTINGS.length; i++) {
        const setting = RETRY_SETTINGS[i];
        const value = String(currentValue(setting, i)).trim() || setting.defaultValue;
        await setCallSetting({ key: setting.key, value });
      }
      setDrafts({});
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        These settings define the visible retry policy for failed or no-answer calls. The scheduler can consume
        the same keys when automatic retry execution is enabled.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {RETRY_SETTINGS.map((setting, index) => (
          <label key={setting.key} className="block">
            <span className="block text-xs uppercase tracking-wider text-muted font-medium mb-1.5">
              {setting.label}
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                value={currentValue(setting, index)}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [setting.key]: e.target.value }))}
                className="w-full bg-white border border-border-light rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-accent focus:ring-1 focus:ring-accent outline-none"
              />
              <span className="text-xs text-muted w-16">{setting.suffix}</span>
            </div>
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-border/60">
        <p className="text-xs text-muted">
          {saved ? <span className="text-success font-medium">Retry policy saved.</span> : 'Stored in Convex call settings.'}
        </p>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
          Save Policy
        </button>
      </div>
    </div>
  );
}

function StatusRow({ label, description, configured = false, loading = false }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/50 last:border-b-0">
      <div>
        <p className="text-sm text-gray-900 font-medium">{label}</p>
        {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
      </div>
      <div className="flex items-center gap-2">
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 text-muted animate-spin" />
            <span className="text-xs font-medium text-muted">Checking...</span>
          </>
        ) : configured ? (
          <>
            <CheckCircle2 className="w-4 h-4 text-success" />
            <span className="text-xs font-medium text-success">Configured</span>
          </>
        ) : (
          <>
            <div className="w-4 h-4 rounded-full border-2 border-muted/40" />
            <span className="text-xs font-medium text-muted">Not configured</span>
          </>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const checkApiConfig = useAction(api.dashboard.checkApiConfig);
  const [apiStatus, setApiStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkApiConfig()
      .then(setApiStatus)
      .catch(() => setApiStatus({ openai: false, elevenlabs: false, twilio: false }))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Connection Status */}
      <Section title="Connection Status" icon={Database}>
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-success status-dot-pulse" />
          <div>
            <p className="text-sm text-gray-900 font-medium">Connected to Convex</p>
            <p className="text-xs text-muted mt-0.5">
              Real-time sync is active. All data updates are streamed automatically.
            </p>
          </div>
        </div>
      </Section>

      {/* API Configuration */}
      <Section title="API Configuration" icon={Key}>
        <p className="text-xs text-muted mb-4">
          API keys are managed via environment variables on the server. These indicators reflect
          actual configuration status from the backend.
        </p>
        <div className="divide-y divide-border/50">
          <StatusRow
            label="OpenAI"
            description="GPT-5.2 for transcript analysis and data extraction"
            configured={apiStatus?.openai ?? false}
            loading={loading}
          />
          <StatusRow
            label="ElevenLabs"
            description="Conversational AI voice agent for insurance calls"
            configured={apiStatus?.elevenlabs ?? false}
            loading={loading}
          />
          <StatusRow
            label="Twilio"
            description="Phone connectivity for outbound voice calls"
            configured={apiStatus?.twilio ?? false}
            loading={loading}
          />
        </div>
      </Section>

      {/* Retry Policy */}
      <Section title="Retry Policy" icon={RotateCcw}>
        <RetryPolicySettings />
      </Section>

      {/* About */}
      <Section title="About" icon={Info}>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-display font-semibold text-gray-900">Cadence</h3>
            <p className="text-sm font-data text-accent mt-1">v0.1.0</p>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            AI-powered claims follow-up. Cadence automates insurance verification calls using
            conversational voice agents, extracts structured data from call transcripts, and keeps
            your claims pipeline moving.
          </p>
          <div className="flex items-center gap-6 pt-2">
            <div className="flex items-center gap-2 text-xs text-muted">
              <Phone className="w-3.5 h-3.5" />
              <span>Voice Agents</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted">
              <Mic className="w-3.5 h-3.5" />
              <span>ElevenLabs</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted">
              <Database className="w-3.5 h-3.5" />
              <span>Convex</span>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
