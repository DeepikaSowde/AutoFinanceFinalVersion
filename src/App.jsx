
import { useState } from 'react'
import './App.css'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import LanguageSwitcher from './components/LanguageSwitcher'
import Sidebar from './components/Sidebar'
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

function App() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true)

  return (
    <BrowserRouter>
      <div className={`min-h-screen bg-slate-50 transition-all duration-300 ${isSidebarCollapsed ? 'sm:pl-20' : 'sm:pl-64'}`}>
        <Sidebar onCollapsedChange={setIsSidebarCollapsed} />
        <main className="min-h-screen flex flex-col sm:pl-3">
          <header className="hidden items-center justify-end px-4 sm:px-6">
            <LanguageSwitcher />
          </header>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/loans" element={<Loans />} />
            <Route path="/loans/:loanId" element={<Loans />} />
            <Route path="/newloan" element={<NewLoan />} />
            <Route path="/customers" element={<Customer />} />
            <Route path="/guarantor-referral" element={<GuarantorReferral />} />
            <Route path="/customers/guarantor-referral" element={<GuarantorReferral />} />
            <Route path="/referral-commission" element={<ReferralCommission />} />
            <Route path="/customers/referral-commission" element={<ReferralCommission />} />
            <Route path="/investors" element={<Investors />} />
            <Route path="/ledger" element={<Ledger />} />
            <Route path="/collection" element={<Collection />} />
            <Route path="/vehicle" element={<Vehicle />} />
            <Route path="/users" element={<UserManagement />} />
            <Route path="/settings" element={<SettingsOverview />} />
            <Route path="/settings/penalty-grace" element={<PenaltyGraceSettings />} />
            <Route path="/reminders" element={<Reminder />} />
            <Route path="/chit-investment" element={<ChitInvestment />} />
            <Route path="*" element={<Navigate to="/newloan" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
