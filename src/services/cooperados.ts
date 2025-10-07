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

// Helper para tentar múltiplos endpoints (404/405 tolerados)
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

// Atualiza dados do cooperado (depende do backend; tenta algumas rotas comuns)
export async function updateCooperado(id: string | number, payload: any): Promise<any> {
  return tryEndpoints('put', [
    `webadmin/cooperados/${id}`,
    `webadmin/cooperados/update/${id}`,
    `webadmin/cooperado/${id}`,
  ], payload)
}

// Histórico de pagamentos do cooperado
export async function listCooperadoPayments(id: string | number, params?: URLSearchParams): Promise<any[]> {
  const data = await tryEndpoints('get', [
    `webadmin/cooperados/${id}/payments`,
    `webadmin/cooperados/${id}/pagamentos`,
    `webadmin/cooperado/${id}/pagamentos`,
    `webadmin/pagamentos?cooperadoId=${id}`,
  ], null, params)
  return Array.isArray(data) ? data : (data?.data || data?.rows || [])
}

// Histórico de presenças (check-in/check-out)
export async function listCooperadoCheckins(id: string | number, params?: URLSearchParams): Promise<any[]> {
  const data = await tryEndpoints('get', [
    `webadmin/cooperados/${id}/checkins`,
    `webadmin/cooperados/${id}/presencas`,
    `webadmin/cooperado/${id}/presencas`,
    `webadmin/presencas?cooperadoId=${id}`,
  ], null, params)
  return Array.isArray(data) ? data : (data?.data || data?.rows || [])
}

// Novos endpoints oficiais
// GET /webadmin/cooperados/paginate/documents
// Parâmetros aceitos: limit, page(0-based), nome, matricula, cpf, sexo('M'|'F'), status(number 0-4|omit),
// fotoPerfilVencimento, atestadoVencimento, antecedentesVencimento, uniformeVencimento, orderBy
export async function paginateCooperadosDocuments(params?: URLSearchParams | Record<string, any>): Promise<{
  total: number
  data: any[]
  page?: number
  limit?: number
}> {
  const http = await api()
  const { data } = await http.get('webadmin/cooperados/paginate/documents', { params })
  // Normaliza resposta
  return {
    total: Number(data?.total ?? (Array.isArray(data?.data) ? data.data.length : 0)),
    data: Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []),
    page: Number(data?.page ?? 0),
    limit: Number(data?.limit ?? 0),
  }
}

// GET /webadmin/cooperados/count/statistics
// Enviar os mesmos parâmetros que a paginação (exceto page/limit, se desejar)
export async function countCooperadosStatistics(params?: URLSearchParams | Record<string, any>): Promise<{
  all: number
  active: number
  inactive: number
  blocked: number
  pending: number
}> {
  const http = await api()
  const { data } = await http.get('webadmin/cooperados/count/statistics', { params })
  return {
    all: Number(data?.all ?? 0),
    active: Number(data?.active ?? 0),
    inactive: Number(data?.inactive ?? 0),
    blocked: Number(data?.blocked ?? 0),
    pending: Number(data?.pending ?? 0),
  }
}

