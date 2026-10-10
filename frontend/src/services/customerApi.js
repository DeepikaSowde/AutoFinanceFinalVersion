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

const uploadsFrom = (section, kinds) =>
  kinds.map(([field, type]) => fileMeta(section[field], type)).filter(Boolean)

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

const toGuarantor = (guarantor) => ({
  hasGuarantor: guarantor.required === 'Yes',
  personal: {
    name: guarantor.name || '',
    countryCode: guarantor.countryCode || '+91',
    mobileNumber: guarantor.mobile || '',
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
  kyc: toKyc(guarantor),
  documents: { requiredMinimum: 2, selectedTypes: [], uploads: uploadsFrom(guarantor, KYC_FILES) },
  photo: guarantor.photo ? { fileName: guarantor.photo.name || '', fileData: '' } : { fileName: '', fileData: '' },
})

export const principalOf = (form) => {
  const vehicleAmount =
    form.loan.vehicleAmount !== null && form.loan.vehicleAmount !== '' && form.loan.vehicleAmount !== undefined
      ? Number(form.loan.vehicleAmount)
      : Number(form.vehicle.amount || 0)
  return Math.max(vehicleAmount - Number(form.loan.downPayment || 0), 0)
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
      referral: {
        referredBy: loan.referredBy || '',
        commission: loan.referredByCommission || '',
      },
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
})

const docAsFile = (meta) => (meta?.fileName ? { name: meta.fileName, type: meta.fileType, size: meta.fileSize, data: '' } : null)

// Installments in the shape the Collection screen works with.
const SCHEDULE_STATUS = { Paid: 'Collected', 'Partially Paid': 'Partial' }

const toUiSchedule = (rows = []) =>
  rows.map((row) => ({
    installmentNumber: row.installmentNumber,
    dueDate: row.dueDate,
    emi: row.paymentAmount,
    amountPaid: row.paidAmount,
    principal: row.principal,
    interest: row.interest,
    principalPaid: row.paidPrincipal,
    interestPaid: row.paidInterest,
    status: SCHEDULE_STATUS[row.status] || 'Due',
  }))

const nextDueDateOf = (loan) => {
  const unpaid = (loan.repaymentSchedule || []).find((row) => row.status !== 'Paid')
  return unpaid?.dueDate || ''
}

const toEntry = (record, loan) => {
  const personal = record.customer.personal || {}
  const rc = record.rc || {}
  const vehicle = record.vehicle || {}
  const guarantor = record.guarantor || {}
  const gPersonal = guarantor.personal || {}
  const charges = loan.charges || {}

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
    vehicle: {
      vehicleId: vehicle.id || '',
      type: vehicle.vehicleType || '',
      brand: vehicle.brand || '',
      model: vehicle.model || '',
      variant: vehicle.variant || '',
      colour: vehicle.colour || '',
      year: vehicle.manufacturingYear || '',
      fuelType: vehicle.fuelType || '',
      amount: vehicle.vehicleValue || '',
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
      name: gPersonal.name || '',
      countryCode: gPersonal.countryCode || '+91',
      mobile: gPersonal.mobileNumber || '',
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
      referredBy: charges.referral?.referredBy || '',
      referredByCommission: charges.referral?.commission || '',
    },
    customerId: record.customer.id,
    loanId: loan.id,
    loanAmount: loan.loanAmount,
    referredByCommission: Number(charges.referral?.commission) || 0,
    emiAmount: loan.calculation?.emiAmount || loan.calculation?.paymentAmount || 0,
    totalPayable: loan.calculation?.totalDue || 0,
    outstandingAmount: loan.outstandingAmount ?? 0,
    paymentFrequency: loan.repayment?.frequency || '',
    nextDueDate: nextDueDateOf(loan),
    repaymentSchedule: toUiSchedule(loan.repaymentSchedule),
    paymentHistory: loan.paymentHistory || [],
    status: loan.status || 'Active',
    createdAt: loan.createdAt,
  }
}

const loansOf = (record) => [record.loan, ...(record.loans || [])].filter((loan) => loan?.id)

export const loadCustomerEntries = async () => {
  const records = await apiGet('/customers')
  const entries = records.flatMap((record) => loansOf(record).map((loan) => toEntry(record, loan)))
  return entries
}

export const getFundingSummary = () => apiGet('/investors/summary')

/*
 * Creates the customer with their first loan, or adds a loan to an existing
 * customer when the mobile number and registration number both match one
 * already on file (the server keeps one vehicle per customer, so a loan on a
 * different vehicle is onboarded as its own customer record).
 * Returns the entry for the new loan.
 */
export const submitLoanApplication = async (form) => {
  const records = await apiGet('/customers')
  const mobile = (form.customer.mobile || '').trim()
  const regNo = (form.vehicle.regNo || '').trim().toUpperCase()

  const existing = records.find(
    (record) =>
      mobile &&
      record.customer.personal?.mobileNumber === mobile &&
      (record.rc?.registrationNumber || '').toUpperCase() === regNo
  )

  const loan = toLoan(form)
  let record

  if (existing) {
    record = await apiPost(`/customers/${existing.customer.id}/loans`, loan)
  } else {
    record = await apiPost('/customers', {
      customer: toCustomer(form.customer),
      vehicle: toVehicle(form.vehicle),
      rc: toRc(form.vehicle),
      guarantor: toGuarantor(form.guarantor),
      loan,
    })
  }

  // The newest loan is the one just created.
  const newest = loansOf(record).reduce((latest, item) =>
    !latest || item.createdAt > latest.createdAt ? item : latest
  , null)

  return toEntry(record, newest)
}
