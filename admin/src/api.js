// Client for the MotoLend super admin API. Talks only to /api/superadmin.
// The session token is kept in sessionStorage: closing the tab signs out.

const BASE = `${(import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000').replace(/\/$/, '')}/api/superadmin`
const TOKEN_KEY = 'motolend_superadmin_token'
const ADMIN_KEY = 'motolend_superadmin'

export const SIGNED_OUT_EVENT = 'motolend-admin:signed-out'

const read = (key) => {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

export const getToken = () => read(TOKEN_KEY) || ''

export const getSignedInAdmin = () => {
  try {
    return JSON.parse(read(ADMIN_KEY) || 'null')
  } catch {
    return null
  }
}

const clearSession = () => {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(ADMIN_KEY)
  } catch {
    // nothing stored
  }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

const request = async (method, path, body) => {
  const token = getToken()
  let response
  try {
    response = await fetch(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Cannot reach the MotoLend API. Check your connection.', 0)
  }

  if (response.status === 204) return null
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    if (response.status === 401 && token) {
      clearSession()
      window.dispatchEvent(new Event(SIGNED_OUT_EVENT))
    }
    throw new ApiError(data?.error || `Request failed (${response.status})`, response.status)
  }
  return data
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body = {}) => request('POST', path, body),
  patch: (path, body = {}) => request('PATCH', path, body),
  put: (path, body = {}) => request('PUT', path, body),
}

export const signIn = async (email, password) => {
  const { token, superAdmin } = await request('POST', '/auth/login', { email, password })
  try {
    sessionStorage.setItem(TOKEN_KEY, token)
    sessionStorage.setItem(ADMIN_KEY, JSON.stringify(superAdmin))
  } catch {
    // private mode without storage: the session lasts until reload
  }
  return superAdmin
}

export const signOut = async () => {
  await request('POST', '/auth/logout').catch(() => {})
  clearSession()
}

export const query = (params) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value !== null && value !== undefined) search.set(key, value)
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}
