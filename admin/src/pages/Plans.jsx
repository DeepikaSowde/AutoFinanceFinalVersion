import { useState } from 'react'
import { Check, Plus } from 'lucide-react'

import { api } from '../api'
import { Alert, Button, Card, Field, PageHeader, PlanBadge } from '../components/ui'
import { FEATURE_LABELS, PRODUCTS, PRODUCT_FEATURES, PRODUCT_LABELS, formatMoney } from '../format'
import { inputClass } from '../styles'
import { useLoad } from '../useLoad'

const LIMITED = { whatsapp_reminders: 'WhatsApp reminders / month', vahan_lookup: 'VAHAN lookups / month' }

// Only limits for features the plan includes; empty = no limit.
const limitsPayload = (limits, features) =>
  Object.fromEntries(Object.entries(limits).filter(([key, value]) => features.includes(key) && value !== '').map(([key, value]) => [key, Number(value)]))

function FeatureFields({ idPrefix, product, features, setFeatures, limits, setLimits }) {
  const offered = PRODUCT_FEATURES[product]
  const limited = Object.entries(LIMITED).filter(([key]) => offered.includes(key) && features.includes(key))
  const toggle = (key) => setFeatures((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]))

  return (
    <>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-700">Features</legend>
        <ul className="space-y-2">
          {offered.map((key) => (
            <li key={key}>
              <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-800">
                <input type="checkbox" checked={features.includes(key)} onChange={() => toggle(key)} className="h-4 w-4 rounded border-slate-300 accent-teal-700" />
                {FEATURE_LABELS[key]}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      {limited.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {limited.map(([key, label]) => (
            <Field key={key} label={label} id={`${idPrefix}-limit-${key}`} hint="Empty = no limit">
              <input
                id={`${idPrefix}-limit-${key}`}
                type="number"
                min="0"
                step="1"
                value={limits[key] ?? ''}
                onChange={(e) => setLimits((current) => ({ ...current, [key]: e.target.value }))}
                className={inputClass}
              />
            </Field>
          ))}
        </div>
      )}
    </>
  )
}

function PlanCard({ plan, onSaved }) {
  const [price, setPrice] = useState(String(plan.priceMonthly))
  const [features, setFeatures] = useState(plan.features)
  const [limits, setLimits] = useState(() => Object.fromEntries(Object.keys(LIMITED).map((key) => [key, plan.limits[key] ?? ''])))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const save = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      const updated = await api.put(`/plans/${plan.id}`, { priceMonthly: Number(price), features, limits: limitsPayload(limits, features) })
      setSaved(true)
      onSaved(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          {plan.name} <PlanBadge plan={plan} />
        </span>
      }
      action={<span className="text-xs text-slate-500">{plan.tenantCount} tenant{plan.tenantCount === 1 ? '' : 's'}</span>}
    >
      <form onSubmit={save} className="space-y-5">
        <Field label="Price per month (₹)" id={`price-${plan.id}`} hint={`Currently ${formatMoney(plan.priceMonthly)}`}>
          <input id={`price-${plan.id}`} type="number" min="0" step="1" required value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} />
        </Field>

        <FeatureFields idPrefix={`plan-${plan.id}`} product={plan.product} features={features} setFeatures={setFeatures} limits={limits} setLimits={setLimits} />

        {error && <Alert>{error}</Alert>}
        <div className="flex items-center gap-3">
          <Button type="submit" busy={busy}>Save {plan.name}</Button>
          {saved && (
            <span role="status" className="inline-flex items-center gap-1 text-sm font-medium text-green-700">
              <Check className="h-4 w-4" aria-hidden="true" /> Saved
            </span>
          )}
        </div>
      </form>
    </Card>
  )
}

function NewPlanCard({ product, onCreated, onCancel }) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('0')
  const [features, setFeatures] = useState(['web_app'])
  const [limits, setLimits] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const create = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/plans', { product, name, priceMonthly: Number(price), features, limits: limitsPayload(limits, features) })
      onCreated()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Card title={`New ${PRODUCT_LABELS[product]} plan`}>
      <form onSubmit={create} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Plan name" id="new-plan-name">
            <input id="new-plan-name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Gold" />
          </Field>
          <Field label="Price per month (₹)" id="new-plan-price">
            <input id="new-plan-price" type="number" min="0" step="1" required value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <FeatureFields idPrefix="new-plan" product={product} features={features} setFeatures={setFeatures} limits={limits} setLimits={setLimits} />
        {error && <Alert>{error}</Alert>}
        <div className="flex gap-2">
          <Button type="submit" busy={busy}>Create plan</Button>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        </div>
      </form>
    </Card>
  )
}

export default function Plans() {
  const plans = useLoad(() => api.get('/plans'), 'plans')
  const [product, setProduct] = useState('auto_finance')
  const [adding, setAdding] = useState(false)

  const shown = plans.data?.filter((plan) => plan.product === product) ?? []
  const tenantsIn = (key) => plans.data?.filter((plan) => plan.product === key).reduce((sum, plan) => sum + plan.tenantCount, 0) ?? 0

  return (
    <>
      <PageHeader
        title="Plans"
        subtitle="Each product has its own plans. A tenant belongs to one product and one of its plans; access is decided by the plan's features."
        actions={
          <Button onClick={() => setAdding(true)} disabled={!plans.data || adding}>
            <Plus className="h-4 w-4" aria-hidden="true" /> New plan
          </Button>
        }
      />

      <div role="tablist" aria-label="Product" className="mb-6 flex flex-wrap gap-2">
        {PRODUCTS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={product === key}
            onClick={() => { setProduct(key); setAdding(false) }}
            className={`rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-inset transition-colors ${
              product === key ? 'bg-teal-800 text-white ring-teal-800' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
            }`}
          >
            {PRODUCT_LABELS[key]} · {tenantsIn(key)} tenant{tenantsIn(key) === 1 ? '' : 's'}
          </button>
        ))}
      </div>

      {plans.error && <Alert>Could not load plans: {plans.error}</Alert>}
      {!plans.data && !plans.error && <p className="text-sm text-slate-500">Loading…</p>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {adding && <NewPlanCard key={product} product={product} onCancel={() => setAdding(false)} onCreated={() => { setAdding(false); plans.reload() }} />}
        {shown.map((plan) => (
          <PlanCard key={`${plan.id}-${plan.priceMonthly}-${plan.features.join()}-${JSON.stringify(plan.limits)}`} plan={plan} onSaved={() => plans.reload()} />
        ))}
        {plans.data && !shown.length && !adding && <p className="text-sm text-slate-500">No plans for {PRODUCT_LABELS[product]} yet.</p>}
      </div>
    </>
  )
}
