
import { useState } from 'react'
import './App.css'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import LanguageSwitcher from './components/LanguageSwitcher'
import Sidebar from './components/Sidebar'
import NewLoan from './pages/NewLoan'
import Customer from './pages/customer/Customer'
import Investors from './pages/Investors/Investors'
import Ledger from './pages/Ledger/Ledger'
import Collection from './pages/Collection/Collection'
import Vehicle from './pages/Vehicle/Vehicle'

import Dashboard from './pages/Dashboard'
import UserManagement from './pages/UserManagement'
import Reminder from './pages/Reminder'

function App() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  return (
    <BrowserRouter>
      <div className={`h-screen overflow-hidden bg-slate-50 ${isSidebarCollapsed ? 'sm:pl-20' : 'sm:pl-64'}`}>
        <Sidebar onCollapsedChange={setIsSidebarCollapsed} />
        <main className="h-screen overflow-hidden sm:pl-3">
          <header className="flex h-12 items-center justify-end px-4 sm:px-6">
            <LanguageSwitcher />
          </header>
          <Routes>
            <Route path="/" element={<Navigate to="/newloan" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/newloan" element={<NewLoan />} />
            <Route path="/customers" element={<Customer />} />
            <Route path="/investors" element={<Investors />} />
            <Route path="/ledger" element={<Ledger />} />
            <Route path="/collection" element={<Collection />} />
            <Route path="/vehicle" element={<Vehicle />} />
            <Route path="/users" element={<UserManagement />} />
            <Route path="/reminders" element={<Reminder />} />
            <Route path="*" element={<Navigate to="/newloan" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
