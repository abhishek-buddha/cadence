import { useState, useEffect } from 'react';
import { useAction } from 'convex/react';
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
    <div className="space-y-6 animate-fade-in max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">Settings</h1>
        <p className="text-sm text-muted mt-1">Application configuration and status</p>
      </div>

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
