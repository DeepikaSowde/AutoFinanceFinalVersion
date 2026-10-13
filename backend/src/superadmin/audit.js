// src/superadmin/audit.js
//
// Every super admin change is written to audit_logs, inside the same
// transaction as the change itself, so a change is never saved without its
// record (or recorded without being saved).

import { query } from "../db/connection.js";

export const writeAudit = (client, { actorId, action, tenantId = null, details = {} }) =>
  client.query("INSERT INTO audit_logs (actor_id, action, tenant_id, details) VALUES ($1, $2, $3, $4)", [
    actorId ?? null,
    action,
    tenantId,
    JSON.stringify(details),
  ]);

const mapLog = (row) => ({
  id: row.id,
  action: row.action,
  tenantId: row.tenant_id,
  tenantName: row.tenant_name || null,
  actor: row.actor_id ? { id: row.actor_id, name: row.actor_name, email: row.actor_email } : null,
  details: row.details ?? {},
  createdAt: new Date(row.created_at).toISOString(),
});

export const getAuditLogs = async ({ tenantId = null, page = 1, pageSize = 50 } = {}) => {
  const params = [];
  let where = "";

  if (tenantId) {
    params.push(tenantId);
    where = `WHERE audit_logs.tenant_id = $${params.length}`;
  }

  const total = (await query(`SELECT COUNT(*)::int AS n FROM audit_logs ${where}`, params)).rows[0].n;

  params.push(pageSize, (page - 1) * pageSize);
  const result = await query(
    `SELECT audit_logs.*, tenants.name AS tenant_name, super_admins.name AS actor_name, super_admins.email AS actor_email
     FROM audit_logs
     LEFT JOIN tenants ON tenants.id = audit_logs.tenant_id
     LEFT JOIN super_admins ON super_admins.id = audit_logs.actor_id
     ${where}
     ORDER BY audit_logs.created_at DESC, audit_logs.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { items: result.rows.map(mapLog), total, page, pageSize };
};
