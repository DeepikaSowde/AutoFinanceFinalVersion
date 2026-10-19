import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Copy, KeyRound } from 'lucide-react'

import { api, query } from '../api'
import { Alert, Button, Card, Field, PlanBadge, ProductBadge, ProgressBar, StatusBadge, Table, Td, Th } from '../components/ui'
import {
  FEATURE_LABELS,
  PAYMENT_METHOD_LABELS,
  actionLabel,
  addDays,
  addMonths,
  auditSummary,
  daysLeftText,
  formatDate,
  formatDateTime,
  formatMoney,
  todayIST,
  PRODUCT_FEATURES,
} from '../format'
import { inputClass } from '../styles'
import { useLoad } from '../useLoad'


/* ---------- small pieces ---------- */

const Toggle = ({ id, checked, onChange, label, note }) => (
  <div className="flex items-center justify-between gap-4 py-2.5">
    <div className="min-w-0">
      <p id={`${id}-label`} className="text-sm font-medium text-slate-800">{label}</p>
      {note && <p className="text-xs text-slate-500">{note}</p>}
    </div>
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-labelledby={`${id}-label`}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${checked ? 'bg-teal-700' : 'bg-slate-300'}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  </div>
)

function TemporaryPassword({ result, onDone }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.temporaryPassword)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <Alert tone="info" onClose={onDone}>
      <p className="font-semibold">Temporary password for {result.user.username}</p>
      <p className="mt-1 flex flex-wrap items-center gap-2">
        <code className="rounded bg-white px-2 py-1 font-mono text-base tracking-wider text-slate-900 ring-1 ring-teal-200">{result.temporaryPassword}</code>
        <button type="button" onClick={copy} className="inline-flex items-center gap-1 text-sm font-semibold text-teal-900 hover:underline">
          <Copy className="h-4 w-4" aria-hidden="true" /> {copied ? 'Copied' : 'Copy'}
        </button>
      </p>
      <p className="mt-1 text-xs">Shown only now. Share it with the lender securely and ask them to change it after signing in.</p>
    </Alert>
  )
}

/* ---------- admin user ---------- */

function AdminUserCard({ tenant, onChanged }) {
  const admin = tenant.admins[0]
  const [form, setForm] = useState({ name: tenant.ownerName || '', email: tenant.email || '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const create = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      setResult(await api.post(`/tenants/${tenant.id}/create-admin`, form))
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const reset = async () => {
    if (!window.confirm(`Reset ${admin.username}'s password? They will be signed out everywhere.`)) return
    setBusy(true)
    setError('')
    try {
      setResult(await api.post(`/tenants/${tenant.id}/admin/reset-password`, { userId: admin.id }))
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Tenant admin user">
      <div className="space-y-4">
        {result && <TemporaryPassword result={result} onDone={() => setResult(null)} />}
        {admin ? (
          <>
            <dl className="space-y-3 text-sm">
              <div><dt className="text-slate-500">Name</dt><dd className="font-medium text-slate-900">{admin.name}</dd></div>
              <div><dt className="text-slate-500">Sign-in (email)</dt><dd className="break-words font-medium text-slate-900">{admin.username}</dd></div>
            </dl>
            <p className="text-xs text-slate-500">{tenant.userCount} user{tenant.userCount === 1 ? '' : 's'} in this lender's account.</p>
            <Button variant="secondary" onClick={reset} busy={busy}>
              <KeyRound className="h-4 w-4" aria-hidden="true" /> Reset temporary password
            </Button>
          </>
        ) : (
          <form onSubmit={create} className="space-y-3">
            <p className="text-sm text-slate-600">This lender has no admin user yet. Create one to give them access.</p>
            <Field label="Name" id="admin-name">
              <input id="admin-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Email (used to sign in)" id="admin-email">
              <input id="admin-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
            </Field>
            <Button type="submit" busy={busy}>Create admin user</Button>
          </form>
        )}
        {error && <Alert>{error}</Alert>}
      </div>
    </Card>
  )
}

/* ---------- payments ---------- */

function PaymentsCard({ tenant, onRecorded, payments, setNotice }) {
  const today = todayIST()
  const start = tenant.validUntil && tenant.validUntil >= today ? addDays(tenant.validUntil, 1) : today
  const price = tenant.planPrice || 0
  const [form, setForm] = useState({
    amount: price ? String(price) : '',
    method: 'upi',
    referenceNo: '',
    paidOn: today,
    periodFrom: start,
    periodTo: addDays(addMonths(start, 1), -1),
    invoiceNo: '',
    notes: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))
  const setPeriod = (months) =>
    setForm((current) => ({
      ...current,
      periodTo: addDays(addMonths(current.periodFrom, months), -1),
      amount: price ? String(price * months) : current.amount,
    }))

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await api.post(`/tenants/${tenant.id}/payments`, { ...form, amount: Number(form.amount) })
      setNotice(`Recorded ${formatMoney(result.payment.amount)} (${result.payment.invoiceNo}). Valid until ${formatDate(result.tenant.validUntil)}.`)
      onRecorded(result.tenant)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Payments">
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Amount (₹)" id="pay-amount">
          <input id="pay-amount" type="number" min="1" step="0.01" required value={form.amount} onChange={set('amount')} className={inputClass} />
        </Field>
        <Field label="Method" id="pay-method">
          <select id="pay-method" value={form.method} onChange={set('method')} className={inputClass}>
            {['upi', 'bank_transfer', 'cheque', 'cash'].map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
          </select>
        </Field>
        <Field label="Reference no." id="pay-ref" hint="UTR / cheque no.">
          <input id="pay-ref" value={form.referenceNo} onChange={set('referenceNo')} className={inputClass} />
        </Field>
        <Field label="Paid on" id="pay-on">
          <input id="pay-on" type="date" required value={form.paidOn} onChange={set('paidOn')} className={inputClass} />
        </Field>
        <Field label="Period from" id="pay-from">
          <input id="pay-from" type="date" required value={form.periodFrom} onChange={set('periodFrom')} className={inputClass} />
        </Field>
        <Field label="Period to" id="pay-to" hint="Valid until moves to this date.">
          <input id="pay-to" type="date" required value={form.periodTo} onChange={set('periodTo')} className={inputClass} />
        </Field>
        <Field label="Invoice no." id="pay-inv" hint="Leave empty to number it automatically.">
          <input id="pay-inv" value={form.invoiceNo} onChange={set('invoiceNo')} className={inputClass} />
        </Field>
        <Field label="Notes" id="pay-notes">
          <input id="pay-notes" value={form.notes} onChange={set('notes')} className={inputClass} />
        </Field>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
          <span className="text-sm text-slate-600">Period:</span>
          {[[1, '1 month'], [3, '3 months'], [12, '1 year']].map(([months, label]) => (
            <Button key={months} variant="secondary" onClick={() => setPeriod(months)}>{label}</Button>
          ))}
          <Button type="submit" busy={busy} className="sm:ml-auto">Record payment</Button>
        </div>
        {error && <div className="sm:col-span-2 lg:col-span-4"><Alert>{error}</Alert></div>}
      </form>

      <div className="-mx-5 -mb-5 mt-5 border-t border-slate-200">
        <Table minWidth={600}>
          <thead>
            <tr>
              <Th>Paid on</Th>
              <Th>Amount</Th>
              <Th>Method</Th>
              <Th>Period</Th>
              <Th>Invoice</Th>
            </tr>
          </thead>
          <tbody>
            {payments.data?.map((p) => (
              <tr key={p.id}>
                <Td className="whitespace-nowrap">{formatDate(p.paidOn)}</Td>
                <Td className="whitespace-nowrap font-semibold tabular-nums">{formatMoney(p.amount)}</Td>
                <Td>
                  <p>{PAYMENT_METHOD_LABELS[p.method] || p.method}</p>
                  {p.referenceNo && <p className="break-all text-xs text-slate-500">{p.referenceNo}</p>}
                </Td>
                <Td className="whitespace-nowrap">{formatDate(p.periodFrom)} – {formatDate(p.periodTo)}</Td>
                <Td className="whitespace-nowrap">
                  <p className="font-mono text-xs">{p.invoiceNo}</p>
                  {p.recordedBy && <p className="text-xs text-slate-500">by {p.recordedBy.name}</p>}
                </Td>
              </tr>
            ))}
            {payments.data && !payments.data.length && (
              <tr><Td colSpan={5} className="py-6 text-center text-slate-500">No payments recorded yet.</Td></tr>
            )}
          </tbody>
        </Table>
      </div>
    </Card>
  )
}

/* ---------- the page ---------- */

function TenantView({ tenant, plans: allPlans, onTenant, reloadSide, payments, audit, notice, setNotice }) {
  // Only this tenant's product: its plans and the features it offers.
  const FEATURES = PRODUCT_FEATURES[tenant.product] || PRODUCT_FEATURES.auto_finance
  const plans = allPlans.filter((p) => p.product === tenant.product)
  const [details, setDetails] = useState({ name: tenant.name, ownerName: tenant.ownerName, phone: tenant.phone, email: tenant.email })
  const [planId, setPlanId] = useState(String(tenant.plan.id))
  const [graceDays, setGraceDays] = useState(String(tenant.graceDays ?? 0))
  const [features, setFeatures] = useState(() => Object.fromEntries(FEATURES.map((key) => [key, tenant.features.includes(key)])))
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const detailsDirty = ['name', 'ownerName', 'phone', 'email'].some((key) => (details[key] || '') !== (tenant[key] || ''))
  const graceDirty = graceDays !== String(tenant.graceDays ?? 0)
  const planDirty = planId !== String(tenant.plan.id)
  const changedFeatures = Object.fromEntries(FEATURES.filter((key) => features[key] !== tenant.features.includes(key)).map((key) => [key, features[key]]))
  const featuresDirty = Object.keys(changedFeatures).length > 0
  const dirty = detailsDirty || graceDirty || planDirty || featuresDirty
  const selectedPlan = plans.find((p) => String(p.id) === planId)

  const run = async (label, action, message) => {
    setBusy(label)
    setError('')
    setNotice('')
    try {
      const updated = await action()
      if (message) setNotice(message)
      if (updated) onTenant(updated)
      reloadSide()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const save = () =>
    run('save', async () => {
      let updated = null
      if (detailsDirty || graceDirty) {
        updated = await api.patch(`/tenants/${tenant.id}`, {
          ...(detailsDirty ? details : {}),
          ...(graceDirty ? { graceDays: graceDays.trim() === '' ? 0 : Number(graceDays) } : {}),
        })
      }
      if (planDirty) updated = await api.patch(`/tenants/${tenant.id}/plan`, { planId: Number(planId) })
      if (featuresDirty) updated = await api.put(`/tenants/${tenant.id}/features`, { features: changedFeatures })
      return updated
    }, 'Changes saved.')

  const toggleSuspend = () => {
    const suspending = tenant.status !== 'suspended'
    if (!window.confirm(suspending ? `Suspend ${tenant.name}? Their staff will be locked out of the app.` : `Reactivate ${tenant.name}?`)) return
    run('status', () => api.patch(`/tenants/${tenant.id}/status`, { status: suspending ? 'suspended' : 'active' }), suspending ? 'Tenant suspended.' : 'Tenant reactivated.')
  }

  const extend = (months, label) => {
    if (!window.confirm(`Extend ${tenant.name}'s subscription by ${label}?`)) return
    run('extend', () => api.patch(`/tenants/${tenant.id}/extend`, { months }), `Extended by ${label}.`)
  }

  const setDetail = (key) => (event) => setDetails((current) => ({ ...current, [key]: event.target.value }))

  return (
    <>
      <Link to="/tenants" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-teal-800">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Tenants
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{tenant.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ProductBadge product={tenant.product} />
            <PlanBadge plan={tenant.plan} />
            <StatusBadge status={tenant.effectiveStatus} />
            {tenant.status === 'suspended' || tenant.effectiveStatus === tenant.status ? null : (
              <span className="text-xs text-slate-500">(past valid-until date)</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={tenant.status === 'suspended' ? 'secondary' : 'danger'} onClick={toggleSuspend} busy={busy === 'status'}>
            {tenant.status === 'suspended' ? 'Reactivate' : 'Suspend'}
          </Button>
          <Button onClick={save} disabled={!dirty} busy={busy === 'save'}>Save</Button>
        </div>
      </div>

      <div className="mb-4 space-y-3">
        {error && <Alert onClose={() => setError('')}>{error}</Alert>}
        {notice && <Alert tone="success" onClose={() => setNotice('')}>{notice}</Alert>}
        {dirty && <Alert tone="info">You have unsaved changes. Click Save to apply them.</Alert>}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Subscription" id="subscription">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Plan" id="plan" hint={selectedPlan ? `${formatMoney(selectedPlan.priceMonthly)} / month` : ''}>
                <select id="plan" value={planId} onChange={(e) => setPlanId(e.target.value)} className={inputClass}>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id} disabled={!p.isActive && String(p.id) !== String(tenant.plan.id)}>{p.name}{p.isActive ? '' : ' (inactive)'}</option>
                  ))}
                </select>
              </Field>
              <div>
                <p className="text-sm font-medium text-slate-700">Valid until</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{formatDate(tenant.validUntil)}</p>
                <p className={`text-sm ${tenant.daysLeft !== null && tenant.daysLeft < 0 ? 'text-red-700' : 'text-slate-500'}`}>
                  {tenant.daysLeft !== null && tenant.daysLeft < 0 ? `Expired ${daysLeftText(tenant.daysLeft)}` : `${daysLeftText(tenant.daysLeft)} left`}
                </p>
                {tenant.inGrace && (
                  <p className="text-sm font-medium text-red-700">In grace period — access stops after {formatDate(tenant.graceEndsOn)}</p>
                )}
              </div>
              <Field
                label="Grace days after expiry"
                id="grace-days"
                hint="Days the lender can keep using the app (with a red banner) after the valid-until date. 0 = locked out the next day. Max 90."
              >
                <input id="grace-days" type="number" min="0" max="90" step="1" value={graceDays} onChange={(e) => setGraceDays(e.target.value)} className={inputClass} />
              </Field>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
              <span className="text-sm text-slate-600">Extend by:</span>
              {[[1, '1 month'], [3, '3 months'], [12, '1 year']].map(([months, label]) => (
                <Button key={months} variant="secondary" onClick={() => extend(months, label)} busy={busy === 'extend'}>{label}</Button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">Extending counts from today if the subscription has already lapsed. Recording a payment below also extends it.</p>
          </Card>

          <Card title="Tenant details">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Lender name" id="d-name"><input id="d-name" value={details.name} onChange={setDetail('name')} className={inputClass} /></Field>
              <Field label="Owner name" id="d-owner"><input id="d-owner" value={details.ownerName} onChange={setDetail('ownerName')} className={inputClass} /></Field>
              <Field label="Phone" id="d-phone"><input id="d-phone" type="tel" value={details.phone} onChange={setDetail('phone')} className={inputClass} /></Field>
              <Field label="Email" id="d-email"><input id="d-email" type="email" value={details.email} onChange={setDetail('email')} className={inputClass} /></Field>
            </div>
          </Card>

          <PaymentsCard key={`${tenant.validUntil}-${tenant.plan.id}`} tenant={{ ...tenant, planPrice: allPlans.find((p) => p.id === tenant.plan.id)?.priceMonthly }} payments={payments} setNotice={setNotice} onRecorded={(updated) => { onTenant(updated); reloadSide() }} />
        </div>

        <div className="space-y-6">
          <Card title="Features">
            <div className="divide-y divide-slate-100">
              {FEATURES.map((key) => {
                const inPlan = tenant.planFeatures.includes(key)
                const overridden = features[key] !== inPlan
                return (
                  <Toggle
                    key={key}
                    id={`feature-${key}`}
                    label={FEATURE_LABELS[key]}
                    checked={features[key]}
                    onChange={(on) => setFeatures((current) => ({ ...current, [key]: on }))}
                    note={overridden ? `Override — ${inPlan ? 'included in' : 'not in'} plan` : inPlan ? 'Included in plan' : 'Not in plan'}
                  />
                )
              })}
            </div>
          </Card>

          <Card title="Usage this month">
            <div className="space-y-5">
              <ProgressBar id="t-usage-wa" label="WhatsApp reminders" used={tenant.usage?.whatsapp_reminders.used} limit={tenant.usage?.whatsapp_reminders.limit} />
              {FEATURES.includes('vahan_lookup') && (
                <ProgressBar id="t-usage-vahan" label="VAHAN lookups" used={tenant.usage?.vahan_lookup.used} limit={tenant.usage?.vahan_lookup.limit} />
              )}
            </div>
          </Card>

          <AdminUserCard tenant={tenant} onChanged={reloadSide} />

          <Card title="Recent changes" action={<Link to={`/audit-log${query({ tenantId: tenant.id })}`} className="text-sm font-semibold text-teal-800 hover:underline">All</Link>}>
            <ul className="space-y-3 text-sm">
              {audit.data?.items.map((log) => (
                <li key={log.id}>
                  <p className="font-medium text-slate-900">{actionLabel(log.action)}</p>
                  <p className="text-slate-600">{auditSummary(log)}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(log.createdAt)}{log.actor ? ` · ${log.actor.name}` : ''}</p>
                </li>
              ))}
              {audit.data && !audit.data.items.length && <li className="text-slate-500">No changes yet.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </>
  )
}

export default function TenantDetail() {
  const { id } = useParams()
  const tenant = useLoad(() => api.get(`/tenants/${id}`), id)
  const plans = useLoad(() => api.get('/plans'), 'plans')
  const payments = useLoad(() => api.get(`/tenants/${id}/payments`), id)
  const audit = useLoad(() => api.get(`/audit-logs${query({ tenantId: id, pageSize: 10 })}`), id)
  const [notice, setNotice] = useState('')

  if (tenant.error && !tenant.data) return <Alert>Could not load this tenant: {tenant.error}</Alert>
  if (!tenant.data || !plans.data) return <p className="text-sm text-slate-500">Loading…</p>

  const t = tenant.data
  // Remount the editor whenever the saved tenant changes, so its form
  // starts from the latest values.
  const snapshot = JSON.stringify([t.name, t.ownerName, t.phone, t.email, t.plan.id, t.features, t.status, t.validUntil, t.graceDays])

  return (
    <TenantView
      key={snapshot}
      tenant={t}
      plans={plans.data}
      payments={payments}
      audit={audit}
      onTenant={tenant.setData}
      notice={notice}
      setNotice={setNotice}
      reloadSide={() => {
        tenant.reload()
        payments.reload()
        audit.reload()
      }}
    />
  )
}
