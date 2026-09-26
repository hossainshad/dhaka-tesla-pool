import { createContext, useContext, useEffect, useState } from 'react'
import { api } from './api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('token')))

  useEffect(() => {
    if (!localStorage.getItem('token')) return
    api('/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false))
  }, [])

  function saveSession(data) {
    localStorage.setItem('token', data.token)
    setUser(data.user)
  }

  async function login(email, password) {
    saveSession(await api('/auth/login', { method: 'POST', body: { email, password } }))
  }

  async function register(name, email, password) {
    saveSession(await api('/auth/register', { method: 'POST', body: { name, email, password } }))
  }

  async function refreshUser() {
    const data = await api('/auth/me')
    setUser(data.user)
  }

  function logout() {
    localStorage.removeItem('token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
