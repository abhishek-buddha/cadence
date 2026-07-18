import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  // Healthcare provider/practice info (needed for insurance verification)
  providers: defineTable({
    practiceName: v.string(),
    npi: v.string(),
    taxId: v.string(),
    address: v.string(),
    phone: v.string(),
    specialty: v.optional(v.string()),
    userId: v.string(),
    createdAt: v.string(),
    updatedAt: v.string(),
  }).index('by_userId', ['userId']),

  // Insurance company directory (medical)
  insuranceContacts: defineTable({
    name: v.string(),
    phone: v.string(),
    department: v.optional(v.string()),
    payerId: v.optional(v.string()),
    hours: v.optional(v.string()),
    ivrInstructions: v.optional(v.string()),
    verificationRequirements: v.optional(v.string()),
    avgHoldTime: v.optional(v.number()),
    notes: v.optional(v.string()),
    humanAgentNumber: v.optional(v.string()),
    // IVR navigation
    ivrEnabled: v.optional(v.boolean()),
    ivrSequence: v.optional(v.string()),
    ivrSteps: v.optional(v.array(v.object({
      waitSeconds: v.number(),
      digit: v.string(),
      label: v.optional(v.string()),
    }))),
    // RFP additions: voice IVR support + payer kind
    voiceIvrEnabled: v.optional(v.boolean()),
    voiceIvrPhrases: v.optional(v.array(v.object({
      promptContains: v.string(),
      responseText: v.string(),
    }))),
    payerKind: v.optional(v.string()), // "medical" | "dental"
    // Raw call transcript the user pasted to auto-generate ivrInstructions.
    // Kept for audit / re-generation; not sent to the agent (only the distilled
    // ivrInstructions playbook is).
    ivrSourceTranscript: v.optional(v.string()),
    // Staleness tracking: when someone last confirmed ivrInstructions/ivrSteps/
    // voiceIvrPhrases against the real payer's live IVR. Cleared automatically
    // when any of those fields are edited, since an edit invalidates the prior
    // confirmation until it's re-checked against the real call.
    ivrVerifiedAt: v.optional(v.string()),
    userId: v.string(),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index('by_userId', ['userId'])
    .index('by_name', ['name']),

  // Dental plans (for EV use case)
  dentalPlans: defineTable({
    planName: v.string(),
    payerName: v.string(),
    insuranceContactId: v.optional(v.id('insuranceContacts')),
    planType: v.optional(v.string()), // "PPO" | "HMO" | "Indemnity"
    groupNumber: v.optional(v.string()),
    annualMaximumCents: v.optional(v.number()),
    deductibleCents: v.optional(v.number()),
    notes: v.optional(v.string()),
    userId: v.string(),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index('by_userId', ['userId'])
    .index('by_planName', ['planName']),

  // Patient records
  patients: defineTable({
    firstName: v.string(),
    lastName: v.string(),
    dateOfBirth: v.string(),
    memberId: v.string(),
    groupNumber: v.optional(v.string()),
    policyNumber: v.optional(v.string()),
    subscriberName: v.optional(v.string()),
    relationship: v.optional(v.string()),
    userId: v.string(),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index('by_userId', ['userId'])
    .index('by_memberId', ['memberId']),

  // Insurance claims (medical use case core entity)
  claims: defineTable({
    claimNumber: v.string(),
    patientId: v.id('patients'),
    insuranceContactId: v.id('insuranceContacts'),
    providerId: v.id('providers'),
    amount: v.number(),
    dateOfService: v.string(),
    dateSubmitted: v.optional(v.string()),
    cptCodes: v.optional(v.array(v.string())),
    diagnosisCodes: v.optional(v.array(v.string())),
    status: v.string(),
    priority: v.string(),
    agingBucket: v.string(),
    denialCode: v.optional(v.string()),
    denialReason: v.optional(v.string()),
    remarkCode: v.optional(v.string()),
    appealDeadline: v.optional(v.string()),
    referenceNumber: v.optional(v.string()),
    lastCalledAt: v.optional(v.string()),
    nextFollowUpDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    userId: v.string(),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index('by_userId', ['userId'])
    .index('by_status', ['status'])
    .index('by_priority', ['priority'])
    .index('by_patientId', ['patientId'])
    .index('by_claimNumber', ['claimNumber'])
    .index('by_agingBucket', ['agingBucket']),

  // Dental eligibility verification cases (dental use case core entity)
  dentalCases: defineTable({
    caseNumber: v.string(),
    patientId: v.id('patients'),
    planId: v.optional(v.id('dentalPlans')),
    insuranceContactId: v.id('insuranceContacts'),
    providerId: v.id('providers'),
    proposedDateOfService: v.string(),
    cdtCodes: v.array(v.string()),
    status: v.string(), // "awaiting_verification" | "verifying" | "verified" | "failed" | "requires_human"
    priority: v.string(),
    notes: v.optional(v.string()),
    lastCalledAt: v.optional(v.string()),
    userId: v.string(),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index('by_userId', ['userId'])
    .index('by_status', ['status'])
    .index('by_patientId', ['patientId'])
    .index('by_caseNumber', ['caseNumber']),

  // Voice call records
  calls: defineTable({
    claimId: v.optional(v.id('claims')),
    dentalCaseId: v.optional(v.id('dentalCases')),
    insuranceContactId: v.id('insuranceContacts'),
    sessionId: v.optional(v.id('callSessions')),
    useCase: v.optional(v.string()), // "medical_claim" | "dental_ev"
    status: v.string(),
    elevenLabsConversationId: v.optional(v.string()),
    twilioCallSid: v.optional(v.string()),
    duration: v.optional(v.number()),
    transcript: v.optional(v.string()),
    recordingUrl: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    // IVR call phase tracking
    callPhase: v.optional(v.string()),
    holdStartedAt: v.optional(v.string()),
    holdDuration: v.optional(v.number()),
    humanDetectedAt: v.optional(v.string()),
    ivrSequenceUsed: v.optional(v.string()),
    // Outcome classification (RFP requirement: 100% retrieval = success)
    outcome: v.optional(v.string()), // "successful" | "partial" | "failed" | "transferred_to_human"
    outcomeReason: v.optional(v.string()),
    requiredFieldsRetrieved: v.optional(v.array(v.string())),
    missingFields: v.optional(v.array(v.string())),
    // Transfer tracking
    transferredAt: v.optional(v.string()),
    transferType: v.optional(v.string()), // "warm" | "cold"
    transferDestination: v.optional(v.string()),
    // Retry tracking
    parentCallId: v.optional(v.id('calls')),
    attemptNumber: v.optional(v.number()),
    // Set atomically (once) when the IVR human-handoff follow-up call has been
    // claimed, so concurrent completion paths (poll / call-ended / webhook)
    // can't each place a duplicate call to the human-agent number.
    handoffFollowUpAt: v.optional(v.string()),
    // ---- LIVE AI→HUMAN HANDOFF (cadence_pro_ivr) ----
    // These drive the live transfer where the AI navigates the payer IVR on a
    // Cadence-controlled Twilio conference call, and when the insurance human
    // picks up, one of our agents takes over the SAME call (AI leg dropped).
    // All optional / additive — legacy calls and the existing ElevenLabs-native
    // separate-follow-up path (handoffFollowUpAt above) are unaffected.
    //   "none"          — no live handoff in play (default / legacy calls)
    //   "awaiting_human"— insurance human detected; broadcast to our agents
    //   "accepting"     — one of our agents claimed it; bridging in progress
    //   "connected"     — our human ↔ insurance human on the same call
    //   "declined"      — an agent declined (call stays available to others)
    //   "handoff_failed"— no agent took it / bridge failed
    //   "handoff_ended" — call ended after a successful handoff
    handoffState: v.optional(v.string()),
    handoffRequestedAt: v.optional(v.string()),
    handoffReason: v.optional(v.string()),
    handoffAcceptedByUserId: v.optional(v.string()),
    handoffAcceptedByEmail: v.optional(v.string()),
    handoffAcceptedAt: v.optional(v.string()),
    assignedAgentUserId: v.optional(v.id('users')),
    assignedAgentEmail: v.optional(v.string()),
    assignedAgentName: v.optional(v.string()),
    // Deterministic Twilio conference name (cadence-<callId>) that every leg
    // (payer, AI media, our human) joins so participants can be swapped live.
    conferenceName: v.optional(v.string()),
    // The AI's conference participant/call leg — dropped on successful handoff.
    aiParticipantCallSid: v.optional(v.string()),
    // Our agent's leg once they join (Phase 1: dialed number; Phase 2: browser
    // softphone). Kept so we can track/clean it up.
    humanParticipantCallSid: v.optional(v.string()),
    // Short numeric token carried in the AI transfer's post-dial DTMF digits so
    // the inbound leg on our bridge number can be correlated back to THIS call.
    handoffToken: v.optional(v.string()),
    // Transcript of the human↔human portion after handoff (Twilio transcription
    // of the conference recording). Separate from `transcript` (the AI/IVR
    // portion) so the two don't collide.
    humanTranscript: v.optional(v.string()),
    userId: v.string(),
    startedAt: v.string(),
    completedAt: v.optional(v.string()),
  })
    .index('by_claimId', ['claimId'])
    .index('by_dentalCaseId', ['dentalCaseId'])
    .index('by_sessionId', ['sessionId'])
    .index('by_userId', ['userId'])
    .index('by_status', ['status'])
    .index('by_outcome', ['outcome'])
    .index('by_handoffState', ['handoffState'])
    .index('by_assignedAgentUserId', ['assignedAgentUserId'])
    .index('by_elevenLabsConversationId', ['elevenLabsConversationId']),

  // Call sessions for multi-patient calls (RFP requirement R-CONV-6)
  callSessions: defineTable({
    insuranceContactId: v.id('insuranceContacts'),
    useCase: v.string(), // "medical_claim" | "dental_ev"
    itemRefs: v.array(v.union(v.id('claims'), v.id('dentalCases'))),
    status: v.string(), // "queued" | "in_progress" | "completed" | "paused" | "failed"
    aggregateOutcome: v.optional(v.string()),
    notes: v.optional(v.string()),
    userId: v.string(),
    createdAt: v.string(),
    startedAt: v.optional(v.string()),
    completedAt: v.optional(v.string()),
  })
    .index('by_userId', ['userId'])
    .index('by_status', ['status']),

  // Structured data extracted from call transcripts (medical claims)
  callResults: defineTable({
    callId: v.id('calls'),
    claimId: v.id('claims'),
    claimStatus: v.optional(v.string()),
    paidAmount: v.optional(v.number()),
    paidDate: v.optional(v.string()),
    checkOrEftNumber: v.optional(v.string()),
    denialCode: v.optional(v.string()),
    remarkCode: v.optional(v.string()),
    denialReason: v.optional(v.string()),
    appealDeadline: v.optional(v.string()),
    missingDocuments: v.optional(v.string()),
    expectedDecisionDate: v.optional(v.string()),
    referenceNumber: v.optional(v.string()),
    repName: v.optional(v.string()),
    nextSteps: v.optional(v.string()),
    rawExtraction: v.string(),
    confidence: v.optional(v.number()),
    userId: v.string(),
    createdAt: v.string(),
  })
    .index('by_callId', ['callId'])
    .index('by_claimId', ['claimId'])
    .index('by_userId', ['userId']),

  // Eligibility verification results (dental EV)
  evResults: defineTable({
    callId: v.id('calls'),
    dentalCaseId: v.id('dentalCases'),
    isActive: v.optional(v.boolean()),
    coverageEffectiveDate: v.optional(v.string()),
    coverageTerminationDate: v.optional(v.string()),
    deductibleAnnualCents: v.optional(v.number()),
    deductibleMetCents: v.optional(v.number()),
    coinsurancePct: v.optional(v.number()),
    copayCents: v.optional(v.number()),
    annualMaximumCents: v.optional(v.number()),
    annualMaxRemainingCents: v.optional(v.number()),
    networkStatus: v.optional(v.string()), // "in_network" | "out_of_network" | "unknown"
    frequencyLimits: v.optional(v.array(v.object({
      cdtCode: v.string(),
      limitDescription: v.string(),
      remainingThisYear: v.optional(v.number()),
    }))),
    waitingPeriods: v.optional(v.array(v.object({
      cdtCode: v.string(),
      endsOn: v.optional(v.string()),
      satisfied: v.boolean(),
    }))),
    repName: v.optional(v.string()),
    referenceNumber: v.optional(v.string()),
    nextSteps: v.optional(v.string()),
    rawExtraction: v.string(),
    confidence: v.optional(v.number()),
    userId: v.string(),
    createdAt: v.string(),
  })
    .index('by_callId', ['callId'])
    .index('by_dentalCaseId', ['dentalCaseId'])
    .index('by_userId', ['userId']),

  // Real-time call events (streamed from ElevenLabs monitor WebSocket via bridge server)
  callEvents: defineTable({
    callId: v.id('calls'),
    type: v.string(),
    message: v.optional(v.string()),
    timestamp: v.string(),
  }).index('by_callId', ['callId']),

  // Single-row settings for passing data between call initiation and TwiML handlers
  callSettings: defineTable({
    key: v.string(),
    value: v.string(),
  }).index('by_key', ['key']),

  // Users with roles for RBAC (RFP requirement R-INT-2)
  users: defineTable({
    email: v.string(),
    name: v.optional(v.string()),
    role: v.string(), // "admin" | "manager" | "operator" | "viewer"
    status: v.string(), // "active" | "disabled"
    ssoProvider: v.optional(v.string()),
    ssoSubject: v.optional(v.string()),
    lastLoginAt: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index('by_email', ['email'])
    .index('by_role', ['role']),

  // Audit log (RFP HIPAA-aligned requirement)
  auditEvents: defineTable({
    userId: v.optional(v.string()),
    userEmail: v.optional(v.string()),
    userRole: v.optional(v.string()),
    action: v.string(), // "create" | "read" | "update" | "delete" | "login" | "logout" | "transfer" | "export"
    resourceType: v.string(), // "claim" | "dentalCase" | "call" | "patient" | etc.
    resourceId: v.optional(v.string()),
    phiAccessed: v.optional(v.boolean()),
    payloadSummary: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    timestamp: v.string(),
  })
    .index('by_timestamp', ['timestamp'])
    .index('by_userId', ['userId'])
    .index('by_resourceType', ['resourceType'])
    .index('by_action', ['action']),

  // Webhook subscriptions (RFP requirement: integration)
  webhookSubscriptions: defineTable({
    url: v.string(),
    events: v.array(v.string()),
    secret: v.string(),
    status: v.string(), // "active" | "paused" | "revoked"
    lastDeliveryAt: v.optional(v.string()),
    lastDeliveryStatus: v.optional(v.string()),
    failureCount: v.optional(v.number()),
    userId: v.string(),
    createdAt: v.string(),
  })
    .index('by_userId', ['userId'])
    .index('by_status', ['status']),

  // Webhook delivery attempts (for retry & dead-letter visibility)
  webhookDeliveries: defineTable({
    subscriptionId: v.id('webhookSubscriptions'),
    eventType: v.string(),
    eventPayload: v.string(),
    attempt: v.number(),
    status: v.string(), // "pending" | "delivered" | "retrying" | "dead_letter"
    httpStatus: v.optional(v.number()),
    responseBody: v.optional(v.string()),
    nextAttemptAt: v.optional(v.string()),
    createdAt: v.string(),
    completedAt: v.optional(v.string()),
  })
    .index('by_subscriptionId', ['subscriptionId'])
    .index('by_status', ['status']),

  // API keys for public REST API (demo-grade)
  apiKeys: defineTable({
    name: v.string(),
    hashedKey: v.string(),
    prefix: v.string(), // first 8 chars of key for display
    scopes: v.array(v.string()),
    status: v.string(), // "active" | "revoked"
    lastUsedAt: v.optional(v.string()),
    createdAt: v.string(),
    revokedAt: v.optional(v.string()),
  })
    .index('by_prefix', ['prefix'])
    .index('by_status', ['status']),

  // Human transfer destinations (RFP requirement R-CONV-4)
  transferDestinations: defineTable({
    name: v.string(),
    phone: v.string(),
    kind: v.string(), // "warm" | "cold" | "either"
    businessHours: v.optional(v.string()),
    payerKind: v.optional(v.string()), // restrict to medical/dental
    insuranceContactIds: v.optional(v.array(v.id('insuranceContacts'))),
    enabled: v.boolean(),
    userId: v.string(),
    createdAt: v.string(),
  }).index('by_userId', ['userId']),
});
