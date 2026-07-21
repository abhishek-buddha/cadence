import { useState, useRef } from 'react';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Building2, Plus, Pencil, Trash2, Phone, X, Grid3x3, ShieldCheck, ShieldAlert, ShieldQuestion, Upload } from 'lucide-react';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import BulkImportInsuranceModal from '../components/BulkImportInsuranceModal';
import ListToolbar, { ListToolbarButton } from '../components/ListToolbar';

const STALE_AFTER_DAYS = 90;
const WARN_AFTER_DAYS = 30;

function daysSince(isoDate) {
  if (!isoDate) return null;
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24));
}

function verificationStatus(isoDate) {
  const days = daysSince(isoDate);
  if (days == null) return { label: 'Never verified', level: 'unknown' };
  if (days > STALE_AFTER_DAYS) return { label: `Stale — verified ${days}d ago`, level: 'stale' };
  if (days > WARN_AFTER_DAYS) return { label: `Verified ${days}d ago`, level: 'warn' };
  return { label: days === 0 ? 'Verified today' : `Verified ${days}d ago`, level: 'fresh' };
}

// Stable serialization for change-detection — only the fields that feed the
// live agent playbook matter here, not cosmetic fields like notes/hours.
function ivrConfigKey(ivrInstructions, ivrSteps, voiceIvrPhrases) {
  return JSON.stringify({
    ivrInstructions: ivrInstructions || '',
    ivrSteps: (ivrSteps || []).map((s) => ({ waitSeconds: Number(s.waitSeconds) || 0, digit: s.digit, label: s.label || '' })),
    voiceIvrPhrases: (voiceIvrPhrases || []).map((p) => ({ promptContains: p.promptContains, responseText: p.responseText })),
  });
}

const PAYER_KIND_OPTIONS = [
  { value: 'medical', label: 'Medical' },
  { value: 'dental', label: 'Dental' },
];

const WAIT_SECONDS_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// Voice AI agent config — not wired to any call behavior yet, just stored for
// now until the agent-side functionality is built.
const VOICE_TONE_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

const VOICE_MODULATION_OPTIONS = [
  { value: 'us_neutral', label: 'US English - Neutral' },
  { value: 'us_east_coast', label: 'US English - East Coast' },
  { value: 'us_west_coast', label: 'US English - West Coast' },
  { value: 'us_southern', label: 'US English - Southern' },
  { value: 'canadian_english', label: 'Canadian English' },
  { value: 'vietnamese_english', label: 'Vietnamese English' },
];

const EMPTY_FORM = {
  name: '',
  phone: '',
  humanAgentNumber: '',
  payerId: '',
  payerKind: 'medical',
  hours: '',
  ivrInstructions: '',
  verificationRequirements: '',
  avgHoldTime: '',
  notes: '',
  ivrEnabled: false,
  ivrSteps: [],
  voiceIvrEnabled: false,
  voiceIvrPhrases: [],
  ivrVerifiedAt: null,
  voiceTone: '',
  voiceModulation: '',
};

function stepsToSequence(steps) {
  return steps
    .map((s) => 'w'.repeat(Math.max(0, Number(s.waitSeconds) || 0)) + (s.digit || ''))
    .join('');
}

export default function InsuranceDirectory() {
  const contacts = useQuery(api.insuranceContacts.list);
  const createContact = useMutation(api.insuranceContacts.create);
  const updateContact = useMutation(api.insuranceContacts.update);
  const removeContact = useMutation(api.insuranceContacts.remove);
  const markIvrVerified = useMutation(api.insuranceContacts.markIvrVerified);
  const generatePlaybook = useAction(api.insuranceContacts.generatePlaybookFromTranscript);

  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [marking, setMarking] = useState(false);
  // Transcript → playbook authoring aid (see IVR Instructions section below)
  const [transcriptInput, setTranscriptInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  const originalIvrKeyRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');

  const isLoading = contacts === undefined;

  const filteredContacts = (contacts ?? []).filter((contact) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return [contact.name, contact.phone, contact.payerId]
      .some((v) => v && String(v).toLowerCase().includes(q));
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setTranscriptInput('');
    setGenError(null);
    setModalOpen(true);
  }

  function openEdit(contact) {
    setEditing(contact);
    setForm({
      name: contact.name,
      phone: contact.phone,
      humanAgentNumber: contact.humanAgentNumber ?? '',
      payerId: contact.payerId ?? '',
      payerKind: contact.payerKind ?? 'medical',
      hours: contact.hours ?? '',
      ivrInstructions: contact.ivrInstructions ?? '',
      verificationRequirements: contact.verificationRequirements ?? '',
      avgHoldTime: contact.avgHoldTime != null ? String(contact.avgHoldTime) : '',
      notes: contact.notes ?? '',
      ivrEnabled: contact.ivrEnabled ?? false,
      ivrSteps: contact.ivrSteps ?? [],
      voiceIvrEnabled: contact.voiceIvrEnabled ?? false,
      voiceIvrPhrases: contact.voiceIvrPhrases ?? [],
      ivrVerifiedAt: contact.ivrVerifiedAt ?? null,
      voiceTone: contact.voiceTone ?? '',
      voiceModulation: contact.voiceModulation ?? '',
    });
    originalIvrKeyRef.current = ivrConfigKey(contact.ivrInstructions, contact.ivrSteps, contact.voiceIvrPhrases);
    // Start the transcript box empty — the playbook may already be filled (e.g.
    // from a bulk upload). The "Generate playbook" button stays disabled until
    // the user actually pastes a new transcript here.
    setTranscriptInput('');
    setGenError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setTranscriptInput('');
    setGenError(null);
    originalIvrKeyRef.current = null;
  }

  async function handleMarkVerified() {
    if (!editing) return;
    setMarking(true);
    try {
      await markIvrVerified({ id: editing._id });
      const nowIso = new Date().toISOString();
      setField('ivrVerifiedAt', nowIso);
      originalIvrKeyRef.current = ivrConfigKey(form.ivrInstructions, form.ivrSteps, form.voiceIvrPhrases);
    } finally {
      setMarking(false);
    }
  }

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleGeneratePlaybook() {
    if (!transcriptInput.trim() || generating) return;
    setGenerating(true);
    setGenError(null);
    try {
      const { playbook } = await generatePlaybook({ transcript: transcriptInput });
      setField('ivrInstructions', playbook);
    } catch (err) {
      setGenError(err?.message || 'Failed to generate playbook from transcript.');
    } finally {
      setGenerating(false);
    }
  }

  function addIvrStep() {
    setForm((prev) => ({
      ...prev,
      ivrSteps: [...prev.ivrSteps, { waitSeconds: 2, digit: '', label: '' }],
    }));
  }

  function updateIvrStep(index, field, value) {
    setForm((prev) => ({
      ...prev,
      ivrSteps: prev.ivrSteps.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    }));
  }

  function removeIvrStep(index) {
    setForm((prev) => ({ ...prev, ivrSteps: prev.ivrSteps.filter((_, i) => i !== index) }));
  }

  function addVoicePhrase() {
    setForm((prev) => ({
      ...prev,
      voiceIvrPhrases: [...prev.voiceIvrPhrases, { promptContains: '', responseText: '' }],
    }));
  }

  function updateVoicePhrase(index, field, value) {
    setForm((prev) => ({
      ...prev,
      voiceIvrPhrases: prev.voiceIvrPhrases.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    }));
  }

  function removeVoicePhrase(index) {
    setForm((prev) => ({ ...prev, voiceIvrPhrases: prev.voiceIvrPhrases.filter((_, i) => i !== index) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const cleanSteps = form.ivrSteps
        .filter((s) => s.digit)
        .map((s) => ({
          waitSeconds: Number(s.waitSeconds) || 0,
          digit: s.digit,
          label: s.label || undefined,
        }));
      const cleanPhrases = form.voiceIvrPhrases.filter((p) => p.promptContains && p.responseText);

      // If the IVR playbook content changed since this contact was opened for
      // editing, the prior verification no longer reflects what's saved —
      // clear it so the staleness badge honestly shows "never verified" again.
      const newIvrKey = ivrConfigKey(form.ivrInstructions, cleanSteps, cleanPhrases);
      const ivrConfigChanged = editing && originalIvrKeyRef.current !== null && newIvrKey !== originalIvrKeyRef.current;

      const payload = {
        name: form.name,
        phone: form.phone,
        // Send the raw value (empty string when cleared) rather than undefined:
        // the update mutation skips undefined fields, so `|| undefined` made it
        // impossible to CLEAR a saved number. "" is written and reads as "no
        // number" everywhere (follow-up guard + prompt both treat it as unset).
        humanAgentNumber: form.humanAgentNumber,
        payerId: form.payerId || undefined,
        payerKind: form.payerKind || undefined,
        hours: form.hours || undefined,
        ivrInstructions: form.ivrInstructions || undefined,
        verificationRequirements: form.verificationRequirements || undefined,
        avgHoldTime: form.avgHoldTime ? Number(form.avgHoldTime) : undefined,
        notes: form.notes || undefined,
        ivrEnabled: form.ivrEnabled,
        ivrSteps: cleanSteps.length ? cleanSteps : undefined,
        ivrSequence: cleanSteps.length ? stepsToSequence(cleanSteps) : undefined,
        voiceIvrEnabled: form.voiceIvrEnabled,
        voiceIvrPhrases: cleanPhrases.length ? cleanPhrases : undefined,
        ivrSourceTranscript: transcriptInput.trim() || undefined,
        voiceTone: form.voiceTone || undefined,
        voiceModulation: form.voiceModulation || undefined,
      };

      if (editing) {
        await updateContact({ id: editing._id, ...payload, clearIvrVerification: ivrConfigChanged });
      } else {
        await createContact(payload);
      }
      closeModal();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this payer? This cannot be undone.')) return;
    await removeContact({ id });
  }

  function formatHoldTime(minutes) {
    if (minutes == null) return '--';
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  const inputClass =
    'w-full bg-white border border-border-light rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-muted focus:border-accent focus:ring-1 focus:ring-accent outline-none';
  const labelClass = 'block text-xs uppercase tracking-wider text-muted font-medium mb-1.5';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight">Payer Directory</h1>
          <p className="text-sm text-muted mt-1">
            {contacts ? `${filteredContacts.length} payer${filteredContacts.length !== 1 ? 's' : ''}` : 'Loading...'}
          </p>
        </div>
      </div>

      {/* Action toolbar */}
      <ListToolbar searchValue={searchQuery} onSearchChange={setSearchQuery}>
        <ListToolbarButton icon={Upload} label="Upload Workbook" onClick={() => setImportOpen(true)} variant="white" />
        <ListToolbarButton icon={Plus} label="Add Payer" onClick={openCreate} />
      </ListToolbar>

      {/* Table */}
      {isLoading ? (
        <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="p-8 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 shimmer rounded-lg" />
            ))}
          </div>
        </div>
      ) : filteredContacts.length === 0 ? (
        <div className="bg-white border border-border rounded-xl shadow-sm">
          <EmptyState
            icon={Building2}
            title={searchQuery ? 'No matching payers' : 'No payers yet'}
            description={
              searchQuery
                ? 'Try adjusting your search to find what you are looking for.'
                : 'Build your payer directory to streamline claims follow-up calls.'
            }
            action={
              !searchQuery ? (
                <button onClick={openCreate} className="px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium text-sm transition-colors inline-flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Add Payer
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-table-header">
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-table-header-text font-semibold">Payer Name</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-table-header-text font-semibold">Phone</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-table-header-text font-semibold">Hours</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-table-header-text font-semibold">Avg Hold Time</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-table-header-text font-semibold">IVR</th>
                  <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-table-header-text font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredContacts.map((contact) => (
                  <tr key={contact._id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <span className="font-medium text-gray-900">{contact.name}</span>
                      {contact.payerId && (
                        <span className="ml-2 text-xs font-data text-muted">({contact.payerId})</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <span className="font-data inline-flex items-center gap-1.5">
                        <Phone className="w-3 h-3 text-muted" />
                        {contact.phone}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{contact.hours ?? '--'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatHoldTime(contact.avgHoldTime)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <div className="flex flex-wrap items-center gap-1">
                        {contact.ivrEnabled && contact.ivrSequence && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-accent/10 text-accent">
                            Keypad
                          </span>
                        )}
                        {contact.voiceIvrEnabled && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-700">
                            Voice
                          </span>
                        )}
                        {!contact.ivrEnabled && !contact.voiceIvrEnabled && !contact.ivrInstructions && (
                          <span className="text-muted text-xs">--</span>
                        )}
                        {(contact.ivrInstructions || (contact.ivrSteps || []).length > 0 || (contact.voiceIvrPhrases || []).length > 0) && (
                          <VerificationDot ivrVerifiedAt={contact.ivrVerifiedAt} />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => openEdit(contact)}
                          className="p-1.5 text-muted hover:text-accent hover:bg-accent/10 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(contact._id)}
                          className="px-3 py-1.5 text-danger hover:bg-danger/10 rounded-lg text-sm transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      <BulkImportInsuranceModal open={importOpen} onClose={() => setImportOpen(false)} />

      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Edit Payer' : 'Add Payer'} wide>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Payer Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                className={inputClass}
                placeholder="Aetna, Blue Cross, etc."
                required
              />
            </div>
            <div>
              <label className={labelClass}>Phone Number</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
                className={inputClass}
                placeholder="1-800-555-0100"
                required
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Human Agent Number</label>
            <input
              type="tel"
              value={form.humanAgentNumber}
              onChange={(e) => setField('humanAgentNumber', e.target.value)}
              className={inputClass}
              placeholder="+918309838260 (forwarded after IVR)"
            />
          </div>

          <div>
            <label className={labelClass}>Payer ID</label>
            <input
              type="text"
              value={form.payerId}
              onChange={(e) => setField('payerId', e.target.value)}
              className={inputClass}
              placeholder="60054"
            />
          </div>

          <div>
            <label className={labelClass}>Payer Type</label>
            <div className="grid grid-cols-2 gap-2">
              {PAYER_KIND_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setField('payerKind', opt.value)}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    form.payerKind === opt.value
                      ? 'border-accent bg-accent/5 text-accent'
                      : 'border-border hover:border-accent/40 bg-white text-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Voice Tone</label>
              <select
                value={form.voiceTone}
                onChange={(e) => setField('voiceTone', e.target.value)}
                className={inputClass}
              >
                <option value="">Select...</option>
                {VOICE_TONE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Voice Modulation</label>
              <select
                value={form.voiceModulation}
                onChange={(e) => setField('voiceModulation', e.target.value)}
                className={inputClass}
              >
                <option value="">Select...</option>
                {VOICE_MODULATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Hours of Operation</label>
              <input
                type="text"
                value={form.hours}
                onChange={(e) => setField('hours', e.target.value)}
                className={inputClass}
                placeholder="Mon-Fri 8am-6pm EST"
              />
            </div>
            <div>
              <label className={labelClass}>Avg Hold Time (minutes)</label>
              <input
                type="number"
                min="0"
                value={form.avgHoldTime}
                onChange={(e) => setField('avgHoldTime', e.target.value)}
                className={inputClass}
                placeholder="15"
              />
            </div>
          </div>

          {/* Authoring aid: generate a playbook from a real call transcript */}
          <div className="border border-border-light rounded-lg p-4 space-y-3 bg-gray-50/50">
            <div>
              <label className={labelClass}>Generate playbook from a call transcript (optional)</label>
              <p className="text-xs text-muted mt-1 mb-2">
                Paste the transcript of a real call with this payer's IVR. An AI distills it into a
                step-by-step navigation playbook and fills the IVR Instructions field below, which you
                can then edit before saving.
              </p>
              <textarea
                value={transcriptInput}
                onChange={(e) => setTranscriptInput(e.target.value)}
                className={inputClass}
                rows={4}
                placeholder={'User: Thank you for calling... Please say or enter your NPI or Tax ID.\nAgent: [enters Tax ID]\n...'}
              />
            </div>
            {genError && <p className="text-xs text-red-600">{genError}</p>}
            <button
              type="button"
              onClick={handleGeneratePlaybook}
              disabled={generating || !transcriptInput.trim()}
              className="px-3 py-1.5 text-sm rounded-md bg-accent text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent/90 transition-colors"
            >
              {generating ? 'Generating…' : 'Generate playbook →'}
            </button>
          </div>

          <div>
            <label className={labelClass}>IVR Instructions (spoken script)</label>
            <textarea
              value={form.ivrInstructions}
              onChange={(e) => setField('ivrInstructions', e.target.value)}
              className={inputClass}
              rows={3}
              placeholder='Say "provider", then say "eligibility and benefits". Provide Tax ID when asked.'
            />
            <p className="text-xs text-muted mt-1">
              Fed to the AI agent as context so it can speak its way through the menu on a normal call.
              Write it manually, or generate it from a transcript above.
            </p>
          </div>

          {/* IVR playbook verification status */}
          {(form.ivrInstructions || form.ivrSteps.length > 0 || form.voiceIvrPhrases.length > 0) && (
            <VerificationBanner
              ivrVerifiedAt={form.ivrVerifiedAt}
              editing={!!editing}
              marking={marking}
              onMarkVerified={handleMarkVerified}
            />
          )}

          {/* Voice IVR auto-response phrases */}
          <div className="border border-border-light rounded-lg p-4 space-y-3 bg-gray-50/50">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.voiceIvrEnabled}
                onChange={(e) => setField('voiceIvrEnabled', e.target.checked)}
                className="rounded border-border-light text-accent focus:ring-accent"
              />
              <span className="text-sm font-medium text-gray-900">Enable voice IVR auto-responses</span>
            </label>
            <p className="text-xs text-muted">
              When the IVR says a phrase containing the trigger text, the agent automatically speaks the matching response — no waiting on the LLM to improvise.
            </p>

            {form.voiceIvrEnabled && (
              <div className="space-y-2">
                {form.voiceIvrPhrases.map((phrase, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <input
                      type="text"
                      value={phrase.promptContains}
                      onChange={(e) => updateVoicePhrase(i, 'promptContains', e.target.value)}
                      className={inputClass}
                      placeholder='IVR says... e.g. "provider or member"'
                    />
                    <input
                      type="text"
                      value={phrase.responseText}
                      onChange={(e) => updateVoicePhrase(i, 'responseText', e.target.value)}
                      className={inputClass}
                      placeholder='Agent responds... e.g. "provider"'
                    />
                    <button
                      type="button"
                      onClick={() => removeVoicePhrase(i)}
                      className="p-2 text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors shrink-0"
                      title="Remove"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addVoicePhrase}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent-hover"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add phrase
                </button>
              </div>
            )}
          </div>

          {/* DTMF keypad IVR sequence builder */}
          <div className="border border-border-light rounded-lg p-4 space-y-3 bg-gray-50/50">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.ivrEnabled}
                onChange={(e) => setField('ivrEnabled', e.target.checked)}
                className="rounded border-border-light text-accent focus:ring-accent"
              />
              <Grid3x3 className="w-4 h-4 text-muted" />
              <span className="text-sm font-medium text-gray-900">Enable DTMF (keypad) IVR navigation</span>
            </label>
            <p className="text-xs text-muted">
              Twilio sends these keypresses automatically before the call connects — use this when the payer's IVR is menu/keypad-based rather than speech-based.
            </p>

            {form.ivrEnabled && (
              <div className="space-y-2">
                {form.ivrSteps.map((step, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={step.waitSeconds}
                      onChange={(e) => updateIvrStep(i, 'waitSeconds', Number(e.target.value))}
                      className={`${inputClass} w-28 shrink-0`}
                    >
                      {WAIT_SECONDS_OPTIONS.map((s) => (
                        <option key={s} value={s}>Wait {s}s</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={step.digit}
                      onChange={(e) => updateIvrStep(i, 'digit', e.target.value.slice(0, 1))}
                      className={`${inputClass} w-16 shrink-0 text-center`}
                      placeholder="1"
                      maxLength={1}
                    />
                    <input
                      type="text"
                      value={step.label}
                      onChange={(e) => updateIvrStep(i, 'label', e.target.value)}
                      className={inputClass}
                      placeholder="Label (optional) — e.g. Claims department"
                    />
                    <button
                      type="button"
                      onClick={() => removeIvrStep(i)}
                      className="p-2 text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors shrink-0"
                      title="Remove"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addIvrStep}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent-hover"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add step
                </button>

                {form.ivrSteps.some((s) => s.digit) && (
                  <div className="pt-2 border-t border-border-light">
                    <span className="text-xs uppercase tracking-wider text-muted font-medium">Generated sequence: </span>
                    <span className="font-data text-sm text-gray-900">
                      {stepsToSequence(form.ivrSteps.filter((s) => s.digit))}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className={labelClass}>Verification Requirements</label>
            <textarea
              value={form.verificationRequirements}
              onChange={(e) => setField('verificationRequirements', e.target.value)}
              className={inputClass}
              rows={2}
              placeholder="NPI, Tax ID, Member ID, DOB required..."
            />
          </div>

          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
              className={inputClass}
              rows={2}
              placeholder="Additional notes..."
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={closeModal}
              className="px-4 py-2.5 text-sm text-muted hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : editing ? 'Update Payer' : 'Add Payer'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

const VERIFICATION_DOT_COLOR = {
  fresh: 'bg-emerald-500',
  warn: 'bg-amber-500',
  stale: 'bg-danger',
  unknown: 'bg-gray-300',
};

function VerificationDot({ ivrVerifiedAt }) {
  const status = verificationStatus(ivrVerifiedAt);
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${VERIFICATION_DOT_COLOR[status.level]}`}
      title={status.label}
    />
  );
}

const VERIFICATION_STYLES = {
  fresh: { icon: ShieldCheck, classes: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  warn: { icon: ShieldAlert, classes: 'bg-amber-50 border-amber-200 text-amber-700' },
  stale: { icon: ShieldAlert, classes: 'bg-danger/10 border-danger/30 text-danger' },
  unknown: { icon: ShieldQuestion, classes: 'bg-gray-50 border-border-light text-muted' },
};

function VerificationBanner({ ivrVerifiedAt, editing, marking, onMarkVerified }) {
  const status = verificationStatus(ivrVerifiedAt);
  const { icon: Icon, classes } = VERIFICATION_STYLES[status.level];

  return (
    <div className={`flex items-center justify-between gap-3 border rounded-lg px-4 py-3 ${classes}`}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="w-4 h-4 shrink-0" />
        <span>{status.label}</span>
        {status.level !== 'fresh' && (
          <span className="text-xs font-normal opacity-80">— confirm this playbook still matches the real payer IVR</span>
        )}
      </div>
      <button
        type="button"
        onClick={onMarkVerified}
        disabled={!editing || marking}
        title={editing ? undefined : 'Save this contact first, then mark it verified after a real test call'}
        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-current/30 hover:bg-white/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
      >
        {marking ? 'Marking...' : 'Mark Verified Now'}
      </button>
    </div>
  );
}
