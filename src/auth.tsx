import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from './api'

interface AuthState {
  ready: boolean
  admin: boolean
  editMode: boolean
  setEditMode: (v: boolean) => void
  loginOpen: boolean
  setLoginOpen: (v: boolean) => void
  login: (password: string) => Promise<void>
  logout: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [admin, setAdmin] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)

  useEffect(() => {
    api
      .get<{ admin: boolean }>('/api/me')
      .then((r) => setAdmin(r.admin))
      .catch(() => {})
      .finally(() => setReady(true))
  }, [])

  const login = useCallback(async (password: string) => {
    await api.post('/api/login', { password })
    setAdmin(true)
    setEditMode(true)
    setLoginOpen(false)
  }, [])

  const logout = useCallback(async () => {
    await api.post('/api/logout')
    setAdmin(false)
    setEditMode(false)
  }, [])

  return (
    <Ctx.Provider value={{ ready, admin, editMode, setEditMode, loginOpen, setLoginOpen, login, logout }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('AuthProvider manquant')
  return v
}
