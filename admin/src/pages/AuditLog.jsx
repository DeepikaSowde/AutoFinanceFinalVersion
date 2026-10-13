import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { api, query } from '../api'
import { Alert, Button, PageHeader, Table, Td, Th } from '../components/ui'
import { actionLabel, auditSummary, formatDateTime } from '../format'
import { useLoad } from '../useLoad'

const PAGE_SIZE = 50

export default function AuditLog() {
  const [params] = useSearchParams()
  const tenantId = params.get('tenantId') || ''
  const [page, setPage] = useState(1)
  const logs = useLoad(() => api.get(`/audit-logs${query({ tenantId, page, pageSize: PAGE_SIZE })}`), `${tenantId}-${page}`)
  const data = logs.data
  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const tenantName = tenantId && data?.items[0]?.tenantName

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle={tenantId ? `Changes for ${tenantName || `tenant #${tenantId}`}.` : 'Every change made by a super admin.'}
        actions={tenantId ? <Link to="/audit-log" className="text-sm font-semibold text-teal-800 hover:underline">Show all tenants</Link> : null}
      />
      {logs.error && <div className="mb-4"><Alert>Could not load the audit log: {logs.error}</Alert></div>}

      <div className="rounded-xl border border-slate-200 bg-white">
        <Table minWidth={820}>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Who</Th>
              <Th>Action</Th>
              <Th>Tenant</Th>
              <Th>Details</Th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((log) => (
              <tr key={log.id}>
                <Td className="whitespace-nowrap text-slate-600">{formatDateTime(log.createdAt)}</Td>
                <Td className="text-slate-700">{log.actor?.name || '—'}</Td>
                <Td className="whitespace-nowrap font-medium text-slate-900">{actionLabel(log.action)}</Td>
                <Td>
                  {log.tenantId ? (
                    <Link to={`/tenants/${log.tenantId}`} className="font-medium text-teal-800 hover:underline">{log.tenantName || `#${log.tenantId}`}</Link>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </Td>
                <Td className="text-slate-600">{auditSummary(log) || '—'}</Td>
              </tr>
            ))}
            {data && !data.items.length && (
              <tr><Td colSpan={5} className="py-8 text-center text-slate-500">Nothing recorded yet.</Td></tr>
            )}
            {logs.loading && !data && (
              <tr><Td colSpan={5} className="py-8 text-center text-slate-500">Loading…</Td></tr>
            )}
          </tbody>
        </Table>
        <div className="flex flex-col gap-2 border-t border-slate-200 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-slate-600">{data ? `Page ${data.page} of ${lastPage} · ${data.total} entries` : ''}</p>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="secondary" disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </div>
    </>
  )
}
