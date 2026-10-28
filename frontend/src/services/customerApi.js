import { apiGet, apiPost } from './api'

// The API keeps customers relationally (customer, vehicle + RC, guarantor,
// loans with installments). The New Loan form and the Customer pages work
// with one flat "entry" per loan, shaped like the onboarding form plus a few
// loan figures. This module converts between the two.
//
// Every onboarding field is stored, either in a real column or in the
// free-form JSON alongside it, so an entry read back matches what was typed.
// Uploaded KYC documents keep their metadata only; the server does not store
// document images. The vehicle photo is kept in full.

/* ---------- files ---------- */

const fileMeta = (file, type) =>
  file ? { type, fileName: file.name || '', fileType: file.type || '', fileSize: file.size || 0 } : null

// Fixed KYC files plus any "additional documents" (each with a title).
const uploadsFrom = (section, kinds) => [
  ...kinds.map(([field, type]) => fileMeta(section[field], type)).filter(Boolean),
  ...(Array.isArray(section.additionalDocs) ? section.additionalDocs : [])
    .filter((doc) => doc?.file)
    .map((doc) => ({ ...fileMeta(doc.file, 'additional'), title: doc.title || 'Document' })),
]

const additionalDocsFrom = (uploads = []) =>
  uploads
    .filter((upload) => upload.type === 'additional')
    .map((upload, index) => ({
      id: `doc_${index + 1}`,
      title: upload.title || 'Document',
      file: { name: upload.fileName, type: upload.fileType, size: upload.fileSize, data: '' },
    }))

const fileFrom = (uploads = [], type) => {
  const found = uploads.find((upload) => upload.type === type)
  return found ? { name: found.fileName, type: found.fileType, size: found.fileSize, data: '' } : null
}

const photoFrom = (photo) =>
  photo?.fileData ? { name: photo.fileName, type: photo.fileType, size: photo.fileSize, data: photo.fileData } : null

const KYC_FILES = [
  ['aadhaarFile', 'aadhaar'],
  ['panFile', 'pan'],
  ['dlFile', 'drivingLicence'],
  ['voterFile', 'voterId'],
]

/* ---------- form -> API ---------- */

const toKyc = (section) => ({
  aadhaarNumber: section.aadhaarNo || '',
  panNumber: section.panNo || '',
  drivingLicenceNumber: section.dlNo || '',
  voterIdNumber: section.voterNo || '',
})

const toCustomer = (customer) => ({
  status: 'Active',
  personal: {
    date: customer.applicationDate || '',
    name: (customer.name || '').trim(),
    countryCode: customer.countryCode || '+91',
    mobileNumber: customer.mobile || '',
    profession: customer.profession || '',
    residenceType: customer.residenceType || '',
    ownHouse: customer.residenceType ? customer.residenceType === 'Own House' : null,
    referredBy: customer.referredBy || '',
    referredByPercentage: customer.referredByPercentage || '',
    address: customer.address || '',
    area: customer.area || '',
    landmark: customer.landmark || '',
    pincode: customer.pincode || '',
  },
  kyc: toKyc(customer),
  documents: { requiredMinimum: 2, selectedTypes: [], uploads: uploadsFrom(customer, KYC_FILES) },
})

const toVehicle = (vehicle) => ({
  vehicleType: vehicle.type || '',
  brand: vehicle.brand || '',
  model: vehicle.model || '',
  variant: vehicle.variant || '',
  colour: vehicle.colour || '',
  manufacturingYear: vehicle.year || '',
  fuelType: vehicle.fuelType || '',
  vehicleValue: Number(vehicle.amount) || 0,
  ownershipType: vehicle.ownershipType || '',
  photo: vehicle.photo
    ? {
        fileName: vehicle.photo.name || '',
        fileType: vehicle.photo.type || '',
        fileSize: vehicle.photo.size || 0,
        fileData: vehicle.photo.data || '',
        uploadedAt: new Date().toISOString(),
      }
    : {},
})

const toRc = (vehicle) => ({
  registrationNumber: (vehicle.regNo || '').toUpperCase(),
  location: vehicle.rto || '',
  dateOfRegistration: vehicle.regDate || '',
  chassisNumber: vehicle.chassisNo || '',
  engineNumber: vehicle.engineNo || '',
  hypothecation: vehicle.hypothecation === 'Yes',
  existingFinancier: vehicle.financier || 'None',
  taxExpiry: vehicle.taxExpiry || '',
  insurance: {
    companyName: vehicle.insuranceCompany || '',
    policyNumber: vehicle.policyNo || '',
    expiryDate: vehicle.insuranceExpiry || '',
    document: fileMeta(vehicle.insuranceFile, 'insurance') || {},
  },
  // NOC and endorsement both concern the existing financier.
  endorsement: {
    enabled: vehicle.financierEndorsement === 'Yes',
    nocStatus: vehicle.nocStatus || '',
    nocDocument: fileMeta(vehicle.nocFile, 'noc'),
  },
  remarks: vehicle.remarks || '',
})

// Which of guarantor / referral the loan form chose ("none", "both",
// "guarantor", "referral"). Older forms said "required: Yes" instead.
const relationshipOptionOf = (form) => form.loan?.relationshipOption || (form.guarantor?.required === 'Yes' ? 'guarantor' : 'none')
// Guarantor details that were filled in count even if the option was left
// unset — they must not be silently dropped (Oviya's "missed guarantor" fix).
const guarantorEntered = (form) =>
  Boolean((form.guarantor?.fullName || form.guarantor?.name || form.guarantor?.phone || form.guarantor?.mobile || '').trim())
export const hasGuarantorIn = (form) => ['both', 'guarantor'].includes(relationshipOptionOf(form)) || guarantorEntered(form)
const hasReferralIn = (form) => ['both', 'referral'].includes(relationshipOptionOf(form))

const toGuarantor = (guarantor, hasGuarantor = guarantor.required === 'Yes') => ({
  hasGuarantor,
  personal: {
    // The register record this guarantor was picked from, if any.
    guarantorId: guarantor.guarantorId || '',
    name: guarantor.name || guarantor.fullName || '',
    countryCode: guarantor.countryCode || '+91',
    mobileNumber: guarantor.mobile || guarantor.phone || '',
    relationship: guarantor.relationship || '',
    profession: guarantor.profession || '',
    residenceType: guarantor.residenceType || '',
    ownHouse: guarantor.residenceType ? guarantor.residenceType === 'Own House' : null,
    address: guarantor.address || '',
    area: guarantor.area || '',
    landmark: guarantor.landmark || '',
    pincode: guarantor.pincode || '',
    kycRequired: guarantor.kycRequired || '',
    verificationStatus: guarantor.verificationStatus || '',
    remarks: guarantor.remarks || '',
  },
  kyc: toKyc({ ...guarantor, aadhaarNo: guarantor.aadhaarNo || guarantor.aadhaarNumber }),
  documents: { requiredMinimum: 2, selectedTypes: [], uploads: uploadsFrom(guarantor, KYC_FILES) },
  photo: guarantor.photo ? { fileName: guarantor.photo.name || '', fileData: '' } : { fileName: '', fileData: '' },
})

// The amount lent: the Loan Amount as entered (the Loan tab fills it with
// vehicle amount less down payment, and the user may edit it), otherwise
// vehicle amount less down payment.
export const principalOf = (form) => {
  const entered = form.loan.loanAmount
  if (entered !== '' && entered !== null && entered !== undefined && Number.isFinite(Number(entered))) {
    return Math.max(0, Number(entered))
  }
  const vehicleAmount =
    form.loan.vehicleAmount !== null && form.loan.vehicleAmount !== '' && form.loan.vehicleAmount !== undefined
      ? Number(form.loan.vehicleAmount)
      : Number(form.vehicle.amount || 0)
  return Math.max(vehicleAmount - Number(form.loan.downPayment || 0), 0)
}

// The referrer as noted on the loan. The register keeps the person and the
// commission record; this copy lets the loan show who referred it.
const toReferral = (form) => {
  const referral = form.referral || {}
  if (!hasReferralIn(form)) {
    return { referredBy: form.loan.referredBy || '', commission: form.loan.referredByCommission || '' }
  }
  const percentage = Number(referral.commissionPercentage) || 0
  const amount = Number(referral.commissionAmount) || (percentage > 0 ? Math.round((principalOf(form) * percentage) / 100) : 0)
  return {
    referredBy: (referral.fullName || referral.name || '').trim(),
    phone: (referral.phone || referral.mobile || '').trim(),
    referralId: referral.referralId || referral.id || '',
    percentage,
    commission: amount || '',
    payCommission: referral.payCommission === true,
    paymentMode: referral.paymentMode || 'Cash',
  }
}

const toLoan = (form) => {
  const { loan } = form
  return {
    vehicleAmount:
      loan.vehicleAmount !== null && loan.vehicleAmount !== '' && loan.vehicleAmount !== undefined
        ? Number(loan.vehicleAmount)
        : Number(form.vehicle.amount || 0),
    downPayment: Number(loan.downPayment) || 0,
    loanAmount: principalOf(form),
    interest: { rate: Number(loan.interestRate) || 0, type: loan.interestType || 'Flat' },
    repayment: {
      method: loan.repaymentMethod || 'EMI',
      frequency: loan.paymentFrequency || 'Monthly',
      tenure: Number(loan.tenure) || 0,
      tenureUnit: loan.tenureUnit || 'Months',
    },
    firstDueDate: loan.firstDueDate || '',
    charges: {
      documentCharge: Number(loan.documentCharge) || 0,
      customizeRules: Boolean(loan.customizeRules),
      graceDays: Number(loan.gracePeriod) || 0,
      penalty: {
        enabled: Boolean(loan.customizeRules),
        type: loan.penaltyType || '',
        amount: Number(loan.latePenalty) || 0,
      },
      referral: toReferral(form),
    },
    status: 'Active',
    // The server draws the principal from the investor pool in the same
    // transaction that creates the loan, or rejects the whole request.
    fundFromPool: true,
  }
}

/* ---------- API -> entry ---------- */

const fromKyc = (kyc = {}, uploads = []) => ({
  aadhaarNo: kyc.aadhaarNumber || '',
  aadhaarFile: fileFrom(uploads, 'aadhaar'),
  panNo: kyc.panNumber || '',
  panFile: fileFrom(uploads, 'pan'),
  dlNo: kyc.drivingLicenceNumber || '',
  dlFile: fileFrom(uploads, 'drivingLicence'),
  voterNo: kyc.voterIdNumber || '',
  voterFile: fileFrom(uploads, 'voterId'),
  additionalDocs: additionalDocsFrom(uploads),
})

// The Vehicles screens use Active / Seized / Released / Sold; a vehicle the
// server has moved to Pending Sale is still held, so it shows as Seized.
const VEHICLE_STATUS = { ACTIVE: 'Active', SEIZED: 'Seized', PENDING_SALE: 'Seized', RELEASED: 'Released', SOLD: 'Sold' }
const EVENT_STATUS = { ...VEHICLE_STATUS }

const seizureDetailsFrom = (seizure) =>
  seizure
    ? {
        seizureDate: (seizure.seizureDate || '').slice(0, 10),
        reason: seizure.reason || '',
        storageLocation: seizure.storageLocation || seizure.location || '',
        condition: seizure.condition || '',
        notes: seizure.notes || seizure.remarks || '',
        recordedAt: seizure.updatedAt || seizure.seizureDate || '',
      }
    : null

const releaseDetailsFrom = (release) =>
  release
    ? {
        releaseDate: (release.releaseDate || '').slice(0, 10),
        reason: release.reason || '',
        releasedTo: release.releasedTo || '',
        recipient: release.releasedTo || '',
        clearedAmount: release.clearedAmount ?? null,
        notes: release.notes || release.remarks || '',
        recordedAt: release.updatedAt || release.releaseDate || '',
      }
    : null

const saleDetailsFrom = (sale) =>
  sale?.saleStatus === 'SOLD'
    ? {
        saleDate: (sale.soldAt || '').slice(0, 10),
        salePrice: sale.salePrice,
        buyerName: sale.buyerName || '',
        buyerPhone: sale.buyerPhone || sale.buyerMobile || '',
        proceedsReceived: sale.netSaleProceeds ?? sale.salePrice,
        saleExpenses: Number(sale.saleExpenses) || 0,
        vehicleExpenses: Number(sale.saleExpenses) || 0,
        netSaleAmount: sale.netSaleProceeds ?? sale.salePrice,
        notes: sale.notes || sale.remarks || '',
        recordedAt: sale.updatedAt || sale.soldAt || '',
      }
    : null

const signedInr = (value) => `${value >= 0 ? '+' : '-'}₹${Math.abs(Math.round(Number(value) || 0)).toLocaleString('en-IN')}`

// The vehicle's history, newest first, in the shape the Vehicles screens show.
// A sale is followed by its "foreclosure finalized" entry (the loan closed
// with it); a settlement with the customer has no status change.
const statusHistoryFrom = (events = []) =>
  events
    .filter((event) => event.fromStatus !== event.toStatus || ['SEIZURE_UPDATED', 'SETTLEMENT'].includes(event.type))
    .flatMap((event) => {
      if (event.type === 'SETTLEMENT') {
        return [{ ...event, fromStatus: undefined, toStatus: undefined, eventType: 'settlement', date: event.createdAt, by: event.performedBy }]
      }
      const entry = {
        ...event,
        fromStatus: EVENT_STATUS[event.fromStatus] || event.fromStatus,
        toStatus: EVENT_STATUS[event.toStatus] || event.toStatus,
        date: event.createdAt,
        by: event.performedBy,
      }
      if (event.type !== 'SALE') return [entry]
      return [
        { ...entry, eventType: 'sale', saleAmount: event.salePrice, vehicleExpenses: event.saleExpenses },
        {
          vehicleId: event.vehicleId,
          eventType: 'foreclosure_completed',
          toStatus: 'Foreclosed',
          date: new Date(new Date(event.createdAt).getTime() + 1000).toISOString(),
          reason: `Foreclosure Finalized & Loan Account Closed. Status: Foreclosed. Profit/Loss: ${signedInr(event.profitLoss)}`,
          totalCost: event.totalForeclosureCost,
          salePrice: event.salePrice,
          netSettlement: 0,
          by: event.performedBy,
          performedBy: event.performedBy,
        },
      ]
    })
    .reverse()

// A sold vehicle's foreclosure: the sale, the cost worked out by the server
// when it was sold, and the settlement with the customer.
const foreclosureFrom = (sale) =>
  sale?.saleStatus === 'SOLD' && sale.finalizedCalculation
    ? {
        completedAt: sale.updatedAt || sale.soldAt,
        saleDate: (sale.soldAt || '').slice(0, 10),
        salePrice: Number(sale.salePrice) || 0,
        finalizedCalculation: sale.finalizedCalculation,
        settlement: sale.settlement || {},
        buyerName: sale.buyerName || '',
        buyerPhone: sale.buyerPhone || '',
        notes: sale.notes || '',
      }
    : null

const docAsFile = (meta) => (meta?.fileName ? { name: meta.fileName, type: meta.fileType, size: meta.fileSize, data: '' } : null)

// Installments in the shape the Collection screen works with.
const SCHEDULE_STATUS = { Paid: 'Collected', 'Partially Paid': 'Partial' }

// Which payments went to an installment, from the server's allocation records
// (one payment can be split across installments, and into interest/principal).
const allocationsByInstallment = (paymentHistory = []) => {
  const byInstallment = {}
  for (const part of paymentHistory) {
    const list = (byInstallment[part.installment] ||= [])
    let row = list.find((item) => item.id === part.collectionId)
    if (!row) {
      row = { id: part.collectionId, date: part.paidAt, amount: 0, principal: 0, interest: 0 }
      list.push(row)
    }
    row.amount += Number(part.amount) || 0
    if (part.isPrincipal) row.principal += Number(part.amount) || 0
    if (part.isInterest) row.interest += Number(part.amount) || 0
  }
  return byInstallment
}

// fromServer marks rows whose paid amounts already include every payment, so
// views must not apply payments to them a second time.
const toUiSchedule = (rows = [], paymentHistory = []) => {
  const allocations = allocationsByInstallment(paymentHistory)
  return rows.map((row) => ({
    installmentNumber: row.installmentNumber,
    dueDate: row.dueDate,
    emi: row.paymentAmount,
    amountPaid: row.paidAmount,
    principal: row.principal,
    interest: row.interest,
    principalPaid: row.paidPrincipal,
    interestPaid: row.paidInterest,
    // Interest waived by a midway closure, and whether the closure settled it.
    waivedInterest: row.waivedInterest || 0,
    closureAdjusted: Boolean(row.midwayClosed),
    isMidwayClosed: Boolean(row.midwayClosed),
    status: SCHEDULE_STATUS[row.status] || 'Pending',
    fromServer: true,
    allocations: allocations[row.installmentNumber] || [],
  }))
}

const nextDueDateOf = (loan) => {
  const unpaid = (loan.repaymentSchedule || []).find((row) => row.status !== 'Paid')
  return unpaid?.dueDate || ''
}

// The loan's referral, from its commission record when there is one.
const referralFrom = (charges, commission) => {
  const noted = charges.referral || {}
  const name = commission?.agentName || noted.referredBy || ''
  if (!name) return null
  return {
    name,
    fullName: name,
    phone: commission?.agentPhone || noted.phone || '',
    mobile: commission?.agentPhone || noted.phone || '',
    referralId: commission?.personId || noted.referralId || '',
    id: commission?.personId || noted.referralId || '',
    commissionId: commission?.id || '',
    commissionPercentage: Number(commission?.percentage ?? noted.percentage) || '',
    commissionAmount: Number(commission?.amount ?? noted.commission) || '',
    payCommission: commission ? commission.status === 'Paid' : noted.payCommission === true,
    paymentMode: commission?.paymentMode || noted.paymentMode || '',
  }
}

const toEntry = (record, loan, commissions = []) => {
  const personal = record.customer.personal || {}
  // Each loan carries the vehicle it was taken on (a customer can have several).
  const rc = loan.rc || record.rc || {}
  const vehicle = loan.vehicle || record.vehicle || {}
  const guarantor = record.guarantor || {}
  const gPersonal = guarantor.personal || {}
  const charges = loan.charges || {}
  const referral = referralFrom(charges, commissions.find((c) => c.loanId === loan.id))
  const hasGuarantor = Boolean(guarantor.hasGuarantor)

  return {
    customer: {
      customerId: record.customer.id,
      applicationDate: personal.date || '',
      name: personal.name || '',
      countryCode: personal.countryCode || '+91',
      mobile: personal.mobileNumber || '',
      profession: personal.profession || '',
      residenceType: personal.residenceType || '',
      referredBy: personal.referredBy || '',
      referredByPercentage: personal.referredByPercentage || '',
      address: personal.address || '',
      area: personal.area || '',
      landmark: personal.landmark || '',
      pincode: personal.pincode || '',
      ...fromKyc(record.customer.kyc, record.customer.documents?.uploads),
    },
    vehicleStatus: VEHICLE_STATUS[vehicle.status] || 'Active',
    statusHistory: statusHistoryFrom(vehicle.events),
    vehicle: {
      vehicleId: vehicle.id || '',
      status: VEHICLE_STATUS[vehicle.status] || 'Active',
      seizureDetails: seizureDetailsFrom(vehicle.seizure),
      releaseDetails: releaseDetailsFrom(vehicle.release),
      saleDetails: saleDetailsFrom(vehicle.sale),
      statusHistory: statusHistoryFrom(vehicle.events),
      type: vehicle.vehicleType || '',
      brand: vehicle.brand || '',
      model: vehicle.model || '',
      variant: vehicle.variant || '',
      colour: vehicle.colour || '',
      year: vehicle.manufacturingYear || '',
      fuelType: vehicle.fuelType || '',
      amount: vehicle.vehicleValue || '',
      ownershipType: vehicle.ownershipType || '',
      photo: photoFrom(vehicle.photo),
      regNo: rc.registrationNumber || '',
      rto: rc.location || '',
      regDate: rc.dateOfRegistration || '',
      chassisNo: rc.chassisNumber || '',
      engineNo: rc.engineNumber || '',
      hypothecation: rc.hypothecation ? 'Yes' : 'No',
      financier: rc.existingFinancier && rc.existingFinancier !== 'None' ? rc.existingFinancier : '',
      nocStatus: rc.endorsement?.nocStatus || '',
      nocFile: docAsFile(rc.endorsement?.nocDocument),
      taxExpiry: rc.taxExpiry || '',
      insuranceCompany: rc.insurance?.companyName || '',
      policyNo: rc.insurance?.policyNumber || '',
      insuranceExpiry: rc.insurance?.expiryDate || '',
      financierEndorsement: rc.endorsement?.enabled ? 'Yes' : 'No',
      insuranceFile: docAsFile(rc.insurance?.document),
      remarks: rc.remarks || '',
    },
    guarantor: {
      required: guarantor.hasGuarantor ? 'Yes' : 'No',
      guarantorId: gPersonal.guarantorId || '',
      name: gPersonal.name || '',
      fullName: gPersonal.name || '',
      countryCode: gPersonal.countryCode || '+91',
      mobile: gPersonal.mobileNumber || '',
      phone: gPersonal.mobileNumber || '',
      aadhaarNumber: guarantor.kyc?.aadhaarNumber || '',
      relationship: gPersonal.relationship || '',
      profession: gPersonal.profession || '',
      residenceType: gPersonal.residenceType || '',
      address: gPersonal.address || '',
      area: gPersonal.area || '',
      landmark: gPersonal.landmark || '',
      pincode: gPersonal.pincode || '',
      kycRequired: gPersonal.kycRequired || '',
      verificationStatus: gPersonal.verificationStatus || '',
      remarks: gPersonal.remarks || '',
      photo: null,
      ...fromKyc(guarantor.kyc, guarantor.documents?.uploads),
    },
    loan: {
      vehicleAmount: loan.vehicleAmount,
      loanAmount: loan.loanAmount,
      downPayment: loan.downPayment,
      interestType: loan.interest?.type === 'Reducing' ? 'Reducing Balance' : loan.interest?.type || 'Flat',
      interestRate: loan.interest?.rate ?? '',
      repaymentMethod: loan.repayment?.method || 'EMI',
      paymentFrequency: loan.repayment?.frequency || '',
      tenure: loan.repayment?.tenure ?? '',
      tenureUnit: loan.repayment?.tenureUnit || 'Months',
      firstDueDate: loan.firstDueDate || '',
      documentCharge: charges.documentCharge || '',
      customizeRules: Boolean(charges.customizeRules),
      gracePeriod: charges.graceDays || '',
      latePenalty: charges.penalty?.amount || '',
      penaltyType: charges.penalty?.type || '',
      referredBy: referral?.name || '',
      referredByCommission: charges.referral?.commission || '',
      relationshipOption: hasGuarantor && referral ? 'both' : hasGuarantor ? 'guarantor' : referral ? 'referral' : 'none',
    },
    referral: referral || {},
    customerId: record.customer.id,
    loanId: loan.id,
    loanAmount: loan.loanAmount,
    referredByCommission: Number(charges.referral?.commission) || 0,
    emiAmount: loan.calculation?.emiAmount || loan.calculation?.paymentAmount || 0,
    totalPayable: loan.calculation?.totalDue || 0,
    outstandingAmount: loan.outstandingAmount ?? 0,
    paymentFrequency: loan.repayment?.frequency || '',
    nextDueDate: nextDueDateOf(loan),
    repaymentSchedule: toUiSchedule(loan.repaymentSchedule, loan.paymentHistory),
    paymentHistory: loan.paymentHistory || [],
    status: loan.status || 'Active',
    // Only the loan the vehicle sale foreclosed carries the foreclosure.
    isForeclosed: loan.status === 'Foreclosed',
    foreclosure: loan.status === 'Foreclosed' ? foreclosureFrom(vehicle.sale) : null,
    createdAt: loan.createdAt,
  }
}

const loansOf = (record) => [record.loan, ...(record.loans || [])].filter((loan) => loan?.id)

export const loadCustomerEntries = async () => {
  // Commissions add the referrer's register id and paid status; someone who
  // cannot read them still gets the loans.
  const [records, commissions] = await Promise.all([apiGet('/customers'), apiGet('/referrals').catch(() => [])])
  const entries = records.flatMap((record) => loansOf(record).map((loan) => toEntry(record, loan, commissions)))
  return entries
}

export const getFundingSummary = () => apiGet('/investors/summary')

const normalRegNo = (value) => String(value || '').replace(/\s+/g, '').toUpperCase()

const vehiclesOf = (record) =>
  record.vehicles?.length ? record.vehicles : record.vehicle?.id ? [{ ...record.vehicle, rc: record.rc }] : []

/*
 * Creates the customer with their first loan, or adds the loan to an existing
 * customer: the one a Re-Loan was started from, or one whose mobile number
 * and a vehicle's registration number both match. The server puts the loan on
 * that customer's vehicle with this registration number, or adds the vehicle
 * to them if it is a new one, and applies the Re-Loan policy.
 * Returns the entry for the new loan.
 */
export const submitLoanApplication = async (form) => {
  const records = await apiGet('/customers')
  const mobile = (form.customer.mobile || '').trim()
  const regNo = normalRegNo(form.vehicle.regNo)
  const isReLoan = Boolean(form.customer?.isReLoanCustomer || form.loan?.isReLoan)

  const reLoanOf = isReLoan && form.customer?.customerId
    ? records.find((record) => record.customer.id === form.customer.customerId)
    : null
  const existing =
    reLoanOf ||
    records.find(
      (record) =>
        mobile &&
        regNo &&
        record.customer.personal?.mobileNumber === mobile &&
        vehiclesOf(record).some((vehicle) => normalRegNo(vehicle.rc?.registrationNumber) === regNo)
    )

  const loan = toLoan(form)
  let record

  if (existing) {
    record = await apiPost(`/customers/${existing.customer.id}/loans`, {
      ...loan,
      vehicle: toVehicle(form.vehicle),
      rc: toRc(form.vehicle),
    })
  } else {
    record = await apiPost('/customers', {
      customer: toCustomer(form.customer),
      vehicle: toVehicle(form.vehicle),
      rc: toRc(form.vehicle),
      guarantor: toGuarantor(form.guarantor, hasGuarantorIn(form)),
      loan,
      // Still a re-loan if its customer was not found: the server applies the policy.
      ...(isReLoan && form.customer?.customerId ? { reLoanOfCustomerId: form.customer.customerId } : {}),
    })
  }

  // The newest loan is the one just created.
  const newest = loansOf(record).reduce((latest, item) =>
    !latest || item.createdAt > latest.createdAt ? item : latest
  , null)

  return toEntry(record, newest)
}
