import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosError } from 'axios'
import router from '@/router'
import type { AuthResult } from '@/types/User'

function getToken(): string | null {
  try {
    const raw = localStorage.getItem('authResult')
    if (!raw) return null
    const parsed = JSON.parse(raw) as AuthResult
    return parsed?.token || parsed?.access_token || parsed?.data?.token || null
  } catch {
    return null
  }
}

export function createApi(baseURL: string): AxiosInstance {
  const api = axios.create({ baseURL, timeout: 60000 })

  // Debug opcional da baseURL e requisições (ativar com localStorage.setItem('debug:api','1'))
  try {
    const debug = typeof localStorage !== 'undefined' && localStorage.getItem('debug:api') === '1'
    if (debug) {
      console.log('[api] instancia criada', { baseURL })
    }
    api.interceptors.request.use(cfg => {
      if (debug) {
        try {
          const full = (cfg.baseURL || '') + (cfg.url || '')
          console.log('[api][request]', { method: (cfg.method || 'get').toUpperCase(), url: full })
        } catch {}
      }
      return cfg
    })
  } catch {}

  api.interceptors.request.use(cfg => {
    const token = getToken()
    if (token) {
      const headers = (cfg.headers || {}) as Record<string, any>
      headers.Authorization = `Bearer ${token}`
      cfg.headers = headers as any
    }
    return cfg
  })

  api.interceptors.response.use(
    res => res,
    err => {
      // Log amigável para timeouts e erros comuns
      try {
        const cfg = (err as AxiosError)?.config as AxiosRequestConfig | undefined
        const url = cfg?.baseURL ? `${cfg.baseURL}${cfg.url || ''}` : (cfg?.url || '')
        const code = (err as AxiosError)?.code || ''
        if (code === 'ECONNABORTED') {
          console.warn('[api][timeout]', { url, timeout: (cfg as any)?.timeout })
        }
      } catch {}
      const status = (err as AxiosError)?.response?.status
      if (status === 401) {
        localStorage.removeItem('authResult')
        router.push({ name: 'login' })
      }
      if (status === 403) {
        console.warn('[api][403] Acesso negado')
      }
      if (status && status >= 500) {
        console.error('[api][server-error]', (err as AxiosError)?.response?.data || (err as Error)?.message)
      }
      return Promise.reject(err)
    }
  )

  return api
}

