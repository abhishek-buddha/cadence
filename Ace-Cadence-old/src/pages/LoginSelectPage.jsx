import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Activity, ShieldCheck, Headset, ArrowLeft, ChevronRight, Loader2 } from 'lucide-react';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin', icon: ShieldCheck, description: 'Full access to claims, master data, reports, and user management' },
  { value: 'operator', label: 'Operator', icon: Headset, description: 'Handles assigned calls and claim follow-up' },
];

function getInitials(emailOrName) {
  if (!emailOrName) return '?';
  const trimmed = emailOrName.trim();
  if (trimmed.includes(' ')) {
    const parts = trimmed.split(' ').filter(Boolean);
    return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

export default function LoginSelectPage({ onSuccess }) {
  const [selectedRole, setSelectedRole] = useState(null);
  const users = useQuery(api.users?.list);

  const isLoading = users === undefined;
  const matchingUsers = (users ?? []).filter(
    (u) => u.role === selectedRole && u.status !== 'disabled'
  );

  function handleSelectUser(user) {
    onSuccess({
      userId: user._id,
      email: user.email,
      name: user.name || user.email,
      role: user.role,
    });
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-4 overflow-hidden">
      {/* Video background — same gate aesthetic as the PIN screen */}
      <video autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover">
        <source src="/access-bg.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-black/30" />

      <div className="relative z-10 flex flex-col items-center w-full">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-10">
          <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-display font-bold text-2xl tracking-tight text-white">Cadence</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/60 font-medium">Claims AI</p>
          </div>
        </div>

        <div className="w-full max-w-md bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-8 shadow-2xl shadow-black/20">
          {!selectedRole ? (
            <>
              <h2 className="font-display font-semibold text-lg text-white text-center mb-1">Who's signing in?</h2>
              <p className="text-sm text-white/60 text-center mb-8">Choose a role to continue</p>

              <div className="space-y-3">
                {ROLE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setSelectedRole(opt.value)}
                      className="w-full flex items-center gap-4 p-4 rounded-xl border border-white/20 bg-white/5 hover:bg-white/15 hover:border-white/40 transition-colors text-left"
                    >
                      <div className="w-10 h-10 rounded-lg bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-display font-semibold text-white">{opt.label}</p>
                        <p className="text-xs text-white/50 truncate">{opt.description}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-white/40 shrink-0" />
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => setSelectedRole(null)}
                className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors mb-4"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Change role
              </button>

              <h2 className="font-display font-semibold text-lg text-white text-center mb-1">
                Sign in as {ROLE_OPTIONS.find((r) => r.value === selectedRole)?.label}
              </h2>
              <p className="text-sm text-white/60 text-center mb-6">Select your account</p>

              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 text-white/50 animate-spin" />
                </div>
              ) : matchingUsers.length === 0 ? (
                <p className="text-sm text-white/50 text-center py-8">
                  No active {ROLE_OPTIONS.find((r) => r.value === selectedRole)?.label.toLowerCase()} accounts found.
                  Add one from User Management first.
                </p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {matchingUsers.map((user) => (
                    <button
                      key={user._id}
                      onClick={() => handleSelectUser(user)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border border-white/20 bg-white/5 hover:bg-white/15 hover:border-white/40 transition-colors text-left"
                    >
                      <div className="w-9 h-9 rounded-full bg-white/15 border border-white/20 flex items-center justify-center text-xs font-display font-semibold text-white shrink-0">
                        {getInitials(user.name || user.email)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{user.name || user.email}</p>
                        {user.name && <p className="text-xs text-white/50 truncate">{user.email}</p>}
                      </div>
                      <ChevronRight className="w-4 h-4 text-white/40 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <p className="mt-10 text-xs text-white/30 font-data">v0.1.0</p>
      </div>
    </div>
  );
}
