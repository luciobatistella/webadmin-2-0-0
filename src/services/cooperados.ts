import { createApi } from './api'
import { loadPublicConfig } from './http'

async function api() {
  const cfg = await loadPublicConfig()
  return createApi(cfg.api_url as string)
}

const _cache = new Map<string, { ts: number; data: any[] }>()
const TTL_MS = 5 * 60_000 // 5 minutos

export async function listCooperados(params?: URLSearchParams): Promise<any[]> {
  const key = JSON.stringify(Object.fromEntries(params ?? []))
  const now = Date.now()
  const hit = _cache.get(key)
  if (hit && now - hit.ts < TTL_MS) {
    // stale-while-revalidate: devolve cache e revalida em background
    revalidate(key, params)
    return hit.data
  }
  const http = await api()
  const { data } = await http.get('webadmin/cooperados', { params })
  const rows = Array.isArray(data) ? data : (data?.data || data?.rows || [])
  _cache.set(key, { ts: now, data: rows })
  return rows
}

async function revalidate(key: string, params?: URLSearchParams){
  try{
    const http = await api()
    const { data } = await http.get('webadmin/cooperados', { params })
    const rows = Array.isArray(data) ? data : (data?.data || data?.rows || [])
    _cache.set(key, { ts: Date.now(), data: rows })
  }catch(err){
    console.warn('[cooperados][revalidate] falhou', err)
  }
}

export async function getCooperado(id: string | number, params?: URLSearchParams): Promise<any> {
  const http = await api()
  const { data } = await http.get(`webadmin/cooperados/detail/${id}`, { params })
  return data
}

