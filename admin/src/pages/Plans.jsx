import { useState } from 'react'
import { Check } from 'lucide-react'

import { api } from '../api'
import { Alert, Button, Card, Field, PageHeader, PlanBadge } from '../components/ui'
import { FEATURE_LABELS, formatMoney } from '../format'
import { inputClass } from '../styles'
import { useLoad } from '../useLoad'

const FEATURES = ['web_app', 'mobile_app', 'whatsapp_reminders', 'vahan_lookup']
const LIMITED = { whatsapp_reminders: 'WhatsApp reminders / month', vahan_lookup: 'VAHAN lookups / month' }

function PlanCard({ plan, onSaved }) {
  const [price, setPrice] = useState(String(plan.priceMonthly))
  const [features, setFeatures] = useState(plan.features)
  const [limits, setLimits] = useState(() => Object.fromEntries(Object.keys(LIMITED).map((key) => [key, plan.limits[key] ?? ''])))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const toggle = (key) => setFeatures((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]))

  const save = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      const updated = await api.put(`/plans/${plan.id}`, {
        priceMonthly: Number(price),
        features,
        // Only limits for features the plan includes; empty = no limit.
        limits: Object.fromEntries(Object.entries(limits).filter(([key, value]) => features.includes(key) && value !== '').map(([key, value]) => [key, Number(value)])),
      })
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

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">Features</legend>
          <ul className="space-y-2">
            {FEATURES.map((key) => (
              <li key={key}>
                <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-800">
                  <input type="checkbox" checked={features.includes(key)} onChange={() => toggle(key)} className="h-4 w-4 rounded border-slate-300 accent-teal-700" />
                  {FEATURE_LABELS[key]}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        {Object.entries(LIMITED).some(([key]) => features.includes(key)) && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Object.entries(LIMITED)
              .filter(([key]) => features.includes(key))
              .map(([key, label]) => (
                <Field key={key} label={label} id={`limit-${plan.id}-${key}`} hint="Empty = no limit">
                  <input
                    id={`limit-${plan.id}-${key}`}
                    type="number"
                    min="0"
                    step="1"
                    value={limits[key]}
                    onChange={(e) => setLimits((current) => ({ ...current, [key]: e.target.value }))}
                    className={inputClass}
                  />
                </Field>
              ))}
          </div>
        )}

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

export default function Plans() {
  const plans = useLoad(() => api.get('/plans'), 'plans')

  return (
    <>
      <PageHeader title="Plans" subtitle="What each plan costs and includes. Access is decided by these features, not plan names." />
      {plans.error && <Alert>Could not load plans: {plans.error}</Alert>}
      {!plans.data && !plans.error && <p className="text-sm text-slate-500">Loading…</p>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {plans.data?.map((plan) => (
          <PlanCard key={`${plan.id}-${plan.priceMonthly}-${plan.features.join()}-${JSON.stringify(plan.limits)}`} plan={plan} onSaved={() => plans.reload()} />
        ))}
      </div>
    </>
  )
}
