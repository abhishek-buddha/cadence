import { mutation, query, action } from './_generated/server';
import { v } from 'convex/values';

// Distill a raw call transcript with a payer's IVR into a concise, imperative
// navigation playbook that the ElevenLabs agent will follow on future calls.
// The result is meant to be stored in insuranceContacts.ivrInstructions, which
// buildIvrInstructionsVar() renders into the {{ivr_instructions}} dynamic
// variable. This is an authoring aid — it does not change the call path.
export const generatePlaybookFromTranscript = action({
  args: { transcript: v.string() },
  handler: async (_ctx, args): Promise<{ playbook: string }> => {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) throw new Error('Missing OpenAI API key');
    if (!args.transcript || !args.transcript.trim()) {
      throw new Error('Transcript is empty');
    }

    const system = `You convert a raw phone-call transcript between an AI billing agent and a health insurance payer's automated phone system (IVR) into a concise, imperative navigation PLAYBOOK that a voice AI agent will follow on future calls to that same payer.

Output ONLY the playbook text — no preamble, no markdown headers, no bullet characters other than a numbered list, no code fences.

Rules:
- Write ordered, imperative steps in the sequence they occur (1., 2., 3., ...).
- For each menu, quote the payer's exact trigger phrase, then state the action: press N, say "…", or enter the Tax ID / NPI as keypad tones (digits only, no dashes).
- On any identity prompt (NPI, Tax ID, member ID, DOB), instruct to answer immediately using the provided values — enter digits as keypad tones, or speak them clearly if the system is voice-only. Never stay silent on an identity prompt. Do NOT say "Representative" to bypass identity unless the system explicitly rejects the entered ID.
- Capture the EXACT wording the IVR uses right before a live agent joins (e.g. "please hold", "connecting you to a representative", hold music). End the playbook by naming that phrase as the human-handoff point.
- Only include steps supported by the transcript. Do not invent menu options that are not shown.
- Be concise — aim for under 150 words. Present tense, imperative voice.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `Transcript:\n${args.transcript}` },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errBody}`);
    }

    const result = await response.json();
    const playbook = (result.choices?.[0]?.message?.content || '').trim();
    if (!playbook) throw new Error('Model returned an empty playbook');
    return { playbook };
  },
});

export const create = mutation({
  args: {
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
    payerKind: v.optional(v.string()),
    ivrVerifiedAt: v.optional(v.string()),
    ivrSourceTranscript: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    const now = new Date().toISOString();
    return await ctx.db.insert('insuranceContacts', {
      ...args,
      userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const list = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    return await ctx.db
      .query('insuranceContacts')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();
  },
});

export const getById = query({
  args: { id: v.id('insuranceContacts') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const update = mutation({
  args: {
    id: v.id('insuranceContacts'),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    department: v.optional(v.string()),
    payerId: v.optional(v.string()),
    hours: v.optional(v.string()),
    ivrInstructions: v.optional(v.string()),
    verificationRequirements: v.optional(v.string()),
    avgHoldTime: v.optional(v.number()),
    notes: v.optional(v.string()),
    humanAgentNumber: v.optional(v.string()),
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
    payerKind: v.optional(v.string()),
    ivrVerifiedAt: v.optional(v.string()),
    ivrSourceTranscript: v.optional(v.string()),
    // When true, clears ivrVerifiedAt even though the field itself is
    // otherwise omitted (omitted = "leave alone" for every other field here).
    // Set by the frontend when ivrInstructions/ivrSteps/voiceIvrPhrases changed,
    // since an edit invalidates the prior real-call confirmation.
    clearIvrVerification: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, clearIvrVerification, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    if (clearIvrVerification) {
      filtered.ivrVerifiedAt = undefined;
    }
    await ctx.db.patch(id, { ...filtered, updatedAt: new Date().toISOString() });
  },
});

export const markIvrVerified = mutation({
  args: { id: v.id('insuranceContacts') },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      ivrVerifiedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id('insuranceContacts') },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
