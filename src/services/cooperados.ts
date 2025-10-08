import { createApi } from './api'
import { loadPublicConfig } from './http'

/** -------------------------------------------------------
 * Infra
 * ------------------------------------------------------*/
async function api() {
  const cfg = await loadPublicConfig()
  return createApi(cfg.api_url as string)
}

/** -------------------------------------------------------
 * Helpers de serialização/normalização/cache
 * ------------------------------------------------------*/
function normalizeParams(input?: URLSearchParams | Record<string, any>) {
  if (!input) return {}
  if (input instanceof URLSearchParams) {
    const obj: Record<string, any> = {}
    // preserva múltiplos valores por chave
    const seen = new Set<string>()
    for (const [k] of input) {
      if (seen.has(k)) continue
      seen.add(k)
      const all = input.getAll(k)
      obj[k] = all.length > 1 ? [...all] : input.get(k)
    }
    return obj
  }
  return { ...(input as any) }
}

function stableKey(params?: URLSearchParams | Record<string, any>) {
  const obj = normalizeParams(params)
  const keys = Object.keys(obj).sort()
  const canon: Record<string, any> = {}
  for (const k of keys) {
    const v = (obj as any)[k]
    canon[k] = Array.isArray(v) ? [...v].sort() : v
  }
  return JSON.stringify(canon)
}

function normalizeListPayload(body: any) {
  const nested = body && typeof body === 'object' && 'data' in body ? body.data : null
  const items =
    (Array.isArray(body?.data) && body.data) ||
    (Array.isArray(body?.data?.items) && body.data.items) ||
    (Array.isArray(body?.data?.rows) && body.data.rows) ||
    (Array.isArray(body?.data?.content) && body.data.content) ||
    (Array.isArray(body?.items) && body.items) ||
    (Array.isArray(body?.rows) && body.rows) ||
    (Array.isArray(body?.content) && body.content) ||
    (Array.isArray(nested?.items) && nested.items) ||
    (Array.isArray(nested?.rows) && nested.rows) ||
    (Array.isArray(nested?.content) && nested.content) ||
    (Array.isArray(body?.result?.items) && body.result.items) ||
    (Array.isArray(body?.result?.rows) && body.result.rows) ||
    (Array.isArray(body?.result?.content) && body.result.content) ||
    (Array.isArray(body?.records) && body.records) ||
    (Array.isArray(body?.results) && body.results) ||
    (Array.isArray(body) && body) || []

  // NUNCA usar items.length como fallback de total aqui; se o backend não informar,
  // consideramos total desconhecido (0) e deixamos a view lidar com navegação "às cegas".
  const total = Number(
    body?.total ?? body?.totalItems ?? body?.count ??
    nested?.total ?? nested?.totalItems ?? nested?.count ??
    body?.totalElements ?? body?.totalCount ?? body?.recordsTotal ??
    body?.result?.total ?? body?.meta?.total ?? 0
  ) || 0

  const page = Number(
    body?.page ?? nested?.page ?? body?.number ?? body?.currentPage ?? body?.meta?.page ?? 0
  )

  const limit = Number(
    body?.limit ?? nested?.limit ?? body?.size ?? body?.pageSize ?? body?.meta?.pageSize ?? 0
  )

  return { items, total, page, limit }
}

const MAX_CACHE_ENTRIES = 200
function pruneCache(map: Map<any, any>) {
  while (map.size > MAX_CACHE_ENTRIES) {
    const firstKey = map.keys().next().value
    map.delete(firstKey)
  }
}

const inflight = new Map<string, Promise<any>>()
async function dedup<T>(key: string, factory: () => Promise<T>): Promise<T> {
  if (inflight.has(key)) return inflight.get(key) as Promise<T>
  const p = factory().finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

/** -------------------------------------------------------
 * listCooperados (SWR com cache e revalidação)
 * ------------------------------------------------------*/
const _cache = new Map<string, { ts: number; data: any[] }>()
const TTL_MS = 5 * 60_000 // 5 minutos

export async function listCooperados(params?: URLSearchParams): Promise<any[]> {
  const key = stableKey(params)
  const now = Date.now()
  const hit = _cache.get(key)
  if (hit && now - hit.ts < TTL_MS) {
    // stale-while-revalidate: devolve cache e revalida em background
    revalidate(key, params)
    return hit.data
  }

  return dedup(key, async () => {
    const http = await api()
    const { data } = await http.get('webadmin/cooperados/paginate/documents', { params })
    const { items } = normalizeListPayload(data)
    if (!items.length) {
      console.warn('[cooperados.list] retorno vazio', { params: params ? Object.fromEntries(params) : {}, bodyKeys: data ? Object.keys(data) : null })
    }
    _cache.set(key, { ts: now, data: items })
    pruneCache(_cache)
    return items
  })
}

async function revalidate(key: string, params?: URLSearchParams){
  try{
    const http = await api()
    const { data } = await http.get('webadmin/cooperados/paginate/documents', { params })
    const { items } = normalizeListPayload(data)
    _cache.set(key, { ts: Date.now(), data: items })
    pruneCache(_cache)
  }catch(err){
    console.warn('[cooperados][revalidate] falhou', err)
  }
}

/** -------------------------------------------------------
 * get / update / helpers de endpoints tolerantes
 * ------------------------------------------------------*/
export async function getCooperado(id: string | number, params?: URLSearchParams): Promise<any> {
  const http = await api()
  const { data } = await http.get(`webadmin/cooperados/findone/detail/${id}`, { params })
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

// Cria novo cooperado
export async function createCooperado(payload: any): Promise<any> {
  return tryEndpoints('post', [
    `webadmin/cooperados`,
    `webadmin/cooperados/create`,
    `webadmin/cooperado`,
  ], payload)
}

// Atualiza dados do cooperado (depende do backend; tenta algumas rotas comuns)
export async function updateCooperado(id: string | number, payload: any): Promise<any> {
  return tryEndpoints('put', [
    `webadmin/cooperados/${id}`,
    `webadmin/cooperados/update/${id}`,
    `webadmin/cooperado/${id}`,
  ], payload)
}

// Deleta cooperado
export async function deleteCooperado(id: string | number): Promise<any> {
  return tryEndpoints('delete', [
    `webadmin/cooperados/${id}`,
    `webadmin/cooperados/delete/${id}`,
    `webadmin/cooperado/${id}`,
  ])
}

/** -------------------------------------------------------
 * Históricos (pagamentos / check-ins)
 * ------------------------------------------------------*/
// Removido variante com query hard-coded (?cooperadoId=) para evitar conflito com params
export async function listCooperadoPayments(id: string | number, params?: URLSearchParams): Promise<any[]> {
  const data = await tryEndpoints('get', [
    `webadmin/cooperados/${id}/payments`,
    `webadmin/cooperados/${id}/pagamentos`,
    `webadmin/cooperado/${id}/pagamentos`,
  ], null, params)
  return Array.isArray(data) ? data : (data?.data || data?.rows || [])
}

export async function listCooperadoCheckins(id: string | number, params?: URLSearchParams): Promise<any[]> {
  const data = await tryEndpoints('get', [
    `webadmin/cooperados/${id}/checkins`,
    `webadmin/cooperados/${id}/presencas`,
    `webadmin/cooperado/${id}/presencas`,
  ], null, params)
  return Array.isArray(data) ? data : (data?.data || data?.rows || [])
}

/** -------------------------------------------------------
 * Paginação oficial com detecção de rotas e variações de parâmetros
 * ------------------------------------------------------*/
const _cachePaginate = new Map<string, { ts: number; data: any }>()
const TTL_PAGINATE_MS = 60_000 // 1 minuto

export async function paginateCooperadosDocuments(
  params?: URLSearchParams | Record<string, any>,
  opts?: { signal?: AbortSignal }
): Promise<{ total: number; data: any[]; page?: number; limit?: number }> {
  const key = stableKey(params)
  const now = Date.now()
  const hit = _cachePaginate.get(key)
  if (hit && (now - hit.ts) < TTL_PAGINATE_MS) {
    // stale-while-revalidate em background
    revalidatePaginate(key, params).catch(() => {})
    return hit.data
  }

  return dedup(key, async () => {
    const http = await api()
    // Alguns ambientes podem não ter exatamente esta rota. Tentamos variações comuns.
    const candidates = [
      'webadmin/cooperados/paginate/documents',
      'webadmin/cooperados/paginate',
      'webadmin/cooperados',
      'cooperados/paginate/documents',
      'cooperados/paginate',
    ]

    const baseObj = normalizeParams(params)
    const pageRaw = Number((baseObj as any)?.page ?? 0)
    const limitRaw = Number((baseObj as any)?.limit ?? 0)
    const offset = Number.isFinite(pageRaw) && Number.isFinite(limitRaw)
      ? Math.max(0, pageRaw) * Math.max(0, limitRaw)
      : undefined

    const paramVariants: Record<string, any>[] = []
    // 0) como veio
    paramVariants.push(baseObj)
    // 1) page + size
    if (limitRaw) paramVariants.push({ ...baseObj, size: limitRaw, limit: undefined })
    // 2) pageSize
    if (limitRaw) paramVariants.push({ ...baseObj, pageSize: limitRaw, limit: undefined })
    // 3) per_page
    if (limitRaw) paramVariants.push({ ...baseObj, per_page: limitRaw, limit: undefined })
    // 4) offset + limit
    if (offset !== undefined) paramVariants.push({ ...baseObj, offset, page: undefined })
    // 5) start + length (DataTables style)
    if (offset !== undefined && limitRaw) paramVariants.push({ ...baseObj, start: offset, length: limitRaw, page: undefined, limit: undefined })

  let body: any = null
  let lastHeaders: Record<string, any> | null = null
    let lastErr: any = null

    outer: for (const path of candidates) {
      try {
        // tenta cada variante de parâmetros
        for (const pv of paramVariants) {
          try {
            const resp = await http.get(path, { params: pv, signal: opts?.signal })
            body = resp.data
            lastHeaders = (resp as any)?.headers || null
            try { if (typeof localStorage !== 'undefined' && localStorage.getItem('debug:cooperados') === '1') console.log('[cooperados.paginate] try', { path, params: pv, keys: body ? Object.keys(body) : null }) } catch {}
            const { items } = normalizeListPayload(body)
            if ((Array.isArray(items) && items.length > 0) || (Array.isArray(body) && body.length > 0)) {
              ;(console as any).log?.('[cooperados.paginate] rota/params OK', { path, params: pv })
              break outer
            }
          } catch (e) {
            lastErr = e
            continue
          }
        }

        // como última tentativa, repete a chamada “sem paginação” (cuidado com volume)
        try {
          const clean: Record<string, any> = { ...(baseObj || {}) }
          delete clean.page; delete clean.limit; delete clean.size; delete clean.pageSize;
          delete clean.per_page; delete clean.offset; delete clean.start; delete clean.length
          const resp = await http.get(path, { params: clean, signal: opts?.signal })
          body = resp.data
          lastHeaders = (resp as any)?.headers || null
          try { if (typeof localStorage !== 'undefined' && localStorage.getItem('debug:cooperados') === '1') console.log('[cooperados.paginate] try(clean)', { path, params: clean, keys: body ? Object.keys(body) : null }) } catch {}
          const { items } = normalizeListPayload(body)
          if ((Array.isArray(items) && items.length > 0) || (Array.isArray(body) && body.length > 0)) {
            ;(console as any).log?.('[cooperados.paginate] usando rota (clean)', path)
            break
          }
        } catch (e) {
          lastErr = e
        }

        // Fallback: alguns backends usam paginação 1-based. Se page=0 foi enviado e veio vazio, tentar page=1.
        if ((baseObj as any)?.page === 0 || (baseObj as any)?.page === '0') {
          const altParams = { ...baseObj, page: 1 }
          try {
            const resp2 = await http.get(path, { params: altParams, signal: opts?.signal })
            const body2: any = resp2.data
            lastHeaders = (resp2 as any)?.headers || null
            try { if (typeof localStorage !== 'undefined' && localStorage.getItem('debug:cooperados') === '1') console.log('[cooperados.paginate] try(page=1)', { path, params: altParams, keys: body2 ? Object.keys(body2) : null }) } catch {}
            const { items: items2 } = normalizeListPayload(body2)
            if ((Array.isArray(items2) && items2.length > 0) || (Array.isArray(body2) && body2.length > 0)) {
              body = body2
              ;(console as any).log?.('[cooperados.paginate] fallback page=1 (1-based) na rota', path)
              break
            }
          } catch (e) {
            lastErr = e
          }
        }
      } catch (e) {
        lastErr = e
        continue
      }
    }

    if (!body && lastErr) throw lastErr

    let { items, total, page, limit } = normalizeListPayload(body)
    // Alguns backends retornam o total apenas em headers (ex.: X-Total-Count)
    try {
      const h = (lastHeaders || {}) as Record<string, any>
      const hdrTotal = Number(
        h['x-total-count'] ?? h['x-total'] ?? h['total-count'] ?? h['total'] ?? 0
      ) || 0
      if (hdrTotal > 0) total = hdrTotal
    } catch { /* noop */ }
    try { if (typeof localStorage !== 'undefined' && localStorage.getItem('debug:cooperados') === '1') console.log('[cooperados.paginate] normalized', { total, page, limit, count: Array.isArray(items) ? items.length : -1 }) } catch {}
    const normalized = { total, data: items, page, limit }
    _cachePaginate.set(key, { ts: now, data: normalized })
    pruneCache(_cachePaginate)
    return normalized
  })
}

async function revalidatePaginate(key: string, params?: URLSearchParams | Record<string, any>) {
  try {
    const fresh = await paginateCooperadosDocuments(params)
    _cachePaginate.set(key, { ts: Date.now(), data: fresh })
    pruneCache(_cachePaginate)
  } catch {
    // silencioso
  }
}

/** -------------------------------------------------------
 * Estatísticas
 * ------------------------------------------------------*/
export async function countCooperadosStatistics(params?: URLSearchParams | Record<string, any>): Promise<{
  all: number
  active: number
  inactive: number
  blocked: number
  pending: number
  regioes?: Record<string, number>
  regions?: Record<string, number>
}> {
  const http = await api()
  const { data } = await http.get('webadmin/cooperados/count/statistics', { params })
  const regioes = (data?.regioes ?? data?.regions ?? {}) as Record<string, number>
  return {
    all: Number(data?.all ?? 0),
    active: Number(data?.active ?? 0),
    inactive: Number(data?.inactive ?? 0),
    blocked: Number(data?.blocked ?? 0),
    pending: Number(data?.pending ?? 0),
    regioes,
    regions: regioes,
  }
}

/** -------------------------------------------------------
 * Funções
 * ------------------------------------------------------*/
// GET /webadmin/cooperados/funcoes => [{ id: number, name: string }]
export async function listFuncoesCooperados(): Promise<Array<{ id: number; name: string }>> {
  // Tenta variações de rota conhecidas
  const raw = await tryEndpoints('get', [
    'webadmin/cooperados/funcoes',
    'webadmin/cooperado/funcoes',
    'cooperados/funcoes',
    'webadmin/funcoes',
    'webadmin/cooperados/functions',
    'cooperados/functions',
  ])
  // Normalização: aceitar data[], items[], rows[], result.items, array direto
  const body: any = raw
  const arr =
    (Array.isArray(body) && body) ||
    (Array.isArray(body?.data) && body.data) ||
    (Array.isArray(body?.items) && body.items) ||
    (Array.isArray(body?.rows) && body.rows) ||
    (Array.isArray(body?.result?.items) && body.result.items) ||
    []

  // Mapear para { id, name } com tolerância a campos nome/descricao
  const mapped = (arr as any[]).map((it) => {
    const id = Number((it as any)?.id)
    const name = String((it as any)?.name ?? (it as any)?.nome ?? (it as any)?.descricao ?? '').trim()
    return { id, name }
  }).filter(x => Number.isFinite(x.id) && x.name.length > 0)

  ;(console as any).log?.('[cooperados.funcoes] loaded', { count: mapped.length })
  return mapped
}
