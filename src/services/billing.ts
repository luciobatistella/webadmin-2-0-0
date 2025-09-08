import { createApi } from './api'
import { loadPublicConfig } from './http'

async function api() {
  const cfg = await loadPublicConfig()
  return createApi(cfg.api_url as string)
}

async function tryEndpoints(method: 'get' | 'post' | 'put' | 'delete', variants: string[], body?: any, params?: URLSearchParams): Promise<any> {
  const http = await api()
  let lastErr: any
  for (const path of variants){
    try {
      let data
      if (method === 'get') {
        ({ data } = await http.get(path, { params }))
      } else if (method === 'delete') {
        ({ data } = await http.delete(path, { params }))
      } else {
        ;({ data } = await (http as any)[method](path, body, { params }))
      }
      return data
    } catch (e: any) {
      lastErr = e
      const status = e?.response?.status
      if (status !== 404 && status !== 405) throw e
    }
  }
  throw lastErr
}

export async function listBilling(params?: URLSearchParams): Promise<any[]> {
  const data = await tryEndpoints('get', [
    'webadmin/faturamento',
    'webadmin/faturamentos',
    'webadmin/billing',
    'webadmin/faturas',
  ], null, params)
  return Array.isArray(data) ? data : (data?.data || data?.rows || [])
}

export type BillingRow = Record<string, any>

