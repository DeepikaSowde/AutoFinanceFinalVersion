// src/services/customerRepository.js
//
// Owns the customer/vehicle/rc/guarantor/loan aggregate. Reads assemble the
// same nested { customer, vehicle, rc, guarantor, loan, loans[] } shape the
// React app consumes, so UI code needs no reshaping.

import { query, withTransaction } from "../db/connection.js";
import { calculateLoan } from "./loanCalculator.js";
import { generateRepaymentSchedule } from "./repaymentSchedule.js";
import { describeInstallment, summariseOutstanding } from "./repaymentEngine.js";

const pad = (number, length = 5) => String(number).padStart(length, "0");

const emptyDocuments = () => ({ requiredMinimum: 2, selectedTypes: [], uploads: [] });
const emptyPhoto = () => ({ fileName: "", fileData: "" });

// jsonb comes back already parsed; this only guards against nulls.
const obj = (value, fallback = {}) => value ?? fallback;

const iso = (value) => (value ? new Date(value).toISOString() : "");

/* =========================================================
   ROW -> API SHAPE
========================================================= */

const mapCustomer = (row) => ({
  id: row.id,
  customerNumber: row.customer_number,
  status: row.status,
  personal: obj(row.personal),
  kyc: obj(row.kyc),
  documents: obj(row.documents, emptyDocuments()),
  photo: obj(row.photo, emptyPhoto()),
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});

export const mapVehicle = (row) => {
  if (!row) return {};

  return {
    id: row.id,
    vehicleId: row.id,
    vehicleType: row.vehicle_type || "",
    brand: row.brand || "",
    model: row.model || "",
    variant: row.variant || "",
    colour: row.colour || "",
    manufacturingYear: row.manufacturing_year || "",
    fuelType: row.fuel_type || "",
    vehicleValue: row.vehicle_value || 0,
    photo: row.photo ?? {},
    status: row.status,
    seizure: row.seizure ?? null,
    release: row.release ?? null,
    sale: row.sale ?? null,
  };
};

const mapRc = (row) => {
  if (!row) return {};

  return {
    rcBookNumber: row.rc_book_number || "",
    registrationNumber: row.registration_number || "",
    location: row.location || "",
    dateOfRegistration: row.date_of_registration || "",
    chassisNumber: row.chassis_number || "",
    engineNumber: row.engine_number || "",
    existingFinancier: row.existing_financier || "None",
    hypothecation: Boolean(row.hypothecation),
    taxExpiry: row.tax_expiry || "",
    permitExpiry: row.permit_expiry || "",
    fcExpiry: row.fc_expiry || "",
    insurance: obj(row.insurance),
    endorsement: obj(row.endorsement, { enabled: false }),
    remarks: row.remarks || "",
  };
};

const mapGuarantor = (row) => {
  if (!row) return { hasGuarantor: false };

  return {
    hasGuarantor: Boolean(row.has_guarantor),
    personal: obj(row.personal),
    kyc: obj(row.kyc),
    documents: obj(row.documents, emptyDocuments()),
    photo: obj(row.photo, emptyPhoto()),
  };
};

const mapLoan = (row, installmentRows, allocationRows, previousLoanRow) => {
  if (!row) return {};

  const schedule = installmentRows.map((installment) => describeInstallment(installment));
  const outstanding = summariseOutstanding(schedule);

  return {
    id: row.id,
    loanNumber: row.loan_number,
    vehicleAmount: row.vehicle_amount,
    downPayment: row.down_payment,
    loanAmount: row.loan_amount,
    funding: obj(row.funding),
    interest: { rate: row.interest_rate, type: row.interest_type },
    repayment: {
      method: row.repayment_method,
      frequency: row.repayment_frequency,
      tenure: row.tenure,
      tenureUnit: row.tenure_unit,
    },
    calculation: obj(row.calculation),
    firstDueDate: row.first_due_date || "",
    charges: obj(row.charges),
    collection: obj(row.collection),
    remarks: row.remarks || "",
    status: row.status,

    foreclosureStatus: row.foreclosure_status || "",
    foreclosedAt: iso(row.foreclosed_at),
    foreclosureReason: row.foreclosure_reason || "",

    previousLoanId: previousLoanRow?.id || "",
    previousLoanNumber: previousLoanRow?.loan_number || "",

    repaymentSchedule: schedule,
    paymentHistory: allocationRows.map((allocation) => ({
      id: allocation.id,
      collectionId: allocation.collection_id || "",
      loanId: row.id,
      loanNumber: row.loan_number,
      installment: allocation.installment_number,
      dueDate: allocation.due_date || "",
      amount: allocation.amount,
      type: allocation.type,
      isPenalty: Boolean(allocation.is_penalty),
      isInterest: Boolean(allocation.is_interest),
      isPrincipal: Boolean(allocation.is_principal),
      paidAt: iso(allocation.created_at),
    })),

    outstandingAmount: outstanding.outstanding,
    principalOutstanding: outstanding.principalOutstanding,
    interestOutstanding: outstanding.interestOutstanding,

    ...obj(row.repayment_meta),

    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
};

/* =========================================================
   LOOKUPS
========================================================= */

export const getCustomerRow = async (customerId) => {
  const result = await query("SELECT * FROM customers WHERE id = $1", [customerId]);

  return result.rows[0];
};

export const getVehicleRowForCustomer = async (customerPk) => {
  const result = await query("SELECT * FROM vehicles WHERE customer_pk = $1", [customerPk]);

  return result.rows[0];
};

const getRcRow = async (vehiclePk) => {
  if (!vehiclePk) return undefined;

  const result = await query("SELECT * FROM rc_details WHERE vehicle_pk = $1", [vehiclePk]);

  return result.rows[0];
};

const getGuarantorRow = async (customerPk) => {
  const result = await query("SELECT * FROM guarantors WHERE customer_pk = $1", [customerPk]);

  return result.rows[0];
};

export const getInstallmentRows = async (loanPk) => {
  const result = await query(
    "SELECT * FROM installments WHERE loan_pk = $1 ORDER BY installment_number ASC",
    [loanPk]
  );

  return result.rows;
};

const getAllocationRows = async (loanPk) => {
  const result = await query(
    `SELECT payment_allocations.*, collections.id AS collection_id
     FROM payment_allocations
     LEFT JOIN collections ON collections.pk = payment_allocations.collection_pk
     WHERE payment_allocations.loan_pk = $1
     ORDER BY payment_allocations.pk ASC`,
    [loanPk]
  );

  return result.rows;
};

export const buildLoan = async (loanRow) => {
  const [installmentRows, allocationRows, previousLoan] = await Promise.all([
    getInstallmentRows(loanRow.pk),
    getAllocationRows(loanRow.pk),
    loanRow.previous_loan_pk
      ? query("SELECT * FROM loans WHERE pk = $1", [loanRow.previous_loan_pk]).then(
          (r) => r.rows[0]
        )
      : Promise.resolve(undefined),
  ]);

  return mapLoan(loanRow, installmentRows, allocationRows, previousLoan);
};

export const buildCustomerRecord = async (customerRow) => {
  const [vehicleRow, guarantorRow, loanResult] = await Promise.all([
    getVehicleRowForCustomer(customerRow.pk),
    getGuarantorRow(customerRow.pk),
    query("SELECT * FROM loans WHERE customer_pk = $1 ORDER BY is_primary DESC, pk ASC", [
      customerRow.pk,
    ]),
  ]);

  const rcRow = await getRcRow(vehicleRow?.pk);
  const loans = await Promise.all(loanResult.rows.map(buildLoan));

  return {
    customer: mapCustomer(customerRow),
    vehicle: mapVehicle(vehicleRow),
    rc: mapRc(rcRow),
    guarantor: mapGuarantor(guarantorRow),
    loan: loans[0] || {},
    loans: loans.slice(1),
  };
};

/* =========================================================
   READS
========================================================= */

export const getCustomers = async () => {
  const result = await query("SELECT * FROM customers ORDER BY pk ASC");

  return Promise.all(result.rows.map(buildCustomerRecord));
};

export const getCustomerById = async (customerId) => {
  const row = await getCustomerRow(customerId);

  return row ? buildCustomerRecord(row) : null;
};

export const getLoans = async () => {
  const customers = await getCustomers();

  return customers.flatMap((record) =>
    [record.loan, ...(record.loans || [])]
      .filter((loan) => loan?.id)
      .map((loan) => ({
        ...loan,
        customerId: record.customer.id,
        customerNumber: record.customer.customerNumber,
        customerName: record.customer.personal?.name || "",
        mobileNumber: record.customer.personal?.mobileNumber || "",
        vehicle: record.vehicle,
        rc: record.rc,
      }))
  );
};

/* =========================================================
   WRITES — building blocks (all take a transaction client)
========================================================= */

const insertVehicle = async (client, customerPk, vehicle = {}) => {
  const result = await client.query(
    `INSERT INTO vehicles
      (id, customer_pk, vehicle_type, brand, model, variant, colour, manufacturing_year,
       fuel_type, vehicle_value, photo, status)
     VALUES ('', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ACTIVE')
     RETURNING pk`,
    [
      customerPk,
      vehicle.vehicleType || "",
      vehicle.brand || "",
      vehicle.model || "",
      vehicle.variant || "",
      vehicle.colour || "",
      String(vehicle.manufacturingYear || ""),
      vehicle.fuelType || "",
      Number(vehicle.vehicleValue) || 0,
      JSON.stringify(vehicle.photo || {}),
    ]
  );

  const vehiclePk = result.rows[0].pk;

  // Matches the frontend's existing VH-#### format.
  await client.query("UPDATE vehicles SET id = $1 WHERE pk = $2", [
    `VH-${pad(vehiclePk, 4)}`,
    vehiclePk,
  ]);

  return vehiclePk;
};

const rcValues = (rc = {}) => [
  rc.rcBookNumber || "",
  rc.registrationNumber || "",
  rc.location || "",
  rc.dateOfRegistration || "",
  rc.chassisNumber || "",
  rc.engineNumber || "",
  rc.existingFinancier || "None",
  Boolean(rc.hypothecation),
  rc.taxExpiry || "",
  rc.permitExpiry || "",
  rc.fcExpiry || "",
  JSON.stringify(rc.insurance || {}),
  JSON.stringify(rc.endorsement || { enabled: false }),
  rc.remarks || "",
];

const insertRc = (client, vehiclePk, rc) =>
  client.query(
    `INSERT INTO rc_details
      (vehicle_pk, rc_book_number, registration_number, location, date_of_registration,
       chassis_number, engine_number, existing_financier, hypothecation, tax_expiry,
       permit_expiry, fc_expiry, insurance, endorsement, remarks)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [vehiclePk, ...rcValues(rc)]
  );

const updateRc = (client, vehiclePk, rc) =>
  client.query(
    `UPDATE rc_details SET
      rc_book_number = $2, registration_number = $3, location = $4,
      date_of_registration = $5, chassis_number = $6, engine_number = $7,
      existing_financier = $8, hypothecation = $9, tax_expiry = $10,
      permit_expiry = $11, fc_expiry = $12, insurance = $13,
      endorsement = $14, remarks = $15
     WHERE vehicle_pk = $1`,
    [vehiclePk, ...rcValues(rc)]
  );

const guarantorValues = (guarantor = {}) => [
  Boolean(guarantor.hasGuarantor),
  JSON.stringify(guarantor.personal || {}),
  JSON.stringify(guarantor.kyc || {}),
  JSON.stringify(guarantor.documents || emptyDocuments()),
  JSON.stringify(guarantor.photo || emptyPhoto()),
];

const insertGuarantor = (client, customerPk, guarantor) =>
  client.query(
    `INSERT INTO guarantors (customer_pk, has_guarantor, personal, kyc, documents, photo)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [customerPk, ...guarantorValues(guarantor)]
  );

const updateGuarantor = (client, customerPk, guarantor) =>
  client.query(
    `UPDATE guarantors SET
      has_guarantor = $2, personal = $3, kyc = $4, documents = $5, photo = $6
     WHERE customer_pk = $1`,
    [customerPk, ...guarantorValues(guarantor)]
  );

const loanTerms = (loan = {}) => ({
  principal: Number(loan.loanAmount) || 0,
  rate: Number(loan.interest?.rate) || 0,
  tenure: Number(loan.repayment?.tenure) || 0,
  tenureUnit: loan.repayment?.tenureUnit || "Months",
  interestType: loan.interest?.type || "Flat",
  repaymentMethod: loan.repayment?.method || "EMI",
  frequency: loan.repayment?.frequency || "Monthly",
});

const insertInstallments = async (client, loanPk, loan) => {
  const schedule = generateRepaymentSchedule({
    ...loanTerms(loan),
    firstDueDate: loan.firstDueDate || "",
  });

  for (const row of schedule) {
    await client.query(
      `INSERT INTO installments
        (loan_pk, installment_number, due_date, opening_balance, principal, interest,
         payment_amount, closing_balance, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Pending')`,
      [
        loanPk,
        row.installmentNumber,
        row.dueDate,
        row.openingBalance,
        row.principal,
        row.interest,
        row.paymentAmount,
        row.closingBalance,
      ]
    );
  }

  return schedule.length;
};

export const insertLoan = async (client, customerPk, vehiclePk, loan = {}, options = {}) => {
  const terms = loanTerms(loan);

  // Loan figures are always recomputed here: a client-submitted
  // calculation is never trusted.
  const calculation = calculateLoan(terms);

  const result = await client.query(
    `INSERT INTO loans
      (id, loan_number, customer_pk, vehicle_pk, previous_loan_pk, is_primary,
       vehicle_amount, down_payment, loan_amount, interest_rate, interest_type,
       repayment_method, repayment_frequency, tenure, tenure_unit, first_due_date,
       calculation, charges, collection, funding, remarks, status)
     VALUES ('', '', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
             $15, $16, $17, $18, $19, $20)
     RETURNING pk`,
    [
      customerPk,
      vehiclePk ?? null,
      options.previousLoanPk ?? null,
      options.isPrimary !== false,
      Number(loan.vehicleAmount) || 0,
      Number(loan.downPayment) || 0,
      terms.principal,
      terms.rate,
      terms.interestType,
      terms.repaymentMethod,
      terms.frequency,
      terms.tenure,
      terms.tenureUnit,
      loan.firstDueDate || "",
      JSON.stringify({
        principal: calculation.principal,
        interestAmount: calculation.interest,
        totalDue: calculation.totalDue,
        emiAmount: calculation.emiAmount ?? 0,
        numberOfPayments: calculation.paymentCount,
        principalPerPayment: calculation.principalPerPayment ?? 0,
        interestPerPayment: calculation.interestPerPayment ?? 0,
        firstPayment: calculation.firstPayment ?? 0,
        lastPayment: calculation.lastPayment ?? 0,
        paymentAmount: calculation.paymentAmount ?? calculation.emiAmount ?? 0,
      }),
      JSON.stringify(loan.charges || {}),
      JSON.stringify(loan.collection || {}),
      JSON.stringify(loan.funding || {}),
      loan.remarks || "",
      loan.status || "Active",
    ]
  );

  const loanPk = result.rows[0].pk;
  const loanId = `LN-${pad(loanPk)}`;

  await client.query("UPDATE loans SET id = $1, loan_number = $1 WHERE pk = $2", [loanId, loanPk]);

  await insertInstallments(client, loanPk, loan);

  return loanPk;
};

/* =========================================================
   CUSTOMER CRUD
========================================================= */

export const createCustomer = async (payload = {}) => {
  const customerId = await withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO customers (id, customer_number, status, personal, kyc, documents, photo)
       VALUES ('', '', $1, $2, $3, $4, $5)
       RETURNING pk`,
      [
        payload.customer?.status || "Active",
        JSON.stringify(payload.customer?.personal || {}),
        JSON.stringify(payload.customer?.kyc || {}),
        JSON.stringify(payload.customer?.documents || emptyDocuments()),
        JSON.stringify(payload.customer?.photo || emptyPhoto()),
      ]
    );

    const customerPk = result.rows[0].pk;
    const id = `CUS-${pad(customerPk)}`;

    await client.query("UPDATE customers SET id = $1, customer_number = $1 WHERE pk = $2", [
      id,
      customerPk,
    ]);

    const vehiclePk = await insertVehicle(client, customerPk, payload.vehicle);
    await insertRc(client, vehiclePk, payload.rc);
    await insertGuarantor(client, customerPk, payload.guarantor || { hasGuarantor: false });
    await insertLoan(client, customerPk, vehiclePk, payload.loan || {});

    return id;
  });

  return getCustomerById(customerId);
};

export const updateCustomer = async (customerId, payload = {}) => {
  const customerRow = await getCustomerRow(customerId);

  if (!customerRow) {
    return null;
  }

  const existing = await buildCustomerRecord(customerRow);

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE customers SET
        status = $2, personal = $3, kyc = $4, documents = $5, photo = $6, updated_at = now()
       WHERE pk = $1`,
      [
        customerRow.pk,
        payload.customer?.status || existing.customer.status,
        JSON.stringify({ ...existing.customer.personal, ...(payload.customer?.personal || {}) }),
        JSON.stringify({ ...existing.customer.kyc, ...(payload.customer?.kyc || {}) }),
        JSON.stringify({ ...existing.customer.documents, ...(payload.customer?.documents || {}) }),
        JSON.stringify({ ...existing.customer.photo, ...(payload.customer?.photo || {}) }),
      ]
    );

    const vehicleRow = await getVehicleRowForCustomer(customerRow.pk);

    if (vehicleRow && payload.vehicle) {
      const merged = { ...existing.vehicle, ...payload.vehicle };

      await client.query(
        `UPDATE vehicles SET
          vehicle_type = $2, brand = $3, model = $4, variant = $5, colour = $6,
          manufacturing_year = $7, fuel_type = $8, vehicle_value = $9, photo = $10, updated_at = now()
         WHERE pk = $1`,
        [
          vehicleRow.pk,
          merged.vehicleType || "",
          merged.brand || "",
          merged.model || "",
          merged.variant || "",
          merged.colour || "",
          String(merged.manufacturingYear || ""),
          merged.fuelType || "",
          Number(merged.vehicleValue) || 0,
          JSON.stringify(merged.photo || {}),
        ]
      );
    }

    if (vehicleRow && payload.rc) {
      await updateRc(client, vehicleRow.pk, {
        ...existing.rc,
        ...payload.rc,
        insurance: { ...existing.rc.insurance, ...(payload.rc.insurance || {}) },
        endorsement: { ...existing.rc.endorsement, ...(payload.rc.endorsement || {}) },
      });
    }

    if (payload.guarantor) {
      await updateGuarantor(client, customerRow.pk, {
        ...existing.guarantor,
        ...payload.guarantor,
        personal: { ...existing.guarantor.personal, ...(payload.guarantor.personal || {}) },
        kyc: { ...existing.guarantor.kyc, ...(payload.guarantor.kyc || {}) },
        documents: { ...existing.guarantor.documents, ...(payload.guarantor.documents || {}) },
        photo: { ...existing.guarantor.photo, ...(payload.guarantor.photo || {}) },
      });
    }

    // Loan terms are deliberately not editable here: changing them would
    // invalidate an already-running repayment schedule. Only descriptive
    // fields and status move.
    if (payload.loan && existing.loan?.id) {
      await client.query(
        `UPDATE loans SET
          remarks = $2, status = $3, funding = $4, charges = $5, updated_at = now()
         WHERE id = $1`,
        [
          existing.loan.id,
          payload.loan.remarks ?? existing.loan.remarks ?? "",
          payload.loan.status || existing.loan.status,
          JSON.stringify({ ...existing.loan.funding, ...(payload.loan.funding || {}) }),
          JSON.stringify({ ...existing.loan.charges, ...(payload.loan.charges || {}) }),
        ]
      );
    }
  });

  return getCustomerById(customerId);
};

export const deleteCustomer = async (customerId) => {
  const result = await query("DELETE FROM customers WHERE id = $1", [customerId]);

  return result.rowCount > 0;
};

/*
 * Additional loan against an existing customer (the re-loan path).
 */
export const addLoanForCustomer = async (customerId, loan = {}) => {
  const customerRow = await getCustomerRow(customerId);

  if (!customerRow) {
    return null;
  }

  const [vehicleRow, previousLoan] = await Promise.all([
    getVehicleRowForCustomer(customerRow.pk),
    query("SELECT * FROM loans WHERE customer_pk = $1 ORDER BY pk DESC LIMIT 1", [
      customerRow.pk,
    ]).then((r) => r.rows[0]),
  ]);

  await withTransaction((client) =>
    insertLoan(client, customerRow.pk, vehicleRow?.pk ?? null, loan, {
      isPrimary: false,
      previousLoanPk: previousLoan?.pk ?? null,
    })
  );

  return getCustomerById(customerId);
};
