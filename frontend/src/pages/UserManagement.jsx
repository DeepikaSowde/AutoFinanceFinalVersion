import { useEffect, useState } from 'react'
import { Pencil, Plus, ShieldCheck, Trash2, UserCog, X } from 'lucide-react'

import { getSessionUser } from '../services/api'
import { createUser, deleteUser, getUsers, updateUser } from '../services/userApi'
import { ACTION_LABELS, DEFAULT_STAFF_PERMISSIONS, PERMISSION_MODULES } from '../config/permissions'

const emptyForm = () => ({
  name: '',
  username: '',
  password: '',
  role: 'staff',
  permissions: structuredClone(DEFAULT_STAFF_PERMISSIONS),
})

const accessSummary = (user) => {
  if (user.role === 'admin') return 'Full access'
  const modules = PERMISSION_MODULES.filter((m) => user.permissions?.[m.key]?.view).map((m) => m.label)
  return modules.length ? modules.join(', ') : 'No access'
}

const RoleBadge = ({ role }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
      role === 'admin' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
    }`}
  >
    {role === 'admin' && <ShieldCheck className="h-3.5 w-3.5" />}
    {role === 'admin' ? 'Admin' : 'Staff'}
  </span>
)

const inputClasses =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700 disabled:bg-slate-50 disabled:text-slate-500'

const UserManagement = () => {
  const me = getSessionUser()
  const isAdmin = me?.role === 'admin'

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(isAdmin)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  // null = closed; { mode: 'add' } or { mode: 'edit', user }
  const [dialog, setDialog] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!isAdmin) return
    let active = true

    getUsers()
      .then((list) => {
        if (!active) return
        setUsers(list)
        setLoadError('')
      })
      .catch((error) => active && setLoadError(error.message))
      .finally(() => active && setLoading(false))

    return () => {
      active = false
    }
  }, [isAdmin, reloadKey])

  const reload = () => setReloadKey((key) => key + 1)

  const flash = (message) => {
    setNotice(message)
    setTimeout(() => setNotice(''), 4000)
  }

  const openAdd = () => {
    setForm(emptyForm())
    setFormError('')
    setDialog({ mode: 'add' })
  }

  const openEdit = (user) => {
    setForm({
      name: user.name,
      username: user.username,
      password: '',
      role: user.role,
      permissions: structuredClone(user.permissions || {}),
    })
    setFormError('')
    setDialog({ mode: 'edit', user })
  }

  const setField = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }))

  // Any action implies view, and clearing view clears the module (the server applies the same rule).
  const togglePermission = (moduleKey, action) => {
    setForm((current) => {
      const module = { ...(current.permissions[moduleKey] || {}) }
      const turningOn = !module[action]

      if (action === 'view' && !turningOn) {
        const rest = { ...current.permissions }
        delete rest[moduleKey]
        return { ...current, permissions: rest }
      }

      module[action] = turningOn
      if (turningOn) module.view = true
      if (!turningOn) delete module[action]

      return { ...current, permissions: { ...current.permissions, [moduleKey]: module } }
    })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return

    if (!form.name.trim()) return setFormError('Name is required.')
    if (dialog.mode === 'add' && !form.username.trim()) return setFormError('Username is required.')
    if (dialog.mode === 'add' && form.password.length < 6) return setFormError('Password must be at least 6 characters.')
    if (dialog.mode === 'edit' && form.password && form.password.length < 6)
      return setFormError('Password must be at least 6 characters.')

    setSaving(true)
    setFormError('')
    try {
      if (dialog.mode === 'add') {
        await createUser(form)
        flash(`${form.name.trim()} added.`)
      } else {
        await updateUser(dialog.user.id, form)
        flash(
          form.password && dialog.user.id !== me.userId
            ? `${form.name.trim()} updated. Their new password takes effect now and they have been signed out.`
            : `${form.name.trim()} updated.`
        )
      }
      setDialog(null)
      reload()
    } catch (error) {
      setFormError(error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (user) => {
    if (!window.confirm(`Remove ${user.name} (${user.username})? They will no longer be able to sign in.`)) return
    try {
      await deleteUser(user.id)
      flash(`${user.name} removed.`)
      reload()
    } catch (error) {
      alert(error.message)
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <UserCog className="mx-auto mb-4 h-10 w-10 text-slate-400" />
          <h1 className="text-lg font-semibold text-slate-800">Admins only</h1>
          <p className="mt-2 text-sm text-slate-500">Ask an admin to add users or change access.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="mt-1 text-sm text-slate-500">Who can sign in, and what staff can see and do.</p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#006052] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#004d43]"
        >
          <Plus className="h-4 w-4" /> Add User
        </button>
      </div>

      {loadError && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load users: {loadError}{' '}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => {
              setLoading(true)
              reload()
            }}
          >
            Retry
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Access</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">Loading users…</td>
              </tr>
            )}
            {!loading &&
              users.map((user) => {
                const isMe = user.id === me.userId
                return (
                  <tr key={user.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {user.name}
                      {isMe && <span className="ml-2 text-xs font-normal text-slate-500">(you)</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{user.username}</td>
                    <td className="px-4 py-3"><RoleBadge role={user.role} /></td>
                    <td className="max-w-xs px-4 py-3 text-slate-600">{accessSummary(user)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(user)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-emerald-700 hover:text-emerald-800"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(user)}
                          disabled={isMe}
                          title={isMe ? "You can't remove your own account" : undefined}
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      {notice && (
        <div className="fixed bottom-6 right-6 z-[70] rounded-lg bg-[#006052] px-5 py-3.5 text-sm font-medium text-white shadow-xl">
          {notice}
        </div>
      )}

      {dialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleSubmit}
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">
                {dialog.mode === 'add' ? 'Add User' : `Edit ${dialog.user.name}`}
              </h2>
              <button type="button" onClick={() => setDialog(null)} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-slate-700">Name</span>
                  <input className={inputClasses} value={form.name} onChange={setField('name')} autoFocus />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-slate-700">Username</span>
                  <input
                    className={inputClasses}
                    value={form.username}
                    onChange={setField('username')}
                    disabled={dialog.mode === 'edit'}
                    autoComplete="off"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-slate-700">
                    {dialog.mode === 'add' ? 'Password' : 'New password'}
                  </span>
                  <input
                    type="password"
                    className={inputClasses}
                    value={form.password}
                    onChange={setField('password')}
                    placeholder={dialog.mode === 'edit' ? 'Leave blank to keep the current one' : 'At least 6 characters'}
                    autoComplete="new-password"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-slate-700">Role</span>
                  <select className={inputClasses} value={form.role} onChange={setField('role')}>
                    <option value="staff">Staff — only the access ticked below</option>
                    <option value="admin">Admin — full access, manages users</option>
                  </select>
                </label>
              </div>

              {form.role === 'staff' && (
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">Staff access</p>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-slate-100">
                        {PERMISSION_MODULES.map((module) => (
                          <tr key={module.key}>
                            <td className="w-32 px-3 py-2 font-medium text-slate-800">{module.label}</td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-x-4 gap-y-1">
                                {module.actions.map((action) => (
                                  <label key={action} className="inline-flex items-center gap-1.5 text-slate-700">
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 accent-emerald-700"
                                      checked={Boolean(form.permissions[module.key]?.[action])}
                                      onChange={() => togglePermission(module.key, action)}
                                    />
                                    {ACTION_LABELS[action]}
                                  </label>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
            </div>

            <div className="flex gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setDialog(null)}
                className="flex-1 rounded-lg border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-lg bg-[#006052] py-2.5 text-sm font-semibold text-white hover:bg-[#004d43] disabled:opacity-50"
              >
                {saving ? 'Saving…' : dialog.mode === 'add' ? 'Add User' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

export default UserManagement
