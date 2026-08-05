const XLSX = require("xlsx");
const path = require("path");

const OUTPUT_DIR = __dirname;

// ─────────────────────────────────────────────────────────────
// 1. test-claims-standard.xlsx
// ─────────────────────────────────────────────────────────────
function createStandardFile() {
  const headers = [
    "Claim Number",
    "Patient Name",
    "DOB",
    "Member ID",
    "Group Number",
    "Insurance Company",
    "Billed Amount",
    "Date of Service",
    "CPT Codes",
    "Status",
  ];

  const rows = [
    [
      "CLM-2026-00101",
      "John Smith",
      "1985-03-15",
      "W123456789",
      "GRP-88401",
      "Aetna",
      1250.00,
      "2026-01-10",
      "99213",
      "Pending",
    ],
    [
      "CLM-2026-00102",
      "John Smith",
      "1985-03-15",
      "W123456789",
      "GRP-88401",
      "Aetna",
      8750.50,
      "2026-01-18",
      "99284, 71046",
      "Approved",
    ],
    [
      "CLM-2026-00103",
      "John Smith",
      "1985-03-15",
      "W123456789",
      "GRP-88401",
      "Aetna",
      525.00,
      "2026-02-01",
      "99395",
      "Denied",
    ],
    [
      "CLM-2026-00104",
      "John Smith",
      "1985-03-15",
      "W123456789",
      "GRP-88401",
      "Aetna",
      14800.00,
      "2026-02-05",
      "27447",
      "In Review",
    ],
    [
      "CLM-2026-00105",
      "John Smith",
      "1985-03-15",
      "W123456789",
      "GRP-88401",
      "Aetna",
      3200.75,
      "2026-02-12",
      "99214, 80053",
      "Approved",
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = headers.map(() => ({ wch: 18 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Claims");

  const filePath = path.join(OUTPUT_DIR, "test-claims-standard.xlsx");
  XLSX.writeFile(wb, filePath);
  console.log("Created:", filePath);
}

// ─────────────────────────────────────────────────────────────
// 2. test-claims-weird-format.xlsx
// ─────────────────────────────────────────────────────────────
function createWeirdFormatFile() {
  const headers = [
    "CLM_NO",
    "PT_FIRST",
    "PT_LAST",
    "BIRTH_DT",
    "INS_MBR_ID",
    "GRP_NO",
    "PAYER",
    "CHRG_AMT",
    "SVC_DT",
    "PROC_CD",
    "CLM_STAT",
  ];

  const rows = [
    [
      "A-990341",
      "Maria",
      "Garcia",
      "07/22/1978",
      "UHC-5501882",
      "G-4410",
      "UnitedHealthcare",
      "$1,475.00",
      "01/05/2026",
      "99283",
      "PEND",
    ],
    [
      "A-990342",
      "Robert",
      "Chen",
      "11/03/1992",
      "BC-7783201",
      "G-5520",
      "Blue Cross Blue Shield",
      "$6250.00",
      "01/14/2026",
      "43239",
      "APPR",
    ],
    [
      "A-990343",
      "Tanisha",
      "Williams",
      "02/14/1965",
      "CIG-3309981",
      "G-7788",
      "Cigna",
      "$890.50",
      "01/28/2026",
      "99214",
      "DENY",
    ],
    [
      "A-990344",
      "James",
      "O'Brien",
      "09/30/1988",
      "AET-1124450",
      "G-3301",
      "Aetna",
      "$12,340.00",
      "02/03/2026",
      "27130",
      "REVW",
    ],
    [
      "A-990345",
      "Priya",
      "Patel",
      "04/17/2001",
      "HUM-6678432",
      "G-9902",
      "Humana",
      "$3,100",
      "02/10/2026",
      "99285, 72148",
      "PEND",
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = headers.map(() => ({ wch: 20 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "CLAIMS_EXPORT");

  const filePath = path.join(OUTPUT_DIR, "test-claims-weird-format.xlsx");
  XLSX.writeFile(wb, filePath);
  console.log("Created:", filePath);
}

// ─────────────────────────────────────────────────────────────
// 3. test-claims-minimal.xlsx
// ─────────────────────────────────────────────────────────────
function createMinimalFile() {
  const headers = ["claim_id", "patient", "insurance", "amount", "dos"];

  const rows = [
    ["10001", "Sarah Johnson", "Aetna", 750, "2026-01-20"],
    ["10002", "Michael Davis", "Cigna", 2300, "01/30/2026"],
    ["10003", "Lisa Nguyen", "Blue Cross", 480.25, "Feb 8, 2026"],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = headers.map(() => ({ wch: 16 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

  const filePath = path.join(OUTPUT_DIR, "test-claims-minimal.xlsx");
  XLSX.writeFile(wb, filePath);
  console.log("Created:", filePath);
}

// ─────────────────────────────────────────────────────────────
// Run all generators
// ─────────────────────────────────────────────────────────────
console.log("Generating test Excel files...\n");

createStandardFile();
createWeirdFormatFile();
createMinimalFile();

console.log("\nDone. All 3 test files created.");
