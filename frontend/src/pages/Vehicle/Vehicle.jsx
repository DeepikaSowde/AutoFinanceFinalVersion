import { useEffect, useMemo, useState } from 'react'
import { Car, History, Search, X } from 'lucide-react'

import { getSessionUser } from '../../services/api'
import { VEHICLE_STATUS_LABELS, loadVehicleEvents, loadVehicles, runVehicleAction } from '../../services/vehicleApi'

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const today = () => new Date().toLocaleDateString('en-CA')

const STATUS_STYLES = {
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  SEIZED: 'bg-red-100 text-red-700',
  PENDING_SALE: 'bg-amber-100 text-amber-800',
  RELEASED: 'bg-sky-100 text-sky-800',
  SOLD: 'bg-slate-200 text-slate-700',
}

// What can be done from each status; the server enforces the same rules.
const ACTIONS = {
  seize: {
    label: 'Seize',
    title: 'Seize vehicle',
    from: ['ACTIVE'],
    fields: [
      { key: 'seizureDate', label: 'Seizure date', type: 'date', required: true, initial: today },
      { key: 'location', label: 'Where it is kept (yard / location)' },
      { key: 'reason', label: 'Reason', required: true, placeholder: 'e.g. 3 EMIs overdue' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
  },
  release: {
    label: 'Release',
    title: 'Release vehicle to customer',
    from: ['SEIZED'],
    fields: [
      { key: 'releaseDate', label: 'Release date', type: 'date', required: true, initial: today },
      { key: 'remarks', label: 'Remarks', type: 'textarea', placeholder: 'e.g. Overdue amount cleared' },
    ],
  },
  pendingSale: {
    label: 'Move to sale',
    title: 'Put vehicle up for sale',
    from: ['SEIZED'],
    fields: [
      { key: 'expectedPrice', label: 'Expected price (₹)', type: 'number' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
  },
  completeSale: {
    label: 'Mark sold',
    title: 'Record the sale',
    from: ['PENDING_SALE'],
    fields: [
      { key: 'buyerName', label: 'Buyer name', required: true },
      { key: 'buyerMobile', label: 'Buyer mobile' },
      { key: 'salePrice', label: 'Sale price (₹)', type: 'number', required: true },
      { key: 'saleExpenses', label: 'Sale expenses (₹)', type: 'number', placeholder: 'Towing, repairs, commission' },
      { key: 'soldAt', label: 'Sale date', type: 'date', required: true, initial: today },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
  },
  cancelSale: {
    label: 'Cancel sale',
    title: 'Cancel the sale',
    from: ['PENDING_SALE'],
    fields: [{ key: 'reason', label: 'Reason', required: true }],
  },
}

const EVENT_LABELS = {
  SEIZURE: 'Seized',
  RELEASE: 'Released',
  PENDING_SALE: 'Moved to sale',
  SALE_CANCELLED: 'Sale cancelled',
  SALE: 'Sold',
}

const canEdit = (user) => user?.role === 'admin' || Boolean(user?.permissions?.vehicles?.edit)

const Vehicle = () => {
  const user = getSessionUser()
  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [status, setStatus] = useState('ALL')
  const [search, setSearch] = useState('')

  const [dialog, setDialog] = useState(null) // { vehicle, action }
  const [form, setForm] = useState({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const [history, setHistory] = useState(null) // { vehicle, events, loading, error }

  useEffect(() => {
    let active = true

    loadVehicles()
      .then((list) => {
        if (!active) return
        setVehicles(list)
        setLoadError('')
      })
      .catch((error) => active && setLoadError(error.message))
      .finally(() => active && setLoading(false))

    return () => {
      active = false
    }
  }, [reloadKey])

  const counts = useMemo(() => {
    const result = { ALL: vehicles.length }
    for (const key of Object.keys(VEHICLE_STATUS_LABELS)) result[key] = vehicles.filter((v) => v.status === key).length
    return result
  }, [vehicles])

  const query = search.trim().toLowerCase()
  const visible = vehicles.filter(
    (v) =>
      (status === 'ALL' || v.status === status) &&
      (!query ||
        v.registrationNumber?.toLowerCase().includes(query) ||
        v.customerName?.toLowerCase().includes(query) ||
        v.loanId?.toLowerCase().includes(query) ||
        `${v.brand} ${v.model}`.toLowerCase().includes(query))
  )

  const openAction = (vehicle, action) => {
    const initial = {}
    for (const field of ACTIONS[action].fields) initial[field.key] = field.initial ? field.initial() : ''
    setForm(initial)
    setFormError('')
    setDialog({ vehicle, action })
  }

  const openHistory = async (vehicle) => {
    setHistory({ vehicle, events: [], loading: true, error: '' })
    try {
      const events = await loadVehicleEvents(vehicle.id)
      setHistory({ vehicle, events: events.slice().reverse(), loading: false, error: '' })
    } catch (error) {
      setHistory({ vehicle, events: [], loading: false, error: error.message })
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return
    const config = ACTIONS[dialog.action]
    const missing = config.fields.find((field) => field.required && !String(form[field.key] || '').trim())
    if (missing) return setFormError(`${missing.label} is required.`)

    const details = { ...form }
    for (const field of config.fields) if (field.type === 'number') details[field.key] = Number(form[field.key]) || 0

    setSaving(true)
    setFormError('')
    try {
      await runVehicleAction(dialog.vehicle.id, dialog.action, details)
      setDialog(null)
      setReloadKey((key) => key + 1)
    } catch (error) {
      setFormError(error.message)
    } finally {
      setSaving(false)
    }
  }

  // Sale preview, computed the same way the server records it.
  const salePreview =
    dialog?.action === 'completeSale'
      ? (() => {
          const outstanding = Number(dialog.vehicle.outstandingAmount || 0)
          const net = Math.max(Number(form.salePrice || 0) - Number(form.saleExpenses || 0), 0)
          return { outstanding, net, deficiency: Math.max(outstanding - net, 0), surplus: Math.max(net - outstanding, 0) }
        })()
      : null

  return (
    <div className="w-full bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Vehicles</h1>
          <p className="mt-1 text-sm text-slate-500">Financed vehicles, seizures, releases and sales.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search reg. no, customer, loan"
            className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052]"
          />
        </div>
      </div>

      {loadError && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load vehicles: {loadError}{' '}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => {
              setLoading(true)
              setReloadKey((key) => key + 1)
            }}
          >
            Retry
          </button>
        </div>
      )}

      <div className="mb-3 flex gap-2 overflow-x-auto">
        {['ALL', ...Object.keys(VEHICLE_STATUS_LABELS)].map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatus(key)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold ${
              status === key ? 'bg-[#006052] text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {key === 'ALL' ? 'All' : VEHICLE_STATUS_LABELS[key]} ({counts[key] || 0})
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Loan</th>
              <th className="px-4 py-3">Outstanding</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">Loading vehicles…</td>
              </tr>
            )}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">No vehicles here.</td>
              </tr>
            )}
            {!loading &&
              visible.map((vehicle) => (
                <tr key={vehicle.id} className="align-top hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {vehicle.photo?.fileData ? (
                        <img src={vehicle.photo.fileData} alt="" className="h-10 w-10 rounded-md object-cover" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100">
                          <Car className="h-5 w-5 text-slate-400" />
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-slate-900">{vehicle.registrationNumber || vehicle.id}</p>
                        <p className="text-xs text-slate-500">
                          {[vehicle.brand, vehicle.model, vehicle.manufacturingYear].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{vehicle.customerName}</p>
                    <p className="text-xs text-slate-500">{vehicle.mobileNumber}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-slate-800">{vehicle.loanId || '—'}</p>
                    {vehicle.loan?.status && <p className="text-xs text-slate-500">{vehicle.loan.status}</p>}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {vehicle.status === 'SOLD' ? '—' : formatCurrency(vehicle.outstandingAmount)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[vehicle.status] || ''}`}>
                      {VEHICLE_STATUS_LABELS[vehicle.status] || vehicle.status}
                    </span>
                    {vehicle.status === 'SOLD' && vehicle.sale && (
                      <p className="mt-1 text-xs text-slate-500">
                        {formatCurrency(vehicle.sale.salePrice)} on {formatDate(vehicle.sale.soldAt)}
                      </p>
                    )}
                    {vehicle.status === 'SEIZED' && vehicle.seizure && (
                      <p className="mt-1 text-xs text-slate-500">since {formatDate(vehicle.seizure.seizureDate)}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      {canEdit(user) &&
                        Object.entries(ACTIONS)
                          .filter(([, config]) => config.from.includes(vehicle.status))
                          .map(([action, config]) => (
                            <button
                              key={action}
                              type="button"
                              onClick={() => openAction(vehicle, action)}
                              className={
                                action === 'seize' || action === 'completeSale'
                                  ? 'rounded-md bg-[#006052] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#004d43]'
                                  : 'rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-emerald-700 hover:text-emerald-800'
                              }
                            >
                              {config.label}
                            </button>
                          ))}
                      <button
                        type="button"
                        onClick={() => openHistory(vehicle)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-emerald-700 hover:text-emerald-800"
                      >
                        <History className="h-3.5 w-3.5" /> History
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {dialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <form onSubmit={handleSubmit} className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{ACTIONS[dialog.action].title}</h2>
                <p className="text-sm text-slate-500">
                  {dialog.vehicle.registrationNumber} · {dialog.vehicle.customerName} · {dialog.vehicle.loanId}
                </p>
              </div>
              <button type="button" onClick={() => setDialog(null)} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto px-6 py-5 text-sm">
              {ACTIONS[dialog.action].fields.map((field) => (
                <label key={field.key} className="block space-y-1">
                  <span className="font-medium text-slate-700">
                    {field.label}
                    {field.required && <span className="text-red-600"> *</span>}
                  </span>
                  {field.type === 'textarea' ? (
                    <textarea
                      rows={3}
                      value={form[field.key]}
                      placeholder={field.placeholder}
                      onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-emerald-700"
                    />
                  ) : (
                    <input
                      type={field.type || 'text'}
                      min={field.type === 'number' ? 0 : undefined}
                      value={form[field.key]}
                      placeholder={field.placeholder}
                      onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-emerald-700"
                    />
                  )}
                </label>
              ))}

              {salePreview && (
                <div className="space-y-1 rounded-lg bg-slate-50 px-4 py-3">
                  <div className="flex justify-between"><span className="text-slate-500">Loan outstanding</span><span className="font-medium">{formatCurrency(salePreview.outstanding)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Net sale proceeds</span><span className="font-medium">{formatCurrency(salePreview.net)}</span></div>
                  {salePreview.deficiency > 0 && (
                    <div className="flex justify-between text-red-700"><span>Shortfall (loss)</span><span className="font-semibold">{formatCurrency(salePreview.deficiency)}</span></div>
                  )}
                  {salePreview.surplus > 0 && (
                    <div className="flex justify-between text-emerald-700"><span>Surplus</span><span className="font-semibold">{formatCurrency(salePreview.surplus)}</span></div>
                  )}
                  <p className="pt-1 text-xs text-slate-500">Recording the sale closes the loan as Foreclosed.</p>
                </div>
              )}

              {formError && <p role="alert" className="text-red-600">{formError}</p>}
            </div>

            <div className="flex gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setDialog(null)}
                className="flex-1 rounded-lg border border-slate-300 bg-white py-2.5 font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-lg bg-[#006052] py-2.5 font-semibold text-white hover:bg-[#004d43] disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </form>
        </div>
      )}

      {history && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">History</h2>
                <p className="text-sm text-slate-500">{history.vehicle.registrationNumber} · {history.vehicle.customerName}</p>
              </div>
              <button type="button" onClick={() => setHistory(null)} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-5 text-sm">
              {history.loading && <p className="text-slate-500">Loading…</p>}
              {history.error && <p className="text-red-600">{history.error}</p>}
              {!history.loading && !history.error && history.events.length === 0 && (
                <p className="text-slate-500">No changes yet — the vehicle has been active since the loan started.</p>
              )}
              <ul className="space-y-3">
                {history.events.map((item) => (
                  <li key={item.id} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                    <p className="font-medium text-slate-800">
                      {EVENT_LABELS[item.type] || item.type}
                      <span className="font-normal text-slate-500">
                        {' '}· {formatDate(item.createdAt)}{item.performedBy ? ` · ${item.performedBy}` : ''}
                      </span>
                    </p>
                    <p className="text-slate-600">
                      {[
                        item.reason,
                        item.location && `Kept at ${item.location}`,
                        item.buyerName && `Buyer: ${item.buyerName}`,
                        item.salePrice ? `Price ${formatCurrency(item.salePrice)}` : null,
                        item.deficiency ? `Shortfall ${formatCurrency(item.deficiency)}` : null,
                        item.surplus ? `Surplus ${formatCurrency(item.surplus)}` : null,
                        item.remarks,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Vehicle
