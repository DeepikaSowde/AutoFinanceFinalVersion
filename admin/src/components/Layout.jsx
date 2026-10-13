import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Building2, LayoutDashboard, LogOut, ScrollText, Tags } from 'lucide-react'

import { getSignedInAdmin, signOut } from '../api'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/tenants', label: 'Tenants', icon: Building2 },
  { to: '/plans', label: 'Plans', icon: Tags },
  { to: '/audit-log', label: 'Audit log', icon: ScrollText },
]

// Dark slate sidebar on large screens; on small screens it becomes a top
// bar with the navigation in a scrollable row.
export default function Layout() {
  const navigate = useNavigate()
  const admin = getSignedInAdmin()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  const linkClass = ({ isActive }) =>
    `flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-teal-400 ${
      isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
    }`

  return (
    <div className="min-h-screen lg:flex">
      <aside className="bg-slate-900 text-slate-100 lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-60 lg:flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-4 lg:px-5 lg:py-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700 text-sm font-bold text-white">M</span>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-white">MotoLend</p>
              <p className="text-xs text-slate-400">Super admin</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white lg:hidden"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
          </button>
        </div>

        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={linkClass}>
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden border-t border-slate-800 px-5 py-4 lg:block">
          <p className="truncate text-sm font-medium text-white">{admin?.name}</p>
          <p className="truncate text-xs text-slate-400">{admin?.email}</p>
          <button
            type="button"
            onClick={handleSignOut}
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-slate-300 hover:text-white"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:ml-60 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
