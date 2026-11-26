import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Phone, Pencil, MessageSquare, History } from 'lucide-react';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { useSoftphone } from '../../hooks/useSoftphone';
import { useAuth } from '../../context/AuthContext';
import { apiPost } from '../../api/client';
import { getPatient } from '../../api/masterData';
import { callToLegacy } from '../../convexCompat/react';
import LiveCallMonitor from '../../components/LiveCallMonitor';
import CaseBackHeader from '../../components/case/CaseBackHeader';
import DetailCard from '../../components/case/DetailCard';
import StatusBadge from '../../components/StatusBadge';
import Modal from '../../components/Modal';
import PatientEditor from '../../components/PatientEditor';
import AppointmentForm from './AppointmentForm';
import AppointmentSummary from './AppointmentSummary';
import useAppointmentPresence from './useAppointmentPresence';
import { callTime } from './format';
import { getAppointment, getCalls, callPatient, requestTakeover, completeCallback, setPresence } from './api';

const actionClass = 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-accent';

function CallHistory({ calls, retryTranscript, busy, timezone }) {
  return <DetailCard icon={History} title="Call History, Transcripts & Recordings">
    <p className="text-sm text-muted">{calls.length ? `${calls.length} call attempt${calls.length === 1 ? '' : 's'}. Open an attempt to view its transcript and recordings.` : 'No calls yet. Call the patient with an appointment reminder.'}</p>
    <div className="divide-y divide-border">{calls.map(call => <details key={call.id} className="py-3">
      <summary className="cursor-pointer flex gap-3 items-center flex-wrap text-sm">
        <span>Call #{call.id} · {callTime(call.started_at, timezone)}</span>
        <StatusBadge status={call.status} />
        {call.outcome && <span>{call.outcome.replaceAll('_', ' ')}</span>}
        {call.assigned_agent_name && <span className="text-muted">Assigned to {call.assigned_agent_name}</span>}
      </summary>
      <div className="pt-4 space-y-4">
        {!!call.booking_changes?.length && <div><h3 className="font-medium text-sm mb-2">Appointment changes</h3><ul className="list-disc pl-5 text-sm space-y-1">{call.booking_changes.map((change, i) => <li key={i}>{change.message}</li>)}</ul></div>}
        {call.error_message && <p className="text-danger text-sm">{call.error_message}</p>}
        {call.eleven_labs_conversation_id && <div><p className="text-sm font-medium mb-2">Voice agent recording</p><audio controls preload="none" className="w-full" src={`/elevenlabs-recording-media?callId=${call.id}`} /></div>}
        {(call.human_recording_path || call.recording_path) && <div><p className="text-sm font-medium mb-2">Operator recording</p><audio controls preload="none" className="w-full" src={`/twilio-recording-media?callId=${call.id}`} /></div>}
        <div><h3 className="font-medium text-sm mb-2">Voice agent transcript</h3><p className="text-sm whitespace-pre-wrap max-h-72 overflow-auto">{call.transcript || 'No transcript is available yet.'}</p></div>
        {call.handoff_state && <div><h3 className="font-medium text-sm mb-2">Operator transcript</h3><p className="text-sm whitespace-pre-wrap max-h-72 overflow-auto">{call.human_transcript || 'Transcription is not available yet. Use the operator recording when it finishes processing.'}</p></div>}
        {call.transcription_error && <p role="alert" className="text-danger text-sm">{call.transcription_error}</p>}
        {call.human_recording_path && !call.human_transcript && <button className={actionClass} disabled={busy} onClick={() => retryTranscript(call.id)}>Generate operator transcript</button>}
      </div>
    </details>)}</div>
  </DetailCard>;
}

export default function AppointmentDetails() {
  const { id } = useParams();
  const auth = useAuth();
  const record = useLiveQuery(() => getAppointment(id), [id], 'appointment');
  const history = useLiveQuery(() => getCalls(id), [id], 'call');
  const { refetch: refreshRecord } = record;
  const { refetch: refreshHistory } = history;
  const [editing, setEditing] = useState(false);
  const [editingPatient, setEditingPatient] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const softphone = useSoftphone();
  const { activeCallId, disconnect } = softphone;
  useAppointmentPresence(softphone.status);
  const calls = history.data || [];
  const active = calls.find(c => !c.completed_at && ['initiating', 'in_progress'].includes(c.status));
  const mine = active && String(active.assigned_agent_user_id) === String(auth.userId);
  const wrapUp = calls.find(c => c.handoff_state === 'handoff_ended' && !c.wrap_up_completed_at && String(c.assigned_agent_user_id) === String(auth.userId));

  useEffect(() => {
    const timer = setInterval(() => { refreshHistory(); refreshRecord(); }, 3000);
    return () => clearInterval(timer);
  }, [refreshHistory, refreshRecord]);

  useEffect(() => {
    if (!active && activeCallId) disconnect();
  }, [active, activeCallId, disconnect]);

  async function act(fn) {
    if (busy) return;
    setBusy(true); setNotice('');
    try { await fn(); await history.refetch(); await record.refetch(); }
    catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }

  async function takeover() {
    if (softphone.status !== 'ready') {
      const device = await softphone.ensureDevice();
      if (!device) throw new Error('Browser phone is unavailable. Check microphone access and retry.');
    }
    await setPresence(true);
    await requestTakeover(active.id);
    const accepted = await apiPost(`/handoff/${active.id}/accept`, { agent_user_id: Number(auth.userId) });
    if (!accepted.ok) throw new Error('Another operator already accepted this call.');
    const joined = await softphone.connect(String(active.id));
    if (!joined.ok) {
      await apiPost(`/appointments/calls/${active.id}/release`);
      throw new Error(`Could not connect: ${joined.error}`);
    }
    const redirected = await apiPost(`/handoff/${active.id}/redirect-payer`);
    if (!redirected.ok) {
      softphone.disconnect();
      await apiPost(`/appointments/calls/${active.id}/release`);
      throw new Error('Could not transfer the patient. The AI call has been preserved.');
    }
    await apiPost(`/handoff/${active.id}/connected`);
  }

  if (record.loading) return <p role="status">Loading appointment…</p>;
  if (record.error) return <p role="alert" className="text-danger">{record.error.message} <button className="underline" onClick={record.refetch}>Retry</button></p>;
  const appointment = record.data;
  return <div className="space-y-4">
    <CaseBackHeader backTo="/appointments" backLabel="Back to Appointments" title={appointment.patient_name} subtitle={`${appointment.appointment_type} · ${appointment.provider_name}`} status={appointment.status}
      rightSlot={<div className="flex gap-2 flex-wrap">
        <button className={actionClass} disabled={busy || !!active || editing || !!editingPatient || history.loading || !!history.error}
          onClick={() => act(async () => setEditingPatient(await getPatient(appointment.patient_id)))}><Pencil size={16} />Edit patient</button>
          <button className={actionClass} disabled={busy || !!active || editing || !!editingPatient || history.loading || !!history.error} onClick={() => setEditing(true)}><Pencil size={16} />Edit appointment</button>
          <button className={`${actionClass} bg-accent text-white`} disabled={busy || editing || !!editingPatient || !!active || !!wrapUp || appointment.status === 'cancelled' || history.loading || !!history.error} onClick={() => act(() => callPatient(id))}><Phone size={16} />{busy ? 'Working…' : 'Call patient'}</button>
      </div>} />
    <div className="flex items-center gap-2 text-sm text-muted"><span>Latest call</span><StatusBadge status={calls[0]?.status || 'not_called'} /></div>
    {(notice || softphone.error) && <p role="alert" className="text-danger text-sm">{notice || softphone.error}</p>}
    {editing && <AppointmentForm record={appointment} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); record.refetch(); }} />}
    <Modal open={!!editingPatient} onClose={() => setEditingPatient(null)} title="Edit Patient" wide>
      {editingPatient && <PatientEditor key={editingPatient.id} patient={editingPatient} phoneEnabled
        onCancel={() => setEditingPatient(null)} onSaved={async () => { await record.refetch(); setEditingPatient(null); }} />}
    </Modal>
    <AppointmentSummary appointment={appointment} />
    <DetailCard icon={MessageSquare} title="Patient instructions"><p className="text-sm whitespace-pre-wrap">{appointment.instructions || 'No additional instructions.'}</p></DetailCard>
    {appointment.callback_requested_at && <div className="rounded-xl border border-border p-4 bg-white space-y-2"><h2 className="font-semibold">Callback requested</h2><p className="text-sm">{appointment.callback_reason}</p><button disabled={busy} onClick={() => act(() => completeCallback(id))} className={actionClass}>Mark callback complete</button></div>}
    {active && <section className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3"><h2 className="font-semibold">Patient call</h2>
        {softphone.status === 'on_call' ? <button className={actionClass} onClick={softphone.toggleMute}>{softphone.muted ? 'Unmute microphone' : 'Mute microphone'}</button> : <button className={`${actionClass} bg-success text-white`} disabled={busy || (active.assigned_agent_user_id && !mine) || active.handoff_state === 'connected'} onClick={() => act(takeover)}>{active.assigned_agent_user_id && !mine ? `Assigned to ${active.assigned_agent_name || 'operator'}` : 'Take over call'}</button>}
      </div>
      {softphone.status === 'on_call' ? <div className="bg-white border border-border rounded-xl p-4 flex justify-between items-center gap-3"><p>You are speaking with the patient. The voice agent is disconnected.</p><button className={`${actionClass} bg-danger text-white`} disabled={busy} onClick={() => act(async () => { await apiPost(`/handoff/${active.id}/ended`); softphone.disconnect(); })}>End call</button></div> : <LiveCallMonitor key={active.id} call={{ ...callToLegacy(active), elevenLabsConversationId: null }} insurance={{ name: appointment.patient_name }} onComplete={history.refetch} />}
    </section>}
    {wrapUp && <button className={`${actionClass} bg-accent text-white`} disabled={busy} onClick={() => act(() => apiPost(`/handoff/${wrapUp.id}/complete-wrap-up`))}>Complete call wrap-up</button>}
    {history.error && <p role="alert" className="text-danger">Could not load call history. <button className="underline" onClick={history.refetch}>Retry</button></p>}
    <CallHistory calls={calls} busy={busy} timezone={appointment.timezone} retryTranscript={callId => act(() => apiPost(`/appointments/calls/${callId}/transcribe`))} />
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <DetailCard icon={MessageSquare} title="Notes"><p className="text-sm whitespace-pre-wrap">{appointment.notes || 'No internal notes.'}</p></DetailCard>
    </div>
  </div>;
}
