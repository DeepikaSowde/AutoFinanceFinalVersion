import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { getToken } from '../../services/api'

// Renders its children only while a session token exists; an expired
// session (the API answers 401) signs the user out via a window event.
const ProtectedRoute = ({ children }) => {
  const [signedIn, setSignedIn] = useState(() => Boolean(getToken()))

  useEffect(() => {
    const onSignedOut = () => setSignedIn(false)
    window.addEventListener('auto-finance:signed-out', onSignedOut)
    return () => window.removeEventListener('auto-finance:signed-out', onSignedOut)
  }, [])

  return signedIn ? children : <Navigate to="/login" replace />
}

export default ProtectedRoute
