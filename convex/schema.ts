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

  // Insurance company directory
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
    userId: v.string(),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index('by_userId', ['userId'])
    .index('by_name', ['name']),

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

  // Insurance claims (core CRM entity)
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

  // Voice call records
  calls: defineTable({
    claimId: v.id('claims'),
    insuranceContactId: v.id('insuranceContacts'),
    status: v.string(),
    elevenLabsConversationId: v.optional(v.string()),
    twilioCallSid: v.optional(v.string()),
    duration: v.optional(v.number()),
    transcript: v.optional(v.string()),
    recordingUrl: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    userId: v.string(),
    startedAt: v.string(),
    completedAt: v.optional(v.string()),
  })
    .index('by_claimId', ['claimId'])
    .index('by_userId', ['userId'])
    .index('by_status', ['status'])
    .index('by_elevenLabsConversationId', ['elevenLabsConversationId']),

  // Structured data extracted from call transcripts
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
    .index('by_claimId', ['claimId']),
});
