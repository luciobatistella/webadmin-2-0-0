import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router'
import { useAuth } from '../stores/auth'

export function authGuard(to: RouteLocationNormalized): RouteLocationRaw | void {
  const { isAuthenticated } = useAuth()
  if ((to.meta as any)?.requiresAuth && !isAuthenticated.value) {
    return { name: 'login' }
  }
}

