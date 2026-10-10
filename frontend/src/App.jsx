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
import Login from './pages/auth/Login'
import ProtectedRoute from './components/auth/ProtectedRoute'

function AppShell() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => window.innerWidth >= 640 && window.innerWidth < 1024)

  return (
    <div className={`min-h-screen bg-slate-50 transition-all duration-300 ${isSidebarCollapsed ? 'sm:pl-20' : 'sm:pl-64'}`}>
      <Sidebar onCollapsedChange={setIsSidebarCollapsed} />
      <main className="min-h-screen flex flex-col sm:pl-3">
        <header className="flex h-12 shrink-0 items-center justify-end px-4 sm:px-6">
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
