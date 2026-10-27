import { useState } from 'react'
import './App.css'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import LanguageSwitcher from './components/LanguageSwitcher'
import Sidebar from './components/Sidebar'
import Loans from './pages/Loans'
import NewLoan from './pages/NewLoan'
import Customer from './pages/customer/Customer'
import GuarantorReferral from './pages/customer/GuarantorReferral'
import ReferralCommission from './pages/customer/ReferralCommission'
import Investors from './pages/Investors/Investors'
import Ledger from './pages/Ledger/Ledger'
import ChitInvestment from './pages/ChitInvestment'
import Collection from './pages/Collection/Collection'
import Vehicle from './pages/Vehicle/Vehicle'

import Dashboard from './pages/Dashboard'
import UserManagement from './pages/UserManagement'
import Reminder from './pages/Reminder'
import SettingsOverview from './pages/Settings/SettingsOverview'
import PenaltyGraceSettings from './pages/Settings/PenaltyGraceSettings'
import ForeclosureVehicleSaleSettings from './pages/Settings/ForeclosureVehicleSaleSettings'
import PaymentAllocationSettings from './pages/Settings/PaymentAllocationSettings'
import SmartSearch from './pages/SmartSearch'
import SmartSearchFloatingButton from './components/SmartSearchFloatingButton'
import SubscriptionBanner from './components/SubscriptionBanner'
import Login from './pages/auth/Login'
import ProtectedRoute from './components/auth/ProtectedRoute'
import { getSessionUser } from './services/api'
import { canOpen, homePageFor } from './config/permissions'

// Shown for a page the signed-in user's permissions don't cover. The server
// refuses the data anyway; this just says so plainly.
function NoAccess() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-800">No access</h1>
        <p className="mt-2 text-sm text-slate-500">
          Your account can't open this page. Ask an admin to change your access in User Management.
        </p>
      </div>
    </div>
  )
}

function AppShell() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true)

  // Permissions come from the session, so an admin's change applies at the user's next sign-in.
  const user = getSessionUser()
  const home = homePageFor(user)
  const gate = (path, page) => (canOpen(user, path) ? page : <NoAccess />)

  return (
    <div className={`min-h-screen bg-white transition-all duration-300 ${isSidebarCollapsed ? 'sm:pl-20' : 'sm:pl-64'}`}>
      <Sidebar onCollapsedChange={setIsSidebarCollapsed} />
      <main className="min-h-screen flex flex-col bg-white">
        <SubscriptionBanner />
        <header className="hidden items-center justify-end px-4 sm:px-6">
          <LanguageSwitcher />
        </header>
        <Routes>
          <Route path="/" element={home ? <Navigate to={home} replace /> : <NoAccess />} />
          <Route path="/loans" element={gate('/loans', <Loans />)} />
          <Route path="/loans/:loanId" element={gate('/loans', <Loans />)} />
          <Route path="/dashboard" element={gate('/dashboard', <Dashboard />)} />
          <Route path="/smart-search" element={gate('/smart-search', <SmartSearch />)} />
          <Route path="/newloan" element={gate('/newloan', <NewLoan />)} />
          <Route path="/customers" element={gate('/customers', <Customer />)} />
          <Route path="/guarantor-referral" element={gate('/guarantor-referral', <GuarantorReferral />)} />
          <Route path="/customers/guarantor-referral" element={gate('/guarantor-referral', <GuarantorReferral />)} />
          <Route path="/referral-commission" element={gate('/referral-commission', <ReferralCommission />)} />
          <Route path="/customers/referral-commission" element={gate('/referral-commission', <ReferralCommission />)} />
          <Route path="/investors" element={gate('/investors', <Investors />)} />
          <Route path="/ledger" element={gate('/ledger', <Ledger />)} />

          <Route path="/chit-investment" element={gate('/chit-investment', <ChitInvestment />)} />
          <Route path="/collection" element={gate('/collection', <Collection />)} />
          <Route path="/vehicle" element={gate('/vehicle', <Vehicle />)} />
          <Route path="/users" element={gate('/users', <UserManagement />)} />
          <Route path="/reminders" element={gate('/reminders', <Reminder />)} />
          <Route path="/settings" element={gate('/settings', <SettingsOverview />)} />
          <Route path="/settings/penalty-grace" element={gate('/settings', <PenaltyGraceSettings />)} />
          <Route path="/settings/foreclosure-vehicle-sale" element={gate('/settings', <ForeclosureVehicleSaleSettings />)} />
          <Route path="/settings/payment-allocation" element={gate('/settings', <PaymentAllocationSettings />)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        {canOpen(user, '/smart-search') && <SmartSearchFloatingButton />}
      </main>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
