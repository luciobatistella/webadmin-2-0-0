import axios, { type AxiosInstance } from 'axios'

export async function loadPublicConfig(): Promise<any> {
  // Permite sobrescrever a API em dev com variável de ambiente (Vite) e um config local opcional
  try {
    const resp = await fetch('/config.json', { cache: 'no-store' })
    const json = await resp.json()
    const envApi = (import.meta as any)?.env?.VITE_API_URL
    if (envApi) return { ...json, api_url: envApi }
    return json
  } catch {
    const envApi = (import.meta as any)?.env?.VITE_API_URL
    if (envApi) return { api_url: envApi }
    // Fallback para manter compatibilidade
    return { api_url: '' }
  }
}

export function createHttp(apiBaseUrl: string): AxiosInstance {
  const http = axios.create({ baseURL: apiBaseUrl, timeout: 60000 })
  return http
}

