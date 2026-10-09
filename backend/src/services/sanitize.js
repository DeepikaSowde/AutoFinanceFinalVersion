// src/services/sanitize.js
//
// Strips uploaded document file contents (Base64) before anything reaches
// the database. Only file metadata (name/type/size/uploadedAt) is
// persisted for documents. The customer and vehicle profile photos are
// the exception — a single small compressed image each, kept in full for
// the Customer Details photo viewer.

const stripUpload = (upload = {}) => ({
  type: upload.type || "",
  fileName: upload.fileName || "",
  fileType: upload.fileType || "",
  fileSize: upload.fileSize || 0,
  uploadedAt: upload.uploadedAt || "",
  fileData: "",
});

const stripPhoto = (photo = {}) => ({
  fileName: photo.fileName || "",
  fileData: "",
});

const stripInsuranceDocument = (document = {}) => ({
  fileName: document.fileName || "",
  fileType: document.fileType || "",
  fileSize: document.fileSize || 0,
  uploadedAt: document.uploadedAt || "",
  fileData: "",
});

export const sanitizeCustomerPayload = (payload = {}) => {
  const safe = structuredClone(payload || {});

  if (Array.isArray(safe.customer?.documents?.uploads)) {
    safe.customer.documents.uploads = safe.customer.documents.uploads.map(stripUpload);
  }

  if (safe.guarantor?.photo) {
    safe.guarantor.photo = stripPhoto(safe.guarantor.photo);
  }

  if (Array.isArray(safe.guarantor?.documents?.uploads)) {
    safe.guarantor.documents.uploads = safe.guarantor.documents.uploads.map(stripUpload);
  }

  if (safe.rc?.insurance?.document) {
    safe.rc.insurance.document = stripInsuranceDocument(safe.rc.insurance.document);
  }

  return safe;
};
