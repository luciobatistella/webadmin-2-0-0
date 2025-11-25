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

// Helper para tentar múltiplos endpoints com tolerância configurável a status de erro
async function tryEndpoints(
  method: 'get' | 'post' | 'put' | 'delete',
  variants: string[],
  body?: any,
  params?: URLSearchParams,
  opts?: { tolerateStatuses?: number[] }
): Promise<any> {
  const http = await api()
  let lastErr: any
  const debug = (() => {
    try { return typeof localStorage !== 'undefined' && localStorage.getItem('debug:cooperados') === '1' } catch { return false }
  })()
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
      if (debug) {
        try { console.log('[cooperados.tryEndpoints] OK', { method, path }) } catch {}
      }
      return data
    } catch (e: any) {
      lastErr = e
      const status = e?.response?.status
      const tolerated = (opts?.tolerateStatuses || [404, 405])
      if (debug) {
        try {
          const msg = e?.response?.data?.message || e?.message || 'erro'
          console.warn('[cooperados.tryEndpoints] falha', { method, path, status, msg })
        } catch {}
      }
      if (!tolerated.includes(Number(status))) throw e
    }
  }
  throw lastErr
}

// Cria novo cooperado
export async function createCooperado(payload: any): Promise<any> {
  // STRICT ROUTE: usa a rota oficial de criação, mas ajusta o SHAPE do payload se backend recusar a "situação na cooperativa".
  const http = await api()
  // Monta URL absoluta para evitar qualquer problema de baseURL/localhost
  let absCreateUrl = 'webadmin/cooperados'
  try {
    const cfg = await loadPublicConfig()
    if (cfg?.api_url) {
      const base = String(cfg.api_url).replace(/\/+$/, '')
      absCreateUrl = `${base}/webadmin/cooperados`
    }
  } catch {}
  const debug = (() => {
    try { return typeof localStorage !== 'undefined' && localStorage.getItem('debug:cooperados') === '1' } catch { return false }
  })()
  // Log leve e seguro de debug (opcional)
  try {
    if (debug) {
      const situacaoSnapshot: Record<string, any> = {}
      const keys = Object.keys(payload || {})
      keys
        .filter(k => /situacao|cooperativa/i.test(k))
        .forEach(k => { situacaoSnapshot[k] = (payload as any)[k] })
      console.log('[cooperados.create][strict] payload snapshot', {
        keys,
        situacao: situacaoSnapshot,
      })
    }
  } catch { /* noop */ }

  // Primeiro envio: payload adaptado exatamente ao esperado pelo backend
  const primary = toExpectedCreatePayload(payload)
  try {
    const { data } = await http.post(absCreateUrl, primary)
    return data
  } catch (err: any) {
    const status = err?.response?.status
    const msg = String(err?.response?.data || err?.message || '')
    const needsSituacao = status === 400 && /situa[cç][aã]o\s+na\s+cooperativa/i.test(msg)
    if (!needsSituacao) throw err
    let lastError = err
    // Fallback 2: alguns backends não parseiam JSON no create e exigem form-urlencoded ou multipart
    try {
      const code = inferSituacaoCode(primary)
      const flatBase = toFlatPrimitives(primary)
      const url = absCreateUrl
      const http2 = http
      const urlencCandidates: Array<[string, any]> = [
        ['cooperativa', String(code)],
        ['situacao_na_cooperativa', String(code)],
        ['situacao_na_cooperativa_id', String(code)],
      ]
      for (const [k, v] of urlencCandidates) {
        try {
          const params = new URLSearchParams()
          for (const [bk, bv] of Object.entries(flatBase)) {
            if (bv === undefined || bv === null) continue
            params.append(bk, String(bv))
          }
          params.append(k, v)
          const { data } = await http2.post(url, params, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
          ;(console as any).log?.('[cooperados.create][fallback-urlenc] OK', { field: k })
          return data
        } catch (e) {
          lastError = e
          try {
            const s = (e as any)?.response?.status
            const m = (e as any)?.response?.data || (e as any)?.message
            console.warn('[cooperados.create][fallback-urlenc] falhou', { field: k, status: s, msg: m })
          } catch {}
        }
      }

      // multipart/form-data
      const fdCandidates: Array<[string, any]> = [
        ['cooperativa', String(code)],
        ['situacao_na_cooperativa', String(code)],
        ['situacao_na_cooperativa_id', String(code)],
      ]
      for (const [k, v] of fdCandidates) {
        try {
          const fd = new FormData()
          for (const [bk, bv] of Object.entries(flatBase)) {
            if (bv === undefined || bv === null) continue
            fd.append(bk, String(bv))
          }
          fd.append(k, v)
          const { data } = await http2.post(url, fd)
          ;(console as any).log?.('[cooperados.create][fallback-multipart] OK', { field: k })
          return data
        } catch (e) {
          lastError = e
          try {
            const s = (e as any)?.response?.status
            const m = (e as any)?.response?.data || (e as any)?.message
            console.warn('[cooperados.create][fallback-multipart] falhou', { field: k, status: s, msg: m })
          } catch {}
        }
      }
    } catch (e) {
      lastError = e
    }
    throw lastError
  }
}

// Gera variações de payload focadas em campos de "situação" para compatibilizar com diferentes backends
function buildPayloadVariants(src: any): any[] {
  const arr: any[] = []
  const code = inferSituacaoCode(src)
  const baseClean = stripSituacaoKeys(src)

  // Preferir tentar primeiro a chave literal "cooperativa"
  arr.push({ ...baseClean, cooperativa: code })

  // 1) snake_case simples
  arr.push({ ...baseClean, situacao_na_cooperativa: code })
  // 2) snake_case com _id
  arr.push({ ...baseClean, situacao_na_cooperativa_id: code })
  // 3) camelCase simples
  arr.push({ ...baseClean, situacaoNaCooperativa: code })
  // 4) camelCase com Id
  arr.push({ ...baseClean, situacaoNaCooperativaId: code })
  // 5) snake para cooperativa
  arr.push({ ...baseClean, situacao_cooperativa: code })
  // 6) snake para cooperativa com _id
  arr.push({ ...baseClean, situacao_cooperativa_id: code })
  // 7) camel para cooperativa
  arr.push({ ...baseClean, situacaoCooperativa: code })
  // 8) camel para cooperativa com Id
  arr.push({ ...baseClean, situacaoCooperativaId: code })
  // 9) genérico
  arr.push({ ...baseClean, situacao: code })
  // 10) statusCadastro
  arr.push({ ...baseClean, statusCadastro: code })
  // 11) objeto aninhado snake
  arr.push({ ...baseClean, situacao_na_cooperativa: { id: code } })
  // 12) objeto aninhado camel
  arr.push({ ...baseClean, situacaoNaCooperativa: { id: code } })
  // 13) ids alternativos
  arr.push({ ...baseClean, id_situacao_na_cooperativa: code })
  arr.push({ ...baseClean, idSituacaoNaCooperativa: code })

  // 14) camel com prefixo id (variação comum)
  arr.push({ ...baseClean, idSituacaoCooperativa: code })

  // 15) aninhado em objeto "cooperado" (alguns backends validam dentro de um objeto raiz)
  arr.push({ ...baseClean, cooperado: { situacao_na_cooperativa: code } })
  arr.push({ ...baseClean, cooperado: { situacao_na_cooperativa_id: code } })
  arr.push({ ...baseClean, cooperado: { situacaoNaCooperativaId: code } })
  arr.push({ ...baseClean, cooperado: { situacao: code } })
  arr.push({ ...baseClean, cooperado: { situacao_na_cooperativa: { id: code } } })
  arr.push({ ...baseClean, cooperado: { situacaoNaCooperativa: { id: code } } })
  arr.push({ ...baseClean, cooperado: { cooperativa: code } })

  // 16) payload totalmente dentro de "cooperado" (fallback mais agressivo)
  arr.push({ cooperado: { ...baseClean, situacao_na_cooperativa: code } })
  arr.push({ cooperado: { ...baseClean, situacao_na_cooperativa_id: code } })
  arr.push({ cooperado: { ...baseClean, situacaoNaCooperativaId: code } })
  arr.push({ cooperado: { ...baseClean, situacao: code } })
  arr.push({ cooperado: { ...baseClean, cooperativa: code } })

  return arr
}

function inferSituacaoCode(obj: any): number {
  const candidates = [
    obj?.situacaoCooperativa,
    obj?.situacaoCooperativaId,
    obj?.statusCadastro,
    obj?.situacaoNaCooperativa,
    obj?.situacao_na_cooperativa,
    obj?.situacao_cooperativa,
    obj?.situacaoCadastro,
    obj?.situacaoCadastroId,
    obj?.situacaoCooperado,
    obj?.situacaoCooperadoId,
    obj?.situacaoCooperativaStr,
    obj?.situacao_codigo,
    obj?.situacao_id,
    // alguns ambientes usam a chave simples "cooperativa" para o código 3/4
    obj?.cooperativa,
    // aninhado em cooperado
    obj?.cooperado?.situacaoCooperativa,
    obj?.cooperado?.situacaoCooperativaId,
    obj?.cooperado?.statusCadastro,
    obj?.cooperado?.situacaoNaCooperativa,
    obj?.cooperado?.situacao_na_cooperativa,
    obj?.cooperado?.situacao_cooperativa,
    obj?.cooperado?.situacaoCadastro,
    obj?.cooperado?.situacaoCadastroId,
    obj?.cooperado?.situacaoCooperado,
    obj?.cooperado?.situacaoCooperadoId,
    obj?.cooperado?.situacaoCooperativaStr,
    obj?.cooperado?.situacao_codigo,
    obj?.cooperado?.situacao_id,
    obj?.cooperado?.cooperativa,
  ]
  for (const v of candidates) {
    const n = Number(v)
    if (Number.isFinite(n) && n > 0) return n
  }
  // default para Pré-Cadastro
  return 4
}

// Remove quaisquer chaves relacionadas a situacao/cooperativa para montar um payload limpo
function stripSituacaoKeys(src: any): any {
  const out: Record<string, any> = {}
  const re = /(situacao|cooperativa)/i
  for (const [k, v] of Object.entries(src || {})) {
    if (re.test(k)) continue
    out[k] = v
  }
  return out
}

// Cria uma versão canônica mínima do payload, usando somente uma chave de situação
function withCanonicalSituacao(src: any, code?: number): any {
  const c = Number(code ?? inferSituacaoCode(src)) || 4
  const base = stripSituacaoKeys(src)
  // Escolha canônica: campo literal "cooperativa" (3 = Cooperado, 4 = Pré-cadastro)
  return { ...base, cooperativa: c }
}

// Utilitário: extrai apenas chaves primitivas (string/number/boolean) para enviar via form-urlencoded/multipart
function toFlatPrimitives(obj: Record<string, any>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue
    const t = typeof v
    if (t === 'string' || t === 'number' || t === 'boolean') {
      out[k] = v as any
    }
  }
  return out
}

// ------------------------------
// Normalizadores para payload de criação esperado pelo backend
// ------------------------------
function onlyDigits(v: any): string {
  return String(v ?? '').replace(/\D+/g, '')
}

function formatCPF(v: any): string {
  const d = onlyDigits(v).padStart(11, '0').slice(-11)
  if (d.length !== 11) return String(v ?? '')
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`
}

function formatRG(v: any): string {
  const d = onlyDigits(v)
  if (d.length === 9) {
    return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}-${d.slice(8)}`
  }
  // fallback: devolve como veio se não for 9 dígitos
  return String(v ?? '')
}

function formatDateBrFromIso(v: any): string | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  if (/\d{2}\/\d{2}\/\d{4}/.test(s)) return s // já está DD/MM/AAAA
  // tenta YYYY-MM-DD
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) {
    const [, y, mo, d] = m
    return `${d}/${mo}/${y}`
  }
  return s
}

function formatCEP(v: any): string {
  const d = onlyDigits(v)
  if (d.length !== 8) return String(v ?? '')
  return `${d.slice(0,5)}-${d.slice(5)}`
}

function formatPhoneBR(v: any): string {
  const d = onlyDigits(v)
  if (d.length === 11) {
    return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
  }
  if (d.length === 10) {
    return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`
  }
  return String(v ?? '')
}

function normalizeSexo(v: any): string | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  if (/^m(asc.*)?$/i.test(s)) return 'Masculino'
  if (/^f(em.*)?$/i.test(s)) return 'Feminino'
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

function normalizeRegiao(v: any): string | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  return s.toUpperCase()
}

function toNumberOrNull(v: any): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function toExpectedCreatePayload(src: any): any {
  const code = inferSituacaoCode(src) // 3 cooperado | 4 pré-cadastro
  const nome = String(src?.nome ?? '').trim()
  const cpf = formatCPF(src?.cpf ?? src?.documento)
  const rg = formatRG(src?.rg)
  const dataNasc = formatDateBrFromIso(src?.dataNasc)
  const dataExp = formatDateBrFromIso(src?.dataExp)
  const sexo = normalizeSexo(src?.sexo)
  const endereco = String(src?.logradouro ?? src?.endereco ?? '').trim()
  const numero = toNumberOrNull(src?.numero)
  const complemento = String(src?.complemento ?? '').trim()
  const bairro = String(src?.bairro ?? '').trim()
  const cep = formatCEP(src?.cep)
  const cidade = String(src?.cidade ?? '').trim()
  const regiao = normalizeRegiao(src?.regiao)
  const uf = String(src?.uf ?? src?.estado ?? '').trim().toUpperCase()
  const email = String(src?.email ?? '').trim()
  const telefone1 = formatPhoneBR(src?.telefone1 ?? src?.telefone)
  const tipoPagtoRaw = String(src?.tipoPagto ?? '').trim().toUpperCase()
  const allowedPagto = new Set([
    'CONTA CORRENTE BRADESCO',
    'CONTA POUPANÇA BRADESCO',
    'DOC CORRENTE',
    'DOC POUPANÇA',
    'CHEQUE',
    'CONTA SUPER - SANTANDER',
    'SEM CONTA',
  ])
  const tipoPagto = allowedPagto.has(tipoPagtoRaw) ? tipoPagtoRaw : 'SEM CONTA'
  const statusStr = String(src?.status ?? 'Novo').trim()
  const banco = toNumberOrNull(src?.banco)

  const out: any = {
    gestor: Boolean(src?.gestor ?? false),
    cooperativa: code,
    nome,
    dataNasc,
    cpf,
    matricula: toNumberOrNull(src?.matricula) ?? null,
    status: statusStr,
    nomeMae: String(src?.nomeMae ?? '').trim(),
    nomePai: String(src?.nomePai ?? '').trim(),
    rg,
    // digito é ignorado
    dataExp,
    sexo,
    funcao1: toNumberOrNull(src?.funcao1) ?? null,
    funcao2: toNumberOrNull(src?.funcao2) ?? null,
    funcao3: toNumberOrNull(src?.funcao3) ?? null,
    funcao4: toNumberOrNull(src?.funcao4) ?? null,
    endereco,
    numero,
    complemento,
    bairro,
    cep,
    cidade,
    regiao,
    uf,
    email,
    telefone1,
    tipoPagto,
    motivoAtes: null,
    motivoUnif: null,
    motivoAnt: null,
    dataEmissao: null,
    validade: null,
    dataEmissao2: null,
    validadeUnif: null,
    data: null,
    validadeCri: null,
    urlImg1: src?.urlImg1 ?? null,
    urlImg2: src?.urlImg2 ?? null,
    urlImg3: src?.urlImg3 ?? null,
    urlImg4: src?.urlImg4 ?? null,
    banco,
  }

  return out
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
  sexo?: { M?: number; F?: number; masculino?: number; feminino?: number }
  opStatus?: {
    disponivel?: number
    contratacao?: number
    pre_doc?: number
    agendado?: number
    trabalhando?: number
    concluido?: number
    faltou_cancelou?: number
  }
}> {
  const http = await api()
  const { data } = await http.get('webadmin/cooperados/count/statistics', { params })
  const regioes = (data?.regioes ?? data?.regions ?? {}) as Record<string, number>
  
  // Extrair dados de sexo - pode vir como sexo.M/F, sexoM/sexoF (separado), ou masculino/feminino
  const sexo = data?.sexo && typeof data.sexo === 'object' ? {
    M: Number(data.sexo.M ?? data.sexo.masculino ?? 0),
    F: Number(data.sexo.F ?? data.sexo.feminino ?? 0),
  } : {
    M: Number(data?.sexoM ?? data?.sexo ?? 0),
    F: Number(data?.sexoF ?? 0),
  }
  
  // Extrair dados de status operacional
  const opStatus = data?.opStatus && typeof data.opStatus === 'object' ? {
    disponivel: Number(data.opStatus.disponivel ?? 0),
    contratacao: Number(data.opStatus.contratacao ?? 0),
    pre_doc: Number(data.opStatus.pre_doc ?? 0),
    agendado: Number(data.opStatus.agendado ?? 0),
    trabalhando: Number(data.opStatus.trabalhando ?? 0),
    concluido: Number(data.opStatus.concluido ?? 0),
    faltou_cancelou: Number(data.opStatus.faltou_cancelou ?? 0),
  } : {
    disponivel: Number(data?.disponivel ?? 0),
    contratacao: Number(data?.contratacao ?? 0),
    pre_doc: Number(data?.pre_doc ?? 0),
    agendado: Number(data?.agendado ?? 0),
    trabalhando: Number(data?.trabalhando ?? 0),
    concluido: Number(data?.concluido ?? 0),
    faltou_cancelou: Number(data?.faltou_cancelou ?? 0),
  }
  
  return {
    all: Number(data?.all ?? 0),
    active: Number(data?.active ?? 0),
    inactive: Number(data?.inactive ?? 0),
    blocked: Number(data?.blocked ?? 0),
    pending: Number(data?.pending ?? 0),
    regioes,
    regions: regioes,
    sexo,
    opStatus,
  }
}

/** -------------------------------------------------------
 * Funções
 * ------------------------------------------------------*/
// GET /webadmin/cooperados/funcoes => [{ id: number, name: string }]
export async function listFuncoesCooperados(limit?: number): Promise<Array<{ id: number; name: string; count?: number }>> {
  // Construir query params se limit foi fornecido
  const params = limit ? new URLSearchParams({ limit: String(limit) }) : undefined
  const queryString = params ? `?${params.toString()}` : ''
  
  // Tenta variações de rota conhecidas
  const raw = await tryEndpoints('get', [
    `webadmin/cooperados/funcoes/ranking${queryString}`,
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

  // Mapear para { id, name, count } com tolerância a campos nome/descricao
  const mapped = (arr as any[]).map((it, idx) => {
    const id = Number((it as any)?.id ?? (it as any)?.funcao_id ?? idx)
    const name = String((it as any)?.name ?? (it as any)?.nome ?? (it as any)?.descricao ?? (it as any)?.funcao ?? (it as any)?.nome_funcao ?? '').trim()
    const count = Number((it as any)?.count ?? (it as any)?.total ?? (it as any)?.quantidade ?? (it as any)?.qtd ?? (it as any)?.cooperados ?? 0)
    
    // Debug: log primeiro item para ver estrutura
    if (idx === 0) {
      ;(console as any).log?.('[cooperados.funcoes] first item structure:', it)
    }
    
    return { id, name, count }
  }).filter(x => Number.isFinite(x.id) && x.name.length > 0)

  ;(console as any).log?.('[cooperados.funcoes] loaded', { count: mapped.length, limit, sample: mapped.slice(0, 3) })
  return mapped
}

/** -------------------------------------------------------
 * Estatísticas de Documentos Pendentes
 * ------------------------------------------------------*/
// GET /webadmin/cooperados/statistics/all-documents
export async function getDocumentStatistics(): Promise<{
  total?: number
  completos?: number
  pendentes?: number
  vencidos?: number
  porTipo?: Record<string, { total: number; pendentes: number; vencidos: number }>
  [key: string]: any
}> {
  try {
    const http = await api()
    const { data } = await http.get('webadmin/cooperados/statistics/all-documents')
    ;(console as any).log?.('[cooperados.documentos] raw data:', data)
    
    // A API retorna um array: [{ tipo, quantidade_vencidos, quantidade_pendentes }, ...]
    // Mapear para estrutura esperada
    if (Array.isArray(data)) {
      const porTipo: Record<string, { total: number; pendentes: number; vencidos: number }> = {}
      let totalPendentes = 0
      let totalVencidos = 0
      
      data.forEach((item: any) => {
        const tipoOriginal = String(item.tipo || '')
        const tipo = tipoOriginal.toLowerCase().replace(/\s+/g, '_')
        const pendentes = Number(item.quantidade_pendentes || 0)
        const vencidos = Number(item.quantidade_vencidos || 0)
        
        ;(console as any).log?.('[cooperados.documentos] item:', { tipoOriginal, tipo, pendentes, vencidos })
        
        // Mapear nomes da API para nomes esperados no componente
        let tipoKey = tipo
        
        // Mapeamentos possíveis baseado na imagem da API
        if (tipo === 'atestadoantecedentes' || tipo === 'atestado_antecedentes') {
          tipoKey = 'antecedentes'
        } else if (tipo === 'atestandomedico' || tipo === 'atestado_medico') {
          tipoKey = 'atestado'
        } else if (tipo === 'fotoperfil' || tipo === 'foto_perfil') {
          tipoKey = 'foto_perfil'
        } else if (tipo === 'uniforme' || tipo === 'foto_uniforme') {
          tipoKey = 'foto_uniforme'
        }
        
        porTipo[tipoKey] = {
          total: pendentes + vencidos,
          pendentes,
          vencidos
        }
        
        totalPendentes += pendentes
        totalVencidos += vencidos
      })
      
      const result = {
        total: totalPendentes + totalVencidos,
        pendentes: totalPendentes,
        vencidos: totalVencidos,
        porTipo
      }
      
      ;(console as any).log?.('[cooperados.documentos] mapped:', result)
      return result
    }
    
    return data || {}
  } catch (error) {
    console.error('[cooperados.documentos] erro:', error)
    return {}
  }
}

/** -------------------------------------------------------
 * Avisos (Alertas) - Lazy Load com Cache
 * ------------------------------------------------------*/
const _cacheAvisos = new Map<string, { ts: number; data: any[] }>()
const TTL_AVISOS_MS = 3 * 60_000 // 3 minutos

export async function listAvisos(params?: URLSearchParams | Record<string, any>): Promise<any[]> {
  const key = stableKey(params)
  const now = Date.now()
  const hit = _cacheAvisos.get(key)
  
  // Se tem cache válido, retorna e revalida em background
  if (hit && now - hit.ts < TTL_AVISOS_MS) {
    revalidateAvisos(key, params).catch(() => {})
    return hit.data
  }

  return dedup(key, async () => {
    const http = await api()
    const { data } = await http.get('webadmin/avisos', { params })
    
    // Normaliza a resposta
    const items = Array.isArray(data) ? data 
      : Array.isArray(data?.data) ? data.data
      : Array.isArray(data?.items) ? data.items
      : Array.isArray(data?.avisos) ? data.avisos
      : []
    
    _cacheAvisos.set(key, { ts: now, data: items })
    pruneCache(_cacheAvisos)
    return items
  })
}

async function revalidateAvisos(key: string, params?: URLSearchParams | Record<string, any>) {
  try {
    const http = await api()
    const { data } = await http.get('webadmin/avisos', { params })
    const items = Array.isArray(data) ? data 
      : Array.isArray(data?.data) ? data.data
      : Array.isArray(data?.items) ? data.items
      : Array.isArray(data?.avisos) ? data.avisos
      : []
    _cacheAvisos.set(key, { ts: Date.now(), data: items })
    pruneCache(_cacheAvisos)
  } catch (err) {
    console.warn('[cooperados.avisos][revalidate] falhou', err)
  }
}

/** -------------------------------------------------------
 * Escalas (Presenças)
 * ------------------------------------------------------*/
const _cacheEscalas = new Map<string, { ts: number; data: any[] }>()
const _inflightEscalas = new Map<string, Promise<any>>()

export async function listEscalas(params?: URLSearchParams | Record<string, any>) {
  const key = stableKey(params)
  const now = Date.now()
  const cached = _cacheEscalas.get(key)
  
  // Se tem cache válido (menos de 3 min), retorna e revalida em background
  if (cached && now - cached.ts < TTL_AVISOS_MS) {
    revalidateEscalas(key, params)
    return cached.data
  }
  
  // Se há uma requisição em andamento, aguarda ela
  if (_inflightEscalas.has(key)) {
    return _inflightEscalas.get(key)
  }
  
  const promise = (async () => {
    try {
      const http = await api()
      const { data } = await http.get('webadmin/cooperados/eventos/escalas', { params })
      
      // Log para debug
      console.log('[cooperados.escalas] Response completo:', data)
      console.log('[cooperados.escalas] Tipo de data:', Array.isArray(data) ? 'Array' : typeof data)
      console.log('[cooperados.escalas] data.data existe?', !!data?.data, 'É array?', Array.isArray(data?.data))
      console.log('[cooperados.escalas] Total informado:', data?.total)
      console.log('[cooperados.escalas] Limit informado:', data?.limit)
      console.log('[cooperados.escalas] CurrentPage:', data?.currentPage)
      console.log('[cooperados.escalas] TotalPages:', data?.totalPages)
      
      // Se a resposta tem estrutura de paginação (total, currentPage, etc), retorna o objeto completo
      if (data && typeof data === 'object' && ('total' in data || 'totalPages' in data || 'currentPage' in data)) {
        console.log('[cooperados.escalas] Retornando resposta com paginação')
        _cacheEscalas.set(key, { ts: Date.now(), data })
        pruneCache(_cacheEscalas)
        return data
      }
      
      // Caso contrário, extrai apenas os items (comportamento antigo)
      const items = Array.isArray(data) ? data 
        : Array.isArray(data?.data) ? data.data
        : Array.isArray(data?.items) ? data.items
        : Array.isArray(data?.escalas) ? data.escalas
        : []
      
      console.log('[cooperados.escalas] Items extraídos:', items.length, 'registros')
      
      _cacheEscalas.set(key, { ts: Date.now(), data: items })
      pruneCache(_cacheEscalas)
      return items
    } finally {
      _inflightEscalas.delete(key)
    }
  })()
  
  _inflightEscalas.set(key, promise)
  return promise
}

async function revalidateEscalas(key: string, params?: URLSearchParams | Record<string, any>) {
  try {
    const http = await api()
    const { data } = await http.get('webadmin/cooperados/eventos/escalas', { params })
    const items = Array.isArray(data) ? data 
      : Array.isArray(data?.data) ? data.data
      : Array.isArray(data?.items) ? data.items
      : Array.isArray(data?.escalas) ? data.escalas
      : []
    _cacheEscalas.set(key, { ts: Date.now(), data: items })
    pruneCache(_cacheEscalas)
  } catch (err) {
    console.warn('[cooperados.escalas][revalidate] falhou', err)
  }
}
