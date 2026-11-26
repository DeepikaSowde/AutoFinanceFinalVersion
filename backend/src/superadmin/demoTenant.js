// src/superadmin/demoTenant.js
//
// One-click free demo for a prospective lender: a tenant on the product's
// Premium plan that runs for DEMO_DAYS, its admin login, and (Auto Finance)
// a handful of made-up customers, vehicles, loans and collections so the
// screens are not empty. Nothing here touches another tenant's data; the
// sample records are created inside this tenant only, with invented names,
// numbers and vehicles.

import { query, withTransaction } from "../db/connection.js";
import { runWithTenant } from "../db/tenantContext.js";
import { createCustomer } from "../services/customerRepository.js";
import { createCollection } from "../services/collectionRepository.js";
import { createInvestor } from "../services/investorRepository.js";
import { writeAudit } from "./audit.js";
import { createTenant, createTenantAdmin, getTenant } from "./tenantRepository.js";
import * as v from "./validate.js";

export const DEMO_DAYS = 30;

/* ---------- dates (India time, as the app counts days) ---------- */

const istToday = () => new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

const addDays = (isoDate, days) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/* ---------- the sample book ---------- */

// Offsets are in days from today, so the demo always looks current: some
// loans on time, some overdue, one closed. `pay` is how many installments,
// from the first, were collected on their due dates.
const SAMPLE_LOANS = [
  { name: "Murugan Selvam", vehicle: ["Two Wheeler", "Honda", "Activa 6G", "2024", 80000], principal: 70000, frequency: "Monthly", tenure: 12, firstDueOffset: -75, pay: 2 },
  { name: "Lakshmi Priya", vehicle: ["Two Wheeler", "TVS", "Jupiter", "2025", 65000], principal: 50000, frequency: "Monthly", tenure: 10, firstDueOffset: 20, pay: 0 },
  { name: "Karthik Raja", vehicle: ["Three Wheeler", "Bajaj", "Maxima", "2023", 150000], principal: 100000, frequency: "Weekly", tenure: 5, firstDueOffset: -28, pay: 5 },
  { name: "Meena Devi", vehicle: ["Two Wheeler", "Royal Enfield", "Classic 350", "2022", 120000], principal: 60000, frequency: "Monthly", tenure: 4, firstDueOffset: -100, pay: 4 },
  { name: "Senthil Kumar", vehicle: ["Two Wheeler", "Hero", "Splendor Plus", "2024", 70000], principal: 45000, frequency: "Monthly", tenure: 18, firstDueOffset: -10, pay: 1 },
  { name: "Anbu Selvi", vehicle: ["Four Wheeler", "Maruti Suzuki", "Alto", "2021", 250000], principal: 150000, frequency: "Monthly", tenure: 24, firstDueOffset: -50, pay: 0 },
];

const seedSampleData = async (collector) => {
  const today = istToday();

  // Money for the loans to be drawn from.
  await createInvestor({
    name: "Demo Investor",
    mobileNumber: "9000000100",
    investment: { initialAmount: 1500000, investmentDate: addDays(today, -120), investmentMode: "Bank Transfer" },
    remarks: "Sample data",
  });

  let collections = 0;

  for (const [index, sample] of SAMPLE_LOANS.entries()) {
    const n = index + 1;
    const [type, brand, model, year, vehicleValue] = sample.vehicle;
    const downPayment = vehicleValue - sample.principal;

    const record = await createCustomer({
      customer: {
        status: "Active",
        personal: {
          name: sample.name,
          // Taken a month before the first due date, never before the investment.
          date: addDays(today, Math.max(Math.min(sample.firstDueOffset, 0) - 30, -118)),
          countryCode: "+91",
          mobileNumber: `90000001${String(n).padStart(2, "0")}`,
          address: `${10 + n}, Gandhi Street, Dindigul`,
          area: "Dindigul",
          pincode: "624001",
        },
      },
      vehicle: { vehicleType: type, brand, model, colour: "Black", manufacturingYear: year, fuelType: "Petrol", vehicleValue, ownershipType: "New" },
      // A made-up but valid-format chassis number (no I, O or Q).
      rc: { registrationNumber: `TN09DM${String(1000 + n)}`, chassisNumber: `MBLHA10EZ9DEMX${String(n).padStart(3, "0")}` },
      loan: {
        vehicleAmount: vehicleValue,
        downPayment,
        loanAmount: sample.principal,
        interest: { rate: 2, type: "Flat" },
        repayment: { method: "EMI", frequency: sample.frequency, tenure: sample.tenure, tenureUnit: "Months" },
        firstDueDate: addDays(today, sample.firstDueOffset),
        charges: {},
        status: "Active",
        fundFromPool: true,
        // A month before the first due date, but never before the investment.
        disbursementDate: addDays(today, Math.max(Math.min(sample.firstDueOffset, 0) - 30, -118)),
      },
    });

    if (!sample.pay) continue;

    const installments = (
      await query(
        `SELECT installment_number, due_date, payment_amount FROM installments
          WHERE loan_pk = (SELECT pk FROM loans WHERE id = $1) ORDER BY installment_number ASC LIMIT $2`,
        [record.loan.id, sample.pay]
      )
    ).rows;

    for (const row of installments) {
      await createCollection(
        {
          loanId: record.loan.id,
          customerId: record.customer.id,
          amount: Number(row.payment_amount),
          dueAmount: Number(row.payment_amount),
          totalPayable: Number(row.payment_amount),
          installment: row.installment_number,
          dueDate: row.due_date,
          payMode: "Cash",
          collectedDate: `${String(row.due_date).slice(0, 10)}T10:00:00+05:30`,
          clientRef: `demo-${record.loan.id}-${row.installment_number}`,
          remarks: "Sample data",
        },
        collector
      );
      collections += 1;
    }
  }

  return { customers: SAMPLE_LOANS.length, loans: SAMPLE_LOANS.length, collections };
};

/* ---------- the demo tenant ---------- */

export const createDemoTenant = async (input, actor) => {
  const name = v.text(input.name, "Lender name", { required: true, max: 180 });
  const ownerName = v.text(input.ownerName, "Owner name");
  const phone = v.phone(input.phone);
  const email = v.email(input.email, "Email", { required: true });
  const product = input.product ? v.oneOf(input.product, "Product", v.PRODUCTS) : "auto_finance";
  const withSampleData = input.withSampleData !== false && product === "auto_finance";

  const plan = (
    await query(
      `SELECT id FROM plans WHERE product = $1 AND is_active
        ORDER BY (code = 'premium') DESC, id DESC LIMIT 1`,
      [product]
    )
  ).rows[0];
  if (!plan) throw v.badRequest("There is no active plan for this product.");

  const validUntil = addDays(istToday(), DEMO_DAYS);
  const demoName = /\bdemo\b/i.test(name) ? name : `${name} (Demo)`;

  const tenant = await createTenant({ name: demoName, ownerName, phone, email, product, planId: plan.id, validUntil }, actor);
  const admin = await createTenantAdmin(tenant.id, { name: ownerName || name, email }, actor);

  let sampleData = { created: false };
  if (withSampleData) {
    try {
      const collector = { userId: admin.user.id, name: admin.user.name, role: "admin" };
      const counts = await runWithTenant(tenant.id, () => seedSampleData(collector));
      sampleData = { created: true, ...counts };
    } catch (error) {
      console.error("Demo sample data failed:", error);
      sampleData = { created: false, error: error.message };
    }
  }

  await withTransaction((client) =>
    writeAudit(client, {
      actorId: actor.id,
      action: "tenant.demo_created",
      tenantId: tenant.id,
      details: { days: DEMO_DAYS, validUntil, sampleData: sampleData.created },
    })
  );

  return { tenant: await getTenant(tenant.id), admin, days: DEMO_DAYS, sampleData };
};
