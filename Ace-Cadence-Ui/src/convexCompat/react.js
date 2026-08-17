import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Compatibility shim for legacy Convex-shaped screens during REST migration.

async function request(path, { method = 'GET', body, params } = {}) {
  const url = new URL(`/api${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    });
  }
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const payload = await response.json();
      detail = payload.detail || detail;
    } catch {
      // ignore non-JSON errors
    }
    throw new Error(detail);
  }
  if (response.status === 204) return null;
  return response.json();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function claimToLegacy(row) {
  if (!row) return row;
  return {
    ...row,
    _id: String(row.id),
    claimNumber: row.claim_number,
    patientId: row.patient_id == null ? undefined : String(row.patient_id),
    insuranceContactId: row.insurance_contact_id == null ? undefined : String(row.insurance_contact_id),
    providerId: row.provider_id == null ? undefined : String(row.provider_id),
    dateOfService: row.date_of_service,
    dateSubmitted: row.date_submitted,
    cptCodes: toArray(row.cpt_codes),
    diagnosisCodes: toArray(row.diagnosis_codes),
    agingBucket: row.aging_bucket,
    denialCode: row.denial_code,
    denialReason: row.denial_reason,
    appealDeadline: row.appeal_deadline,
    referenceNumber: row.reference_number,
    lastCalledAt: row.last_called_at,
    nextFollowUpDate: row.next_follow_up_date,
    followUpDisposition: row.follow_up_disposition,
    followUpComment: row.follow_up_comment,
  };
}

function patientToLegacy(row) {
  if (!row) return row;
  return {
    ...row,
    _id: String(row.id),
    firstName: row.first_name,
    lastName: row.last_name,
    dateOfBirth: row.date_of_birth,
    memberId: row.member_id,
    groupNumber: row.group_number,
    policyNumber: row.policy_number,
    subscriberName: row.subscriber_name,
  };
}

function insuranceToLegacy(row) {
  if (!row) return row;
  return {
    ...row,
    _id: String(row.id),
    payerId: row.payer_id,
    avgHoldTime: row.avg_hold_time,
    verificationRequirements: row.verification_requirements,
    humanAgentNumber: row.human_agent_number,
    callConnectionType: row.call_connection_type,
    warmTransferNumber: row.warm_transfer_number,
  };
}

function providerToLegacy(row) {
  if (!row) return row;
  return {
    ...row,
    _id: String(row.id),
    practiceName: row.practice_name,
    taxId: row.tax_id,
  };
}

function timestampToLegacy(value) {
  if (!value || typeof value !== 'string' || !value.includes('T')) return value;
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : value + 'Z';
}

function callToLegacy(row) {
  if (!row) return row;
  return {
    ...row,
    _id: String(row.id),
    claimId: row.claim_id == null ? undefined : String(row.claim_id),
    insuranceContactId: row.insurance_contact_id == null ? undefined : String(row.insurance_contact_id),
    elevenLabsConversationId: row.eleven_labs_conversation_id,
    twilioCallSid: row.twilio_call_sid,
    startedAt: timestampToLegacy(row.started_at),
    completedAt: timestampToLegacy(row.completed_at),
    errorMessage: row.error_message,
    callPhase: row.call_phase,
    holdStartedAt: timestampToLegacy(row.hold_started_at),
    holdDuration: row.hold_duration,
    humanDetectedAt: timestampToLegacy(row.human_detected_at),
    outcomeReason: row.outcome_reason,
    requiredFieldsRetrieved: toArray(row.required_fields_retrieved),
    missingFields: toArray(row.missing_fields),
    transferredAt: timestampToLegacy(row.transferred_at),
    transferType: row.transfer_type,
    transferDestination: row.transfer_destination,
    handoffState: row.handoff_state,
    assignedAgentName: row.assigned_agent_name,
    assignedAgentEmail: row.assigned_agent_email,
    humanTranscript: row.human_transcript,
    linkedClaimIds: toArray(row.linked_claim_ids).map(String),
  };
}

function handoffCallToLegacy(row) {
  const call = callToLegacy(row);
  if (!call) return call;
  return {
    ...call,
    assignedAgentUserId: row.assigned_agent_user_id == null ? undefined : String(row.assigned_agent_user_id),
    handoffRequestedAt: row.handoff_requested_at,
    handoffReason: row.handoff_reason,
    handoffAcceptedByUserId: row.handoff_accepted_by_user_id == null ? undefined : String(row.handoff_accepted_by_user_id),
    handoffAcceptedByEmail: row.handoff_accepted_by_email,
    handoffAcceptedAt: row.handoff_accepted_at,
    conferenceName: row.conference_name,
    humanParticipantCallSid: row.human_participant_call_sid,
    handoffToken: row.handoff_token,
    aiRecordingPath: row.ai_recording_path,
    humanRecordingPath: row.human_recording_path,
    wrapUpCompletedAt: row.wrap_up_completed_at,
    insuranceCompany: row.insurance_company,
    claimNumber: row.claim_number,
    patientName: row.patient_first_name || row.patient_last_name ? `${row.patient_first_name || ''} ${row.patient_last_name || ''}`.trim() : null,
    patientDob: row.patient_dob,
    memberId: row.member_id,
    providerName: row.provider_name,
    providerNpi: row.provider_npi,
    claimAmount: row.claim_amount,
    dateOfService: row.claim_date_of_service,
    cptCodes: toArray(row.cpt_codes),
    diagnosisCodes: toArray(row.diagnosis_codes),
    claimStatus: row.claim_status,
    claimPriority: row.claim_priority,
    humanAgentNumber: row.human_agent_number,
  };
}

function eventToLegacy(row) {
  if (!row) return row;
  return { ...row, _id: String(row.id), callId: row.call_id == null ? undefined : String(row.call_id) };
}

function resultToLegacy(row) {
  if (!row) return row;
  return {
    ...row,
    _id: String(row.id),
    callId: row.call_id == null ? undefined : String(row.call_id),
    claimId: row.claim_id == null ? undefined : String(row.claim_id),
    claimStatus: row.claim_status,
    paidAmount: row.paid_amount,
    denialCode: row.denial_code,
    denialReason: row.denial_reason,
    appealDeadline: row.appeal_deadline,
    missingDocuments: row.missing_documents,
    expectedDecisionDate: row.expected_decision_date,
    referenceNumber: row.reference_number,
    nextSteps: row.next_steps,
    rawExtraction: row.raw_extraction,
  };
}

function userToLegacy(row) {
  if (!row) return row;
  return {
    ...row,
    _id: String(row.id),
    lastLoginAt: row.last_login_at,
    insuranceContactIds: toArray(row.insurance_contact_ids).map(String),
    providerIds: toArray(row.provider_ids).map(String),
    specializations: toArray(row.specializations),
    teamLeadName: row.team_lead_name,
    userGroupId: row.user_group_id == null ? null : String(row.user_group_id),
  };
}

function groupToLegacy(row) {
  if (!row) return row;
  return {
    ...row,
    _id: String(row.id),
    insuranceContactIds: toArray(row.insurance_contact_ids).map(String),
    providerIds: toArray(row.provider_ids).map(String),
    specializations: toArray(row.specializations),
  };
}

function userPayload(body) {
  return {
    email: body.email,
    name: body.name,
    role: body.role,
    status: body.status,
    insurance_contact_ids: toArray(body.insuranceContactIds).map(Number),
    provider_ids: toArray(body.providerIds).map(Number),
    specializations: toArray(body.specializations),
    team_lead_name: body.teamLeadName,
    user_group_id: body.userGroupId ? Number(body.userGroupId) : null,
  };
}

async function handoffDetail(callId) {
  const detail = await request(`/handoff/${Number(callId)}`);
  return {
    call: handoffCallToLegacy(detail.call),
    events: toArray(detail.events).map(eventToLegacy),
  };
}

async function routingAgents() {
  const rows = await request('/handoff/routing/agents');
  return toArray(rows).map((row) => ({
    user: userToLegacy(row.user),
    availability: row.availability,
    activeCall: handoffCallToLegacy(row.activeCall),
  }));
}

async function getClaimWithDetails(id) {
  const detail = await request(`/ui-data/claims/${Number(id)}/full`);
  const results = await request('/call-results', { params: { claim_id: Number(id) } });
  const claim = claimToLegacy({
    ...detail.claim,
    last_called_at: detail.followup?.last_called_at,
    next_follow_up_date: detail.followup?.next_follow_up_date,
    follow_up_disposition: detail.followup?.follow_up_disposition,
    follow_up_comment: detail.followup?.follow_up_comment,
    follow_up_by: detail.followup?.follow_up_by,
    follow_up_at: detail.followup?.follow_up_at,
  });
  return {
    claim,
    patient: patientToLegacy(detail.patient),
    insurance: insuranceToLegacy(detail.insurance_contact),
    provider: providerToLegacy(detail.provider),
    calls: toArray(detail.calls).map(callToLegacy),
    latestResult: resultToLegacy(toArray(results)[0]),
  };
}
async function operatorStats(args = {}) {
  const status = args.userId ? await request('/handoff/routing/status', { params: { user_id: Number(args.userId) } }) : null;
  const calls = (await request('/calls', { params: { assigned_agent_user_id: Number(args.userId) } })).map(callToLegacy);
  const completed = calls.filter((call) => call.handoffState === 'handoff_ended' || call.status === 'completed');
  return {
    availability: status?.availability || 'available',
    isCurrentlyOnCall: ['assigned', 'in_call'].includes(status?.availability),
    activeCall: handoffCallToLegacy(status?.activeCall),
    completedToday: completed.filter((call) => String(call.completedAt || call.startedAt || '').slice(0, 10) === new Date().toISOString().slice(0, 10)).length,
    recentCalls: completed.slice(0, 5),
  };
}

async function listLatestResultsByClaim() {
  const rows = await request('/call-results');
  const byClaim = {};
  rows.map(resultToLegacy).forEach((result) => {
    if (!result.claimId) return;
    if (!byClaim[result.claimId]) byClaim[result.claimId] = result;
  });
  return byClaim;
}

async function dashboardStats(args = {}) {
  const [claims, calls, results] = await Promise.all([
    request('/claims'),
    request('/calls'),
    request('/call-results'),
  ]);
  const fromDate = args.fromDate || null;
  const toDate = args.toDate || null;
  const selectedProviderId = args.providerId ? String(args.providerId) : null;
  const filteredClaims = claims
    .map(claimToLegacy)
    .filter((claim) => !selectedProviderId || claim.providerId === selectedProviderId)
    .filter((claim) => {
      if (!fromDate && !toDate) return true;
      const date = claim.dateSubmitted || claim.dateOfService;
      if (!date) return false;
      const day = String(date).slice(0, 10);
      if (fromDate && day < fromDate) return false;
      if (toDate && day > toDate) return false;
      return true;
    });
  const claimIds = new Set(filteredClaims.map((claim) => claim._id));
  const filteredCalls = calls.map(callToLegacy).filter((call) => !selectedProviderId || claimIds.has(call.claimId));
  const today = new Date().toISOString().slice(0, 10);
  const completedCalls = filteredCalls.filter((call) => call.status === 'completed').length;
  const outcomeStats = { successful: 0, partial: 0, failed: 0, transferred: 0 };
  filteredCalls.forEach((call) => {
    if (call.handoffState === 'connected' || call.handoffState === 'handoff_ended') outcomeStats.transferred += 1;
    else if (call.outcome && outcomeStats[call.outcome] !== undefined) outcomeStats[call.outcome] += 1;
    else if (call.status === 'failed') outcomeStats.failed += 1;
  });
  const resultRows = results.map(resultToLegacy);
  const recoveredAmount = resultRows.reduce((sum, result) => sum + Number(result.paidAmount || 0), 0);
  return {
    totalClaims: filteredClaims.length,
    inProgressClaims: filteredClaims.filter((claim) => claim.status === 'in_progress').length,
    pendingClaims: filteredClaims.filter((claim) => claim.status === 'pending').length,
    callsToday: filteredCalls.filter((call) => String(call.startedAt || '').slice(0, 10) === today).length,
    totalCalls: filteredCalls.length,
    completedCalls,
    successRate: filteredCalls.length ? Math.round((completedCalls / filteredCalls.length) * 100) : 0,
    totalBilled: filteredClaims.reduce((sum, claim) => sum + Number(claim.amount || 0), 0),
    recoveredAmount,
    byAgingBucket: filteredClaims.reduce((acc, claim) => {
      const key = claim.agingBucket || '0-30';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
    outcomeStats,
    outcomeWindowIsDateFilter: Boolean(fromDate || toDate),
  };
}

function reportParams(args = {}) {
  return {
    use_case: args.useCase,
  };
}

function reportSuccessRate(row) {
  return {
    total: row.total || row.total_completed || 0,
    successful: row.successful || 0,
    partial: row.partial || 0,
    failed: row.failed || 0,
    transferred: row.transferred || 0,
    successRatePct: row.success_rate_pct || 0,
  };
}

function reportDataAccuracy(row) {
  return {
    overall: row.overall
      ? { captureRate: row.overall.capture_rate || 0, avgConfidence: row.overall.avg_confidence ?? null }
      : { captureRate: 0, avgConfidence: null },
    byField: toArray(row.by_field).map((field) => ({
      field: field.field,
      totalCalls: field.total_calls || 0,
      capturedCount: field.captured_count || 0,
      captureRate: field.capture_rate || 0,
      avgConfidence: field.avg_confidence ?? null,
    })),
  };
}

function reportTurnaroundTime(row, useCase) {
  return row.sample_size
    ? [{ useCase: useCase || 'all', count: row.sample_size, p50: row.avg_call_duration_seconds || 0, p95: row.avg_call_duration_seconds || 0, p99: row.avg_call_duration_seconds || 0 }]
    : [];
}

function reportHoldMetrics(row) {
  return {
    totalCalls: row.sample_size || 0,
    callsWithHold: row.sample_size || 0,
    avgHoldSeconds: row.avg_hold_seconds || 0,
    p95HoldSeconds: row.avg_hold_seconds || 0,
    maxHoldSeconds: row.max_hold_seconds || 0,
    longHoldCount: 0,
    over30MinCount: 0,
    byPayer: [],
  };
}

function reportOperationalKpis(row) {
  const total = row.total_calls || 0;
  const transferred = row.transferred_to_human || 0;
  const failed = row.failed_calls || 0;
  const completed = row.completed_calls ?? Math.max(0, total - failed);
  return {
    totalCalls: total,
    completedCalls: completed,
    ivrAttempted: total,
    ivrTraversed: completed,
    ivrTraversalRate: total ? Math.round((completed / total) * 100) : 0,
    transferredCalls: transferred,
    transferRate: total ? Math.round((transferred / total) * 100) : 0,
    automationRate: completed ? Math.round(((completed - transferred) / completed) * 100) : 0,
    callsPerHour: 0,
    estimatedMinutesSaved: row.estimated_minutes_saved || 0,
    estimatedCostSavings: row.estimated_cost_savings || 0,
  };
}

function reportExceptions(row) {
  return toArray(row.calls).map((call) => ({
    exception: call.error_message || call.outcome || call.status,
    payer: call.insurance_contact_id,
    payerName: call.insurance_contact_id ? `Payer ${call.insurance_contact_id}` : '--',
    count: 1,
    lastSeenAt: call.completed_at || call.started_at,
  }));
}

function reportVolumeByTier(row) {
  return Object.entries(row.by_priority || {}).map(([tier, count]) => ({
    payer: tier,
    payerName: tier,
    tier,
    count,
  }));
}

function reportSuccessRateByPayer(rows) {
  return toArray(rows).map((row) => ({
    payer: String(row.payer),
    payerName: row.payer_name || 'Unknown',
    successful: row.successful || 0,
    partial: row.partial || 0,
    failed: row.failed || 0,
    total: row.total || 0,
    pct: row.pct || 0,
  }));
}

function reportSuccessRateByWeek(rows) {
  return toArray(rows).map((row) => ({
    weekStart: row.week_start,
    successful: row.successful || 0,
    partial: row.partial || 0,
    failed: row.failed || 0,
    total: row.total || 0,
  }));
}
async function executeQuery(name, args) {
  if (name === 'claims.list') return (await request('/claims')).map(claimToLegacy);
  if (name === 'claims.getById') return claimToLegacy(await request(`/claims/${Number(args.id)}`));
  if (name === 'claims.getWithDetails') return getClaimWithDetails(args.id);
  if (name === 'patients.list') return (await request('/master-data/patients')).map(patientToLegacy);
  if (name === 'insuranceContacts.list') return (await request('/master-data/insurance-contacts')).map(insuranceToLegacy);
  if (name === 'insuranceContacts.getById') return insuranceToLegacy(await request(`/master-data/insurance-contacts/${Number(args.id)}`));
  if (name === 'providers.list') return (await request('/master-data/providers')).map(providerToLegacy);
  if (name === 'calls.listRecent') return (await request('/calls')).map(callToLegacy).slice(0, args?.limit || 50);
  if (name === 'calls.getRecordingUrls') return null;
  if (name === 'callResults.listLatestByUser') return listLatestResultsByClaim();
  if (name === 'handoff.listAwaitingHandoff') return (await request('/handoff/awaiting')).map(handoffCallToLegacy);
  if (name === 'handoff.listLive') return (await request('/handoff/live')).map(handoffCallToLegacy);
  if (name === 'handoff.getHandoff') return handoffDetail(args.callId);
  if (name === 'handoff.getMyRoutingStatus') { const row = await request('/handoff/routing/status', { params: { user_id: Number(args.userId) } }); return row ? { user: userToLegacy(row.user), availability: row.availability, activeCall: handoffCallToLegacy(row.activeCall) } : null; }
  if (name === 'handoff.listRoutingAgents') return routingAgents();
  if (name === 'operatorStats.getStats') return operatorStats(args || {});
  if (name === 'callResults.getByCall') {
    const rows = await request('/call-results', { params: { call_id: Number(args.callId) } });
    return resultToLegacy(rows[0]);
  }
  if (name === 'dashboard.getStats') return dashboardStats(args || {});
  if (name === 'users.list') return (await request('/users')).map(userToLegacy);
  if (name === 'userGroups.list') return (await request('/user-groups')).map(groupToLegacy);
  if (name === 'reports.successRate') return reportSuccessRate(await request('/reports/success-rate', { params: reportParams(args) }));
  if (name === 'reports.successRateByPayer') return reportSuccessRateByPayer(await request('/reports/success-rate-by-payer', { params: reportParams(args) }));
  if (name === 'reports.successRateByWeek') return reportSuccessRateByWeek(await request('/reports/success-rate-by-week', { params: reportParams(args) }));
  if (name === 'reports.dataAccuracy') return reportDataAccuracy(await request('/reports/data-accuracy', { params: reportParams(args) }));
  if (name === 'reports.turnaroundTime') return reportTurnaroundTime(await request('/reports/turnaround-time', { params: reportParams(args) }), args?.useCase);
  if (name === 'reports.holdMetrics') return reportHoldMetrics(await request('/reports/hold-metrics', { params: reportParams(args) }));
  if (name === 'reports.operationalKpis') return reportOperationalKpis(await request('/reports/operational-kpis', { params: reportParams(args) }));
  if (name === 'reports.exceptionReport') return reportExceptions(await request('/reports/exceptions', { params: reportParams(args) }));
  if (name === 'reports.volumeByTier') return reportVolumeByTier(await request('/reports/volume-by-tier', { params: reportParams(args) }));
  return undefined;
}

async function executeMutation(name, args) {
  if (name === 'claims.updateStatus') return claimToLegacy(await request(`/claims/${Number(args.id)}/status`, { method: 'PATCH', body: { status: args.status } }));
  if (name === 'claims.bulkRemove') {
    await Promise.all(toArray(args.ids).map((id) => request(`/claims/${Number(id)}`, { method: 'DELETE' })));
    return { success: true };
  }
  if (name === 'users.create') return userToLegacy(await request('/users', { method: 'POST', body: userPayload(args) }));
  if (name === 'users.updateRole') return userToLegacy(await request(`/users/${Number(args.id)}`, { method: 'PATCH', body: { role: args.role } }));
  if (name === 'users.setStatus') return userToLegacy(await request(`/users/${Number(args.id)}`, { method: 'PATCH', body: { status: args.status } }));
  if (name === 'users.updateRoutingProfile') return userToLegacy(await request(`/users/${Number(args.id)}`, { method: 'PATCH', body: userPayload(args) }));
  if (name === 'userGroups.remove') return request(`/user-groups/${Number(args.id)}`, { method: 'DELETE' });
  if (name === 'handoff.acceptHandoff') return request(`/handoff/${Number(args.callId)}/accept`, { method: 'POST', body: { agent_user_id: args.agentUserId ? Number(args.agentUserId) : undefined } });
  if (name === 'handoff.declineHandoff') return request(`/handoff/${Number(args.callId)}/decline`, { method: 'POST', body: {} });
  if (name === 'handoff.markConnectedFromClient') return request(`/handoff/${Number(args.callId)}/connected`, { method: 'POST' });
  if (name === 'handoff.endHandoffFromClient') return request(`/handoff/${Number(args.callId)}/ended`, { method: 'POST' });
  if (name === 'handoff.completeWrapUp') return request(`/handoff/${Number(args.callId)}/complete-wrap-up`, { method: 'POST' });
  if (name === 'claimImport.bulkImportClaims') throw new Error('Claims bulk import is not wired to the new backend yet.');
  return undefined;
}

async function executeAction(name, args = {}) {
  if (name === 'callActions.initiateCall') return request('/calls/initiate', { method: 'POST', body: { claim_id: Number(args.claimId) } });
  if (name === 'handoff.redirectPayerToConference') return request(`/handoff/${Number(args.callId)}/redirect-payer`, { method: 'POST' });
  if (name === 'callActions.endCall') return request(`/handoff/${Number(args.callId)}/ended`, { method: 'POST' });
  if (name.startsWith('claimImport.')) throw new Error('AI claim import is not wired to the new backend yet.');
  return undefined;
}

function functionName(fn) {
  return fn?.__cadenceCompatName;
}

export function useQuery(fn, args) {
  const name = functionName(fn);
  const key = useMemo(() => JSON.stringify(args ?? null), [args]);
  const [data, setData] = useState(undefined);
  const [refreshTick, setRefreshTick] = useState(0);
  const alive = useRef(true);
  const previousRequestRef = useRef(null);
  const shouldPoll =
    name?.startsWith('handoff.') ||
    name?.startsWith('operatorStats.') ||
    name === 'claims.getWithDetails';

  useEffect(() => {
    if (!shouldPoll || args === 'skip') return undefined;
    const timer = setInterval(() => setRefreshTick((value) => value + 1), 3000);
    return () => clearInterval(timer);
  }, [shouldPoll, key]);

  useEffect(() => {
    alive.current = true;
    if (!name || args === 'skip') {
      setData(undefined);
      return undefined;
    }
    const requestKey = `${name}:${key}`;
    if (previousRequestRef.current !== requestKey) {
      previousRequestRef.current = requestKey;
      setData(undefined);
    }
    executeQuery(name, args || {})
      .then((result) => {
        if (alive.current) setData(result);
      })
      .catch((error) => {
        console.error(error);
        if (alive.current) setData(null);
      });
    return () => {
      alive.current = false;
    };
  }, [name, key, refreshTick]);

  return data;
}

export function useMutation(fn) {
  const name = functionName(fn);
  return useCallback((args) => executeMutation(name, args || {}), [name]);
}

export function useAction(fn) {
  const name = functionName(fn);
  return useCallback((args) => executeAction(name, args || {}), [name]);
}
