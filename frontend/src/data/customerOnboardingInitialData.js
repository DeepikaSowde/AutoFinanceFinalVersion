// src/data/customerOnboardingInitialData.js

export const customerOnboardingInitialData = {
  // =====================================================
  // 01. CUSTOMER
  // =====================================================
  customer: {
    applicationDate: new Date().toISOString().split("T")[0],

    name: "",
    countryCode: "+91",
    mobile: "",
    profession: "",
    residenceType: "",

    referredBy: "",
    referredByPercentage: "",

    address: "",
    area: "",
    landmark: "",
    pincode: "",

    // KYC
    aadhaarNo: "",
    aadhaarFile: null,

    panNo: "",
    panFile: null,

    dlNo: "",
    dlFile: null,

    voterNo: "",
    voterFile: null,
  },

  // =====================================================
  // 02. VEHICLE
  // =====================================================
  vehicle: {
    // Vehicle Information
    regNo: "",
    type: "",
    brand: "",
    model: "",
    variant: "",
    colour: "",
    fuelType: "",
    year: "",
    amount: "",

    // Vehicle Photo
    photo: null,

    // Registration & Identification
    rto: "",
    regDate: "",
    chassisNo: "",
    engineNo: "",

    // Hypothecation
    hypothecation: "",
    financier: "",
    nocStatus: "",
    nocFile: null,

    // Insurance & Compliance
    taxExpiry: "",
    insuranceCompany: "",
    policyNo: "",
    insuranceExpiry: "",
    financierEndorsement: "",
    insuranceFile: null,

    // Remarks
    remarks: "",
  },

  // =====================================================
  // 03. LOAN
  // =====================================================
 loan: {
  // =====================================================
  // LOAN DETAILS
  // =====================================================

  // Vehicle amount
  vehicleAmount: "",

  // Down payment
  downPayment: "",

  // Interest
  interestType: "",
  repaymentMethod: "",
  interestRate: "",

  // Repayment
  paymentFrequency: "",
  tenure: "",
  tenureUnit: "",

  // First due date
  firstDueDate: "",

  // Charges
  documentCharge: "",

  // =====================================================
  // CUSTOMER-SPECIFIC CHARGES
  // =====================================================

  customizeRules: false,

  gracePeriod: "",
  latePenalty: "",
  penaltyType: "",
},

  // =====================================================
  // 04. REFERENCE
  // =====================================================
  reference: {},
guarantor: {
  required: "No",

  name: "",
  countryCode: "+91",
  mobile: "",
  relationship: "",
  profession: "",

  address: "",
  area: "",
  landmark: "",
  pincode: "",
  residenceType: "",

  kycRequired: "Yes",

  aadhaarNo: "",
  aadhaarFile: null,

  panNo: "",
  panFile: null,

  dlNo: "",
  dlFile: null,

  voterNo: "",
  voterFile: null,
},
  // =====================================================
  // 05. DOCUMENTS
  // =====================================================
  documents: {},
};