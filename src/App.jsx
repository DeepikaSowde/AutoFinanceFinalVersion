
import { useState, useEffect } from 'react'
import './App.css'
import { BrowserRouter, Navigate, Route, Routes, Outlet } from 'react-router-dom'
import LanguageSwitcher from './components/LanguageSwitcher'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import Loans from './pages/Loans'
import NewLoan from './pages/NewLoan'
import Customer from './pages/customer/Customer'
import Investors from './pages/Investors/Investors'
import Ledger from './pages/Ledger/Ledger'
import Collection from './pages/Collection/Collection'
import Vehicle from './pages/Vehicle/Vehicle'

import Dashboard from './pages/Dashboard'
import UserManagement from './pages/UserManagement'
import Reminder from './pages/Reminder'
import GuarantorReferral from './pages/customer/GuarantorReferral'
import ReferralCommission from './pages/customer/ReferralCommission'
import ChitInvestment from './pages/ChitInvestment'
import SettingsOverview from './pages/Settings/SettingsOverview'
import PenaltyGraceSettings from './pages/Settings/PenaltyGraceSettings'
import ForeclosureVehicleSaleSettings from './pages/Settings/ForeclosureVehicleSaleSettings'
import SmartSearch from './pages/SmartSearch'
import SmartSearchFloatingButton from './components/SmartSearchFloatingButton'

import { ShieldAlert } from 'lucide-react'
import {
  getCurrentUser,
  hasPathPermission,
  SESSION_UPDATE_EVENT,
  PERMISSION_UPDATE_EVENT,
} from './utils/userManagementStorage'

function ProtectedRoute({ path, children }) {
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser())

  useEffect(() => {
    const handleUpdate = () => setCurrentUser(getCurrentUser())
    window.addEventListener(SESSION_UPDATE_EVENT, handleUpdate)
    window.addEventListener(PERMISSION_UPDATE_EVENT, handleUpdate)
    window.addEventListener('storage', handleUpdate)
    return () => {
      window.removeEventListener(SESSION_UPDATE_EVENT, handleUpdate)
      window.removeEventListener(PERMISSION_UPDATE_EVENT, handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [])

  if (!currentUser) {
    return <Navigate to="/login" replace />
  }

  if (currentUser && currentUser.role === 'Staff' && !hasPathPermission(currentUser, path)) {
    return (
      <div className="flex-1 min-h-[80vh] flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm max-w-md w-full space-y-4">
          <div className="h-16 w-16 bg-rose-50 rounded-2xl border border-rose-100 flex items-center justify-center mx-auto text-rose-600">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">Access Restricted</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            Your Staff account does not have permission to access this module. Please contact your system administrator to request access.
          </p>
          <a
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#006B52] hover:bg-[#005344] text-white text-sm font-semibold transition-all shadow-xs"
          >
            Return to Dashboard
          </a>
        </div>
      </div>
    )
  }

  return children
}

function AuthenticatedLayout() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true)
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser())

  useEffect(() => {
    const handleUpdate = () => setCurrentUser(getCurrentUser())
    window.addEventListener(SESSION_UPDATE_EVENT, handleUpdate)
    window.addEventListener(PERMISSION_UPDATE_EVENT, handleUpdate)
    window.addEventListener('storage', handleUpdate)
    return () => {
      window.removeEventListener(SESSION_UPDATE_EVENT, handleUpdate)
      window.removeEventListener(PERMISSION_UPDATE_EVENT, handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [])

  if (!currentUser) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className={`min-h-screen bg-white transition-all duration-300 ${isSidebarCollapsed ? 'sm:pl-20' : 'sm:pl-64'}`}>
      <Sidebar onCollapsedChange={setIsSidebarCollapsed} />
      <main className="min-h-screen flex flex-col bg-white">
        <header className="hidden items-center justify-end px-4 sm:px-6">
          <LanguageSwitcher />
        </header>
        <Outlet />
        <SmartSearchFloatingButton />
      </main>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<AuthenticatedLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<ProtectedRoute path="/dashboard"><Dashboard /></ProtectedRoute>} />
          <Route path="/smart-search" element={<SmartSearch />} />
          <Route path="/loans" element={<ProtectedRoute path="/loans"><Loans /></ProtectedRoute>} />
          <Route path="/loans/:loanId" element={<ProtectedRoute path="/loans"><Loans /></ProtectedRoute>} />
          <Route path="/newloan" element={<ProtectedRoute path="/loans"><NewLoan /></ProtectedRoute>} />
          <Route path="/customers" element={<ProtectedRoute path="/customers"><Customer /></ProtectedRoute>} />
          <Route path="/guarantor-referral" element={<ProtectedRoute path="/customers"><GuarantorReferral /></ProtectedRoute>} />
          <Route path="/customers/guarantor-referral" element={<ProtectedRoute path="/customers"><GuarantorReferral /></ProtectedRoute>} />
          <Route path="/referral-commission" element={<ProtectedRoute path="/customers"><ReferralCommission /></ProtectedRoute>} />
          <Route path="/customers/referral-commission" element={<ProtectedRoute path="/customers"><ReferralCommission /></ProtectedRoute>} />
          <Route path="/investors" element={<ProtectedRoute path="/investors"><Investors /></ProtectedRoute>} />
          <Route path="/ledger" element={<ProtectedRoute path="/ledger"><Ledger /></ProtectedRoute>} />
          <Route path="/collection" element={<ProtectedRoute path="/collection"><Collection /></ProtectedRoute>} />
          <Route path="/vehicle" element={<ProtectedRoute path="/vehicle"><Vehicle /></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute path="/users"><UserManagement /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute path="/settings"><SettingsOverview /></ProtectedRoute>} />
          <Route path="/settings/penalty-grace" element={<ProtectedRoute path="/settings"><PenaltyGraceSettings /></ProtectedRoute>} />
          <Route path="/settings/foreclosure-vehicle-sale" element={<ProtectedRoute path="/settings"><ForeclosureVehicleSaleSettings /></ProtectedRoute>} />
          <Route path="/reminders" element={<ProtectedRoute path="/reminders"><Reminder /></ProtectedRoute>} />
          <Route path="/chit-investment" element={<ProtectedRoute path="/investors"><ChitInvestment /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
