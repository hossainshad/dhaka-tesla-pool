const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export class ApiError extends Error {
  constructor(message, code, details) {
    super(message)
    this.code = code
    this.details = details
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const token = localStorage.getItem('token')
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  let response
  try {
    response = await fetch(`${API_URL}/api${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('Cannot reach the server. Is the API running?', 'NETWORK_ERROR')
  }

  if (response.status === 401 && token) {
    localStorage.removeItem('token')
    window.location.href = '/login'
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new ApiError(data.error?.message || 'Something went wrong', data.error?.code, data.error?.details)
  }
  return data
}

export function errorText(err) {
  if (err.details?.length) return err.details.map((d) => d.message).join('. ')
  return err.message
}

export function taka(paisa) {
  return `৳${(paisa / 100).toFixed(0)}`
}
