// src/db/tenantContext.js
//
// The tenant (lender) a request is acting for. loadTenant puts it here for
// the rest of the request; repositories read it with currentTenantId() and
// add it to every query on business tables. Reading it outside a tenant
// request throws, so a missing filter fails loudly instead of returning
// another lender's data.

import { AsyncLocalStorage } from "node:async_hooks";

const store = new AsyncLocalStorage();

export const runWithTenant = (tenantId, callback) => store.run({ tenantId }, callback);

export const currentTenantId = () => {
  const tenantId = store.getStore()?.tenantId;

  if (!tenantId) {
    throw Object.assign(new Error("No tenant for this request."), { statusCode: 500 });
  }

  return tenantId;
};
