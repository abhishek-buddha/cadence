import { internalMutation } from './_generated/server';

// Idempotent seed: only inserts demo data if the marker auditEvents row is missing.
export const seedDemoData = internalMutation({
  args: {},
  handler: async (ctx) => {
    const userId = 'demo-user';
    const now = new Date().toISOString();

    // Marker check: skip if already seeded
    const allAudit = await ctx.db.query('auditEvents').collect();
    const marker = allAudit.find((e) => e.action === 'seed_marker');
    if (marker) return { seeded: false, reason: 'already seeded' };

    // ---------- 5 medical insuranceContacts ----------
    const medicalIvrSteps = [
      { waitSeconds: 3, digit: '1' },
      { waitSeconds: 3, digit: '3' },
    ];
    const medicalIvrPhrases = [
      { promptContains: 'claims or eligibility', responseText: 'claims' },
    ];
    const medicalPayers = [
      { name: 'Aetna', payerId: '60054' },
      { name: 'Cigna', payerId: '62308' },
      { name: 'UnitedHealthcare', payerId: '87726' },
      { name: 'Anthem', payerId: '38001' },
      { name: 'Humana', payerId: '61101' },
    ];
    const medicalInsIds: Record<string, any> = {};
    for (const p of medicalPayers) {
      medicalInsIds[p.name] = await ctx.db.insert('insuranceContacts', {
        name: p.name,
        phone: '+15005550006',
        payerId: p.payerId,
        ivrEnabled: true,
        ivrSequence: '1,3',
        ivrSteps: medicalIvrSteps,
        humanAgentNumber: '+15005550006',
        voiceIvrEnabled: true,
        voiceIvrPhrases: medicalIvrPhrases,
        payerKind: 'medical',
        userId,
        createdAt: now,
        updatedAt: now,
      });
    }

    // ---------- 5 dental insuranceContacts ----------
    const dentalPayers = [
      { name: 'Delta Dental', payerId: 'CDCA1' },
      { name: 'MetLife Dental', payerId: '65978' },
      { name: 'Cigna Dental', payerId: '62308' },
      { name: 'Aetna Dental', payerId: '60054' },
      { name: 'United Concordia', payerId: 'CDUS1' },
    ];
    const dentalInsIds: Record<string, any> = {};
    for (const p of dentalPayers) {
      dentalInsIds[p.name] = await ctx.db.insert('insuranceContacts', {
        name: p.name,
        phone: '+15005550006',
        payerId: p.payerId,
        ivrEnabled: true,
        ivrSequence: '1,3',
        ivrSteps: medicalIvrSteps,
        humanAgentNumber: '+15005550006',
        voiceIvrEnabled: true,
        voiceIvrPhrases: medicalIvrPhrases,
        payerKind: 'dental',
        userId,
        createdAt: now,
        updatedAt: now,
      });
    }

    // ---------- 3 dentalPlans ----------
    const planDeltaPpo = await ctx.db.insert('dentalPlans', {
      planName: 'Delta PPO',
      payerName: 'Delta Dental',
      insuranceContactId: dentalInsIds['Delta Dental'],
      planType: 'PPO',
      groupNumber: 'DDPPO-1001',
      annualMaximumCents: 200000,
      deductibleCents: 5000,
      userId,
      createdAt: now,
      updatedAt: now,
    });
    const planMetlifeHmo = await ctx.db.insert('dentalPlans', {
      planName: 'MetLife HMO',
      payerName: 'MetLife Dental',
      insuranceContactId: dentalInsIds['MetLife Dental'],
      planType: 'HMO',
      groupNumber: 'METHMO-2002',
      annualMaximumCents: 150000,
      deductibleCents: 5000,
      userId,
      createdAt: now,
      updatedAt: now,
    });
    const planCignaPreferred = await ctx.db.insert('dentalPlans', {
      planName: 'Cigna Preferred',
      payerName: 'Cigna Dental',
      insuranceContactId: dentalInsIds['Cigna Dental'],
      planType: 'PPO',
      groupNumber: 'CIGPRE-3003',
      annualMaximumCents: 250000,
      deductibleCents: 7500,
      userId,
      createdAt: now,
      updatedAt: now,
    });

    // ---------- 8 patients ----------
    const patientSeeds = [
      ['Sarah', 'Johnson', '1985-03-12', 'AET-001'],
      ['Michael', 'Chen', '1972-09-22', 'CIG-002'],
      ['Emily', 'Rodriguez', '1990-05-30', 'UHC-003'],
      ['David', 'Kim', '1981-11-18', 'ANT-004'],
      ['Jessica', 'Williams', '1995-07-04', 'HUM-005'],
      ['James', 'Brown', '1968-01-25', 'DD-006'],
      ['Linda', 'Garcia', '1979-08-09', 'MET-007'],
      ['Robert', 'Davis', '1988-12-15', 'UNC-008'],
    ];
    const patientIds: any[] = [];
    for (const [first, last, dob, mid] of patientSeeds) {
      patientIds.push(await ctx.db.insert('patients', {
        firstName: first,
        lastName: last,
        dateOfBirth: dob,
        memberId: mid,
        userId,
        createdAt: now,
        updatedAt: now,
      }));
    }

    // ---------- 2 providers ----------
    const provGeneral = await ctx.db.insert('providers', {
      practiceName: 'Westside Medical Group',
      npi: '1234567890',
      taxId: '12-3456789',
      address: '123 Main St, Austin, TX 78701',
      phone: '+15125550100',
      specialty: 'Internal Medicine',
      userId,
      createdAt: now,
      updatedAt: now,
    });
    const provDental = await ctx.db.insert('providers', {
      practiceName: 'Sunrise Dental Care',
      npi: '0987654321',
      taxId: '98-7654321',
      address: '456 Oak Ave, Austin, TX 78704',
      phone: '+15125550200',
      specialty: 'General Dentistry',
      userId,
      createdAt: now,
      updatedAt: now,
    });

    // ---------- 6 medical claims ----------
    const claimSeeds = [
      { num: 'CLM-2026-001', pIdx: 0, ins: 'Aetna', amt: 250000, dos: '2025-12-01', cpt: ['99213'], age: '91-120', status: 'pending' },
      { num: 'CLM-2026-002', pIdx: 1, ins: 'Cigna', amt: 175000, dos: '2026-01-10', cpt: ['99214'], age: '61-90', status: 'pending' },
      { num: 'CLM-2026-003', pIdx: 2, ins: 'UnitedHealthcare', amt: 95000, dos: '2026-02-15', cpt: ['99213', '90834'], age: '31-60', status: 'in_progress' },
      { num: 'CLM-2026-004', pIdx: 3, ins: 'Anthem', amt: 320000, dos: '2025-10-20', cpt: ['99215'], age: '120+', status: 'denied' },
      { num: 'CLM-2026-005', pIdx: 4, ins: 'Humana', amt: 60000, dos: '2026-03-05', cpt: ['99213'], age: '31-60', status: 'pending' },
      { num: 'CLM-2026-006', pIdx: 0, ins: 'Aetna', amt: 415000, dos: '2025-11-08', cpt: ['99214', '93000'], age: '120+', status: 'pending' },
    ];
    for (const c of claimSeeds) {
      await ctx.db.insert('claims', {
        claimNumber: c.num,
        patientId: patientIds[c.pIdx],
        insuranceContactId: medicalInsIds[c.ins],
        providerId: provGeneral,
        amount: c.amt,
        dateOfService: c.dos,
        cptCodes: c.cpt,
        status: c.status,
        priority: c.age === '120+' ? 'high' : c.age === '91-120' ? 'medium' : 'low',
        agingBucket: c.age,
        userId,
        createdAt: now,
        updatedAt: now,
      });
    }

    // ---------- 4 dentalCases ----------
    const dentalCaseSeeds = [
      { num: 'EV-20260417-A001', pIdx: 5, ins: 'Delta Dental', plan: planDeltaPpo, dos: '2026-04-25', cdt: ['D0150', 'D1110'], status: 'awaiting_verification', prio: 'medium' },
      { num: 'EV-20260417-A002', pIdx: 6, ins: 'MetLife Dental', plan: planMetlifeHmo, dos: '2026-04-22', cdt: ['D2740'], status: 'awaiting_verification', prio: 'high' },
      { num: 'EV-20260417-A003', pIdx: 7, ins: 'Cigna Dental', plan: planCignaPreferred, dos: '2026-05-02', cdt: ['D7240'], status: 'awaiting_verification', prio: 'high' },
      { num: 'EV-20260417-A004', pIdx: 0, ins: 'Aetna Dental', plan: undefined, dos: '2026-04-30', cdt: ['D0274'], status: 'awaiting_verification', prio: 'low' },
    ];
    for (const c of dentalCaseSeeds) {
      await ctx.db.insert('dentalCases', {
        caseNumber: c.num,
        patientId: patientIds[c.pIdx],
        planId: c.plan,
        insuranceContactId: dentalInsIds[c.ins],
        providerId: provDental,
        proposedDateOfService: c.dos,
        cdtCodes: c.cdt,
        status: c.status,
        priority: c.prio,
        userId,
        createdAt: now,
        updatedAt: now,
      });
    }

    // ---------- 2 transferDestinations ----------
    await ctx.db.insert('transferDestinations', {
      name: 'Medical Help Desk',
      phone: '+15005550101',
      kind: 'either',
      businessHours: 'Mon-Fri 8am-6pm CT',
      payerKind: 'medical',
      enabled: true,
      userId,
      createdAt: now,
    });
    await ctx.db.insert('transferDestinations', {
      name: 'Dental Help Desk',
      phone: '+15005550202',
      kind: 'either',
      businessHours: 'Mon-Fri 8am-5pm CT',
      payerKind: 'dental',
      enabled: true,
      userId,
      createdAt: now,
    });

    // ---------- 3 users ----------
    const userSeeds = [
      { email: 'admin@cadence.demo', name: 'Admin User', role: 'admin' },
      { email: 'manager@cadence.demo', name: 'Manager User', role: 'manager' },
      { email: 'viewer@cadence.demo', name: 'Viewer User', role: 'viewer' },
    ];
    for (const u of userSeeds) {
      const existing = await ctx.db
        .query('users')
        .withIndex('by_email', (q) => q.eq('email', u.email))
        .first();
      if (!existing) {
        await ctx.db.insert('users', {
          email: u.email,
          name: u.name,
          role: u.role,
          status: 'active',
          createdAt: now,
        });
      }
    }

    // ---------- Marker ----------
    await ctx.db.insert('auditEvents', {
      action: 'seed_marker',
      resourceType: 'system',
      payloadSummary: 'Demo data seeded',
      timestamp: now,
    });

    return { seeded: true };
  },
});

// Wipe key tables and re-seed (DEV ONLY)
export const wipeAndReseed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tables = [
      'claims', 'dentalCases', 'calls', 'callResults', 'evResults',
      'callSessions', 'auditEvents',
    ] as const;
    for (const t of tables) {
      const all = await ctx.db.query(t).collect();
      for (const row of all) await ctx.db.delete(row._id);
    }
    // Re-run seed by inlining (cannot call another mutation from within a mutation).
    const userId = 'demo-user';
    const now = new Date().toISOString();

    const medicalIvrSteps = [
      { waitSeconds: 3, digit: '1' },
      { waitSeconds: 3, digit: '3' },
    ];
    const medicalIvrPhrases = [
      { promptContains: 'claims or eligibility', responseText: 'claims' },
    ];

    // For wipe: also clear insuranceContacts/dentalPlans/patients/providers/transferDestinations/users that match userId
    const cleanupTables = ['insuranceContacts', 'dentalPlans', 'patients', 'providers', 'transferDestinations', 'users'] as const;
    for (const t of cleanupTables) {
      const all = await ctx.db.query(t).collect();
      for (const row of all) {
        // users table doesn't have userId; clean all on wipe
        if ((row as any).userId === userId || t === 'users') {
          await ctx.db.delete(row._id);
        }
      }
    }

    const medicalPayers = [
      { name: 'Aetna', payerId: '60054' },
      { name: 'Cigna', payerId: '62308' },
      { name: 'UnitedHealthcare', payerId: '87726' },
      { name: 'Anthem', payerId: '38001' },
      { name: 'Humana', payerId: '61101' },
    ];
    const medicalInsIds: Record<string, any> = {};
    for (const p of medicalPayers) {
      medicalInsIds[p.name] = await ctx.db.insert('insuranceContacts', {
        name: p.name, phone: '+15005550006', payerId: p.payerId,
        ivrEnabled: true, ivrSequence: '1,3', ivrSteps: medicalIvrSteps,
        humanAgentNumber: '+15005550006', voiceIvrEnabled: true,
        voiceIvrPhrases: medicalIvrPhrases, payerKind: 'medical',
        userId, createdAt: now, updatedAt: now,
      });
    }
    const dentalPayers = [
      { name: 'Delta Dental', payerId: 'CDCA1' },
      { name: 'MetLife Dental', payerId: '65978' },
      { name: 'Cigna Dental', payerId: '62308' },
      { name: 'Aetna Dental', payerId: '60054' },
      { name: 'United Concordia', payerId: 'CDUS1' },
    ];
    const dentalInsIds: Record<string, any> = {};
    for (const p of dentalPayers) {
      dentalInsIds[p.name] = await ctx.db.insert('insuranceContacts', {
        name: p.name, phone: '+15005550006', payerId: p.payerId,
        ivrEnabled: true, ivrSequence: '1,3', ivrSteps: medicalIvrSteps,
        humanAgentNumber: '+15005550006', voiceIvrEnabled: true,
        voiceIvrPhrases: medicalIvrPhrases, payerKind: 'dental',
        userId, createdAt: now, updatedAt: now,
      });
    }

    const planDeltaPpo = await ctx.db.insert('dentalPlans', {
      planName: 'Delta PPO', payerName: 'Delta Dental',
      insuranceContactId: dentalInsIds['Delta Dental'], planType: 'PPO',
      groupNumber: 'DDPPO-1001', annualMaximumCents: 200000, deductibleCents: 5000,
      userId, createdAt: now, updatedAt: now,
    });
    const planMetlifeHmo = await ctx.db.insert('dentalPlans', {
      planName: 'MetLife HMO', payerName: 'MetLife Dental',
      insuranceContactId: dentalInsIds['MetLife Dental'], planType: 'HMO',
      groupNumber: 'METHMO-2002', annualMaximumCents: 150000, deductibleCents: 5000,
      userId, createdAt: now, updatedAt: now,
    });
    const planCignaPreferred = await ctx.db.insert('dentalPlans', {
      planName: 'Cigna Preferred', payerName: 'Cigna Dental',
      insuranceContactId: dentalInsIds['Cigna Dental'], planType: 'PPO',
      groupNumber: 'CIGPRE-3003', annualMaximumCents: 250000, deductibleCents: 7500,
      userId, createdAt: now, updatedAt: now,
    });

    const patientSeeds = [
      ['Sarah', 'Johnson', '1985-03-12', 'AET-001'],
      ['Michael', 'Chen', '1972-09-22', 'CIG-002'],
      ['Emily', 'Rodriguez', '1990-05-30', 'UHC-003'],
      ['David', 'Kim', '1981-11-18', 'ANT-004'],
      ['Jessica', 'Williams', '1995-07-04', 'HUM-005'],
      ['James', 'Brown', '1968-01-25', 'DD-006'],
      ['Linda', 'Garcia', '1979-08-09', 'MET-007'],
      ['Robert', 'Davis', '1988-12-15', 'UNC-008'],
    ];
    const patientIds: any[] = [];
    for (const [first, last, dob, mid] of patientSeeds) {
      patientIds.push(await ctx.db.insert('patients', {
        firstName: first, lastName: last, dateOfBirth: dob, memberId: mid,
        userId, createdAt: now, updatedAt: now,
      }));
    }

    const provGeneral = await ctx.db.insert('providers', {
      practiceName: 'Westside Medical Group', npi: '1234567890', taxId: '12-3456789',
      address: '123 Main St, Austin, TX 78701', phone: '+15125550100',
      specialty: 'Internal Medicine', userId, createdAt: now, updatedAt: now,
    });
    const provDental = await ctx.db.insert('providers', {
      practiceName: 'Sunrise Dental Care', npi: '0987654321', taxId: '98-7654321',
      address: '456 Oak Ave, Austin, TX 78704', phone: '+15125550200',
      specialty: 'General Dentistry', userId, createdAt: now, updatedAt: now,
    });

    const claimSeeds = [
      { num: 'CLM-2026-001', pIdx: 0, ins: 'Aetna', amt: 250000, dos: '2025-12-01', cpt: ['99213'], age: '91-120', status: 'pending' },
      { num: 'CLM-2026-002', pIdx: 1, ins: 'Cigna', amt: 175000, dos: '2026-01-10', cpt: ['99214'], age: '61-90', status: 'pending' },
      { num: 'CLM-2026-003', pIdx: 2, ins: 'UnitedHealthcare', amt: 95000, dos: '2026-02-15', cpt: ['99213', '90834'], age: '31-60', status: 'in_progress' },
      { num: 'CLM-2026-004', pIdx: 3, ins: 'Anthem', amt: 320000, dos: '2025-10-20', cpt: ['99215'], age: '120+', status: 'denied' },
      { num: 'CLM-2026-005', pIdx: 4, ins: 'Humana', amt: 60000, dos: '2026-03-05', cpt: ['99213'], age: '31-60', status: 'pending' },
      { num: 'CLM-2026-006', pIdx: 0, ins: 'Aetna', amt: 415000, dos: '2025-11-08', cpt: ['99214', '93000'], age: '120+', status: 'pending' },
    ];
    for (const c of claimSeeds) {
      await ctx.db.insert('claims', {
        claimNumber: c.num, patientId: patientIds[c.pIdx],
        insuranceContactId: medicalInsIds[c.ins], providerId: provGeneral,
        amount: c.amt, dateOfService: c.dos, cptCodes: c.cpt, status: c.status,
        priority: c.age === '120+' ? 'high' : c.age === '91-120' ? 'medium' : 'low',
        agingBucket: c.age, userId, createdAt: now, updatedAt: now,
      });
    }

    const dentalCaseSeeds = [
      { num: 'EV-20260417-A001', pIdx: 5, ins: 'Delta Dental', plan: planDeltaPpo, dos: '2026-04-25', cdt: ['D0150', 'D1110'], status: 'awaiting_verification', prio: 'medium' },
      { num: 'EV-20260417-A002', pIdx: 6, ins: 'MetLife Dental', plan: planMetlifeHmo, dos: '2026-04-22', cdt: ['D2740'], status: 'awaiting_verification', prio: 'high' },
      { num: 'EV-20260417-A003', pIdx: 7, ins: 'Cigna Dental', plan: planCignaPreferred, dos: '2026-05-02', cdt: ['D7240'], status: 'awaiting_verification', prio: 'high' },
      { num: 'EV-20260417-A004', pIdx: 0, ins: 'Aetna Dental', plan: undefined, dos: '2026-04-30', cdt: ['D0274'], status: 'awaiting_verification', prio: 'low' },
    ];
    for (const c of dentalCaseSeeds) {
      await ctx.db.insert('dentalCases', {
        caseNumber: c.num, patientId: patientIds[c.pIdx], planId: c.plan,
        insuranceContactId: dentalInsIds[c.ins], providerId: provDental,
        proposedDateOfService: c.dos, cdtCodes: c.cdt, status: c.status,
        priority: c.prio, userId, createdAt: now, updatedAt: now,
      });
    }

    await ctx.db.insert('transferDestinations', {
      name: 'Medical Help Desk', phone: '+15005550101', kind: 'either',
      businessHours: 'Mon-Fri 8am-6pm CT', payerKind: 'medical',
      enabled: true, userId, createdAt: now,
    });
    await ctx.db.insert('transferDestinations', {
      name: 'Dental Help Desk', phone: '+15005550202', kind: 'either',
      businessHours: 'Mon-Fri 8am-5pm CT', payerKind: 'dental',
      enabled: true, userId, createdAt: now,
    });

    const userSeeds = [
      { email: 'admin@cadence.demo', name: 'Admin User', role: 'admin' },
      { email: 'manager@cadence.demo', name: 'Manager User', role: 'manager' },
      { email: 'viewer@cadence.demo', name: 'Viewer User', role: 'viewer' },
    ];
    for (const u of userSeeds) {
      await ctx.db.insert('users', {
        email: u.email, name: u.name, role: u.role,
        status: 'active', createdAt: now,
      });
    }

    await ctx.db.insert('auditEvents', {
      action: 'seed_marker', resourceType: 'system',
      payloadSummary: 'Demo data wiped + reseeded', timestamp: now,
    });

    return { wiped: true, reseeded: true };
  },
});

// ---------------------------------------------------------------------------
// Targeted cleanup: remove all dummy/test data created during development
// while preserving legitimate demo claims (CLM-2026-* series).
//
// Removes:
//   - All dentalCases with caseNumber matching EV-20260417-*  (44 cases)
//   - All claims with claimNumber matching TST-*              (14 claims)
//   - All callSessions whose itemRefs overlap the deleted claims/cases above
//   - evResults and calls linked to the removed dental cases
// ---------------------------------------------------------------------------
export const cleanTestData = internalMutation({
  args: {},
  handler: async (ctx) => {
    let dentalDeleted = 0;
    let claimsDeleted = 0;
    let sessionsDeleted = 0;
    let evResultsDeleted = 0;
    let callsDeleted = 0;

    // 1. Collect IDs to delete
    const allDentalCases = await ctx.db.query('dentalCases').collect();
    const junkCaseIds = new Set(
      allDentalCases
        .filter((c) => c.caseNumber?.startsWith('EV-20260417-'))
        .map((c) => c._id)
    );

    const allClaims = await ctx.db.query('claims').collect();
    const junkClaimIds = new Set(
      allClaims
        .filter((c) => c.claimNumber?.startsWith('TST-'))
        .map((c) => c._id)
    );

    // 2. Delete calls + evResults linked to junk dental cases
    for (const caseId of junkCaseIds) {
      const linkedCalls = await ctx.db
        .query('calls')
        .withIndex('by_dentalCaseId', (q) => q.eq('dentalCaseId', caseId))
        .collect();
      for (const call of linkedCalls) {
        // Delete any evResults for this call
        const evs = await ctx.db
          .query('evResults')
          .withIndex('by_callId', (q) => q.eq('callId', call._id))
          .collect();
        for (const ev of evs) {
          await ctx.db.delete(ev._id);
          evResultsDeleted++;
        }
        await ctx.db.delete(call._id);
        callsDeleted++;
      }
      // Also delete evResults indexed directly by dentalCaseId
      const caseEvs = await ctx.db
        .query('evResults')
        .withIndex('by_dentalCaseId', (q) => q.eq('dentalCaseId', caseId))
        .collect();
      for (const ev of caseEvs) {
        await ctx.db.delete(ev._id);
        evResultsDeleted++;
      }
    }

    // 3. Delete sessions whose itemRefs overlap junk IDs
    const allSessions = await ctx.db.query('callSessions').collect();
    for (const session of allSessions) {
      const refs = session.itemRefs ?? [];
      const hasJunk = refs.some(
        (ref) => junkCaseIds.has(ref as any) || junkClaimIds.has(ref as any)
      );
      if (hasJunk) {
        await ctx.db.delete(session._id);
        sessionsDeleted++;
      }
    }

    // 4. Delete the junk dental cases
    for (const id of junkCaseIds) {
      await ctx.db.delete(id);
      dentalDeleted++;
    }

    // 5. Delete the TST- claims
    for (const id of junkClaimIds) {
      await ctx.db.delete(id);
      claimsDeleted++;
    }

    // 6. Delete revoked webhook subscriptions
    let webhooksDeleted = 0;
    const allWebhooks = await ctx.db.query('webhookSubscriptions').collect();
    for (const wh of allWebhooks) {
      if (wh.status === 'revoked') {
        // Delete associated delivery records first
        const deliveries = await ctx.db
          .query('webhookDeliveries')
          .withIndex('by_subscriptionId', (q) => q.eq('subscriptionId', wh._id))
          .collect();
        for (const d of deliveries) await ctx.db.delete(d._id);
        await ctx.db.delete(wh._id);
        webhooksDeleted++;
      }
    }

    // 7. Delete test/audit API keys (keep only keys with lastUsedAt set — those are real integrations)
    let apiKeysDeleted = 0;
    const allKeys = await ctx.db.query('apiKeys').collect();
    for (const key of allKeys) {
      // Delete keys that: have never been used AND name contains "test" or "apikey" or "audit"
      const isTestKey = !key.lastUsedAt && (
        key.name?.toLowerCase().includes('test') ||
        key.name?.toLowerCase().includes('apikey') ||
        key.name?.toLowerCase().includes('audit') ||
        key.name?.toLowerCase().includes('runner')
      );
      if (isTestKey || key.status === 'revoked') {
        await ctx.db.delete(key._id);
        apiKeysDeleted++;
      }
    }

    return {
      dentalCasesDeleted: dentalDeleted,
      claimsDeleted,
      sessionsDeleted,
      evResultsDeleted,
      callsDeleted,
      webhooksDeleted,
      apiKeysDeleted,
    };
  },
});
