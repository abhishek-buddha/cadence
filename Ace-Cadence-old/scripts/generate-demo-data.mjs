// Generate synthetic test data for Cadence's bulk-import demo.
// Outputs:
//   test-data/medical-claims-demo-50.xlsx
//   test-data/medical-claims-demo-50.csv
//   test-data/dental-ev-cases-demo-30.xlsx
//   test-data/dental-ev-cases-demo-30.csv
//
// All data is fully synthetic — no real PHI.

import * as XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_DIR = path.resolve(__dirname, "..", "test-data");

// ─────────────────────────────────────────────────────────────
// Seeded RNG (Mulberry32) for reproducibility.
// ─────────────────────────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(424242);

const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const pickN = (arr, n) => {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length; i++) {
    const idx = Math.floor(rand() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
};
const intBetween = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const moneyBetween = (min, max) => Math.round((rand() * (max - min) + min) * 100) / 100;

function pad(n, width = 2) {
  return String(n).padStart(width, "0");
}

function fmtDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dateOffsetFromToday(daysOffset) {
  const today = new Date(2026, 3, 17); // 2026-04-17 (deterministic for demo)
  const d = new Date(today);
  d.setDate(d.getDate() + daysOffset);
  return d;
}

function randomDOB(minAge, maxAge) {
  const today = new Date(2026, 3, 17);
  const age = intBetween(minAge, maxAge);
  const yr = today.getFullYear() - age;
  const mo = intBetween(1, 12);
  const dy = intBetween(1, 28);
  return `${yr}-${pad(mo)}-${pad(dy)}`;
}

// ─────────────────────────────────────────────────────────────
// Name pools (synthetic)
// ─────────────────────────────────────────────────────────────
const FIRST_NAMES = [
  "James", "Mary", "Robert", "Patricia", "Michael", "Jennifer", "William", "Linda",
  "David", "Elizabeth", "Richard", "Barbara", "Joseph", "Susan", "Thomas", "Jessica",
  "Charles", "Sarah", "Christopher", "Karen", "Daniel", "Nancy", "Matthew", "Lisa",
  "Anthony", "Margaret", "Mark", "Betty", "Donald", "Sandra", "Steven", "Ashley",
  "Paul", "Kimberly", "Andrew", "Emily", "Joshua", "Donna", "Kenneth", "Michelle",
  "Kevin", "Carol", "Brian", "Amanda", "George", "Melissa", "Edward", "Deborah",
  "Ronald", "Stephanie", "Timothy", "Rebecca", "Jason", "Laura", "Jeffrey", "Sharon",
  "Ryan", "Cynthia", "Jacob", "Kathleen", "Gary", "Amy", "Nicholas", "Shirley",
  "Eric", "Angela", "Jonathan", "Helen", "Stephen", "Anna", "Larry", "Brenda",
  "Justin", "Pamela", "Scott", "Nicole", "Frank", "Samantha", "Brandon", "Katherine",
  "Raymond", "Christine", "Gregory", "Debra", "Samuel", "Rachel", "Patrick", "Catherine",
  "Alexander", "Carolyn", "Jack", "Janet", "Dennis", "Ruth", "Jerry", "Maria",
  "Tyler", "Heather", "Aaron", "Diane", "Jose", "Virginia", "Adam", "Julie",
  "Henry", "Joyce", "Nathan", "Victoria", "Douglas", "Olivia", "Zachary", "Kelly",
  "Peter", "Christina", "Kyle", "Lauren", "Walter", "Joan", "Ethan", "Evelyn",
  "Jeremy", "Judith", "Harold", "Megan", "Keith", "Andrea", "Christian", "Cheryl",
  "Roger", "Hannah", "Noah", "Jacqueline", "Gerald", "Martha", "Carl", "Gloria",
  "Terry", "Teresa", "Sean", "Ann", "Austin", "Sara", "Arthur", "Madison",
  "Lawrence", "Frances", "Jesse", "Kathryn", "Dylan", "Janice", "Bryan", "Jean",
  "Joe", "Abigail", "Jordan", "Alice", "Billy", "Julia", "Bruce", "Judy",
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
  "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
  "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker",
  "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill",
  "Flores", "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell",
  "Mitchell", "Carter", "Roberts", "Gomez", "Phillips", "Evans", "Turner", "Diaz",
  "Parker", "Cruz", "Edwards", "Collins", "Reyes", "Stewart", "Morris", "Morales",
  "Murphy", "Cook", "Rogers", "Gutierrez", "Ortiz", "Morgan", "Cooper", "Peterson",
  "Bailey", "Reed", "Kelly", "Howard", "Ramos", "Kim", "Cox", "Ward",
  "Richardson", "Watson", "Brooks", "Chavez", "Wood", "James", "Bennett", "Gray",
  "Mendoza", "Ruiz", "Hughes", "Price", "Alvarez", "Castillo", "Sanders", "Patel",
  "Myers", "Long", "Ross", "Foster", "Jimenez", "Powell", "Jenkins", "Perry",
  "Russell", "Sullivan", "Bell", "Coleman", "Butler", "Henderson", "Barnes",
  "Gonzales", "Fisher", "Vasquez", "Simmons", "Romero", "Jordan", "Patterson",
  "Alexander", "Hamilton", "Graham", "Reynolds", "Griffin", "Wallace", "Moreno",
];

// ─────────────────────────────────────────────────────────────
// Medical claims data
// ─────────────────────────────────────────────────────────────
const MEDICAL_INSURERS = [
  { name: "Aetna", memberPrefix: () => "W" + intBetween(100000000, 999999999) },
  { name: "Cigna", memberPrefix: () => "U" + intBetween(100000000, 999999999) },
  { name: "UnitedHealthcare", memberPrefix: () => {
      // 9 alphanumeric chars
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let s = "";
      for (let i = 0; i < 9; i++) s += chars[Math.floor(rand() * chars.length)];
      return s;
    } },
  { name: "Anthem", memberPrefix: () => "YYL" + intBetween(10000000, 99999999) },
  { name: "Humana", memberPrefix: () => "H" + intBetween(10000000, 99999999) },
];

const CPT_CODES = [
  "99213", "99214", "99215", "99212", "99203", "99204", "99205",
  "71046", "71045", "85025", "80053", "80061", "93000", "93010",
  "90471", "90472", "36415", "81001", "82565", "84443",
  "27130", "27447", "29881", "43239", "45378", "76700", "76830",
  "99283", "99284", "99285", "99281", "99282", "99291",
  "97110", "97140", "97530",
];

const ICD10_CODES = [
  "Z00.00", "I10", "E11.9", "E78.5", "J06.9", "J20.9", "J45.909",
  "M25.561", "M54.5", "M79.3", "K21.9", "K59.00", "N39.0",
  "R07.9", "R10.9", "R51", "R53.83", "R05",
  "F32.9", "F41.1", "F90.0",
  "G43.909", "G47.00",
  "S93.401A", "S60.512A", "S00.83XA",
  "Z23", "Z71.3", "Z79.4",
  "B34.9", "A09", "H66.90", "L20.9",
];

const STATUSES = ["pending", "in_progress", "paid", "denied"];

const MEDICAL_NOTES = [
  "Patient called about claim status",
  "Submitted via clearinghouse",
  "Awaiting EOB from payer",
  "Claim in adjudication queue",
  "Denial appeal in progress",
  "Resubmitted with corrected modifier",
  "Patient verified eligibility on file",
  "Coordination of benefits required",
  "Provider re-attested NPI",
  "Authorized prior to service",
  "Out-of-network benefit applied",
  "Secondary insurance billed next",
  "Awaiting medical records request",
  "Payment posted to AR",
  "Patient responsibility transferred to statement",
  "Claim returned for missing diagnosis pointer",
  "Reviewed by coding QA team",
  "Status check call scheduled",
  "Held pending W9 verification",
  "EOB reconciled, no balance due",
];

function generateMedicalClaims(count) {
  const headers = [
    "Claim Number",
    "Patient First Name",
    "Patient Last Name",
    "Patient DOB",
    "Member ID",
    "Insurance",
    "CPT Codes",
    "ICD-10 Codes",
    "Amount",
    "Date of Service",
    "Status",
    "Notes",
  ];

  const rows = [headers];
  for (let i = 0; i < count; i++) {
    const insurer = pick(MEDICAL_INSURERS);
    const cptCount = intBetween(1, 3);
    const icdCount = intBetween(1, 3);
    // Status mix: weight more pending/in_progress for a realistic AR queue
    const statusBag = [
      "pending", "pending", "pending",
      "in_progress", "in_progress",
      "paid", "paid",
      "denied",
    ];
    const status = pick(statusBag);

    const claimNum = `CLM-2026-${pad(50100 + i, 5)}`;
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    const dob = randomDOB(18, 80);
    const memberId = insurer.memberPrefix();
    const cpt = pickN(CPT_CODES, cptCount).join(", ");
    const icd = pickN(ICD10_CODES, icdCount).join(", ");
    const amount = moneyBetween(50, 5000);
    const dosOffset = -intBetween(1, 120);
    const dos = fmtDate(dateOffsetFromToday(dosOffset));
    const note = pick(MEDICAL_NOTES);

    rows.push([
      claimNum,
      firstName,
      lastName,
      dob,
      memberId,
      insurer.name,
      cpt,
      icd,
      amount,
      dos,
      status,
      note,
    ]);
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────
// Dental EV cases data
// ─────────────────────────────────────────────────────────────
const DENTAL_INSURERS = [
  {
    name: "Delta Dental",
    memberPrefix: () => "DD" + intBetween(10000000, 99999999),
    plans: ["Delta PPO Premier", "Delta PPO Standard", "Delta DeltaCare USA HMO"],
  },
  {
    name: "MetLife Dental",
    memberPrefix: () => "M" + intBetween(100000000, 999999999),
    plans: ["MetLife High Option", "MetLife Standard Option", "MetLife PDP Plus"],
  },
  {
    name: "Cigna Dental",
    memberPrefix: () => "C" + intBetween(100000000, 999999999),
    plans: ["Cigna Dental Preferred", "Cigna DPPO Advantage", "Cigna DHMO"],
  },
  {
    name: "Aetna Dental",
    memberPrefix: () => "A" + intBetween(100000000, 999999999),
    plans: ["Aetna DMO", "Aetna PPO Max", "Aetna Vital Savings"],
  },
  {
    name: "United Concordia",
    memberPrefix: () => "UC" + intBetween(10000000, 99999999),
    plans: ["United Concordia FFS", "United Concordia Advantage Plus", "United Concordia Elite"],
  },
];

const CDT_CODES = [
  "D0150", "D0210", "D0220", "D0274", "D0330",
  "D1110", "D1120", "D1206", "D1351",
  "D2140", "D2330", "D2391", "D2392", "D2740", "D2750",
  "D3220", "D3310", "D3320", "D3330",
  "D4341", "D4342", "D4910",
  "D5110", "D5120", "D5213",
  "D6010", "D6056", "D6240",
  "D7140", "D7210", "D7220",
  "D8080", "D9230",
];

const DENTAL_NOTES = [
  "Pre-treatment estimate requested",
  "Patient new to practice",
  "Verifying annual maximum remaining",
  "Coordination with primary insurance pending",
  "Awaiting attachment X-rays",
  "Patient changing employers next month",
  "Frequency limitation check needed",
  "Waiting period applies for major work",
  "Verify deductible status before scheduling",
  "Dual coverage on file",
  "Confirm orthodontic lifetime max",
  "Patient requested pre-D for crown",
  "Out-of-network benefit verification",
  "Active orthodontic case",
  "Previous restoration replacement check",
  "Patient updating address with payer",
  "Periodontal frequency verification",
  "Bridge replacement age check",
  "Implant exclusion review",
  "Missing tooth clause may apply",
];

function generateDentalEVCases(count) {
  const headers = [
    "Case Number",
    "Patient First Name",
    "Patient Last Name",
    "Patient DOB",
    "Member ID",
    "Group Number",
    "Plan Name",
    "Insurance",
    "Provider NPI",
    "CDT Codes",
    "Proposed Date of Service",
    "Notes",
  ];

  const rows = [headers];
  for (let i = 0; i < count; i++) {
    const insurer = pick(DENTAL_INSURERS);
    const caseNum = `EV-2026-${pad(30100 + i, 5)}`;
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    const dob = randomDOB(18, 80);
    const memberId = insurer.memberPrefix();
    const groupNum = `GRP-${intBetween(10000, 99999)}`;
    const planName = pick(insurer.plans);
    const npi = String(intBetween(1000000000, 1999999999));
    const cdtCount = intBetween(1, 3);
    const cdt = pickN(CDT_CODES, cdtCount).join(", ");
    // Proposed DOS within next 30 days
    const dos = fmtDate(dateOffsetFromToday(intBetween(1, 30)));
    const note = pick(DENTAL_NOTES);

    rows.push([
      caseNum,
      firstName,
      lastName,
      dob,
      memberId,
      groupNum,
      planName,
      insurer.name,
      npi,
      cdt,
      dos,
      note,
    ]);
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────
// Writers
// ─────────────────────────────────────────────────────────────
function writeXLSX(rows, sheetName, filename) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  // Reasonable column widths
  ws["!cols"] = rows[0].map((h) => ({
    wch: Math.max(12, Math.min(28, String(h).length + 4)),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
  const filePath = path.join(OUT_DIR, filename);
  fs.writeFileSync(filePath, buf);
  return filePath;
}

function writeCSV(rows, filename) {
  // Use sheet_to_csv for proper escaping (quotes, commas, newlines).
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const filePath = path.join(OUT_DIR, filename);
  fs.writeFileSync(filePath, csv);
  return filePath;
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  console.log("Generating demo bulk-import data...\n");

  const medical = generateMedicalClaims(50);
  const xlsxA = writeXLSX(medical, "Medical Claims", "medical-claims-demo-50.xlsx");
  const csvA = writeCSV(medical, "medical-claims-demo-50.csv");
  console.log("  Created:", xlsxA);
  console.log("  Created:", csvA);

  const dental = generateDentalEVCases(30);
  const xlsxB = writeXLSX(dental, "Dental EV Cases", "dental-ev-cases-demo-30.xlsx");
  const csvB = writeCSV(dental, "dental-ev-cases-demo-30.csv");
  console.log("  Created:", xlsxB);
  console.log("  Created:", csvB);

  console.log("\nDone.");
  console.log(`  Medical claims: ${medical.length - 1} rows`);
  console.log(`  Dental EV cases: ${dental.length - 1} rows`);
}

main();
