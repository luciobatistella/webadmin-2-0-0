import { reactive, computed, type ComputedRef } from 'vue'
import type { User, AuthResult } from '@/types/User'

export interface AuthState {
  isAuthenticated: boolean
  currentUser: User | null
}

const state = reactive<AuthState>({ isAuthenticated: false, currentUser: null })

export function useAuth(): {
  isAuthenticated: ComputedRef<boolean>
  currentUser: ComputedRef<User | null>
  initAuth: () => void
  successLogin: (payload: User | AuthResult) => void
  logout: () => void
} {
  const isAuthenticated = computed(() => state.isAuthenticated)
  const currentUser = computed(() => state.currentUser)

  function initAuth() {
    const raw = localStorage.getItem('authResult')
    if (raw) {
      try {
        state.currentUser = JSON.parse(raw)
        state.isAuthenticated = true
      } catch (_) {
        state.currentUser = null
        state.isAuthenticated = false
      }
    }
  }

  function successLogin(payload: User | AuthResult) {
    state.currentUser = payload as User
    state.isAuthenticated = true
    localStorage.setItem('authResult', JSON.stringify(payload))
  }

  function logout() {
    state.currentUser = null
    state.isAuthenticated = false
    localStorage.removeItem('authResult')
  }

  return { isAuthenticated, currentUser, initAuth, successLogin, logout }
}

