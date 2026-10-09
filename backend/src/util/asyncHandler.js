// src/util/asyncHandler.js
//
// Express 4 does not catch a rejected promise from an async route handler,
// so a thrown database error would leave the request hanging. This forwards
// it to the error middleware instead.

export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
