import { faker } from '@faker-js/faker';

/* ---------- types ---------- */

export interface Patient {
  patientId: string;
  firstName: string;
  lastName: string;
  dob: string;        // YYYY-MM-DD
  gender: 'M' | 'F' | 'X';
  memberId: string;
  groupNumber: string;
  payerName: string;
  phone: string;
  email: string;
}

export interface MedicalClaim {
  claimId: string;
  patient: Patient;
  cptCodes: string[];
  icd10Codes: string[];
  serviceDate: string;
  billedAmount: number;
  placeOfService: string;
  renderingProviderNpi: string;
  billingProviderNpi: string;
  payerId: string;
}

export interface DentalCase {
  caseId: string;
  patient: Patient;
  appointmentDate: string;
  cdtCodes: string[];     // e.g. D0150, D1110
  toothNumbers?: number[];
  practiceNpi: string;
  payerId: string;
}

export interface Payer {
  payerId: string;
  name: string;
  payerType: 'medical' | 'dental';
  ivrPhone: string;
  providerLine: string;
  websiteUrl: string;
  electronicPayerId: string;
}

export interface EvFixture {
  evId: string;
  patient: Patient;
  payer: Payer;
  appointmentDate: string;
  procedureCodes: string[];
  groupName?: string;
  subscriberId: string;
}

/* ---------- factories ---------- */

faker.seed(20260417); // deterministic across runs unless caller re-seeds

function tag(): string {
  // Short marker so synthetic rows are easy to filter / clean up.
  return `T${faker.string.alphanumeric({ length: 6, casing: 'upper' })}`;
}

export function buildPatient(overrides: Partial<Patient> = {}): Patient {
  const firstName = overrides.firstName ?? faker.person.firstName();
  const lastName = overrides.lastName ?? faker.person.lastName();
  return {
    patientId: `PAT-${tag()}`,
    firstName,
    lastName,
    dob: faker.date.birthdate({ min: 18, max: 85, mode: 'age' }).toISOString().slice(0, 10),
    gender: faker.helpers.arrayElement(['M', 'F', 'X']) as Patient['gender'],
    memberId: faker.string.alphanumeric({ length: 11, casing: 'upper' }),
    groupNumber: faker.string.alphanumeric({ length: 7, casing: 'upper' }),
    payerName: faker.helpers.arrayElement([
      'Aetna', 'Cigna', 'United Healthcare', 'Anthem BCBS', 'Humana', 'Delta Dental', 'MetLife Dental',
    ]),
    phone: faker.phone.number({ style: 'national' }),
    email: faker.internet.email({ firstName, lastName }).toLowerCase(),
    ...overrides,
  };
}

export function buildMedicalClaim(overrides: Partial<MedicalClaim> = {}): MedicalClaim {
  const patient = overrides.patient ?? buildPatient();
  return {
    claimId: `CLM-${tag()}`,
    patient,
    cptCodes: overrides.cptCodes ?? faker.helpers.arrayElements(
      ['99213', '99214', '99215', '93000', '85025', '80053', '36415', '20610'],
      { min: 1, max: 3 }
    ),
    icd10Codes: overrides.icd10Codes ?? faker.helpers.arrayElements(
      ['E11.9', 'I10', 'M54.5', 'J45.909', 'K21.9', 'F41.9', 'R51', 'Z00.00'],
      { min: 1, max: 3 }
    ),
    serviceDate: faker.date.recent({ days: 60 }).toISOString().slice(0, 10),
    billedAmount: Number(faker.finance.amount({ min: 80, max: 4500, dec: 2 })),
    placeOfService: faker.helpers.arrayElement(['11', '22', '23', '02']),
    renderingProviderNpi: faker.string.numeric(10),
    billingProviderNpi: faker.string.numeric(10),
    payerId: `PYR-${tag()}`,
    ...overrides,
  };
}

export function buildDentalCase(overrides: Partial<DentalCase> = {}): DentalCase {
  const patient = overrides.patient ?? buildPatient({ payerName: faker.helpers.arrayElement(['Delta Dental', 'MetLife Dental', 'Cigna Dental']) });
  return {
    caseId: `DENT-${tag()}`,
    patient,
    appointmentDate: faker.date.soon({ days: 21 }).toISOString().slice(0, 10),
    cdtCodes: overrides.cdtCodes ?? faker.helpers.arrayElements(
      ['D0150', 'D1110', 'D1120', 'D0274', 'D2391', 'D2740', 'D4341', 'D7140'],
      { min: 1, max: 4 }
    ),
    toothNumbers: overrides.toothNumbers ?? faker.helpers.arrayElements(
      Array.from({ length: 32 }, (_, i) => i + 1),
      { min: 0, max: 4 }
    ),
    practiceNpi: faker.string.numeric(10),
    payerId: `PYR-${tag()}`,
    ...overrides,
  };
}

export function buildPayer(overrides: Partial<Payer> = {}): Payer {
  const payerType = overrides.payerType ?? faker.helpers.arrayElement(['medical', 'dental'] as const);
  const name = overrides.name ?? (payerType === 'dental'
    ? faker.helpers.arrayElement(['Delta Dental', 'MetLife Dental', 'Cigna Dental', 'Guardian Dental'])
    : faker.helpers.arrayElement(['Aetna', 'Cigna', 'United Healthcare', 'Anthem BCBS', 'Humana']));
  return {
    payerId: `PYR-${tag()}`,
    name,
    payerType,
    ivrPhone: `1-800-${faker.string.numeric(3)}-${faker.string.numeric(4)}`,
    providerLine: `1-888-${faker.string.numeric(3)}-${faker.string.numeric(4)}`,
    websiteUrl: faker.internet.url(),
    electronicPayerId: faker.string.alphanumeric({ length: 5, casing: 'upper' }),
    ...overrides,
  };
}

export function buildEvFixture(overrides: Partial<EvFixture> = {}): EvFixture {
  const patient = overrides.patient ?? buildPatient();
  const payer = overrides.payer ?? buildPayer({ payerType: 'dental', name: patient.payerName });
  return {
    evId: `EV-${tag()}`,
    patient,
    payer,
    appointmentDate: faker.date.soon({ days: 14 }).toISOString().slice(0, 10),
    procedureCodes: overrides.procedureCodes ?? faker.helpers.arrayElements(
      ['D0150', 'D1110', 'D2391', 'D4341', 'D2740'],
      { min: 1, max: 3 }
    ),
    groupName: overrides.groupName ?? faker.company.name(),
    subscriberId: patient.memberId,
    ...overrides,
  };
}

/** Reseed Faker for a deterministic test slice (e.g. seeded snapshot tests). */
export function reseed(seed: number): void {
  faker.seed(seed);
}
