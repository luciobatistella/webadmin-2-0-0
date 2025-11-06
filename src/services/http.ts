import axios, { type AxiosInstance } from 'axios'

export async function loadPublicConfig(): Promise<any> {
  // Permite sobrescrever a API em dev com variável de ambiente (Vite) e um config local opcional
  try {
    const resp = await fetch('/config.json', { cache: 'no-store' })
    const json = await resp.json()
    const envApi = (import.meta as any)?.env?.VITE_API_URL
    if (envApi) {
      try {
        const debug = typeof localStorage !== 'undefined' && (localStorage.getItem('debug:http') === '1' || localStorage.getItem('debug:api') === '1')
        if (debug) console.log('[http][config] usando VITE_API_URL (env)', { api_url: envApi })
      } catch {}
      return { ...json, api_url: envApi }
    }
    try {
      const debug = typeof localStorage !== 'undefined' && (localStorage.getItem('debug:http') === '1' || localStorage.getItem('debug:api') === '1')
      if (debug) console.log('[http][config] usando public/config.json', { api_url: json?.api_url })
    } catch {}
    return json
  } catch {
    const envApi = (import.meta as any)?.env?.VITE_API_URL
    if (envApi) {
      try {
        const debug = typeof localStorage !== 'undefined' && (localStorage.getItem('debug:http') === '1' || localStorage.getItem('debug:api') === '1')
        if (debug) console.log('[http][config] usando VITE_API_URL (env) – fallback', { api_url: envApi })
      } catch {}
      return { api_url: envApi }
    }
    // Fallback para manter compatibilidade
    try {
      const debug = typeof localStorage !== 'undefined' && (localStorage.getItem('debug:http') === '1' || localStorage.getItem('debug:api') === '1')
      if (debug) console.warn('[http][config] sem config.json e sem VITE_API_URL; api_url vazio')
    } catch {}
    return { api_url: '' }
  }
}

export function createHttp(apiBaseUrl: string): AxiosInstance {
  const http = axios.create({ baseURL: apiBaseUrl, timeout: 60000 })
  return http
}

