import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { SIGNED_OUT_EVENT, getToken } from './api'
import Layout from './components/Layout'
import AuditLog from './pages/AuditLog'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Plans from './pages/Plans'
import TenantDetail from './pages/TenantDetail'
import Tenants from './pages/Tenants'

// Renders the app only while signed in; an expired session (401) sends the
// super admin back to the sign-in page.
function RequireSignIn({ children }) {
  const [signedIn, setSignedIn] = useState(() => Boolean(getToken()))

  useEffect(() => {
    const onSignedOut = () => setSignedIn(false)
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut)
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut)
  }, [])

  return signedIn ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <RequireSignIn>
              <Layout />
            </RequireSignIn>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="tenants" element={<Tenants />} />
          <Route path="tenants/:id" element={<TenantDetail />} />
          <Route path="plans" element={<Plans />} />
          <Route path="audit-log" element={<AuditLog />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
