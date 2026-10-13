// Test script to verify the loan mapping and filtering logic for CustomerView

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passed++;
  } else {
    console.error(`[FAIL] ${testName}`);
    failed++;
  }
}

// Logic implementations to test
const extractRecordLoanId = (record, index) => {
  if (!record || typeof record !== 'object') return null;
  const rawLoanId = record.loanId || record.loan?.loanId;
  if (rawLoanId && typeof rawLoanId === 'string' && rawLoanId.trim()) {
    return rawLoanId.trim();
  }
  if (index !== undefined && index !== null && index >= 0) {
    return `LN-${String(index + 1).padStart(3, "0")}`;
  }
  return null;
};

const extractRecordCustomerId = (record, index) => {
  if (!record || typeof record !== 'object') return null;
  const rawId = record.customerId || record.customer?.customerId;
  if (rawId && typeof rawId === 'string' && rawId.trim()) {
    return rawId.trim();
  }
  const mobile = record.customer?.mobile || record.mobile;
  if (mobile && typeof mobile === 'string' && mobile.trim().length >= 5) {
    const cleanMobile = mobile.trim();
    if (!/^0+$/.test(cleanMobile.slice(-5))) {
      return `CUS-${cleanMobile.slice(-5)}`;
    }
  }
  if (index !== undefined && index !== null && index >= 0) {
    return `CUS-${String(index + 1).padStart(3, "0")}`;
  }
  return null;
};

function getCustomerLoans({ allData, customerId, initialLoanId }) {
  if (!allData || allData.length === 0) return [];

  let targetRecord = null;
  let targetIndex = -1;
  if (initialLoanId && typeof initialLoanId === "string" && initialLoanId.trim()) {
    const cleanInitialLoanId = initialLoanId.trim().toLowerCase();
    targetIndex = allData.findIndex((d, idx) => {
      const lId = extractRecordLoanId(d, idx);
      return lId && lId.toLowerCase() === cleanInitialLoanId;
    });
    if (targetIndex >= 0) {
      targetRecord = allData[targetIndex];
    }
  }

  if (!targetRecord && customerId && typeof customerId === "string" && customerId.trim()) {
    const cleanCId = customerId.trim().toLowerCase();
    targetIndex = allData.findIndex((d, idx) => {
      const cId = extractRecordCustomerId(d, idx);
      return cId && cId.toLowerCase() === cleanCId;
    });
    if (targetIndex >= 0) {
      targetRecord = allData[targetIndex];
    }
  }

  if (!targetRecord && !customerId) return [];

  const effectiveTargetCId = targetRecord
    ? (extractRecordCustomerId(targetRecord, targetIndex) || customerId)
    : customerId;
  const targetCIdLower = effectiveTargetCId ? effectiveTargetCId.trim().toLowerCase() : "";
  const targetName = targetRecord?.customer?.name?.trim().toLowerCase();
  const targetAadhaar = targetRecord?.customer?.aadhaarNo?.trim();
  const targetMobile = targetRecord?.customer?.mobile?.trim();

  const mappedRecords = allData.map((d, index) => {
    const lId = extractRecordLoanId(d, index) || `LN-${String(index + 1).padStart(3, "0")}`;
    const cId = extractRecordCustomerId(d, index) || effectiveTargetCId;
    return { d, index, lId, cId };
  });

  return mappedRecords
    .filter(({ d, lId, cId }) => {
      if (targetRecord && d === targetRecord) return true;
      if (initialLoanId && lId && lId.toLowerCase() === initialLoanId.trim().toLowerCase()) return true;
      if (!targetCIdLower) return false;

      const cIdLower = (cId || "").trim().toLowerCase();
      if (!cIdLower || cIdLower !== targetCIdLower) return false;

      const dName = d.customer?.name?.trim().toLowerCase();
      if (targetName && dName && targetName !== dName) return false;

      const dAadhaar = d.customer?.aadhaarNo?.trim();
      if (targetAadhaar && dAadhaar && targetAadhaar !== dAadhaar) return false;

      const dMobile = d.customer?.mobile?.trim();
      if (targetMobile && dMobile && targetMobile.length >= 10 && dMobile.length >= 10 && targetMobile !== dMobile) return false;

      if (targetCIdLower === "cus-000" && targetName && dName !== targetName) return false;

      return true;
    })
    .map(({ d, lId, cId }) => ({
      ...d,
      customerId: cId,
      loanId: lId,
    }));
}

console.log("=== Running Acceptance Tests for Loan Mapping & CustomerView ===\n");

// Scenario 1:
// Customer A has 1 loan (Loan #3, LN-003)
// Customer B has 1 loan (Loan #4, LN-004)
// Both have distinct customer IDs
const dataScenario1 = [
  { loanId: "LN-001", customerId: "CUS-001", customer: { name: "First Person" } },
  { loanId: "LN-002", customerId: "CUS-002", customer: { name: "Second Person" } },
  { loanId: "LN-003", customerId: "CUS-003", customer: { name: "Customer A", mobile: "9876500003" } },
  { loanId: "LN-004", customerId: "CUS-004", customer: { name: "Customer B", mobile: "9876500004" } },
];

// Test 1: Clicking Loan #3 opens only Loan #3
const res1 = getCustomerLoans({ allData: dataScenario1, customerId: "CUS-003", initialLoanId: "LN-003" });
assert(res1.length === 1, "Acceptance Test 1: Customer A has exactly 1 loan card");
assert(res1[0].loanId === "LN-003", "Acceptance Test 1: Customer A's loan card is Loan #3");

// Test 2: Clicking Loan #4 opens only Loan #4
const res2 = getCustomerLoans({ allData: dataScenario1, customerId: "CUS-004", initialLoanId: "LN-004" });
assert(res2.length === 1, "Acceptance Test 2: Customer B has exactly 1 loan card");
assert(res2[0].loanId === "LN-004", "Acceptance Test 2: Customer B's loan card is Loan #4");

// Test 3: Opening Customer A must never show Customer B's loan
assert(!res1.some(l => l.loanId === "LN-004"), "Acceptance Test 3: Opening Customer A never shows Loan #4");
assert(!res2.some(l => l.loanId === "LN-003"), "Acceptance Test 3: Opening Customer B never shows Loan #3");

// Scenario 2:
// Customer A and Customer B both had missing or colliding customer IDs (e.g. CUS-000 from empty mobile)
const dataScenarioCollidingIds = [
  { loanId: "LN-001", customerId: "CUS-000", customer: { name: "Other 1" } },
  { loanId: "LN-002", customerId: "CUS-000", customer: { name: "Other 2" } },
  { loanId: "LN-003", customerId: "CUS-000", customer: { name: "Customer A" } },
  { loanId: "LN-004", customerId: "CUS-000", customer: { name: "Customer B" } },
];

const resColliding3 = getCustomerLoans({ allData: dataScenarioCollidingIds, customerId: "CUS-000", initialLoanId: "LN-003" });
assert(resColliding3.length === 1, "Colliding ID Test: Loan #3 has only 1 card despite shared CUS-000 ID");
assert(resColliding3[0].loanId === "LN-003", "Colliding ID Test: Only Loan #3 card is returned");

const resColliding4 = getCustomerLoans({ allData: dataScenarioCollidingIds, customerId: "CUS-000", initialLoanId: "LN-004" });
assert(resColliding4.length === 1, "Colliding ID Test: Loan #4 has only 1 card despite shared CUS-000 ID");
assert(resColliding4[0].loanId === "LN-004", "Colliding ID Test: Only Loan #4 card is returned");

// Scenario 3: Genuine Re-loans
// Customer A has Loan #3 and later receives genuine re-loan Loan #5
const dataScenarioReloan = [
  { loanId: "LN-001", customerId: "CUS-001", customer: { name: "Customer X" } },
  { loanId: "LN-003", customerId: "CUS-003", customer: { name: "Customer A", mobile: "9876543210" } },
  { loanId: "LN-004", customerId: "CUS-004", customer: { name: "Customer B", mobile: "9123456789" } },
  { loanId: "LN-005", customerId: "CUS-003", customer: { name: "Customer A", mobile: "9876543210" } },
];

const resReloan = getCustomerLoans({ allData: dataScenarioReloan, customerId: "CUS-003", initialLoanId: "LN-003" });
assert(resReloan.length === 2, "Acceptance Test 4: Genuine re-loan customer sees both loan cards");
assert(resReloan.some(l => l.loanId === "LN-003") && resReloan.some(l => l.loanId === "LN-005"), "Acceptance Test 4: Cards represent LN-003 and LN-005");
assert(!resReloan.some(l => l.loanId === "LN-004"), "Acceptance Test 4: Customer B's loan LN-004 is NOT included");

// Scenario 4: Records without explicit loanId (fallback generated from index)
const dataScenarioFallbackIds = [
  { customer: { name: "Person 1" } }, // LN-001
  { customer: { name: "Person 2" } }, // LN-002
  { customer: { name: "Customer A" } }, // LN-003
  { customer: { name: "Customer B" } }, // LN-004
];

const resFallback3 = getCustomerLoans({ allData: dataScenarioFallbackIds, customerId: "CUS-003", initialLoanId: "LN-003" });
assert(resFallback3.length === 1, "Fallback index Test: Loan #3 returns exactly 1 card");
assert(resFallback3[0].loanId === "LN-003", "Fallback index Test: Card has correct generated ID LN-003");

const resFallback4 = getCustomerLoans({ allData: dataScenarioFallbackIds, customerId: "CUS-004", initialLoanId: "LN-004" });
assert(resFallback4.length === 1, "Fallback index Test: Loan #4 returns exactly 1 card");
assert(resFallback4[0].loanId === "LN-004", "Fallback index Test: Card has correct generated ID LN-004");

console.log(`\nTests Completed: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
