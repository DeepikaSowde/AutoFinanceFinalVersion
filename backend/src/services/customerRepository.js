// src/services/customerRepository.js
//
// Owns the customer/vehicle/rc/guarantor/loan aggregate. Reads assemble the
// same nested { customer, vehicle, rc, guarantor, loan, loans[] } shape the
// React app consumes, so UI code needs no reshaping.

import { query, withTransaction } from "../db/connection.js";
import { currentTenantId } from "../db/tenantContext.js";
import { calculateLoan } from "./loanCalculator.js";
import { generateRepaymentSchedule } from "./repaymentSchedule.js";
import { fundLoanInTransaction } from "./investorRepository.js";
import { syncDocumentChargeIncome, deleteDocumentChargeIncomes } from "./incomeRepository.js";
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
    // New / Second-hand / Third-hand.
    ownershipType: row.ownership_type || "",
    photo: row.photo ?? {},
    status: row.status,
    seizure: row.seizure ?? null,
    release: row.release ?? null,
    sale: row.sale ?? null,
  };
};

// Status changes (seized, released, sold, ...) in the order they happened.
const mapVehicleEvent = (row) => ({
  ...(row.details ?? {}),
  id: row.id,
  type: row.event_type,
  fromStatus: row.from_status,
  toStatus: row.to_status,
  performedBy: row.performed_by || "",
  createdAt: iso(row.created_at),
});

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
  const result = await query("SELECT * FROM customers WHERE id = $1 AND tenant_id = $2", [customerId, currentTenantId()]);

  return result.rows[0];
};

// A customer can hold several vehicles (a re-loan on another vehicle adds
// one); each loan points at its own. This is the first one, used where only
// one is meant (editing the customer without naming a vehicle).
export const getVehicleRowForCustomer = async (customerPk) => {
  const result = await query("SELECT * FROM vehicles WHERE customer_pk = $1 ORDER BY pk ASC LIMIT 1", [customerPk]);

  return result.rows[0];
};

const getVehicleRowsForCustomer = async (customerPk) => {
  const result = await query("SELECT * FROM vehicles WHERE customer_pk = $1 ORDER BY pk ASC", [customerPk]);

  return result.rows;
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

const buildVehicle = async (vehicleRow) => {
  const [rcRow, eventRows] = await Promise.all([
    getRcRow(vehicleRow.pk),
    query("SELECT * FROM vehicle_events WHERE vehicle_pk = $1 ORDER BY pk ASC", [vehicleRow.pk]).then((r) => r.rows),
  ]);

  return { pk: vehicleRow.pk, vehicle: { ...mapVehicle(vehicleRow), events: eventRows.map(mapVehicleEvent) }, rc: mapRc(rcRow) };
};

/*
 * record.vehicle / record.rc are the first loan's vehicle (the customer's
 * first vehicle), as before. Every loan also carries the vehicle and RC it
 * was taken on (loan.vehicle / loan.rc), and record.vehicles lists them all.
 */
export const buildCustomerRecord = async (customerRow) => {
  const [vehicleRows, guarantorRow, loanResult] = await Promise.all([
    getVehicleRowsForCustomer(customerRow.pk),
    getGuarantorRow(customerRow.pk),
    query("SELECT * FROM loans WHERE customer_pk = $1 ORDER BY is_primary DESC, pk ASC", [
      customerRow.pk,
    ]),
  ]);

  const [vehicles, builtLoans] = await Promise.all([
    Promise.all(vehicleRows.map(buildVehicle)),
    Promise.all(loanResult.rows.map(buildLoan)),
  ]);
  const byPk = new Map(vehicles.map((item) => [item.pk, item]));
  const first = byPk.get(loanResult.rows[0]?.vehicle_pk) || vehicles[0];
  const loans = builtLoans.map((loan, index) => {
    const own = byPk.get(loanResult.rows[index].vehicle_pk) || first;
    return { ...loan, vehicleId: own?.vehicle.id || "", vehicle: own?.vehicle || {}, rc: own?.rc || mapRc() };
  });

  return {
    customer: mapCustomer(customerRow),
    vehicle: first?.vehicle || {},
    rc: first?.rc || mapRc(),
    vehicles: vehicles.map(({ vehicle, rc }) => ({ ...vehicle, rc })),
    guarantor: mapGuarantor(guarantorRow),
    loan: loans[0] || {},
    loans: loans.slice(1),
  };
};

/* =========================================================
   READS
========================================================= */

export const getCustomers = async () => {
  const result = await query("SELECT * FROM customers WHERE tenant_id = $1 ORDER BY pk ASC", [currentTenantId()]);

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
        vehicle: loan.vehicle || record.vehicle,
        rc: loan.rc || record.rc,
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
       fuel_type, vehicle_value, photo, status, tenant_id, ownership_type)
     VALUES ('', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ACTIVE', $11, $12)
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
      currentTenantId(),
      vehicle.ownershipType || "",
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
       calculation, charges, collection, funding, remarks, status, tenant_id)
     VALUES ('', '', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
             $15, $16, $17, $18, $19, $20, $21)
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
      currentTenantId(),
    ]
  );

  const loanPk = result.rows[0].pk;
  const loanId = `LN-${pad(loanPk)}`;

  await client.query("UPDATE loans SET id = $1, loan_number = $1 WHERE pk = $2", [loanId, loanPk]);

  await insertInstallments(client, loanPk, loan);
  await syncDocumentChargeIncome(client, loanPk);

  return loanPk;
};

/* =========================================================
   CUSTOMER CRUD
========================================================= */

// New Loan asks for the principal to be drawn from the investor pool; doing
// it in the same transaction means an unfunded loan is never left behind.
const fundIfRequested = (client, loanPk, loan = {}) =>
  loan.fundFromPool
    ? fundLoanInTransaction(client, {
        amount: Number(loan.loanAmount) || 0,
        loanPk,
        date: loan.disbursementDate || new Date().toISOString().slice(0, 10),
      })
    : null;

export const createCustomer = async (payload = {}) => {
  const customerId = await withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO customers (id, customer_number, status, personal, kyc, documents, photo, tenant_id)
       VALUES ('', '', $1, $2, $3, $4, $5, $6)
       RETURNING pk`,
      [
        payload.customer?.status || "Active",
        JSON.stringify(payload.customer?.personal || {}),
        JSON.stringify(payload.customer?.kyc || {}),
        JSON.stringify(payload.customer?.documents || emptyDocuments()),
        JSON.stringify(payload.customer?.photo || emptyPhoto()),
        currentTenantId(),
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
    const loanPk = await insertLoan(client, customerPk, vehiclePk, payload.loan || {});
    await fundIfRequested(client, loanPk, payload.loan);

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

    // payload.vehicleId picks which of the customer's vehicles to edit (the first by default).
    const targetId = payload.vehicleId || payload.vehicle?.vehicleId;
    const target = targetId ? (existing.vehicles || []).find((item) => item.id === targetId) : null;
    if (targetId && !target) {
      throw Object.assign(new Error("That vehicle does not belong to this customer."), { statusCode: 400 });
    }
    const vehicleRow = target
      ? (await client.query("SELECT * FROM vehicles WHERE id = $1 AND customer_pk = $2", [target.id, customerRow.pk])).rows[0]
      : await getVehicleRowForCustomer(customerRow.pk);
    const currentVehicle = target || existing.vehicle;
    const currentRc = target?.rc || existing.rc;

    if (vehicleRow && payload.vehicle) {
      const { vehicleId: _ignored, ...vehicleFields } = payload.vehicle;
      const merged = { ...currentVehicle, ...vehicleFields };

      await client.query(
        `UPDATE vehicles SET
          vehicle_type = $2, brand = $3, model = $4, variant = $5, colour = $6,
          manufacturing_year = $7, fuel_type = $8, vehicle_value = $9, photo = $10,
          ownership_type = $11, updated_at = now()
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
          merged.ownershipType || "",
        ]
      );
    }

    if (vehicleRow && payload.rc) {
      await updateRc(client, vehicleRow.pk, {
        ...currentRc,
        ...payload.rc,
        insurance: { ...currentRc.insurance, ...(payload.rc.insurance || {}) },
        endorsement: { ...currentRc.endorsement, ...(payload.rc.endorsement || {}) },
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
         WHERE id = $1 AND tenant_id = $6`,
        [
          existing.loan.id,
          payload.loan.remarks ?? existing.loan.remarks ?? "",
          payload.loan.status || existing.loan.status,
          JSON.stringify({ ...existing.loan.funding, ...(payload.loan.funding || {}) }),
          JSON.stringify({ ...existing.loan.charges, ...(payload.loan.charges || {}) }),
          currentTenantId(),
        ]
      );

      // A changed document charge updates (or removes) its income entry.
      const loanPk = await client.query("SELECT pk FROM loans WHERE id = $1 AND tenant_id = $2", [
        existing.loan.id,
        currentTenantId(),
      ]);
      if (loanPk.rows[0]) await syncDocumentChargeIncome(client, loanPk.rows[0].pk);
    }
  });

  return getCustomerById(customerId);
};

export const deleteCustomer = async (customerId) =>
  withTransaction(async (client) => {
    // Their loans go with them (cascade), so their document-charge income too.
    const loans = await client.query(
      `SELECT l.id FROM loans l JOIN customers c ON c.pk = l.customer_pk
       WHERE c.id = $1 AND c.tenant_id = $2`,
      [customerId, currentTenantId()]
    );
    await deleteDocumentChargeIncomes(client, loans.rows.map((r) => r.id));

    const result = await client.query("DELETE FROM customers WHERE id = $1 AND tenant_id = $2", [
      customerId,
      currentTenantId(),
    ]);

    return result.rowCount > 0;
  });

const normalRegNo = (value) => String(value || "").replace(/\s+/g, "").toUpperCase();

/*
 * Additional loan against an existing customer (the re-loan path). The loan
 * goes on:
 *   - options.vehicleId, one of the customer's vehicles; else
 *   - the customer's vehicle with options.rc's registration number; else
 *   - a new vehicle from options.vehicle / options.rc, added to this customer;
 *   - with none of those, the vehicle of the customer's latest loan.
 */
export const addLoanForCustomer = async (customerId, loan = {}, options = {}) => {
  const customerRow = await getCustomerRow(customerId);

  if (!customerRow) {
    return null;
  }

  const [vehicleRows, previousLoan] = await Promise.all([
    getVehicleRowsForCustomer(customerRow.pk),
    query("SELECT * FROM loans WHERE customer_pk = $1 ORDER BY pk DESC LIMIT 1", [
      customerRow.pk,
    ]).then((r) => r.rows[0]),
  ]);

  let vehiclePk = null;
  let newVehicle = false;

  if (options.vehicleId) {
    const named = vehicleRows.find((row) => row.id === options.vehicleId);
    if (!named) {
      throw Object.assign(new Error("That vehicle does not belong to this customer."), { statusCode: 400 });
    }
    vehiclePk = named.pk;
  } else if (normalRegNo(options.rc?.registrationNumber)) {
    const regNo = normalRegNo(options.rc.registrationNumber);
    const rcRows = vehicleRows.length
      ? (await query("SELECT vehicle_pk, registration_number FROM rc_details WHERE vehicle_pk = ANY($1)", [
          vehicleRows.map((row) => row.pk),
        ])).rows
      : [];
    const match = rcRows.find((row) => normalRegNo(row.registration_number) === regNo);
    if (match) vehiclePk = match.vehicle_pk;
    else newVehicle = true;
  } else if (options.vehicle && Object.keys(options.vehicle).length) {
    newVehicle = true;
  } else {
    vehiclePk = previousLoan?.vehicle_pk ?? vehicleRows[0]?.pk ?? null;
  }

  if (vehiclePk) {
    const held = vehicleRows.find((row) => row.pk === vehiclePk);
    if (held && held.status === "SOLD") {
      throw Object.assign(new Error("This vehicle has been sold; a new loan needs another vehicle."), {
        statusCode: 409,
      });
    }
  }

  await withTransaction(async (client) => {
    if (newVehicle) {
      vehiclePk = await insertVehicle(client, customerRow.pk, options.vehicle || {});
      await insertRc(client, vehiclePk, options.rc || {});
    }

    const loanPk = await insertLoan(client, customerRow.pk, vehiclePk, loan, {
      isPrimary: false,
      previousLoanPk: previousLoan?.pk ?? null,
    });
    await fundIfRequested(client, loanPk, loan);
  });

  return getCustomerById(customerId);
};
