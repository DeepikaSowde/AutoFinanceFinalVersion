import { apiDelete, apiGet, apiPost, apiPut } from './api'

// Admin-only on the server: anyone else gets a 403.

export const getUsers = () => apiGet('/auth/users')

export const createUser = ({ name, username, password, role, permissions }) =>
  apiPost('/auth/users', { name, username, password, role, permissions })

// A blank password keeps the current one.
export const updateUser = (userId, { name, password, role, permissions }) =>
  apiPut(`/auth/users/${userId}`, {
    name,
    role,
    permissions,
    ...(password ? { password } : {}),
  })

export const deleteUser = (userId) => apiDelete(`/auth/users/${userId}`)
