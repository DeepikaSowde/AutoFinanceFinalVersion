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

// Function modeling CustomerView's customerLoans useMemo logic
function computeCustomerLoans(allData, customerId, initialLoanId, allPayments = []) {
  if (!allData || allData.length === 0) {
    return [];
  }

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

  if (!targetRecord && !customerId) {
    return [];
  }

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
      if (!cIdLower || cIdLower !== targetCIdLower) {
        return false;
      }

      const dName = d.customer?.name?.trim().toLowerCase();
      if (targetName && dName && targetName !== dName) {
        return false;
      }

      const dAadhaar = d.customer?.aadhaarNo?.trim();
      if (targetAadhaar && dAadhaar && targetAadhaar !== dAadhaar) {
        return false;
      }

      const dMobile = d.customer?.mobile?.trim();
      if (targetMobile && dMobile && targetMobile.length >= 10 && dMobile.length >= 10 && targetMobile !== dMobile) {
        return false;
      }

      if (targetCIdLower === "cus-000" && targetName && dName !== targetName) {
        return false;
      }

      return true;
    })
    .map(({ d, lId, cId }) => ({
      ...d,
      customerId: cId,
      loanId: lId,
    }));
}

console.log("=== Comprehensive MotoLend Loan-Card Mapping Acceptance Suite ===\n");

// Acceptance Test Data Setup:
// Loan #1: Person 1
// Loan #2: Person 2
// Loan #3: Customer A (Single Loan)
// Loan #4: Customer B (Single Loan)
// Loan #5: Customer C (Loan 1)
// Loan #6: Customer C (Loan 2 - Genuine Re-loan)
const mockAllData = [
  { loanId: "LN-001", customerId: "CUS-001", customer: { name: "First Person", mobile: "9876500001" } },
  { loanId: "LN-002", customerId: "CUS-002", customer: { name: "Second Person", mobile: "9876500002" } },
  { loanId: "LN-003", customerId: "CUS-003", customer: { name: "Customer A", mobile: "9876500003", aadhaarNo: "1111-2222-3333" } },
  { loanId: "LN-004", customerId: "CUS-004", customer: { name: "Customer B", mobile: "9876500004", aadhaarNo: "4444-5555-6666" } },
  { loanId: "LN-005", customerId: "CUS-005", customer: { name: "Customer C", mobile: "9876500005", aadhaarNo: "7777-8888-9999" } },
  { loanId: "LN-006", customerId: "CUS-005", customer: { name: "Customer C", mobile: "9876500005", aadhaarNo: "7777-8888-9999" } },
];

// Acceptance Test 1: Customer A has one loan, Loan #3: opening it displays only Loan #3
const test1Loans = computeCustomerLoans(mockAllData, "CUS-003", "LN-003");
assert(test1Loans.length === 1, "Acceptance Test 1: Opening Loan #3 displays exactly 1 loan card");
assert(test1Loans[0].loanId === "LN-003", "Acceptance Test 1: Displayed card is Loan #3");

// Acceptance Test 2: Customer B has one loan, Loan #4: opening it displays only Loan #4
const test2Loans = computeCustomerLoans(mockAllData, "CUS-004", "LN-004");
assert(test2Loans.length === 1, "Acceptance Test 2: Opening Loan #4 displays exactly 1 loan card");
assert(test2Loans[0].loanId === "LN-004", "Acceptance Test 2: Displayed card is Loan #4");

// Acceptance Test 3: Opening Customer A must never show Customer B's loan
assert(!test1Loans.some(l => l.loanId === "LN-004"), "Acceptance Test 3: Customer A never displays Customer B's Loan #4");
assert(!test2Loans.some(l => l.loanId === "LN-003"), "Acceptance Test 3: Customer B never displays Customer A's Loan #3");

// Acceptance Test 4: A customer with two genuine loans should see both of their actual loan cards, with correct selected loan
const test4LoansOpening5 = computeCustomerLoans(mockAllData, "CUS-005", "LN-005");
assert(test4LoansOpening5.length === 2, "Acceptance Test 4: Customer C with genuine re-loan displays both loan cards");
assert(test4LoansOpening5.some(l => l.loanId === "LN-005") && test4LoansOpening5.some(l => l.loanId === "LN-006"), "Acceptance Test 4: Both LN-005 and LN-006 cards are present");
assert(!test4LoansOpening5.some(l => l.loanId === "LN-003" || l.loanId === "LN-004"), "Acceptance Test 4: Neither Customer A nor Customer B loans appear for Customer C");

const test4LoansOpening6 = computeCustomerLoans(mockAllData, "CUS-005", "LN-006");
assert(test4LoansOpening6.length === 2, "Acceptance Test 4: Opening LN-006 displays both LN-005 and LN-006 cards");

// Acceptance Test 5: Selecting another loan updates the selected loan
let selectedLoanId = "LN-005";
let activeLoan = test4LoansOpening5.find(l => l.loanId === selectedLoanId);
assert(activeLoan.loanId === "LN-005", "Acceptance Test 5: Initially LN-005 is selected and active");
selectedLoanId = "LN-006";
activeLoan = test4LoansOpening5.find(l => l.loanId === selectedLoanId);
assert(activeLoan.loanId === "LN-006", "Acceptance Test 5: Clicking second loan updates selected active loan to LN-006");

// Robustness Test: Colliding IDs and missing IDs
const mockCollidingData = [
  { customer: { name: "Customer Alpha" } }, // Will get LN-001, CUS-001
  { customer: { name: "Customer Beta" } },  // Will get LN-002, CUS-002
  { customerId: "CUS-000", customer: { name: "Customer A" } }, // LN-003
  { customerId: "CUS-000", customer: { name: "Customer B" } }, // LN-004
];
const testCollidingA = computeCustomerLoans(mockCollidingData, "CUS-000", "LN-003");
assert(testCollidingA.length === 1 && testCollidingA[0].loanId === "LN-003", "Robustness Test: Shared CUS-000 ID does not cause Customer B to show in Customer A view");

const testCollidingB = computeCustomerLoans(mockCollidingData, "CUS-000", "LN-004");
assert(testCollidingB.length === 1 && testCollidingB[0].loanId === "LN-004", "Robustness Test: Shared CUS-000 ID does not cause Customer A to show in Customer B view");

console.log(`\nAll Acceptance Tests Completed: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
