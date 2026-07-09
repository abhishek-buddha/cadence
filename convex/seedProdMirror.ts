import { internalMutation } from './_generated/server';

// One-off: mirror the 8 real insuranceContacts rows from production
// (colorless-cardinal-959, userId 'default') into this dev deployment, so
// the IVR playbook can be tested against the same real payer data/phone
// numbers used in production. Safe to re-run — skips a contact if one with
// the same name + phone already exists under 'default'.
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = [
      {
        name: 'Delta Dental',
        phone: '+1-800-000-0000',
        createdAt: '2026-04-22T12:04:06.126Z',
        updatedAt: '2026-04-22T12:04:06.126Z',
      },
      {
        name: 'United Concordia',
        phone: '+1-800-000-0000',
        createdAt: '2026-04-22T12:04:06.126Z',
        updatedAt: '2026-04-22T12:04:06.126Z',
      },
      {
        name: 'MetLife Dental',
        phone: '+1-800-000-0000',
        createdAt: '2026-04-22T12:04:06.126Z',
        updatedAt: '2026-04-22T12:04:06.126Z',
      },
      {
        name: 'Cigna Dental',
        phone: '+13187589839',
        department: 'Claims',
        humanAgentNumber: '+917330817729',
        createdAt: '2026-04-22T12:04:06.126Z',
        updatedAt: '2026-05-13T14:59:48.617Z',
      },
      {
        name: 'UnitedHealthcare',
        phone: '+919390730048',
        payerId: '60054',
        department: 'Claims, Provider Relations',
        hours: 'Mon-Fri 8am-6pm EST',
        avgHoldTime: 2,
        verificationRequirements: 'Member ID',
        createdAt: '2026-04-07T12:49:08.117Z',
        updatedAt: '2026-04-07T12:49:08.117Z',
      },
      {
        name: 'Acme Health Insurance',
        phone: '+917893477335',
        payerId: 'ACME001',
        department: 'Claims',
        hours: 'Mon-Fri 8am-6pm EST',
        avgHoldTime: 5,
        humanAgentNumber: '+919666095550',
        notes: 'Test IVR',
        createdAt: '2026-04-05T08:45:52.647Z',
        updatedAt: '2026-06-16T11:53:11.203Z',
      },
      {
        name: 'BCBS I',
        phone: '+919666095550',
        payerId: '600556',
        department: 'Claims',
        hours: 'Mon-Fri',
        avgHoldTime: 10,
        humanAgentNumber: '+918309838260',
        verificationRequirements: 'Tax ID',
        createdAt: '2026-02-14T17:02:55.547Z',
        updatedAt: '2026-06-23T10:21:43.032Z',
      },
      {
        name: 'Aetna',
        phone: '+13187589839',
        payerId: '60054',
        department: 'Claims',
        humanAgentNumber: '+919989033968',
        createdAt: '2026-02-14T13:46:08.372Z',
        updatedAt: '2026-07-08T10:22:07.911Z',
      },
    ];

    const existing = await ctx.db
      .query('insuranceContacts')
      .withIndex('by_userId', (q) => q.eq('userId', 'default'))
      .collect();

    let inserted = 0;
    let skipped = 0;
    for (const row of rows) {
      const dup = existing.find((e) => e.name === row.name && e.phone === row.phone);
      if (dup) {
        skipped++;
        continue;
      }
      await ctx.db.insert('insuranceContacts', { ...row, userId: 'default' });
      inserted++;
    }

    return { inserted, skipped };
  },
});
