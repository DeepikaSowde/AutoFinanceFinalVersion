import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, X } from 'lucide-react'

import { api, query } from '../api'
import { Alert, Button, Field, PageHeader, PlanBadge, ProductBadge, StatusBadge, Table, Td, Th } from '../components/ui'
import { PRODUCTS, PRODUCT_LABELS, daysLeftText, formatDate } from '../format'
import { inputClass } from '../styles'
import { useLoad } from '../useLoad'

const PAGE_SIZE = 20

const UsageCell = ({ usage }) => {
  if (!usage?.enabled) return <span className="text-slate-400">Not in plan</span>
  const over = usage.limit !== null && usage.used >= usage.limit
  return (
    <span className={`tabular-nums ${over ? 'font-semibold text-red-700' : 'text-slate-700'}`}>
      {usage.used.toLocaleString('en-IN')}
      {usage.limit !== null && <span className="text-slate-400"> / {usage.limit.toLocaleString('en-IN')}</span>}
    </span>
  )
}

function AddTenantDialog({ plans, onClose, onCreated }) {
  const activeFor = (product) => plans.filter((p) => p.isActive && p.product === product)
  const [form, setForm] = useState({ name: '', ownerName: '', phone: '', email: '', product: 'auto_finance', planId: activeFor('auto_finance')[0]?.id || '', validUntil: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  const handleSubmit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const tenant = await api.post('/tenants', { ...form, planId: Number(form.planId), validUntil: form.validUntil || undefined })
      onCreated(tenant)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="add-tenant-title">
      <form onSubmit={handleSubmit} className="w-full max-w-lg rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 id="add-tenant-title" className="text-base font-semibold text-slate-900">Add tenant</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Lender name" id="t-name">
              <input id="t-name" required value={form.name} onChange={set('name')} className={inputClass} placeholder="e.g. Sri Murugan Finance" />
            </Field>
          </div>
          <Field label="Owner name" id="t-owner">
            <input id="t-owner" value={form.ownerName} onChange={set('ownerName')} className={inputClass} />
          </Field>
          <Field label="Phone" id="t-phone">
            <input id="t-phone" type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} className={inputClass} placeholder="10-digit mobile" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Email" id="t-email">
              <input id="t-email" type="email" value={form.email} onChange={set('email')} className={inputClass} />
            </Field>
          </div>
          <Field label="Product" id="t-product" hint="Decides which modules the lender gets. Cannot be changed later.">
            <select
              id="t-product"
              value={form.product}
              onChange={(e) => setForm((current) => ({ ...current, product: e.target.value, planId: activeFor(e.target.value)[0]?.id || '' }))}
              className={inputClass}
            >
              {PRODUCTS.map((key) => <option key={key} value={key}>{PRODUCT_LABELS[key]}</option>)}
            </select>
          </Field>
          <Field label="Plan" id="t-plan">
            <select id="t-plan" required value={form.planId} onChange={set('planId')} className={inputClass}>
              {activeFor(form.product).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Valid until" id="t-valid" hint="Leave empty for one month from today.">
            <input id="t-valid" type="date" value={form.validUntil} onChange={set('validUntil')} className={inputClass} />
          </Field>
          {error && <div className="sm:col-span-2"><Alert>{error}</Alert></div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" busy={busy}>Create tenant</Button>
        </div>
      </form>
    </div>
  )
}

export default function Tenants() {
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [product, setProduct] = useState('')
  const [planId, setPlanId] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [adding, setAdding] = useState(false)

  // Search after typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const plans = useLoad(() => api.get('/plans'), 'plans')
  const key = JSON.stringify({ search, product, planId, status, page })
  const tenants = useLoad(() => api.get(`/tenants${query({ search, product, planId, status, page, pageSize: PAGE_SIZE })}`), key)
  const data = tenants.data
  const from = data && data.total ? (data.page - 1) * data.pageSize + 1 : 0
  const to = data ? Math.min(data.page * data.pageSize, data.total) : 0
  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <>
      <PageHeader
        title="Tenants"
        subtitle="Every lender using MotoLend."
        actions={
          <Button onClick={() => setAdding(true)} disabled={!plans.data}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add tenant
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
        <div className="relative">
          <label htmlFor="tenant-search" className="sr-only">Search tenants</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            id="tenant-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, owner, phone or email"
            className={`${inputClass} pl-9`}
          />
        </div>
        <div>
          <label htmlFor="product-filter" className="sr-only">Product</label>
          <select id="product-filter" value={product} onChange={(e) => { setProduct(e.target.value); setPlanId(''); setPage(1) }} className={inputClass}>
            <option value="">All products</option>
            {PRODUCTS.map((key) => <option key={key} value={key}>{PRODUCT_LABELS[key]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="plan-filter" className="sr-only">Plan</label>
          <select id="plan-filter" value={planId} onChange={(e) => { setPlanId(e.target.value); setPage(1) }} className={inputClass}>
            <option value="">All plans</option>
            {plans.data?.filter((p) => !product || p.product === product).map((p) => (
              <option key={p.id} value={p.id}>{product ? p.name : `${p.name} · ${PRODUCT_LABELS[p.product]}`}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="status-filter" className="sr-only">Status</label>
          <select id="status-filter" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className={inputClass}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="expired">Expired</option>
          </select>
        </div>
      </div>

      {tenants.error && <div className="mb-4"><Alert>Could not load tenants: {tenants.error}</Alert></div>}

      <div className="rounded-xl border border-slate-200 bg-white">
        <Table minWidth={1000}>
          <thead>
            <tr>
              <Th>Tenant</Th>
              <Th>Product</Th>
              <Th>Plan</Th>
              <Th>Status</Th>
              <Th>Valid until</Th>
              <Th>WhatsApp</Th>
              <Th>VAHAN</Th>
              <Th className="text-right"><span className="sr-only">Manage</span></Th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50/60">
                <Td>
                  <p className="font-semibold text-slate-900">{t.name}</p>
                  <p className="text-xs text-slate-500">{[t.ownerName, t.phone].filter(Boolean).join(' · ') || '—'}</p>
                </Td>
                <Td><ProductBadge product={t.product} /></Td>
                <Td><PlanBadge plan={t.plan} /></Td>
                <Td><StatusBadge status={t.effectiveStatus} /></Td>
                <Td className="whitespace-nowrap">
                  <p>{formatDate(t.validUntil)}</p>
                  <p className={`text-xs ${t.daysLeft !== null && t.daysLeft < 0 ? 'text-red-700' : 'text-slate-500'}`}>{daysLeftText(t.daysLeft)}</p>
                </Td>
                <Td><UsageCell usage={t.usage?.whatsapp_reminders} /></Td>
                <Td>{t.product === 'general_finance' ? <span className="text-slate-400">—</span> : <UsageCell usage={t.usage?.vahan_lookup} />}</Td>
                <Td className="text-right">
                  <Link to={`/tenants/${t.id}`} className="font-semibold text-teal-800 hover:underline">Manage</Link>
                </Td>
              </tr>
            ))}
            {data && !data.items.length && (
              <tr><Td colSpan={8} className="py-8 text-center text-slate-500">No tenants match.</Td></tr>
            )}
            {tenants.loading && !data && (
              <tr><Td colSpan={8} className="py-8 text-center text-slate-500">Loading…</Td></tr>
            )}
          </tbody>
        </Table>

        <div className="flex flex-col gap-2 border-t border-slate-200 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-slate-600">{data ? `${from}–${to} of ${data.total}` : ''}</p>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="secondary" disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </div>

      {adding && plans.data && (
        <AddTenantDialog plans={plans.data} onClose={() => setAdding(false)} onCreated={(tenant) => navigate(`/tenants/${tenant.id}`)} />
      )}
    </>
  )
}
