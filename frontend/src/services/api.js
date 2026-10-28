// Fetch client for the Auto Finance API. The bearer token lives in
// sessionStorage so a closed tab signs the user out.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api'

// Fired after any successful create/update/delete, so views showing the same
// records (e.g. a loan's details after a payment) can reload.
export const DATA_CHANGED_EVENT = 'auto-finance:data-changed'

const TOKEN_KEY = 'auto_finance_token'
const USER_KEY = 'auto_finance_user'

export const getToken = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export const getSessionUser = () => {
  try {
    return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null')
  } catch {
    return null
  }
}

export const saveSession = (token, user) => {
  try {
    sessionStorage.setItem(TOKEN_KEY, token)
    sessionStorage.setItem(USER_KEY, JSON.stringify(user))
  } catch {
    // Storage can be unavailable (private mode); the app stays signed out.
  }
}

export const clearSession = () => {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(USER_KEY)
  } catch {
    // nothing to clear
  }
}

// Server codes meaning the whole lender account is locked out.
const LOCKED_OUT_CODES = ['SUBSCRIPTION_EXPIRED', 'TENANT_SUSPENDED']
const LOCKED_OUT_KEY = 'auto_finance_locked_out'

// The lock-out reason saved when a session was ended for it.
export const getLockedOutMessage = () => {
  try {
    return sessionStorage.getItem(LOCKED_OUT_KEY) || ''
  } catch {
    return ''
  }
}

export const clearLockedOutMessage = () => {
  try {
    sessionStorage.removeItem(LOCKED_OUT_KEY)
  } catch {
    // nothing to clear
  }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const request = async (path, options = {}) => {
  const token = getToken()

  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    })
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0)
  }

  // Any successful write tells open views to reload (see DATA_CHANGED_EVENT),
  // unless it is marked quiet (a preference that changes no business data).
  const isWrite = options.method && options.method !== 'GET' && !options.quiet
  if (isWrite && response.ok) window.dispatchEvent(new Event(DATA_CHANGED_EVENT))

  if (response.status === 204) return null

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    // An expired or revoked session: drop it and send the user to sign in.
    if (response.status === 401 && token) {
      clearSession()
      window.dispatchEvent(new Event('auto-finance:signed-out'))
    }
    // The lender's subscription ran out (or was suspended) mid-session: sign
    // out and let the sign-in page say why.
    if (response.status === 403 && token && LOCKED_OUT_CODES.includes(data?.code)) {
      clearSession()
      try {
        sessionStorage.setItem(LOCKED_OUT_KEY, data.error || '')
      } catch {
        // the sign-in page then shows no reason
      }
      window.dispatchEvent(new Event('auto-finance:signed-out'))
    }
    throw new ApiError(data?.error || `Request failed with status ${response.status}`, response.status)
  }

  return data
}

export const apiGet = (path) => request(path)
export const apiPost = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body ?? {}) })
export const apiPut = (path, body, { quiet = false } = {}) =>
  request(path, { method: 'PUT', body: JSON.stringify(body ?? {}), quiet })
export const apiDelete = (path) => request(path, { method: 'DELETE' })

export const login = async (username, password) => {
  const { token, user } = await apiPost('/auth/login', { username, password })
  saveSession(token, user)
  return user
}

export const logout = () => {
  // Best effort: tell the server, but sign out locally whatever happens.
  request('/auth/logout', { method: 'POST' }).catch(() => {})
  clearSession()
}
