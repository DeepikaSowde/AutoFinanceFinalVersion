import { Link } from 'react-router-dom'
import { AlertTriangle, Building2, CalendarClock, CheckCircle2 } from 'lucide-react'

import { api } from '../api'
import { Alert, Card, PageHeader, PlanBadge, ProductBadge, ProgressBar, Table, Td, Th } from '../components/ui'
import { PRODUCTS, PRODUCT_LABELS, daysLeftText, formatDate } from '../format'
import { useLoad } from '../useLoad'

const Metric = ({ icon: Icon, label, value, tone }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-5">
    <div className="flex items-center gap-4">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">{value ?? '—'}</p>
      </div>
    </div>
  </div>
)

const monthName = (month) =>
  month ? new Date(`${month}-01T00:00:00Z`).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''

export default function Dashboard() {
  const { data, error, loading } = useLoad(() => api.get('/dashboard'), 'dashboard')
  const totals = data?.totals

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Lenders, subscriptions and this month's usage." />
      {error && <div className="mb-4"><Alert>Could not load the dashboard: {error}</Alert></div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Building2} label="Total tenants" value={totals?.tenants} tone="bg-slate-100 text-slate-700" />
        <Metric icon={CheckCircle2} label="Active" value={totals?.active} tone="bg-green-100 text-green-700" />
        <Metric icon={CalendarClock} label="Expiring in 30 days" value={totals?.expiringIn30Days} tone="bg-amber-100 text-amber-700" />
        <Metric icon={AlertTriangle} label="Suspended or expired" value={totals?.suspendedOrExpired} tone="bg-red-100 text-red-700" />
      </div>

      {data?.perProduct && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PRODUCTS.map((key) => (
            <div key={key} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5">
              <div>
                <ProductBadge product={key} />
                <p className="mt-2 text-sm text-slate-600">{data.perProduct[key]?.active ?? 0} active of {data.perProduct[key]?.tenants ?? 0} tenants</p>
              </div>
              <Link to="/plans" className="text-sm font-semibold text-teal-800 hover:underline">{PRODUCT_LABELS[key]} plans</Link>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title={`Usage this month${data ? ` · ${monthName(data.month)}` : ''}`} className="xl:col-span-1">
          {loading && !data ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <div className="space-y-5">
              <ProgressBar id="usage-whatsapp" label="WhatsApp reminders" used={data?.usage.whatsapp_reminders.used} limit={data?.usage.whatsapp_reminders.limit} />
              <ProgressBar id="usage-vahan" label="VAHAN lookups" used={data?.usage.vahan_lookup.used} limit={data?.usage.vahan_lookup.limit} />
              <p className="text-xs text-slate-500">
                Totals across active tenants with each feature ({data?.usage.whatsapp_reminders.tenants ?? 0} with WhatsApp,{' '}
                {data?.usage.vahan_lookup.tenants ?? 0} with VAHAN).
              </p>
              {data && (
                <div className="border-t border-slate-100 pt-4">
                  <p className="mb-2 text-sm font-medium text-slate-800">Tenants per plan</p>
                  <ul className="space-y-1.5 text-sm">
                    {Object.entries(data.perPlan).map(([code, plan]) => (
                      <li key={code} className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <PlanBadge plan={{ code, name: plan.name }} />
                          <span className="text-xs text-slate-500">{PRODUCT_LABELS[plan.product]}</span>
                        </span>
                        <span className="tabular-nums text-slate-700">{plan.count}</span>
                      </li>
                    ))}
                    {!Object.keys(data.perPlan).length && <li className="text-slate-500">No tenants yet.</li>}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card title="Expiring soon" className="xl:col-span-2" action={<Link to="/tenants" className="text-sm font-semibold text-teal-800 hover:underline">All tenants</Link>}>
          <div className="-m-5">
            <Table minWidth={560}>
              <thead>
                <tr>
                  <Th>Tenant</Th>
                  <Th>Plan</Th>
                  <Th>Valid until</Th>
                  <Th>Days left</Th>
                  <Th className="text-right"><span className="sr-only">Action</span></Th>
                </tr>
              </thead>
              <tbody>
                {data?.expiringSoon.map((t) => (
                  <tr key={t.id}>
                    <Td className="font-medium text-slate-900">{t.name}</Td>
                    <Td><PlanBadge plan={t.plan} /></Td>
                    <Td className="whitespace-nowrap">{formatDate(t.validUntil)}</Td>
                    <Td className={`whitespace-nowrap font-medium ${t.daysLeft <= 7 ? 'text-red-700' : 'text-amber-800'}`}>
                      {t.inGrace ? `Expired ${daysLeftText(t.daysLeft)}` : daysLeftText(t.daysLeft)}
                      {t.inGrace && <span className="block text-xs font-normal">Grace until {formatDate(t.graceEndsOn)}</span>}
                    </Td>
                    <Td className="text-right">
                      <Link to={`/tenants/${t.id}#subscription`} className="font-semibold text-teal-800 hover:underline">
                        Extend
                      </Link>
                    </Td>
                  </tr>
                ))}
                {data && !data.expiringSoon.length && (
                  <tr>
                    <Td className="py-6 text-center text-slate-500" colSpan={5}>No active tenant expires in the next 30 days.</Td>
                  </tr>
                )}
                {loading && !data && (
                  <tr><Td className="py-6 text-center text-slate-500">Loading…</Td></tr>
                )}
              </tbody>
            </Table>
          </div>
        </Card>
      </div>
    </>
  )
}
