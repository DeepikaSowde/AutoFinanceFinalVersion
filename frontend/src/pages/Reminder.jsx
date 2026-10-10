import { useEffect, useMemo, useState } from 'react'
import { BellRing, CalendarClock, MessageCircle, Phone, Search, TriangleAlert, X } from 'lucide-react'

import { getSessionUser } from '../services/api'
import { loadReminderData, logFollowUp } from '../services/reminderApi'

const DUE_SOON_DAYS = 7
const OUTCOMES = ['Promised to pay', 'Not reachable', 'Asked for more time', 'Paid', 'Other']

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

// Local calendar dates as YYYY-MM-DD, so "today" is the user's today.
const localDate = (date = new Date()) => date.toLocaleDateString('en-CA')
const addDays = (days) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return localDate(date)
}
const daysBetween = (from, to) => Math.round((new Date(to) - new Date(from)) / 86400000)

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const phoneDigits = (entry) => `${entry.customer?.countryCode || '+91'}${entry.customer?.mobile || ''}`.replace(/\D/g, '')

const whatsappLink = (row) => {
  const text =
    `Hello ${row.entry.customer?.name || ''}, this is a reminder that ${formatCurrency(row.dueAmount)} ` +
    `is due on your loan ${row.entry.loanId}` +
    (row.daysOverdue > 0 ? ` (overdue by ${row.daysOverdue} day${row.daysOverdue === 1 ? '' : 's'})` : ` on ${formatDate(row.oldestDue)}`) +
    '. Please pay at the earliest. Thank you.'
  return `https://wa.me/${phoneDigits(row.entry)}?text=${encodeURIComponent(text)}`
}

const canLog = (user) =>
  user?.role === 'admin' || Boolean(user?.permissions?.reminders?.add || user?.permissions?.reminders?.edit)

const TABS = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'soon', label: `Due in ${DUE_SOON_DAYS} days` },
  { key: 'followups', label: 'Follow-ups today' },
]

const Reminder = () => {
  const user = getSessionUser()
  const [data, setData] = useState({ entries: [], reminders: [] })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [tab, setTab] = useState('overdue')
  const [search, setSearch] = useState('')

  const [logging, setLogging] = useState(null) // row being logged
  const [form, setForm] = useState({ outcome: OUTCOMES[0], note: '', nextReminderDate: '' })
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true

    loadReminderData()
      .then((loaded) => {
        if (!active) return
        setData(loaded)
        setLoadError('')
      })
      .catch((error) => active && setLoadError(error.message))
      .finally(() => active && setLoading(false))

    return () => {
      active = false
    }
  }, [reloadKey])

  const today = localDate()

  // One row per loan with something unpaid due by the horizon, plus its follow-up record.
  const rows = useMemo(() => {
    const horizon = addDays(DUE_SOON_DAYS)
    const reminderByLoan = new Map(data.reminders.map((reminder) => [reminder.loanId, reminder]))

    return data.entries
      .map((entry) => {
        const unpaid = (entry.repaymentSchedule || [])
          .map((row) => ({ ...row, remaining: Math.max(0, Number(row.emi || 0) - Number(row.amountPaid || 0)) }))
          .filter((row) => row.remaining > 0.009 && row.dueDate && row.dueDate <= horizon)

        if (!unpaid.length) return null

        const oldestDue = unpaid[0].dueDate
        const overdue = unpaid.filter((row) => row.dueDate < today)

        return {
          entry,
          reminder: reminderByLoan.get(entry.loanId) || null,
          dueAmount: unpaid.reduce((sum, row) => sum + row.remaining, 0),
          overdueAmount: overdue.reduce((sum, row) => sum + row.remaining, 0),
          overdueCount: overdue.length,
          oldestDue,
          daysOverdue: Math.max(0, daysBetween(oldestDue, today)),
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.daysOverdue - a.daysOverdue || a.oldestDue.localeCompare(b.oldestDue))
  }, [data, today])

  const lists = {
    overdue: rows.filter((row) => row.overdueCount > 0),
    soon: rows.filter((row) => row.overdueCount === 0),
    followups: rows.filter(
      (row) => row.reminder?.status === 'Active' && row.reminder.nextReminderDate && row.reminder.nextReminderDate <= today
    ),
  }

  const query = search.trim().toLowerCase()
  const visible = lists[tab].filter(
    (row) =>
      !query ||
      row.entry.customer?.name?.toLowerCase().includes(query) ||
      row.entry.loanId?.toLowerCase().includes(query) ||
      row.entry.customer?.mobile?.includes(query) ||
      row.entry.vehicle?.regNo?.toLowerCase().includes(query)
  )

  const openLog = (row) => {
    setLogging(row)
    setForm({ outcome: OUTCOMES[0], note: '', nextReminderDate: addDays(1) })
    setFormError('')
  }

  const handleSave = async (event) => {
    event.preventDefault()
    if (saving) return
    if (form.outcome !== 'Paid' && !form.nextReminderDate) {
      setFormError('Choose when to follow up next.')
      return
    }

    setSaving(true)
    setFormError('')
    try {
      await logFollowUp({
        entry: logging.entry,
        existing: logging.reminder,
        outcome: form.outcome,
        note: form.note,
        nextReminderDate: form.outcome === 'Paid' ? '' : form.nextReminderDate,
        by: user?.name,
      })
      setLogging(null)
      setReloadKey((key) => key + 1)
    } catch (error) {
      setFormError(error.message)
    } finally {
      setSaving(false)
    }
  }

  const totalOverdue = lists.overdue.reduce((sum, row) => sum + row.overdueAmount, 0)

  return (
    <div className="w-full bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reminders</h1>
          <p className="mt-1 text-sm text-slate-500">Customers to contact about overdue and upcoming payments.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, loan, mobile, vehicle"
            className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052]"
          />
        </div>
      </div>

      {loadError && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load reminders: {loadError}{' '}
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

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { icon: TriangleAlert, label: 'Overdue loans', value: lists.overdue.length, sub: formatCurrency(totalOverdue), tone: 'bg-red-50 text-red-600' },
          { icon: CalendarClock, label: `Due in ${DUE_SOON_DAYS} days`, value: lists.soon.length, sub: 'not yet overdue', tone: 'bg-amber-50 text-amber-600' },
          { icon: BellRing, label: 'Follow-ups today', value: lists.followups.length, sub: 'scheduled for today or earlier', tone: 'bg-emerald-50 text-emerald-700' },
        ].map(({ icon: Icon, label, value, sub, tone }) => (
          <div key={label} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500">{label}</p>
              <p className="text-xl font-bold text-slate-900">
                {value} <span className="text-xs font-medium text-slate-500">{sub}</span>
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-3 flex gap-2 overflow-x-auto">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold ${
              tab === key ? 'bg-[#006052] text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {label} ({lists[key].length})
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Loan</th>
              <th className="px-4 py-3">Due</th>
              <th className="px-4 py-3">Last follow-up</th>
              <th className="px-4 py-3">Next</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">Loading…</td>
              </tr>
            )}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">Nothing here right now.</td>
              </tr>
            )}
            {!loading &&
              visible.map((row) => (
                <tr key={row.entry.loanId} className="align-top hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{row.entry.customer?.name}</p>
                    <p className="text-xs text-slate-500">
                      {row.entry.customer?.countryCode} {row.entry.customer?.mobile}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{row.entry.loanId}</p>
                    <p className="text-xs text-slate-500">{row.entry.vehicle?.regNo}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{formatCurrency(row.dueAmount)}</p>
                    <p className={`text-xs ${row.daysOverdue > 0 ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
                      {row.daysOverdue > 0
                        ? `${row.daysOverdue} day${row.daysOverdue === 1 ? '' : 's'} overdue · ${row.overdueCount} EMI${row.overdueCount === 1 ? '' : 's'}`
                        : `due ${formatDate(row.oldestDue)}`}
                    </p>
                  </td>
                  <td className="max-w-[220px] px-4 py-3">
                    {row.reminder?.lastOutcome ? (
                      <>
                        <p className="font-medium text-slate-800">{row.reminder.lastOutcome}</p>
                        <p className="truncate text-xs text-slate-500" title={row.reminder.lastNote}>
                          {formatDate(row.reminder.history?.[0]?.at)}
                          {row.reminder.lastNote ? ` · ${row.reminder.lastNote}` : ''}
                        </p>
                      </>
                    ) : (
                      <span className="text-slate-400">None yet</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {row.reminder?.status === 'Active' ? formatDate(row.reminder.nextReminderDate) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <a
                        href={`tel:+${phoneDigits(row.entry)}`}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-emerald-700 hover:text-emerald-800"
                      >
                        <Phone className="h-3.5 w-3.5" /> Call
                      </a>
                      <a
                        href={whatsappLink(row)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-emerald-700 hover:text-emerald-800"
                      >
                        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                      </a>
                      {canLog(user) && (
                        <button
                          type="button"
                          onClick={() => openLog(row)}
                          className="rounded-md bg-[#006052] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#004d43]"
                        >
                          Log follow-up
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {logging && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <form onSubmit={handleSave} className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Log follow-up</h2>
                <p className="text-sm text-slate-500">
                  {logging.entry.customer?.name} · {logging.entry.loanId} · {formatCurrency(logging.dueAmount)} due
                </p>
              </div>
              <button type="button" onClick={() => setLogging(null)} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto px-6 py-5 text-sm">
              <label className="block space-y-1">
                <span className="font-medium text-slate-700">Outcome</span>
                <select
                  value={form.outcome}
                  onChange={(event) => setForm((current) => ({ ...current, outcome: event.target.value }))}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-emerald-700"
                >
                  {OUTCOMES.map((outcome) => (
                    <option key={outcome}>{outcome}</option>
                  ))}
                </select>
              </label>
              {form.outcome === 'Paid' && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800">
                  This closes the reminder. Record the money itself on the Collection page.
                </p>
              )}
              <label className="block space-y-1">
                <span className="font-medium text-slate-700">Note</span>
                <textarea
                  rows={3}
                  value={form.note}
                  onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                  placeholder="e.g. Will pay on Friday after salary"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-emerald-700"
                />
              </label>
              {form.outcome !== 'Paid' && (
                <label className="block space-y-1">
                  <span className="font-medium text-slate-700">Next follow-up</span>
                  <input
                    type="date"
                    min={today}
                    value={form.nextReminderDate}
                    onChange={(event) => setForm((current) => ({ ...current, nextReminderDate: event.target.value }))}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-emerald-700"
                  />
                </label>
              )}

              {logging.reminder?.history?.length > 0 && (
                <div>
                  <p className="mb-2 font-medium text-slate-700">History</p>
                  <ul className="space-y-2">
                    {logging.reminder.history.map((item) => (
                      <li key={item.at} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                        <p className="font-medium text-slate-800">
                          {item.outcome} <span className="font-normal text-slate-500">· {formatDate(item.at)}{item.by ? ` · ${item.by}` : ''}</span>
                        </p>
                        {item.note && <p className="text-slate-600">{item.note}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {formError && <p role="alert" className="text-red-600">{formError}</p>}
            </div>

            <div className="flex gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setLogging(null)}
                className="flex-1 rounded-lg border border-slate-300 bg-white py-2.5 font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-lg bg-[#006052] py-2.5 font-semibold text-white hover:bg-[#004d43] disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

export default Reminder
