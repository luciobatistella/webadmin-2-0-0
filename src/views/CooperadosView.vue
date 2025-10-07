<script setup lang="ts">
import { ref, computed, onMounted, onActivated, watch, nextTick } from 'vue'
import { ChatBubbleLeftEllipsisIcon } from '@heroicons/vue/24/outline'
import Breadcrumbs from '@/components/Breadcrumbs.vue'
import ClientActions from '@/components/ClientActions.vue'
import { listCooperados, getCooperado, paginateCooperadosDocuments, countCooperadosStatistics, listCooperadoPayments, listCooperadoCheckins, updateCooperado } from '@/services/cooperados'
import SidePanel from '@/components/SidePanel.vue'
import { useRoute, useRouter } from 'vue-router'
import { COOPERADO_DETAIL_VIEW_MODE } from '@/config/featureFlags'
import { OP_STATUS_LABEL, normalizeOpStatusKey } from '@/constants/operationalStatus'

type Row = Record<string, any>

defineOptions({ name: 'CooperadosView' })

const rows = ref<Row[]>([])
const loading = ref(false)
const page = ref(1)
const limit = ref(18)
const total = ref(0)
// Rastreia a última página carregada do backend quando usamos paginação oficial
const lastLoadedPage = ref(1)

const q = ref('')
const sortBy = ref<'nome'|'mais_recentes'|'codigo'>('mais_recentes')
const showFilters = ref(false)
const showFuncFilter = ref(false)
const showSort = ref(false)
const showOpStatus = ref(false)
const opStatusFilter = ref<string>('') // '', 'disponivel', 'contratacao', 'pre_doc', 'agendado', 'trabalhando', 'concluido', 'faltou_cancelou'
// Modo de abas por Status Operacional
const useOpStatusTabs = ref(false)
const opTab = ref<string>('') // '' significa Todos no modo abas operacionais
// Filtro de documentos (vencimentos)
const showDocsFilter = ref(false)
const vencFotoPerfil = ref(false)
const vencAtestado = ref(false)
const vencAntecedentes = ref(false)
const vencUniforme = ref(false)

const docFiltersActive = computed(() => vencFotoPerfil.value || vencAtestado.value || vencAntecedentes.value || vencUniforme.value)

const showLocation = ref(false)
const route = useRoute()
const router = useRouter()
const viewMode = computed(() => (route.query.view || COOPERADO_DETAIL_VIEW_MODE))

// Persistência de estado (filtros/página) via querystring e destaque do último visitado
const initializing = ref(true)
const lastVisitedId = ref<string | null>(null)
// Evita que watchers resetem a página durante sincronização a partir da URL
const syncing = ref(false)

function toBool(v: unknown): boolean {
  return v === '1' || v === 'true' || v === true
}

function syncFromQuery() {
  syncing.value = true
  const qy = route.query as Record<string, any>
  if (qy.q != null) q.value = String(qy.q)
  if (qy.sort === 'nome' || qy.sort === 'codigo' || qy.sort === 'mais_recentes') sortBy.value = qy.sort
  if (qy.tab === 'todos' || qy.tab === 'ativos' || qy.tab === 'inativos' || qy.tab === 'bloqueados' || qy.tab === 'pendentes') currentTab.value = qy.tab
  if (qy.page != null && !Number.isNaN(Number(qy.page))) page.value = Math.max(1, Number(qy.page))
  if (qy.limit != null && !Number.isNaN(Number(qy.limit))) limit.value = Math.max(1, Number(qy.limit))
  if (qy.sexo === 'M' || qy.sexo === 'F' || qy.sexo === '') sexoFilter.value = String(qy.sexo)
  if (qy.uf != null) estadoFilter.value = String(qy.uf)
  if (qy.cidade != null) cidadeFilter.value = String(qy.cidade)
  if (qy.regiao != null) regiaoFilter.value = String(qy.regiao)
  if (qy.status === 'nenhum' || qy.status === 'completo' || qy.status === 'incompleto') statusFilter.value = String(qy.status)
  if (typeof qy.op === 'string') opStatusFilter.value = String(qy.op)
  if (qy.opTabs != null) useOpStatusTabs.value = toBool(qy.opTabs)
  if (typeof qy.opTab === 'string') opTab.value = String(qy.opTab)
  if (typeof qy.funcao === 'string') funcaoFilter.value = String(qy.funcao)
  if (qy.vFoto != null) vencFotoPerfil.value = toBool(qy.vFoto)
  if (qy.vAtestado != null) vencAtestado.value = toBool(qy.vAtestado)
  if (qy.vAntecedentes != null) vencAntecedentes.value = toBool(qy.vAntecedentes)
  if (qy.vUniforme != null) vencUniforme.value = toBool(qy.vUniforme)
  // Libera os watchers somente no próximo tick, evitando resets de página
  nextTick(() => { syncing.value = false })
}

function buildQueryFromState() {
  const qy: Record<string, any> = {}
  if (q.value) qy.q = q.value
  if (sortBy.value) qy.sort = sortBy.value
  if (currentTab.value) qy.tab = currentTab.value
  if (page.value) qy.page = String(page.value)
  if (limit.value) qy.limit = String(limit.value)
  if (sexoFilter.value) qy.sexo = sexoFilter.value
  if (estadoFilter.value) qy.uf = estadoFilter.value
  if (cidadeFilter.value) qy.cidade = cidadeFilter.value
  if (regiaoFilter.value) qy.regiao = regiaoFilter.value
  if (statusFilter.value && statusFilter.value !== 'nenhum') qy.status = statusFilter.value
  if (opStatusFilter.value) qy.op = opStatusFilter.value
  if (useOpStatusTabs.value) {
    qy.opTabs = '1'
    if (opTab.value) qy.opTab = opTab.value
  }
  if (funcaoFilter.value) qy.funcao = funcaoFilter.value
  if (vencFotoPerfil.value) qy.vFoto = '1'
  if (vencAtestado.value) qy.vAtestado = '1'
  if (vencAntecedentes.value) qy.vAntecedentes = '1'
  if (vencUniforme.value) qy.vUniforme = '1'
  // manter view se vier por query
  if (route.query.view) qy.view = route.query.view
  return qy
}

function restoreLastVisited() {
  try {
    const raw = sessionStorage.getItem('cooperados:last')
    if (!raw) return
    const obj = JSON.parse(raw || '{}') as { id?: string; at?: number }
    if (!obj || !obj.id) return
    // Considera válido por até 60s
    if (obj.at && Date.now() - Number(obj.at) > 60000) {
      sessionStorage.removeItem('cooperados:last')
      return
    }
    lastVisitedId.value = String(obj.id)
    // remove destaque após animação
    setTimeout(() => {
      lastVisitedId.value = null
      sessionStorage.removeItem('cooperados:last')
    }, 3400)
  } catch { /* noop */ }
}

function isJustVisited(it: Row): boolean {
  const id = resolveCooperadoId(it)
  return lastVisitedId.value != null && String(id ?? '') === String(lastVisitedId.value)
}

// Detalhes do cooperado
const showDetail = ref(false)
const selectedCooperadoId = ref<number | null>(null)
const detailLoading = ref(false)
const detail = ref<Row | null>(null)
const editing = ref(false)
const activeDetailTab = ref<'perfil' | 'documentos' | 'pagamentos' | 'presencas'>('perfil')
const payments = ref<Row[]>([])
const checkins = ref<Row[]>([])

// Filtro por função
const funcaoFilter = ref('')
const FILTRO_SEM_FUNCAO = '__SEM_FUNCAO__'
const FILTRO_COM_FUNCAO = '__COM_FUNCAO__'

// Tabs (Situação)
const currentTab = ref('todos') // 'todos' | 'ativos' | 'inativos' | 'bloqueados' | 'pendentes'

// Contadores oficiais do backend
const remoteCounts = ref<{ all: number; active: number; inactive: number; blocked: number; pending: number }>({ all: 0, active: 0, inactive: 0, blocked: 0, pending: 0 })


// Filtros adicionais
const showStatusFilter = ref(false)
const statusFilter = ref('nenhum') // 'nenhum' | 'completo' | 'incompleto'
const sexoFilter = ref('')         // 'M' | 'F' | ''
const estadoFilter = ref('SP')      // UF ou nome
const cidadeFilter = ref('')
const regiaoFilter = ref('')

// Dropdown combinado (Ordenação + Sexo + Documentos)
const showCombined = ref(false)


// Mapa UF -> Região
const UF_TO_REGIAO: Record<string,string> = { AC: 'N', AP: 'N', AM: 'N', PA: 'N', RO: 'N', RR: 'N', TO: 'N', AL: 'NE', BA: 'NE', CE: 'NE', MA: 'NE', PB: 'NE', PE: 'NE', PI: 'NE', RN: 'NE', SE: 'NE', DF: 'CO', GO: 'CO', MS: 'CO', MT: 'CO', ES: 'SE', MG: 'SE', RJ: 'SE', SP: 'SE', PR: 'S', RS: 'S', SC: 'S' }
const UF_OPTIONS = Object.keys(UF_TO_REGIAO)
// Macro-regiões do Brasil (fallback)
const MACRO_REGIOES: string[] = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul']
// Regiões por UF (ex.: zonas de São Paulo)
const REGIOES_POR_UF = {
  SP: ['Zona Norte', 'Zona Sul', 'Zona Leste', 'Zona Oeste', 'Centro']
}

const regionOptions = computed(() => {
  if (String(estadoFilter.value).toUpperCase() === 'SP') {
    return (REGIOES_POR_UF.SP || []).map(label => ({ label, value: label }))
  }
  return MACRO_REGIOES.map(r => ({ label: r, value: r }))
})

function matchRegion(it: Row, selected: string) {
  if (!selected) return true
  const uf = String(it.uf || it.estado || '').toUpperCase()
  // Se for SP e o filtro for uma zona nominal (ex.: Zona Norte), casa por texto em campos comuns
  if (uf === 'SP' && !['N', 'NE', 'CO', 'SE', 'S'].includes(selected)) {
    const v = normalizeText(selected)
    const fields = [it.regiao_sp, it.regiao, it.zona, it.zona_sp, it.bairro_regiao]
    return fields.some(f => normalizeText(f || '').includes(v))
  }
  // Caso contrário, usa macro-região via UF_TO_REGIAO
  return (UF_TO_REGIAO as Record<string,string>)[uf] === selected
}


// Heurística simples de “completo”
function isCompleto(it: Row) {
  const hasNome = !!(it.nome || it.name)
  const hasDoc = !!(it.cpf || it.cnpj || it.documento)
  const hasEmail = !!it.email
  return hasNome && hasDoc && hasEmail
}


function mapStatusTabToApi(): number | undefined {
  // status: number (null|0|1|2|3|4) (Todos|Ativo|Inativo|Bloqueado|Pendente)
  if (currentTab.value === 'todos') return undefined // não enviar para "todos"
  if (currentTab.value === 'ativos') return 1
  if (currentTab.value === 'inativos') return 2
  if (currentTab.value === 'bloqueados') return 3
  if (currentTab.value === 'pendentes') return 4
  return undefined
}

function buildApiParams(opts?: { includeDocFilters?: boolean }): URLSearchParams {
  const p = new URLSearchParams()
  // Backend é 0-based; UI é 1-based
  p.append('page', String(page.value - 1))
  p.append('limit', String(limit.value))
  // Busca livre mapeada para nome/matricula/cpf conforme padrão do texto
  if (q.value) {
    const raw = String(q.value).trim()
    const onlyDigits = raw.replace(/\D+/g, '')
    const looksLikeCpf = /\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11}/.test(raw)
    if (looksLikeCpf) p.append('cpf', onlyDigits.length === 11 ? onlyDigits : raw)
    else if (/^\d{1,6}$/.test(onlyDigits)) p.append('matricula', onlyDigits)
    else p.append('nome', raw)
  }
  if (sexoFilter.value === 'M' || sexoFilter.value === 'F') {
    p.append('sexo', String(sexoFilter.value))
  }
  // Status geral (Situação) só é enviado quando NÃO estamos usando abas por status operacional
  const statusNum = mapStatusTabToApi()
  if (!useOpStatusTabs.value && typeof statusNum === 'number' && statusNum > 0) {
    p.append('status', String(statusNum))
  }
  // Vencimentos (apenas enviar quando true) — opcional
  const includeDocs = opts?.includeDocFilters !== false
  if (includeDocs) {
    if (vencFotoPerfil.value) p.append('fotoPerfilVencimento', 'true')
    if (vencAtestado.value) p.append('atestadoVencimento', 'true')
    if (vencAntecedentes.value) p.append('antecedentesVencimento', 'true')
    if (vencUniforme.value) p.append('uniformeVencimento', 'true')
  }
  // orderBy
  if (sortBy.value === 'nome') p.append('orderBy', 'nome')
  else if (sortBy.value === 'codigo') p.append('orderBy', 'matricula')
  else p.append('orderBy', 'matricula')
  return p
}

// Busca incremental de todas as páginas para paginação local (suporta grandes volumes)
async function fetchAllForLocalPaging(): Promise<Row[]> {
  // Não enviamos filtros de documentos para o backend (OR aplicado localmente ou por abas)
  const baseParams = buildApiParams({ includeDocFilters: false })
  baseParams.set('page', '0')

  const perPageCandidates = ['500', '250', '100']
  const maxRecords = 12000 // trava de segurança para não baixar infinitamente
  const aggregated: Row[] = []

  let chosenLimit: string | null = null
  let totalServer = 0
  // Tenta limites maiores primeiro para reduzir número de requisições
  for (const lim of perPageCandidates) {
    try {
      const p0 = new URLSearchParams(baseParams as any)
      p0.set('limit', lim)
      const resp0 = await paginateCooperadosDocuments(p0)
      const data0 = (resp0?.data || []) as Row[]
      totalServer = Number(resp0?.total || data0.length || 0)
      aggregated.push(...data0)
      chosenLimit = lim
      break
    } catch (e) {
      // tenta próximo limite
      continue
    }
  }

  if (!chosenLimit) {
    // como fallback extremo, retorna o que conseguiu (ou vazio)
    return aggregated
  }

  const perPage = Number(chosenLimit)
  const totalPages = Math.max(1, Math.ceil(totalServer / perPage))

  // Já carregamos a página 0; buscar as demais
  for (let pageIdx = 1; pageIdx < totalPages; pageIdx++) {
    // Se por algum motivo já atingiu o máximo, para
    if (aggregated.length >= maxRecords) break
    try {
      const p = new URLSearchParams(baseParams as any)
      p.set('page', String(pageIdx))
      p.set('limit', String(perPage))
      const resp = await paginateCooperadosDocuments(p)
      const data = (resp?.data || []) as Row[]
      if (!Array.isArray(data) || data.length === 0) break
      aggregated.push(...data)
    } catch (e) {
      // Se falhar uma página, tenta a próxima; não aborta a lista já obtida
      continue
    }
  }

  return aggregated.slice(0, maxRecords)
}

// Agrega via backend os documentos com OR entre as flags ativas de vencimento
async function fetchAllForLocalDocsOR(): Promise<Row[]> {
  const flags: Array<{ key: string; set: (p: URLSearchParams) => void }> = []
  if (vencFotoPerfil.value) flags.push({ key: 'fotoPerfilVencimento', set: (p) => p.set('fotoPerfilVencimento', 'true') })
  if (vencAtestado.value) flags.push({ key: 'atestadoVencimento', set: (p) => p.set('atestadoVencimento', 'true') })
  if (vencAntecedentes.value) flags.push({ key: 'antecedentesVencimento', set: (p) => p.set('antecedentesVencimento', 'true') })
  if (vencUniforme.value) flags.push({ key: 'uniformeVencimento', set: (p) => p.set('uniformeVencimento', 'true') })

  if (flags.length === 0) return []

  const maxRecords = 12000
  const perPageCandidates = ['500', '250', '100']
  const merged: Row[] = []
  const seen = new Set<string | number>()

  // Para cada flag ativa, percorre a paginação completa e agrega resultados
  for (const f of flags) {
    // Base sem outras flags para esta rodada
    const base = buildApiParams({ includeDocFilters: false })
    // Copia e injeta a flag
    const baseWithFlag = new URLSearchParams(base as any)
    f.set(baseWithFlag)
    baseWithFlag.set('page', '0')

    let chosenLimit: string | null = null
    let totalServer = 0
    // tentativa progressiva de limites
    for (const lim of perPageCandidates) {
      try {
        const p0 = new URLSearchParams(baseWithFlag as any)
        p0.set('limit', lim)
        const resp0 = await paginateCooperadosDocuments(p0)
        const data0 = (resp0?.data || []) as Row[]
        totalServer = Number(resp0?.total || data0.length || 0)
        for (const it of data0) {
          const id = resolveCooperadoId(it)
          if (id != null && !seen.has(id)) { seen.add(id); merged.push(it) }
        }
        chosenLimit = lim
        break
      } catch (e) {
        continue
      }
    }

    if (!chosenLimit) continue

    const perPage = Number(chosenLimit)
    const totalPages = Math.max(1, Math.ceil(totalServer / perPage))
    for (let pageIdx = 1; pageIdx < totalPages; pageIdx++) {
      if (merged.length >= maxRecords) break
      try {
        const p = new URLSearchParams(baseWithFlag as any)
        p.set('page', String(pageIdx))
        p.set('limit', String(perPage))
        const resp = await paginateCooperadosDocuments(p)
        const data = (resp?.data || []) as Row[]
        if (!Array.isArray(data) || data.length === 0) break
        for (const it of data) {
          const id = resolveCooperadoId(it)
          if (id != null && !seen.has(id)) { seen.add(id); merged.push(it) }
        }
      } catch (e) { continue }
    }

    if (merged.length >= maxRecords) break
  }

  return merged.slice(0, maxRecords)
}

async function load() {
  loading.value = true
  try {
    const officialAllowed = [1, 10, 20, 50, 100]
    const canUseOfficial = officialAllowed.includes(Number(limit.value))
    const useLocalDocsOR = docFiltersActive.value
    const useLocalOpTabs = useOpStatusTabs.value

    if (useLocalDocsOR) {
      // Quando filtros de documentos estão ativos, agregamos via backend (OR entre flags)
      const list = await fetchAllForLocalDocsOR()
      rows.value = list
      total.value = list.length
      lastLoadedPage.value = page.value

      // Contadores oficiais com os mesmos filtros (sem page/limit e sem doc flags)
      const countParams = buildApiParams({ includeDocFilters: false })
      countParams.delete('page')
      countParams.delete('limit')
      remoteCounts.value = await countCooperadosStatistics(countParams)
    } else if (useLocalOpTabs) {
      // Paginação local: buscar TODAS as páginas e filtrar localmente por abas operacionais
      const list = await fetchAllForLocalPaging()
      rows.value = list
      total.value = list.length
      lastLoadedPage.value = page.value

      // Contadores oficiais com os mesmos filtros (sem page/limit)
      const countParams = buildApiParams({ includeDocFilters: false })
      countParams.delete('page')
      countParams.delete('limit')
      remoteCounts.value = await countCooperadosStatistics(countParams)
    } else if (canUseOfficial) {
      const p = buildApiParams()
      // Chamada oficial de paginação
      const resp = await paginateCooperadosDocuments(p)
      rows.value = (resp?.data || []) as Row[]
      total.value = Number(resp?.total || 0)
      lastLoadedPage.value = page.value

      // Contadores oficiais (mesmos filtros, sem page/limit)
      const countParams = buildApiParams()
      countParams.delete('page')
      countParams.delete('limit')
      remoteCounts.value = await countCooperadosStatistics(countParams)
    } else {
      // Fallback: endpoint legacy (sem contadores), sem provocar 400
      const legacy = new URLSearchParams()
      legacy.append('page', String(page.value - 1))
      legacy.append('limit', String(limit.value))
      if (q.value) legacy.append('q', q.value)
      const data: any = await listCooperados(legacy)
      rows.value = Array.isArray(data) ? (data as Row[]) : ((data?.data || data?.rows || []) as Row[])
      total.value = Array.isArray(data) ? (data as any[]).length : Number(data?.total || rows.value.length)
  lastLoadedPage.value = page.value
      const all = rows.value.length
      const active = rows.value.filter(isAtivo as any).length
      const inactive = rows.value.filter(isInativo as any).length
      const blocked = rows.value.filter(isBloqueado as any).length
      const pending = rows.value.filter(isPendente as any).length
      remoteCounts.value = { all, active, inactive, blocked, pending }
    }
  } catch (err) {
    console.warn('[cooperados] paginate/documents falhou, fallback para endpoint antigo', err)
    const legacy = new URLSearchParams()
    legacy.append('page', String(page.value - 1))
    legacy.append('limit', String(limit.value))
    if (q.value) legacy.append('q', q.value)
    const data: any = await listCooperados(legacy)
    rows.value = Array.isArray(data) ? (data as Row[]) : ((data?.data || data?.rows || []) as Row[])
    total.value = Array.isArray(data) ? (data as any[]).length : Number(data?.total || rows.value.length)
    remoteCounts.value = { all: total.value, active: 0, inactive: 0, blocked: 0, pending: 0 }
  } finally {
    // Se estamos paginando localmente (doc filters ou abas operacionais), garanta que a página atual
    // não ultrapasse o total de páginas calculado, evitando cair para 1 indevidamente.
    try {
      if (!isOfficialPaged.value) {
        const totalForPaging = filteredRows.value.length
        const tp = Math.max(1, Math.ceil(totalForPaging / limit.value))
        if (page.value > tp) page.value = tp
      }
    } catch {}
    loading.value = false
  }


}

function resolveCooperadoId(it: Row): string | number | null {
  const cand = (it && (it as any)) || {}
  const id = cand.id ?? cand.cooperadoId ?? cand.cooperado_id ?? cand.codigo ?? cand.matricula
  return (id !== undefined && id !== null && String(id).trim() !== '') ? id : null
}

async function openDetail(it: Row) {
  const safeId = resolveCooperadoId(it)
  if (!safeId) {
    ;(window as any).$toast?.error?.('Não foi possível abrir os detalhes: cooperado sem identificador')
    return
  }
  // Se o modo for "page", navegar para a página de detalhes
  if (viewMode.value === 'page') {
    try {
      // Destacar imediatamente o card clicado
      lastVisitedId.value = String(safeId)
      sessionStorage.setItem('cooperados:last', JSON.stringify({ id: String(safeId), at: Date.now() }))
    } catch { /* noop */ }
    // Levar a query atual junto para que o botão Voltar preserve busca/filtros
    router.push({ name: 'cooperado-detail', params: { id: String(safeId) }, query: { ...route.query } })
    return
  }
  try {
    selectedCooperadoId.value = Number(safeId) || null
    showDetail.value = true
    detailLoading.value = true
    detail.value = null
    const data = await getCooperado(safeId, new URLSearchParams())
    detail.value = (data && (data.data || data)) as Row
    // carregar abas extras (pagamentos/presenças)
    loadDetailExtras(String(safeId))
  } catch (e) {
    console.error('[cooperados.detail] falha ao carregar detalhe', e)
    ;(window as any).$toast?.error?.('Não foi possível carregar os detalhes do cooperado')
  } finally {
    detailLoading.value = false
  }
}

function closeDetail() {
  // Ao fechar o painel lateral, destacar temporariamente o card visitado
  const lastId = selectedCooperadoId.value
  showDetail.value = false
  detail.value = null
  if (lastId != null) {
    lastVisitedId.value = String(lastId)
    setTimeout(() => { lastVisitedId.value = null }, 3400)
  }
  selectedCooperadoId.value = null
}

async function loadDetailExtras(id: number | string) {
  try {
    const [p, c] = await Promise.all([
      listCooperadoPayments(id, new URLSearchParams()),
      listCooperadoCheckins(id, new URLSearchParams()),
    ])
    payments.value = Array.isArray(p) ? p : []
    checkins.value = Array.isArray(c) ? c : []
  } catch (e) {
    console.warn('[cooperados.detail] extras falharam', e)
    payments.value = payments.value || []
    checkins.value = checkins.value || []
  }
}

function startEdit() {
  editing.value = true
}
function cancelEdit() {
  editing.value = false
}
async function saveEdit() {
  try {
    if (!detail.value) return
    const id = resolveCooperadoId(detail.value)
    if (id == null) return
    const payload: any = {
      nome: detail.value.nome,
      sexo: detail.value.sexo,
      cidade: detail.value.cidade,
      uf: detail.value.uf || detail.value.estado,
      cooperativa: detail.value.cooperativa,
      status: detail.value.status,
      // Adicione outros campos editáveis necessários
    }
    await updateCooperado(String(id), payload)
    editing.value = false
    ;(window as any).$toast?.success?.('Dados atualizados')
  } catch (e) {
    console.error('[cooperados.detail] salvar edição', e)
    ;(window as any).$toast?.error?.('Não foi possível salvar as alterações')
  }
}

// Helpers de status para abas (Situação)
function normStatus(it: Row) {
  return String(it.status || it.situacao || '').toLowerCase()
}
function isAtivo(it: Row) {
  const s = normStatus(it)
  if (!s) return false
  if (s.includes('bloq') || s.includes('pend') || s.includes('inativ')) return false
  return s.includes('ativ') || s.includes('aprov')
}
function isInativo(it: Row) {
  const s = normStatus(it)
  return s.includes('inativ')
}
function isBloqueado(it: Row) {
  const s = normStatus(it)
  return s.includes('bloq')
}
function isPendente(it: Row) {
  const s = normStatus(it)
  return s.includes('pend')
}

// Aplica todos os filtros (exceto a aba)
const baseFilteredRows = computed<Row[]>(() => {
  let list: Row[] = Array.isArray(rows.value) ? rows.value : []
  const rawTerm = String(q.value || '')
  const term = normalizeText(rawTerm)

  if (term) {
    list = list.filter(it => {
      const nome = normalizeText(it.nome || it.name || '')
      const doc = normalizeText(it.cpf || it.cnpj || it.documento || '')
      const email = normalizeText(it.email || '')
      const matricula = normalizeText(it.matricula || it.matricola || it.registration || '')
      const id = String(it.id || '')
      const func = normalizeText(it.funcao || it.funcao1 || it.funcao2 || it.funcao3 || it.role || it.cargo || '')
      return (
        nome.includes(term) ||
        doc.includes(term) ||
        email.includes(term) ||
        matricula.includes(term) ||
        id.includes(rawTerm) ||
        func.includes(term)
      )
    })
  }

  if (statusFilter.value === 'completo') list = list.filter(it => isCompleto(it))
  else if (statusFilter.value === 'incompleto') list = list.filter(it => !isCompleto(it))

  if (sexoFilter.value) {
    const sx = String(sexoFilter.value).toUpperCase()
    list = list.filter(it => String(it.sexo || it.gender || '').toUpperCase().startsWith(sx))
  }

  if (estadoFilter.value) {
    const uf = String(estadoFilter.value).toUpperCase()
    list = list.filter(it => String(it.estado || it.uf || '').toUpperCase() === uf)
  }
  if (cidadeFilter.value) {
    const c = normalizeText(cidadeFilter.value)
    list = list.filter(it => normalizeText(it.cidade || it.city || '').includes(c))
  }

  if (regiaoFilter.value) {
    const sel = regiaoFilter.value
    list = list.filter(it => matchRegion(it, sel))
  }

  // Filtro de documentos vencidos (OR entre os selecionados)
  if (vencFotoPerfil.value || vencAtestado.value || vencAntecedentes.value || vencUniforme.value) {
    list = list.filter(it => {
      const f = getDocVencFlags(it)
      return (
        (vencFotoPerfil.value && !!f.foto) ||
        (vencAtestado.value && !!f.atestado) ||
        (vencAntecedentes.value && !!f.antecedentes) ||
        (vencUniforme.value && !!f.uniforme)
      )
    })
  }

  // Aplicar filtro de status operacional (via dropdown OU via abas operacionais)
  const opKey = useOpStatusTabs.value ? String(opTab.value || '') : String(opStatusFilter.value || '')
  if (opKey) {
    list = list.filter(it => getOpStatusKey(it) === opKey)
  }

  if (funcaoFilter.value) {
    const fsel = normalizeText(funcaoFilter.value)
    list = list.filter(it => [it.funcao, it.funcao1, it.funcao2, it.funcao3]
      .filter(Boolean)
      .some(f => normalizeText(f).includes(fsel)))
  }

  return list
})


// Lista base sem aplicar filtro de sexo (para contadores)
const preSexoRows = computed<Row[]>(() => {
  let list: Row[] = Array.isArray(rows.value) ? rows.value : []
  const rawTerm = String(q.value || '')
  const term = normalizeText(rawTerm)
  if (term) {
    list = list.filter(it => {
      const nome = normalizeText(it.nome || it.name || '')
      const doc = normalizeText(it.cpf || it.cnpj || it.documento || '')
      const email = normalizeText(it.email || '')
      const matricula = normalizeText(it.matricula || it.matricola || it.registration || '')
      const id = String(it.id || '')
      return nome.includes(term) || doc.includes(term) || email.includes(term) || matricula.includes(term) || id.includes(rawTerm)
    })
  }
  if (statusFilter.value === 'completo') list = list.filter(it => isCompleto(it))
  else if (statusFilter.value === 'incompleto') list = list.filter(it => !isCompleto(it))
  // Não aplicar filtro de status operacional aqui (para contadores)
  // Intencionalmente NÃO aplica filtro de sexo aqui
  if (estadoFilter.value) {
    const uf = String(estadoFilter.value).toUpperCase()
    list = list.filter(it => String(it.estado || it.uf || '').toUpperCase() === uf)
  }
  if (cidadeFilter.value) {
    const c = normalizeText(cidadeFilter.value)
    list = list.filter(it => normalizeText(it.cidade || it.city || '').includes(c))
  }
  // Também não aplica regiao aqui (é para contadores de sexo)
  return list
})

// Lista base sem aplicar filtro de região (para contadores)
const preRegiaoRows = computed<Row[]>(() => {
  let list: Row[] = Array.isArray(rows.value) ? rows.value : []
  const rawTerm = String(q.value || '')
  const term = normalizeText(rawTerm)
  if (term) {
    list = list.filter(it => {
      const nome = normalizeText(it.nome || it.name || '')
      const doc = normalizeText(it.cpf || it.cnpj || it.documento || '')
      const email = normalizeText(it.email || '')
      const matricula = normalizeText(it.matricula || it.matricola || it.registration || '')
      const id = String(it.id || '')
      return nome.includes(term) || doc.includes(term) || email.includes(term) || matricula.includes(term) || id.includes(rawTerm)
    })
  }
  if (statusFilter.value === 'completo') list = list.filter(it => isCompleto(it))
  else if (statusFilter.value === 'incompleto') list = list.filter(it => !isCompleto(it))
  // Não aplicar filtro de status operacional aqui (para contadores)
  if (sexoFilter.value) {
    const sx = String(sexoFilter.value).toUpperCase()
    list = list.filter(it => String(it.sexo || it.gender || '').toUpperCase().startsWith(sx))
  }
  if (estadoFilter.value) {
    const uf = String(estadoFilter.value).toUpperCase()
    list = list.filter(it => String(it.estado || it.uf || '').toUpperCase() === uf)
  }
  if (cidadeFilter.value) {
    const c = normalizeText(cidadeFilter.value)
    list = list.filter(it => normalizeText(it.cidade || it.city || '').includes(c))
  }
  // NOTE: Não aplicamos filtro de regiao aqui de propósito
  return list
})
// Lista base sem aplicar filtro de função (para contadores de função)
const preFuncaoRows = computed<Row[]>(() => {
  let list: Row[] = Array.isArray(rows.value) ? rows.value : []
  const rawTerm = String(q.value || '')
  const term = normalizeText(rawTerm)
  if (term) {
    list = list.filter(it => {
      const nome = normalizeText(it.nome || it.name || '')
      const doc = normalizeText(it.cpf || it.cnpj || it.documento || '')
      const email = normalizeText(it.email || '')
      const matricula = normalizeText(it.matricula || it.matricola || it.registration || '')
      const id = String(it.id || '')
      return nome.includes(term) || doc.includes(term) || email.includes(term) || matricula.includes(term) || id.includes(rawTerm)
    })
  }
  if (statusFilter.value === 'completo') list = list.filter(it => isCompleto(it))
  else if (statusFilter.value === 'incompleto') list = list.filter(it => !isCompleto(it))
  // Não aplicar filtro de status operacional aqui (para contadores)
  if (sexoFilter.value) {
    const sx = String(sexoFilter.value).toUpperCase()
    list = list.filter(it => String(it.sexo || it.gender || '').toUpperCase().startsWith(sx))
  }
  if (estadoFilter.value) {
    const uf = String(estadoFilter.value).toUpperCase()
    list = list.filter(it => String(it.estado || it.uf || '').toUpperCase() === uf)
  }
  if (cidadeFilter.value) {
    const c = normalizeText(cidadeFilter.value)
    list = list.filter(it => normalizeText(it.cidade || it.city || '').includes(c))
  }
  // NOTE: Não aplicamos filtro de função aqui de propósito
  return list
})

// Lista base sem aplicar filtro de status operacional (para contagem das abas operacionais)
const preOpRows = computed<Row[]>(() => {
  let list: Row[] = Array.isArray(rows.value) ? rows.value : []
  const rawTerm = String(q.value || '')
  const term = normalizeText(rawTerm)
  if (term) {
    list = list.filter(it => {
      const nome = normalizeText(it.nome || it.name || '')
      const doc = normalizeText(it.cpf || it.cnpj || it.documento || '')
      const email = normalizeText(it.email || '')
      const matricula = normalizeText(it.matricula || it.matricola || it.registration || '')
      const id = String(it.id || '')
      const func = normalizeText(it.funcao || it.funcao1 || it.funcao2 || it.funcao3 || it.role || it.cargo || '')
      return (
        nome.includes(term) ||
        doc.includes(term) ||
        email.includes(term) ||
        matricula.includes(term) ||
        id.includes(rawTerm) ||
        func.includes(term)
      )
    })
  }
  if (statusFilter.value === 'completo') list = list.filter(it => isCompleto(it))
  else if (statusFilter.value === 'incompleto') list = list.filter(it => !isCompleto(it))
  if (sexoFilter.value) {
    const sx = String(sexoFilter.value).toUpperCase()
    list = list.filter(it => String(it.sexo || it.gender || '').toUpperCase().startsWith(sx))
  }
  if (estadoFilter.value) {
    const uf = String(estadoFilter.value).toUpperCase()
    list = list.filter(it => String(it.estado || it.uf || '').toUpperCase() === uf)
  }
  if (cidadeFilter.value) {
    const c = normalizeText(cidadeFilter.value)
    list = list.filter(it => normalizeText(it.cidade || it.city || '').includes(c))
  }
  if (regiaoFilter.value) {
    const sel = regiaoFilter.value
    list = list.filter(it => matchRegion(it, sel))
  }
  if (funcaoFilter.value) {
    const fsel = normalizeText(funcaoFilter.value)
    list = list.filter(it => [it.funcao, it.funcao1, it.funcao2, it.funcao3]
      .filter(Boolean)
      .some(f => normalizeText(f).includes(fsel)))
  }
  return list
})

const opCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {
    disponivel: 0,
    contratacao: 0,
    pre_doc: 0,
    agendado: 0,
    trabalhando: 0,
    concluido: 0,
    faltou_cancelou: 0,
  }
  for (const it of preOpRows.value) {
    const k = getOpStatusKey(it)
    if (!k) continue
    counts[k] = (counts[k] || 0) + 1
  }
  return counts
})

const funcaoCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = { [FILTRO_SEM_FUNCAO]: 0, [FILTRO_COM_FUNCAO]: 0 }
  const list = preFuncaoRows.value
  for (const it of list) {
    const funcoes = [it.funcao, it.funcao1, it.funcao2, it.funcao3, it.funcao4, it.funcao5, it.funcao6, it.funcao7, it.funcao8].filter(Boolean)
    if (funcoes.length === 0) counts[FILTRO_SEM_FUNCAO]++
    else counts[FILTRO_COM_FUNCAO]++
    for (const f of funcoes) {
      const key = String(f).trim()
      if (!key) continue
      counts[key] = (counts[key] || 0) + 1
    }
  }
  // ordenar por maior frequência e pegar top 5
  const top = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,5)
  const topObj: Record<string, number> = {}
  for (const [k,v] of top) topObj[k as string] = v as number
  return topObj
})

const totalPreFuncao = computed(() => Array.isArray(preFuncaoRows?.value) ? preFuncaoRows.value.length : 0)


const regiaoCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {}
  const list = preRegiaoRows.value
  const isSP = String(estadoFilter.value).toUpperCase() === 'SP'
  if (isSP) {
    const labels = ['Zona Norte', 'Zona Sul', 'Zona Leste', 'Zona Oeste', 'Centro']
    for (const label of labels) {

      const v = normalizeText(label)
      counts[label] = list.filter(it => normalizeText(it.regiao || it.regiao_sp || it.zona || it.zona_sp || '').includes(v)).length
    }
  } else {
    const labels = ['N', 'NE', 'CO', 'SE', 'S']
    for (const r of labels) {
      counts[r] = list.filter(it => {
        const uf = String(it.uf || it.estado || '').toUpperCase()
        const macro = UF_TO_REGIAO[uf]
        const reg = String(it.regiao || '').toUpperCase()
        return (macro === r) || (reg === r)
      }).length
    }
  }
  return counts
})

const totalPreRegiao = computed(() => Array.isArray(preRegiaoRows?.value) ? preRegiaoRows.value.length : 0)


function getRegiaoCount(key: string) {
  try {
    const rc = (regiaoCounts && 'value' in regiaoCounts) ? (regiaoCounts?.value || {}) : (regiaoCounts as any)
    return (rc as Record<string, number>)?.[key] ?? 0
  } catch (e) { return 0 }
}





const totalSexoM = computed(() => preSexoRows.value.filter((it: Row) => String(it.sexo || it.gender || '').toUpperCase().startsWith('M')).length)
const totalSexoF = computed(() => preSexoRows.value.filter((it: Row) => String(it.sexo || it.gender || '').toUpperCase().startsWith('F')).length)



// Totais dos tabs devem refletir os filtros atuais aplicados na UI.
// Para garantir atualização imediata com qualquer filtro local (UF, cidade, região, função, etc.),
// sempre computamos a partir de baseFilteredRows.
const totalTodos = computed(() => baseFilteredRows.value.length)
const totalAtivos = computed(() => baseFilteredRows.value.filter(isAtivo).length)
const totalInativos = computed(() => baseFilteredRows.value.filter(isInativo).length)
const totalBloqueados = computed(() => baseFilteredRows.value.filter(isBloqueado).length)
const totalPendentesTab = computed(() => baseFilteredRows.value.filter(isPendente).length)


const filteredRows = computed<Row[]>(() => {
  let list: Row[] = baseFilteredRows.value

  // Aba (Situação)
  if (!useOpStatusTabs.value) {
    if (currentTab.value === 'ativos') list = list.filter(isAtivo as any)
    else if (currentTab.value === 'inativos') list = list.filter(isInativo as any)
    else if (currentTab.value === 'bloqueados') list = list.filter(isBloqueado as any)
    else if (currentTab.value === 'pendentes') list = list.filter(isPendente as any)
  }

  // Ordenação
  const byName = (it: Row) => normalizeText(it.nome || it.name || '')
  if (sortBy.value === 'nome') list = [...list].sort((a, b) => byName(a).localeCompare(byName(b)))
  else if (sortBy.value === 'codigo') list = [...list].sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0))
  else list = [...list].sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))
  return list
})

function normalizeText(s: unknown) {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .toLowerCase()
}


function getOpStatusKey(it: Row): string {
  const raw = (it as any).status_operacional || (it as any).operational_status || (it as any).status_evento || (it as any).status_evento_atual || ''
  return normalizeOpStatusKey(raw) || ''
}


function getAvatarUrl(it: Row) {
  // tenta campos comuns de foto (prioriza urlImg1)
  return it.urlImg1 || it.foto || it.photo || it.avatar || it.picture || ''
}
function getInitials(it: Row) {
  const name = String(it.nome || it.name || '').trim()
  if (!name) return '?'
  const parts = name.split(/\s+/).slice(0, 2)
  return parts.map(p => p[0]?.toUpperCase() || '').join('')
}

function getMatricula(it: Row): string {
  return String(it.matricula || it.matricola || it.registration || '').trim()
}

function setLimit(v: unknown) {
  const allowed = [18, 36, 54, 72, 90]
  const num = Number(v) || 18
  const n = allowed.includes(num) ? num : 18
  limit.value = n
  page.value = 1
  pushStateToQuery()
  load()
}

function toWhatsUrl(number: unknown) {
  const digits = String(number || '').replace(/[^0-9]/g, '')
  if (!digits) return ''
  return `https://api.whatsapp.com/send/?phone=55${digits}&text&type=phone_number&app_absent=0`
}

function openWhats(number: unknown) {
  const url = toWhatsUrl(number)
  if (url) window.open(url, '_blank', 'noopener')
}

// Helpers de vencimento de documentos
function truthyFlag(v: any): boolean {
  return v === true || v === 'true' || v === 1 || v === '1'
}
function getDocVencFlags(it: Row) {
  // lidar com possível variação de campo (ex.: fotoPerfiVencimento vs fotoPerfilVencimento)
  const foto = truthyFlag((it as any).fotoPerfilVencimento ?? (it as any).fotoPerfiVencimento)
  const atestado = truthyFlag((it as any).atestadoVencimento)
  const antecedentes = truthyFlag((it as any).antecedentesVencimento)
  const uniforme = truthyFlag((it as any).uniformeVencimento)
  return { foto, atestado, antecedentes, uniforme }
}

function hasAnyDocVenc(it: Row): boolean {
  const f = getDocVencFlags(it)
  return !!(f.foto || f.atestado || f.antecedentes || f.uniforme)
}

function getFuncoes(it: Row): string[] {
  const vals = [it.funcao, it.funcao1, it.funcao2, it.funcao3, it.funcao4, it.funcao5, it.funcao6, it.funcao7, it.funcao8]
    .map(v => String(v || '').trim())
    .filter(v => v.length > 0)
  // remove duplicadas preservando ordem
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of vals) { if (!seen.has(v)) { seen.add(v); out.push(v) } }
  return out
}

function getRegiaoDisplay(it: Row): string {
  return String(it.regiao || it.regiao_sp || it.zona || it.zona_sp || '').trim()
}

function toggleCidadeFilter(city: string) {
  const c = String(city || '').trim()
  if (!c) return
  cidadeFilter.value = (String(cidadeFilter.value).trim() === c) ? '' : c
  page.value = 1
  pushStateToQuery()
  load()
}

function toggleRegiaoFilter(region: string) {
  const r = String(region || '').trim()
  if (!r) return
  // Se for uma zona de SP, forçamos UF=SP para casar corretamente com zonas
  if (/^zona\s+/i.test(r)) estadoFilter.value = 'SP'
  regiaoFilter.value = (String(regiaoFilter.value).trim() === r) ? '' : r
  page.value = 1
  pushStateToQuery()
  load()
}

async function copyEmail(email: unknown) {
  const value = String(email || '').trim()
  if (!value) return
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
    } else {
      const ta = document.createElement('textarea')
      ta.value = value
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    ;(window as any).$toast?.success?.('E-mail copiado')
  } catch (e) {
    console.warn('[copyEmail]', e)
    ;(window as any).$toast?.error?.('Não foi possível copiar o e-mail')
  }
}

// Utilitários para o painel de detalhes
function formatDate(val: unknown): string {
  if (!val) return '-'
  try {
    const s = String(val)
    const d = new Date(s)
    if (isNaN(d.getTime())) return '-'
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    return `${dd}/${mm}/${yyyy}`
  } catch { return '-' }
}

function calcIdade(val: unknown): number | null {
  if (!val) return null
  try {
    const d = new Date(String(val))
    if (isNaN(d.getTime())) return null
    const today = new Date()
    let idade = today.getFullYear() - d.getFullYear()
    const m = today.getMonth() - d.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) idade--
    return idade
  } catch { return null }
}

const detailDocFlags = computed(() => {
  const f = detail.value || ({} as any)
  return {
    foto: truthyFlag(f?.fotoPerfilVencimento ?? f?.fotoPerfiVencimento),
    atestado: truthyFlag(f?.atestadoVencimento),
    antecedentes: truthyFlag(f?.antecedentesVencimento),
    uniforme: truthyFlag(f?.uniformeVencimento),
  }
})

const detailFuncoesDedupe = computed<string[]>(() => {
  const f = (detail.value || {}) as any
  const listA = [f.funcao, f.funcao1, f.funcao2, f.funcao3, f.funcao4, f.funcao5, f.funcao6, f.funcao7, f.funcao8]
    .map((v: any) => String(v || '').trim()).filter(Boolean)
  const listB = Array.isArray(f.funcoes) ? (f.funcoes as any[]).map(x => String(x?.profissao || '').trim()).filter(Boolean) : []
  const merged = [...listA, ...listB]
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of merged) { if (v && !seen.has(v)) { seen.add(v); out.push(v) } }
  return out
})

type DocItem = { id?: number|string; tipo?: string; label: string; dataEnvio?: string; dataVencimento?: string; url?: string }
const detailDocumentosList = computed<DocItem[]>(() => {
  const f = (detail.value || {}) as any
  const arr = Array.isArray(f?.documentos) ? (f.documentos as any[]) : []
  const labelMap: Record<string,string> = {
    fotoPerfil: 'Foto de perfil',
    atestadoMedico: 'Atestado médico',
    antecedentesCriminais: 'Antecedentes criminais',
    uniforme: 'Uniforme',
  }
  return arr.map((d: any) => ({
    id: d.id,
    tipo: d.tipo,
    label: labelMap[d.tipo] || String(d.tipo || 'Documento'),
    dataEnvio: d.dataEnvio,
    dataVencimento: d.dataVencimento,
    url: d.urlDocumento || d.url,
  }))
})

// Agora a paginação vem do backend; apenas exibe a página atual
// Quando usamos paginação oficial (sem doc filters), já vem paginado do backend.
// Caso contrário (doc filters OR ou legacy), paginamos localmente.
const officialAllowed = [1, 10, 20, 50, 100]
const isOfficialPaged = computed(() => officialAllowed.includes(Number(limit.value)) && !docFiltersActive.value && !useOpStatusTabs.value)
const visibleRows = computed<Row[]>(() => {
  if (isOfficialPaged.value) return filteredRows.value
  const start = (page.value - 1) * limit.value
  return filteredRows.value.slice(start, start + limit.value)
})

// Paginação: total de páginas e lista de páginas com elipses
const totalPages = computed<number>(() => {
  const totalForPaging = (!isOfficialPaged.value)
    ? filteredRows.value.length
    : total.value
  return Math.max(1, Math.ceil(totalForPaging / limit.value))
})

const pageItems = computed<Array<number | '…'>>(() => {
  const total = totalPages.value
  const current = page.value
  const delta = 2 // quantidade de páginas vizinhas de cada lado
  if (total <= 1) return [1]
  const items: Array<number | '…'> = []
  items.push(1)
  let left = Math.max(2, current - delta)
  let right = Math.min(total - 1, current + delta)
  if (left > 2) items.push('…')
  for (let p = left; p <= right; p++) items.push(p)
  if (right < total - 1) items.push('…')
  items.push(total)
  return items
})




function getSortLabel() {
  const labels: Record<'nome'|'mais_recentes'|'codigo', string> = { nome: 'nome', mais_recentes: 'mais recentes', codigo: 'código' }
  return labels[sortBy.value] || 'mais recentes'
}
function clearEstado() { estadoFilter.value = ''; page.value = 1; pushStateToQuery(); load() }
function clearRegiao() { regiaoFilter.value = ''; page.value = 1; pushStateToQuery(); load() }
function clearCidade() { cidadeFilter.value = ''; page.value = 1; pushStateToQuery(); load() }
function clearSexo() { sexoFilter.value = ''; page.value = 1; pushStateToQuery(); load() }
function clearStatus() { statusFilter.value = 'nenhum'; page.value = 1; pushStateToQuery(); load() }
function clearFuncao() { funcaoFilter.value = ''; page.value = 1; pushStateToQuery(); load() }
function clearOpStatus() { opStatusFilter.value = ''; page.value = 1; pushStateToQuery(); load() }

function clearSearch() { q.value = ''; page.value = 1; pushStateToQuery(); load() }

function onCreate() {
  // TODO: abrir modal/criar novo cooperado
  console.log('[cooperados.create]')
}


function onMoreAction(key: string) {
  console.log('[cooperados.more]', key)
}

function onSearchInput() { page.value = 1 }
function filter() {
  page.value = 1
  pushStateToQuery()
  load()
}

function printWindow(){ (window as any).print() }


// Inicialização com restauração de estado via query e destaque do último visitado
onMounted(async () => {
  syncFromQuery()
  await load()
  initializing.value = false
  restoreLastVisited()
})

// Quando voltar do detalhe (KeepAlive ativo), reativar a view preserva a página e filtros da query
onActivated(async () => {
  // Re-sincroniza com a query atual (mantendo página corrente)
  syncFromQuery()
  // Recarrega somente se necessário (ex.: se nada carregado ainda)
  if (!rows.value?.length) {
    await load()
  }
  // Força rearmar a animação de destaque ao retornar
  lastVisitedId.value = null
  restoreLastVisited()
  // Se for paginação oficial e a página atual não foi a última carregada, recarregue
  if (isOfficialPaged.value && lastLoadedPage.value !== page.value) {
    await load()
  }
})

function pushStateToQuery() {
  if (initializing.value) return
  const qy = buildQueryFromState()
  // Substitui a query inteira para evitar parâmetros órfãos quando filtros são removidos
  router.replace({ query: { ...qy } }).catch(() => {})
}

// Recarrega e sincroniza ao mudar de aba (situação)
watch(currentTab, () => { if (initializing.value || syncing.value) return; page.value = 1; pushStateToQuery(); load() })
// Recarrega e sincroniza ao mudar sexo
watch(sexoFilter, () => { if (initializing.value || syncing.value) return; page.value = 1; pushStateToQuery(); load() })
// Recarrega e sincroniza ao mudar ordenação
watch(sortBy, () => { if (initializing.value || syncing.value) return; page.value = 1; pushStateToQuery(); load() })
// Recarrega e sincroniza ao alterar filtros de vencimento
watch([vencFotoPerfil, vencAtestado, vencAntecedentes, vencUniforme], () => { if (initializing.value || syncing.value) return; page.value = 1; pushStateToQuery(); load() }, { deep: true })
// Sincroniza filtros adicionais
watch(statusFilter, () => { if (initializing.value || syncing.value) return; page.value = 1; pushStateToQuery(); load() })
watch(opStatusFilter, () => { if (initializing.value || syncing.value) return; page.value = 1; pushStateToQuery(); load() })
watch(useOpStatusTabs, (val) => { if (initializing.value || syncing.value) return; page.value = 1; if (val) { opStatusFilter.value = '' } else { opTab.value = '' } pushStateToQuery(); load() })
watch(opTab, () => { if (initializing.value || syncing.value) return; page.value = 1; pushStateToQuery(); load() })
watch(funcaoFilter, () => { if (initializing.value || syncing.value) return; page.value = 1; pushStateToQuery(); load() })
watch(page, () => { if (initializing.value || syncing.value) return; pushStateToQuery() })
watch(limit, () => { if (initializing.value || syncing.value) return; pushStateToQuery() })
// Recarrega ao buscar por q ao pressionar Enter (já chama filter()); para mudança geral, debounce seria melhor

</script>

<template>
  <section class="">

    <Breadcrumbs />
    <header class="mb-6 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <h1 class="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Cooperados</h1>
        <span
          class="bg-blue-100 mt-1 text-blue-800 text-xs font-medium me-2 px-2.5 py-0.5 rounded-sm dark:bg-blue-900 dark:text-blue-300">
          Exibindo {{ Math.min((page - 1) * limit + 1, isOfficialPaged ? total : filteredRows.length) }} • {{ Math.min(page * limit,
            (isOfficialPaged ? total : filteredRows.length)) }} de {{ isOfficialPaged ? total : filteredRows.length }} registros</span>
      </div>
      <ClientActions @print="printWindow" @create="onCreate" @action="onMoreAction" />
    </header>

    <!-- Barra de busca e filtros em uma linha (padrão de Clientes) -->
    <div class="card p-4 ">
      <div class="flex flex-wrap items-center gap-4">
        <!-- Campo de busca com lupa e botão limpar (igual Clientes) -->
        <div class="relative flex-1 min-w-[300px]">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg class="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input v-model="q" @keyup.enter="filter" @input="onSearchInput"
            class="w-full pl-10 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-600 dark:text-zinc-100"
            :class="q ? 'pr-10' : 'pr-4'" placeholder="Buscar por nome, matrícula, email, CPF" />

          <!-- Badges de filtros ativos dentro do input -->
          <div class="absolute inset-y-0 right-8 flex items-center gap-1 overflow-x-auto max-w-[55%] pr-1">
            <span v-if="estadoFilter"
              class="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
              UF: {{ estadoFilter }}
              <button @click="clearEstado" type="button" class="ml-1 hover:text-blue-900">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
            <span v-if="regiaoFilter"
              class="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200">
              Região: {{ regiaoFilter }}
              <button @click="clearRegiao" type="button" class="ml-1 hover:text-green-900">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
            <span v-if="cidadeFilter"
              class="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200">
              Cidade: {{ cidadeFilter }}
              <button @click="clearCidade" type="button" class="ml-1 hover:text-purple-900">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
            <span v-if="sexoFilter"
              class="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
              Sexo: {{ sexoFilter }}
              <button @click="clearSexo" type="button" class="ml-1 hover:text-amber-900">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
            <span v-if="statusFilter !== 'nenhum'"
              class="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200">
              Status: {{ statusFilter }}
              <button @click="clearStatus" type="button" class="ml-1 hover:text-zinc-900 dark:hover:text-zinc-100">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
            <span v-if="funcaoFilter"
              class="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
              Função: {{ funcaoFilter }}
              <button @click="clearFuncao" type="button" class="ml-1 hover:text-emerald-900">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>

            <span v-if="opStatusFilter"
              class="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200">
              Status Op.: {{ OP_STATUS_LABEL[opStatusFilter] || opStatusFilter }}
              <button @click="clearOpStatus" type="button" class="ml-1 hover:text-indigo-900">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>

            <!-- Badges: vencimentos de documentos -->
            <span v-if="vencFotoPerfil"
              class="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200">
              Foto perfil venc.
              <button @click="vencFotoPerfil = false" type="button" class="ml-1 hover:text-red-900">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
            <span v-if="vencAtestado"
              class="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200">
              Atestado venc.
              <button @click="vencAtestado = false" type="button" class="ml-1 hover:text-red-900">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
            <span v-if="vencAntecedentes"
              class="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200">
              Antecedentes venc.
              <button @click="vencAntecedentes = false" type="button" class="ml-1 hover:text-red-900">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
            <span v-if="vencUniforme"
              class="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200">
              Uniforme venc.
              <button @click="vencUniforme = false" type="button" class="ml-1 hover:text-red-900">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>

          </div>

          <button v-if="q" @click="clearSearch"
            class="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            type="button">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Botão de filtro por Funções (dropdown) -->
        <div class="relative">
          <button @click="showFuncFilter = !showFuncFilter"
            class="flex items-center gap-2 px-3 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
            :class="{ 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/20 dark:border-blue-600 dark:text-blue-300': showFuncFilter || funcaoFilter }">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h18M3 10h18M3 16h18" />
            </svg>
            <span class="font-medium">por funções</span>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <!-- Dropdown de filtro por Funções -->
          <div v-if="showFuncFilter"
            class="absolute z-10 mt-2 w-[15rem] max-w-[90vw] bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 p-4">
            <div class="grid grid-cols-1 sm:grid-cols-1 gap-2">
              <div>
                <h3 class="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-3">Funções</h3>
                <div class="flex flex-wrap gap-1 mb-1">
                  <button @click="funcaoFilter = ''" class="px-2 py-1 text-[11px] rounded border transition-colors"
                    :class="funcaoFilter === '' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Todas
                    ({{ totalPreFuncao }})</button>
                  <button v-if="funcaoCounts[FILTRO_COM_FUNCAO]" @click="funcaoFilter = FILTRO_COM_FUNCAO" class="px-2 py-1 text-[11px] rounded border transition-colors"
                    :class="funcaoFilter === FILTRO_COM_FUNCAO ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">
                    Preencheu ({{ funcaoCounts[FILTRO_COM_FUNCAO] || 0 }})
                  </button>
                  <button v-if="funcaoCounts[FILTRO_SEM_FUNCAO]" @click="funcaoFilter = FILTRO_SEM_FUNCAO" class="px-2 py-1 text-[11px] rounded border transition-colors"
                    :class="funcaoFilter === FILTRO_SEM_FUNCAO ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">
                    Não preencheu ({{ funcaoCounts[FILTRO_SEM_FUNCAO] || 0 }})
                  </button>
                  <template v-for="(count, f) in funcaoCounts" :key="f">
                    <button v-if="f !== FILTRO_SEM_FUNCAO && f !== FILTRO_COM_FUNCAO" @click="funcaoFilter = f"
                      class="px-2 py-1 text-[11px] rounded border transition-colors"
                      :class="funcaoFilter === f ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">
                      {{ f }} ({{ count }})
                    </button>
                  </template>
                </div>
              </div>
            </div>

          </div>

        </div>

        <!-- Dropdown combinado: Ordenação + Sexo + Documentos -->
        <div class="flex flex-wrap items-center gap-3">
        <div class="relative">
          <button @click="showCombined = !showCombined"
            class="flex items-center gap-2 px-3 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
            :class="{ 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/20 dark:border-blue-600 dark:text-blue-300': showCombined || sortBy !== 'mais_recentes' || sexoFilter || vencFotoPerfil || vencAtestado || vencAntecedentes || vencUniforme }">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span class="font-medium">Filtros</span>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <div v-if="showCombined"
            class="absolute z-10 mt-2 w-[24rem] max-w-[90vw] bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 p-4">
            <div class="grid grid-cols-1 gap-4">
              <div>
                <h3 class="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-2">Ordenar por</h3>
                <div class="flex flex-wrap gap-1">
                  <button @click="sortBy = 'nome'; filter(); showCombined = false"
                    class="px-2 py-1 text-xs rounded border transition-colors"
                    :class="sortBy === 'nome' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">nome</button>
                  <button @click="sortBy = 'mais_recentes'; filter(); showCombined = false"
                    class="px-2 py-1 text-xs rounded border transition-colors"
                    :class="sortBy === 'mais_recentes' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">mais recentes</button>
                  <button @click="sortBy = 'codigo'; filter(); showCombined = false"
                    class="px-2 py-1 text-xs rounded border transition-colors"
                    :class="sortBy === 'codigo' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">código</button>
                </div>
              </div>

              <div>
                <h3 class="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-2">Sexo</h3>
                <div class="flex gap-1">
                  <button @click="sexoFilter = ''" class="px-2 py-1 text-xs rounded border transition-colors"
                    :class="sexoFilter === '' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Todos</button>
                  <button @click="sexoFilter = 'M'" class="px-2 py-1 text-xs rounded border transition-colors"
                    :class="sexoFilter === 'M' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Masculino ({{ totalSexoM }})</button>
                  <button @click="sexoFilter = 'F'" class="px-2 py-1 text-xs rounded border transition-colors"
                    :class="sexoFilter === 'F' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Feminino ({{ totalSexoF }})</button>
                </div>
              </div>

              <div>
                <h3 class="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-2">Documentos (vencimentos)</h3>
                <div class="flex flex-wrap gap-1">
                  <button @click="vencFotoPerfil = !vencFotoPerfil; filter(); showCombined = false" class="px-2 py-1 text-xs rounded border transition-colors"
                    :class="vencFotoPerfil ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Foto perfil</button>
                  <button @click="vencAtestado = !vencAtestado; filter(); showCombined = false" class="px-2 py-1 text-xs rounded border transition-colors"
                    :class="vencAtestado ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Atestado médico</button>
                  <button @click="vencAntecedentes = !vencAntecedentes; filter(); showCombined = false" class="px-2 py-1 text-xs rounded border transition-colors"
                    :class="vencAntecedentes ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Antecedentes</button>
                  <button @click="vencUniforme = !vencUniforme; filter(); showCombined = false" class="px-2 py-1 text-xs rounded border transition-colors"
                    :class="vencUniforme ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Uniforme</button>
                </div>
              </div>
            </div>
          </div>
        </div>

  <!-- Dropdown “Status Operacional” (padrão do Ordenar por) -->
        <div class="relative">
          <button @click="showOpStatus = !showOpStatus"
            class="flex items-center gap-2 px-3 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
            :class="{ 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/20 dark:border-blue-600 dark:text-blue-300': showOpStatus || opStatusFilter }">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span class="font-medium">Status operacional</span>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <div v-if="showOpStatus"
            class="absolute z-10 mt-2 w-[24rem] max-w-[90vw] bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 p-4">
            <div class="grid grid-cols-1 gap-2">
              <div>
                <h3 class="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-2">Status Operacional</h3>
                <div class="flex items-center justify-between mb-2 text-[11px]">
                  <span class="text-zinc-600 dark:text-zinc-300">Usar como abas</span>
                  <label class="inline-flex items-center cursor-pointer select-none">
                    <input type="checkbox" v-model="useOpStatusTabs" class="sr-only">
                    <span class="relative inline-block w-10 h-5 bg-zinc-300 rounded-full transition peer-checked:bg-blue-600">
                      <span class="absolute left-0 top-0 w-5 h-5 bg-white rounded-full shadow transform transition" :class="useOpStatusTabs ? 'translate-x-5' : ''"></span>
                    </span>
                  </label>
                </div>
                <!-- Modo filtros (switch desligado) -->
                <div v-if="!useOpStatusTabs" class="flex flex-wrap gap-1">
                  <button @click="opStatusFilter = ''; showOpStatus=false" class="px-2 py-1 text-[11px] rounded border transition-colors"
                    :class="opStatusFilter === '' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">
                    Todos
                  </button>
                  <button @click="opStatusFilter = 'disponivel'; showOpStatus=false" class="px-2 py-1 text-[11px] rounded border transition-colors"
                    :class="opStatusFilter === 'disponivel' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">
                    {{ OP_STATUS_LABEL.disponivel }}
                  </button>
                  <button @click="opStatusFilter = 'contratacao'; showOpStatus=false" class="px-2 py-1 text-[11px] rounded border transition-colors"
                    :class="opStatusFilter === 'contratacao' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">
                    {{ OP_STATUS_LABEL.contratacao }}
                  </button>
                  <button @click="opStatusFilter = 'pre_doc'; showOpStatus=false" class="px-2 py-1 text-[11px] rounded border transition-colors"
                    :class="opStatusFilter === 'pre_doc' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">
                    {{ OP_STATUS_LABEL.pre_doc }}
                  </button>
                  <button @click="opStatusFilter = 'agendado'; showOpStatus=false" class="px-2 py-1 text-[11px] rounded border transition-colors"
                    :class="opStatusFilter === 'agendado' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">
                    {{ OP_STATUS_LABEL.agendado }}
                  </button>
                  <button @click="opStatusFilter = 'trabalhando'; showOpStatus=false" class="px-2 py-1 text-[11px] rounded border transition-colors"
                    :class="opStatusFilter === 'trabalhando' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">
                    {{ OP_STATUS_LABEL.trabalhando }}
                  </button>
                  <button @click="opStatusFilter = 'concluido'; showOpStatus=false" class="px-2 py-1 text-[11px] rounded border transition-colors"
                    :class="opStatusFilter === 'concluido' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">
                    {{ OP_STATUS_LABEL.concluido }}
                  </button>
                  <button @click="opStatusFilter = 'faltou_cancelou'; showOpStatus=false" class="px-2 py-1 text-[11px] rounded border transition-colors"
                    :class="opStatusFilter === 'faltou_cancelou' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">
                    {{ OP_STATUS_LABEL.faltou_cancelou }}
                  </button>
                </div>
                <!-- Modo abas (switch ligado): selecionar opTab direto -->
                <div v-else class="flex flex-wrap gap-1">
                  <button @click="opTab = ''; showOpStatus=false" class="px-2 py-1 text-[11px] rounded border transition-colors"
                    :class="opTab === '' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">
                    Todos ({{ preOpRows.length }})
                  </button>
                  <button @click="opTab = 'disponivel'; showOpStatus=false" class="px-2 py-1 text-[11px] rounded border transition-colors"
                    :class="opTab === 'disponivel' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">
                    {{ OP_STATUS_LABEL.disponivel }} ({{ opCounts.disponivel || 0 }})
                  </button>
                  <button @click="opTab = 'contratacao'; showOpStatus=false" class="px-2 py-1 text-[11px] rounded border transition-colors"
                    :class="opTab === 'contratacao' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">
                    {{ OP_STATUS_LABEL.contratacao }} ({{ opCounts.contratacao || 0 }})
                  </button>
                  <button @click="opTab = 'pre_doc'; showOpStatus=false" class="px-2 py-1 text-[11px] rounded border transition-colors"
                    :class="opTab === 'pre_doc' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">
                    {{ OP_STATUS_LABEL.pre_doc }} ({{ opCounts.pre_doc || 0 }})
                  </button>
                  <button @click="opTab = 'agendado'; showOpStatus=false" class="px-2 py-1 text-[11px] rounded border transition-colors"
                    :class="opTab === 'agendado' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">
                    {{ OP_STATUS_LABEL.agendado }} ({{ opCounts.agendado || 0 }})
                  </button>
                  <button @click="opTab = 'trabalhando'; showOpStatus=false" class="px-2 py-1 text-[11px] rounded border transition-colors"
                    :class="opTab === 'trabalhando' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">
                    {{ OP_STATUS_LABEL.trabalhando }} ({{ opCounts.trabalhando || 0 }})
                  </button>
                  <button @click="opTab = 'concluido'; showOpStatus=false" class="px-2 py-1 text-[11px] rounded border transition-colors"
                    :class="opTab === 'concluido' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">
                    {{ OP_STATUS_LABEL.concluido }} ({{ opCounts.concluido || 0 }})
                  </button>
                  <button @click="opTab = 'faltou_cancelou'; showOpStatus=false" class="px-2 py-1 text-[11px] rounded border transition-colors"
                    :class="opTab === 'faltou_cancelou' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">
                    {{ OP_STATUS_LABEL.faltou_cancelou }} ({{ opCounts.faltou_cancelou || 0 }})
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>


  
  </div>
        <!-- Dropdown “Localização” (UF/Cidade/Região) -->
        <div class="relative">
          <button @click="showLocation = !showLocation"
            class="flex items-center gap-2 px-3 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
            :class="{ 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/20 dark:border-blue-600 dark:text-blue-300': showLocation }">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 5a3 3 0 110 6 3 3 0 010-6z" />
            </svg>
            <span class="font-medium">Localização</span>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <div v-if="showLocation"
            class="absolute z-10 mt-2 w-[15rem] max-w-[90vw] bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 p-4">
            <div class="grid grid-cols-1 sm:grid-cols-1 gap-2">
              <div>
                <label class="text-[10px] block mb-1 text-zinc-500">Estado (UF)</label>
                <div class="flex gap-1 mb-1">
                  <button @click="estadoFilter = 'SP'" class="px-2 py-1 text-[11px] rounded border transition-colors"
                    :class="estadoFilter === 'SP' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">SP</button>
                  <button @click="estadoFilter = 'RJ'" class="px-2 py-1 text-[11px] rounded border transition-colors"
                    :class="estadoFilter === 'RJ' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">RJ</button>
                  <button @click="estadoFilter = 'MG'" class="px-2 py-1 text-[11px] rounded border transition-colors"
                    :class="estadoFilter === 'MG' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">MG</button>
                  <select v-model="estadoFilter"
                    class="form-input px-2 py-1 text-[11px] rounded border border-zinc-300 dark:border-zinc-600 w-full">
                    <option value="">Todos</option>
                    <option
                      v-for="uf in ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']"
                      :key="uf" :value="uf">{{ uf }}</option>
                  </select>
                </div>

              </div>
              <div>
                <label class="text-[10px] block mb-1 text-zinc-500 ">Cidade</label>
                <input v-model="cidadeFilter"
                  class="form-input px-2 py-1 text-[11px] rounded border border-zinc-300 dark:border-zinc-600 w-full"
                  placeholder="Digite a cidade" />
              </div>
              <div>
                <label class="text-[10px] block mb-1 text-zinc-500">Região</label>
                <div class="flex flex-wrap gap-1">
                  <template v-if="String(estadoFilter).toUpperCase() === 'SP'">
                    <button @click="regiaoFilter = ''" class="px-2 py-1 text-[11px] rounded border transition-colors"
                      :class="regiaoFilter === '' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Todas
                      ({{ totalPreRegiao }})</button>
                    <button v-for="r in ['Zona Norte', 'Zona Sul', 'Zona Leste', 'Zona Oeste', 'Centro']" :key="r"
                      @click="regiaoFilter = r" class="px-2 py-1 text-[11px] rounded border transition-colors"
                      :class="regiaoFilter === r ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">{{
                      r }} ({{ (regiaoCounts && regiaoCounts[r]) || 0 }})</button>
                  </template>
                  <template v-else>
                    <button @click="regiaoFilter = ''" class="px-2 py-1 text-[11px] rounded border transition-colors"
                      :class="regiaoFilter === '' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Todas
                      ({{ totalPreRegiao }})</button>
                    <button @click="regiaoFilter = 'N'" class="px-2 py-1 text-[11px] rounded border transition-colors"
                      :class="regiaoFilter === 'N' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Norte
                      ({{ (regiaoCounts && regiaoCounts.N) || 0 }})</button>
                    <button @click="regiaoFilter = 'NE'" class="px-2 py-1 text-[11px] rounded border transition-colors"
                      :class="regiaoFilter === 'NE' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Nordeste
                      ({{ (regiaoCounts && regiaoCounts.NE) || 0 }})</button>
                    <button @click="regiaoFilter = 'CO'" class="px-2 py-1 text-[11px] rounded border transition-colors"
                      :class="regiaoFilter === 'CO' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Centro
                      Oeste ({{ (regiaoCounts && regiaoCounts.CO) || 0 }})</button>
                    <button @click="regiaoFilter = 'SE'" class="px-2 py-1 text-[11px] rounded border transition-colors"
                      :class="regiaoFilter === 'SE' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Sudeste
                      ({{ (regiaoCounts && regiaoCounts.SE) || 0 }})</button>
                    <button @click="regiaoFilter = 'S'" class="px-2 py-1 text-[11px] rounded border transition-colors"
                      :class="regiaoFilter === 'S' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Sul
                      ({{ (regiaoCounts && regiaoCounts.S) || 0 }})</button>
                  </template>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>



      <!-- Filtros avançados (sexo/estado/cidade/região) -->
      <div v-if="false" class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
        <div>
          <label class="text-xs block mb-1">Sexo</label>
          <select v-model="sexoFilter" class="form-input">
            <option value="">Todos</option>
            <option value="M">Masculino</option>
            <option value="F">Feminino</option>
          </select>
        </div>
        <div>
          <label class="text-xs block mb-1">Estado (UF)</label>
          <select v-model="estadoFilter" class="form-input">
            <option value="">Todos</option>
            <option
              v-for="uf in ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']"
              :key="uf" :value="uf">{{ uf }}</option>
          </select>
        </div>
        <div>
          <label class="text-xs block mb-1">Cidade</label>
          <input v-model="cidadeFilter" class="form-input" placeholder="Digite a cidade" />
        </div>
        <div>
          <label class="text-xs block mb-1">Região</label>
          <select v-model="regiaoFilter" class="form-input">
            <option value="">Todas</option>
            <option value="N">Norte (N)</option>
            <option value="NE">Nordeste (NE)</option>
            <option value="CO">Centro-Oeste (CO)</option>
            <option value="SE">Sudeste (SE)</option>
            <option value="S">Sul (S)</option>
          </select>
        </div>
      </div>
    </div>
    <!-- Tabs entre os filtros e os cards -->
    <div class="mb-3 mt-3">
      <nav class="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-700">
        <template v-if="!useOpStatusTabs">
          <div class="flex gap-2">
            <button @click="currentTab = 'todos'"
              :class="currentTab === 'todos' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'"
              class="px-3 py-2 text-sm">Todos <span>({{ totalTodos }})</span></button>
            <button @click="currentTab = 'ativos'"
              :class="currentTab === 'ativos' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'"
              class="px-3 py-2 text-sm">Ativos <span>({{ totalAtivos }})</span></button>
            <button @click="currentTab = 'pendentes'"
              :class="currentTab === 'pendentes' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'"
              class="px-3 py-2 text-sm">Pendentes <span>({{ totalPendentesTab }})</span></button>
            <button @click="currentTab = 'bloqueados'"
              :class="currentTab === 'bloqueados' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'"
              class="px-3 py-2 text-sm">Bloqueado <span>({{ totalBloqueados }})</span></button>
            <button @click="currentTab = 'inativos'"
              :class="currentTab === 'inativos' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'"
              class="px-3 py-2 text-sm">Inativo <span>({{ totalInativos }})</span></button>
          </div>
        </template>
        <template v-else>
          <div class="flex gap-2 overflow-x-auto">
            <button @click="opTab = ''"
              :class="opTab === '' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'"
              class="px-3 py-2 text-sm whitespace-nowrap">Todos <span>({{ preOpRows.length }})</span></button>
            <button @click="opTab = 'disponivel'"
              :class="opTab === 'disponivel' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'"
              class="px-3 py-2 text-sm whitespace-nowrap">{{ OP_STATUS_LABEL.disponivel }} <span>({{ opCounts.disponivel || 0 }})</span></button>
            <button @click="opTab = 'contratacao'"
              :class="opTab === 'contratacao' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'"
              class="px-3 py-2 text-sm whitespace-nowrap">{{ OP_STATUS_LABEL.contratacao }} <span>({{ opCounts.contratacao || 0 }})</span></button>
            <button @click="opTab = 'pre_doc'"
              :class="opTab === 'pre_doc' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'"
              class="px-3 py-2 text-sm whitespace-nowrap">{{ OP_STATUS_LABEL.pre_doc }} <span>({{ opCounts.pre_doc || 0 }})</span></button>
            <button @click="opTab = 'agendado'"
              :class="opTab === 'agendado' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'"
              class="px-3 py-2 text-sm whitespace-nowrap">{{ OP_STATUS_LABEL.agendado }} <span>({{ opCounts.agendado || 0 }})</span></button>
            <button @click="opTab = 'trabalhando'"
              :class="opTab === 'trabalhando' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'"
              class="px-3 py-2 text-sm whitespace-nowrap">{{ OP_STATUS_LABEL.trabalhando }} <span>({{ opCounts.trabalhando || 0 }})</span></button>
            <button @click="opTab = 'concluido'"
              :class="opTab === 'concluido' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'"
              class="px-3 py-2 text-sm whitespace-nowrap">{{ OP_STATUS_LABEL.concluido }} <span>({{ opCounts.concluido || 0 }})</span></button>
            <button @click="opTab = 'faltou_cancelou'"
              :class="opTab === 'faltou_cancelou' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'"
              class="px-3 py-2 text-sm whitespace-nowrap">{{ OP_STATUS_LABEL.faltou_cancelou }} <span>({{ opCounts.faltou_cancelou || 0 }})</span></button>
          </div>
        </template>
        <div class="ml-auto flex items-center gap-2 text-sm">
          <span class="text-zinc-500">Exibir</span>
          <select :value="limit" @change="setLimit(($event.target as HTMLSelectElement).value)"
            class="px-2 py-1 border border-zinc-300 rounded-md text-sm dark:bg-zinc-800 dark:border-zinc-600">
            <option :value="18">18</option>
            <option :value="36">36</option>
            <option :value="54">54</option>
            <option :value="72">72</option>
            <option :value="90">90</option>
          </select>
        </div>
      </nav>
    </div>

    <!-- Cards de cooperados (como Clientes) -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <template v-if="loading">
        <div v-for="n in 6" :key="'sk' + n" class="card space-y-2 p-3">
          <div class="h-4 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800"></div>
          <div class="h-3 w-1/3 rounded bg-zinc-200 dark:bg-zinc-800"></div>
          <div class="h-3 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800"></div>
          <div class="h-3 w-1/4 rounded bg-zinc-200 dark:bg-zinc-800"></div>
        </div>
      </template>

      <template v-else>
        <article
          v-for="it in visibleRows"
          :key="it.id || it.matricula || it.cpf || it.nome || Math.random()"
          class="card p-3 transition-colors hover:border-blue-300 hover:bg-blue-50/40 dark:hover:bg-zinc-800/40 cursor-pointer"
          :class="isJustVisited(it) ? 'cooperado-highlight' : ''"
          @click="openDetail(it)"
        >
          <div class="grid grid-cols-[80px,1fr] gap-2 items-start">
            <div class="row-span-3 self-center flex items-center justify-center">
              <div
                class="h-16 w-16 rounded-md overflow-hidden bg-zinc-200 text-zinc-600 flex items-center justify-center">
                <img v-if="getAvatarUrl(it)" :src="getAvatarUrl(it)" alt="avatar" class="h-full w-full object-cover" />
                <span v-else class="text-[12px] font-semibold">{{ getInitials(it) }}</span>
              </div>
            </div>
            <header class="flex items-center min-w-0 gap-2">
              <strong class="truncate block max-w-full">{{ it.nome || it.name || '—' }}</strong>
              <span v-if="getMatricula(it)" class="shrink-0 rounded px-1.5 py-0.5 text-[10px] bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                #{{ getMatricula(it) }}
              </span>
            </header>
            <!-- Badge e ícones de vencimento de documentos -->
            <div class="flex items-center gap-1 mt-1 flex-wrap">
              <span v-if="hasAnyDocVenc(it)" title="Possui algum documento vencido"
                    class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded bg-red-100 text-red-700">
                Docs vencidos
              </span>
              <template v-if="getDocVencFlags(it).foto">
                <span title="Foto de perfil vencida" class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-700">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="14" rx="2"/>
                    <circle cx="9" cy="10" r="3"/>
                    <path d="M21 21l-4-4-4 4"/>
                  </svg>
                </span>
              </template>
              <template v-if="getDocVencFlags(it).atestado">
                <span title="Atestado médico vencido" class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-700">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 2h9a2 2 0 0 1 2 2v16l-4-3-4 3V4a2 2 0 0 1 2-2z"/>
                    <path d="M8 7h6"/>
                    <path d="M8 11h6"/>
                  </svg>
                </span>
              </template>
              <template v-if="getDocVencFlags(it).antecedentes">
                <span title="Antecedentes criminais vencidos" class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-700">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="2"/>
                    <path d="M7 5V3h10v2"/>
                    <path d="M7 13h10"/>
                  </svg>
                </span>
              </template>
              <template v-if="getDocVencFlags(it).uniforme">
                <span title="Uniforme vencido" class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-700">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M16 3l5 3-3 6v9H6V12L3 6l5-3 4 3 4-3z"/>
                  </svg>
                </span>
              </template>
            </div>
            <dl class="col-start-2 min-w-0 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <!-- Cidade e Região como badges clicáveis -->
                <div class="flex flex-wrap items-center gap-1 sm:col-span-2">
                  <button v-if="it.cidade" @click.stop="toggleCidadeFilter(String(it.cidade))"
                          :title="'Filtrar por cidade: ' + it.cidade"
                          class="px-1.5 py-0.5 rounded text-[10px] border transition-colors"
                          :class="String(cidadeFilter).trim() === String(it.cidade).trim()
                              ? 'border-blue-600 text-blue-700 bg-blue-50 dark:bg-blue-900/20'
                              : 'border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800'">
                    {{ it.cidade }}
                  </button>
                  <button v-if="getRegiaoDisplay(it)" @click.stop="toggleRegiaoFilter(getRegiaoDisplay(it))"
                          :title="'Filtrar por região: ' + getRegiaoDisplay(it)"
                          class="px-1.5 py-0.5 rounded text-[10px] border transition-colors"
                          :class="String(regiaoFilter).trim() === getRegiaoDisplay(it)
                              ? 'border-blue-600 text-blue-700 bg-blue-50 dark:bg-blue-900/20'
                              : 'border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800'">
                    {{ getRegiaoDisplay(it) }}
                  </button>
                  <!-- Ícones de contato protegidos ao lado das badges -->
                  <button v-if="it.telefone1" @click.stop="openWhats(it.telefone1)"
                          class="px-1.5 py-0.5 rounded text-[10px] border transition-colors border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800 ml-1"
                          :title="'Abrir WhatsApp'">
                    <ChatBubbleLeftEllipsisIcon class="w-4 h-4" />
                  </button>
                  <button v-if="it.email" @click.stop="copyEmail(it.email)"
                          class="px-1.5 py-0.5 rounded text-[10px] border transition-colors border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          :title="'Copiar e-mail'">
                    <!-- Ícone e-mail (outline padronizado) -->
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M3 8l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <span v-if="hasAnyDocVenc(it)" class="inline-flex items-center justify-center ml-1 text-red-600" title="Documento vencido">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10" />
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v5" />
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 16h.01" />
                    </svg>
                  </span>
                </div>
                <!-- <dd >{{ it.cooperativa }}</dd> -->
                <!-- Funções agregadas -->
                <dd v-if="getFuncoes(it).length" class="sm:col-span-2">
                  <div class="flex flex-wrap gap-1">
                    <template v-for="(f, idx) in getFuncoes(it)" :key="String(f) + idx">
                      <span class="px-1.5 py-0.5 rounded-full text-[10px] bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">{{ f }}</span>
                    </template>
                  </div>
                </dd>
              </div>
            </dl>
          </div>
        </article>
      </template>
    </div>
  </section>
  
  <!-- Painel lateral de detalhes do cooperado -->
  <SidePanel v-if="viewMode !== 'page'" :open="showDetail" title="Detalhes do cooperado" @close="closeDetail">
    <div v-if="detailLoading" class="space-y-3">
      <div class="h-4 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse"></div>
      <div class="h-3 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse"></div>
      <div class="h-3 w-1/3 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse"></div>
    </div>
    <div v-else-if="detail" class="space-y-4">
      <!-- Cabeçalho compacto -->
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="h-16 w-16 rounded-full overflow-hidden bg-zinc-200 text-zinc-600 flex items-center justify-center ring-2 ring-zinc-300">
            <img v-if="getAvatarUrl(detail)" :src="getAvatarUrl(detail)" alt="avatar" class="h-full w-full object-cover" />
            <span v-else class="text-[12px] font-semibold">{{ getInitials(detail) }}</span>
          </div>
          <div class="min-w-0">
            <div class="text-lg font-semibold truncate">{{ detail.nome || detail.name || '—' }}</div>
            <div class="flex flex-wrap items-center gap-2 text-xs text-zinc-600 mt-1">
              <span v-if="detail.cidade" class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">{{ detail.cidade }}<span v-if="detail.uf || detail.estado">/{{ detail.uf || detail.estado }}</span></span>
              <span v-if="detail.status" class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">{{ detail.status }}</span>
              <span v-if="detail.sexo" class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">{{ detail.sexo }}</span>
              <span v-if="detail.cooperativa" class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">{{ detail.cooperativa }}</span>
            </div>
            <div class="text-xs text-zinc-500 mt-1 truncate">Matrícula #{{ detail.matricula || detail.matricola || detail.registration || '-' }}</div>
          </div>
        </div>
        <div class="shrink-0">
          <button @click="startEdit" class="h-9 w-9 inline-flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700" title="Editar">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Abas -->
      <nav class="border-b border-zinc-200 dark:border-zinc-700 text-sm">
        <ul class="flex gap-4">
          <li>
            <button @click="activeDetailTab = 'perfil'" :class="activeDetailTab === 'perfil' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'" class="px-1 py-2">Perfil</button>
          </li>
          <li>
            <button @click="activeDetailTab = 'documentos'" :class="activeDetailTab === 'documentos' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'" class="px-1 py-2">Documentos</button>
          </li>
          <li>
            <button @click="activeDetailTab = 'pagamentos'" :class="activeDetailTab === 'pagamentos' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'" class="px-1 py-2">Pagamentos</button>
          </li>
          <li>
            <button @click="activeDetailTab = 'presencas'" :class="activeDetailTab === 'presencas' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'" class="px-1 py-2">Presenças</button>
          </li>
        </ul>
      </nav>

      <!-- Conteúdos das abas -->
      <div v-if="activeDetailTab === 'perfil'">
        <div v-if="!editing" class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <!-- Pessoais -->
          <div>
            <div class="text-[11px] uppercase text-zinc-500">CPF</div>
            <div class="font-medium">{{ detail.cpf || '-' }}</div>
          </div>
          <div>
            <div class="text-[11px] uppercase text-zinc-500">RG</div>
            <div class="font-medium">{{ detail.rg || '-' }}</div>
          </div>
          <div>
            <div class="text-[11px] uppercase text-zinc-500">Nascimento</div>
            <div class="font-medium flex items-center gap-2">
              <span>{{ formatDate(detail.dataNasc) }}</span>
              <span v-if="calcIdade(detail.dataNasc) !== null" class="text-xs text-zinc-500">({{ calcIdade(detail.dataNasc) }} anos)</span>
            </div>
          </div>
          <div>
            <div class="text-[11px] uppercase text-zinc-500">Sexo</div>
            <div class="font-medium">{{ detail.sexo || detail.gender || '-' }}</div>
          </div>
          <!-- Contato -->
          <div class="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm border-t pt-3">
            <div class="sm:col-span-2">
              <div class="text-[11px] uppercase text-zinc-500">E-mail</div>
              <div class="font-medium break-all">{{ detail.email || '-' }}</div>
            </div>
            <div>
              <div class="text-[11px] uppercase text-zinc-500">Telefone 1</div>
              <div class="font-medium flex items-center gap-2">
                <a :href="toWhatsUrl(detail.telefone1)" target="_blank" rel="noopener" class="text-green-600 hover:underline" v-if="detail.telefone1">{{ detail.telefone1 }}</a>
                <span v-else>-</span>
              </div>
            </div>
            <div>
              <div class="text-[11px] uppercase text-zinc-500">Telefone 2</div>
              <div class="font-medium">{{ detail.telefone2 || '-' }}</div>
            </div>
          </div>

          <!-- Endereço -->
          <div class="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm border-t pt-3">
            <div>
              <div class="text-[11px] uppercase text-zinc-500">Cidade/UF</div>
              <div class="font-medium">{{ detail.cidade || '-' }}<span v-if="detail.uf || detail.estado">/{{ (detail.uf || detail.estado) }}</span></div>
            </div>
            <div>
              <div class="text-[11px] uppercase text-zinc-500">Bairro</div>
              <div class="font-medium">{{ detail.bairro || '-' }}</div>
            </div>
            <div>
              <div class="text-[11px] uppercase text-zinc-500">Endereço</div>
              <div class="font-medium">{{ detail.endereco || '-' }}</div>
            </div>
            <div>
              <div class="text-[11px] uppercase text-zinc-500">Número</div>
              <div class="font-medium">{{ detail.numero || '-' }}</div>
            </div>
            <div>
              <div class="text-[11px] uppercase text-zinc-500">Complemento</div>
              <div class="font-medium">{{ detail.complemento || '-' }}</div>
            </div>
          </div>

          <!-- Pagamento -->
          <div class="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm border-t pt-3">
            <div>
              <div class="text-[11px] uppercase text-zinc-500">Tipo de Pagamento</div>
              <div class="font-medium">{{ detail.tipoPagto || '-' }}</div>
            </div>
            <div>
              <div class="text-[11px] uppercase text-zinc-500">Banco</div>
              <div class="font-medium">{{ detail.banco || '-' }}</div>
            </div>
            <div>
              <div class="text-[11px] uppercase text-zinc-500">Agência</div>
              <div class="font-medium">{{ detail.agencia || '-' }}</div>
            </div>
            <div>
              <div class="text-[11px] uppercase text-zinc-500">Conta</div>
              <div class="font-medium">{{ detail.conta || '-' }}</div>
            </div>
          </div>

          <!-- Funções -->
          <div class="sm:col-span-2 border-t pt-3">
            <div class="text-[11px] uppercase text-zinc-500 mb-1">Funções</div>
            <div class="flex flex-wrap gap-1">
              <template v-for="(f, i) in detailFuncoesDedupe" :key="String(f)+i">
                <span class="px-2 py-0.5 text-xs rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">{{ f }}</span>
              </template>
              <span v-if="!detailFuncoesDedupe.length" class="text-sm text-zinc-500">—</span>
            </div>
          </div>
        </div>
        <!-- Form de edição -->
        <div v-else class="space-y-3">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label class="text-sm">Nome
              <input v-model="(detail as any).nome" class="form-input w-full" />
            </label>
            <label class="text-sm">Sexo
              <select v-model="(detail as any).sexo" class="form-input w-full">
                <option value="">-</option>
                <option value="M">M</option>
                <option value="F">F</option>
              </select>
            </label>
            <label class="text-sm">Cidade
              <input v-model="(detail as any).cidade" class="form-input w-full" />
            </label>
            <label class="text-sm">UF
              <input v-model="(detail as any).uf" class="form-input w-full" />
            </label>
            <label class="text-sm">Cooperativa
              <input v-model="(detail as any).cooperativa" class="form-input w-full" />
            </label>
            <label class="text-sm">Status
              <input v-model="(detail as any).status" class="form-input w-full" />
            </label>
          </div>
          <div class="flex justify-end gap-2">
            <button @click="cancelEdit" class="px-3 py-1.5 rounded border">Cancelar</button>
            <button @click="saveEdit" class="px-3 py-1.5 rounded bg-blue-600 text-white">Salvar</button>
          </div>
        </div>
      </div>

      <div v-else-if="activeDetailTab === 'documentos'">
        <!-- Documentos existentes -->
        <div class="border-t pt-3">
          <div class="flex items-center justify-between mb-2">
            <div class="text-[11px] uppercase text-zinc-500">Documentos</div>
            <div class="flex items-center gap-1">
              <span v-if="detailDocFlags.foto" class="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">Foto perfil vencida</span>
              <span v-if="detailDocFlags.atestado" class="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">Atestado vencido</span>
              <span v-if="detailDocFlags.antecedentes" class="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">Antecedentes vencidos</span>
              <span v-if="detailDocFlags.uniforme" class="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">Uniforme vencido</span>
            </div>
          </div>
          <div class="text-sm">
            <div v-if="!detailDocumentosList.length" class="text-zinc-500">Nenhum documento enviado.</div>
            <ul v-else class="divide-y divide-zinc-200 dark:divide-zinc-700">
              <li v-for="d in detailDocumentosList" :key="String(d.id || d.label + d.url)" class="py-2 flex items-center justify-between gap-3">
                <div>
                  <div class="font-medium">{{ d.label }}</div>
                  <div class="text-xs text-zinc-500">Envio: {{ formatDate(d.dataEnvio) }}<span v-if="d.dataVencimento"> • Venc.: {{ formatDate(d.dataVencimento) }}</span></div>
                </div>
                <div>
                  <a v-if="d.url" :href="d.url" target="_blank" rel="noopener" class="text-blue-600 hover:underline text-xs">abrir</a>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div v-else-if="activeDetailTab === 'pagamentos'">
        <div class="pt-3">
          <div class="text-[11px] uppercase text-zinc-500 mb-2">Histórico de Pagamentos</div>
          <div v-if="!payments.length" class="text-sm text-zinc-500">Sem registros.</div>
          <ul v-else class="divide-y divide-zinc-200 dark:divide-zinc-700 text-sm">
            <li v-for="(p, i) in payments" :key="'p'+i" class="py-2 flex items-center justify-between">
              <div class="min-w-0">
                <div class="font-medium truncate">{{ p.descricao || p.descr || p.referencia || 'Pagamento' }}</div>
                <div class="text-xs text-zinc-500">{{ formatDate(p.data || p.data_pagamento || p.dt) }}</div>
              </div>
              <div class="shrink-0 font-medium">{{ p.valor || p.total || '-' }}</div>
            </li>
          </ul>
        </div>
      </div>

      <div v-else-if="activeDetailTab === 'presencas'">
        <div class="pt-3">
          <div class="text-[11px] uppercase text-zinc-500 mb-2">Histórico de Presenças</div>
          <div v-if="!checkins.length" class="text-sm text-zinc-500">Sem registros.</div>
          <ul v-else class="divide-y divide-zinc-200 dark:divide-zinc-700 text-sm">
            <li v-for="(c, i) in checkins" :key="'c'+i" class="py-2 flex items-center justify-between">
              <div class="min-w-0">
                <div class="font-medium truncate">{{ c.evento || c.event || c.nome || 'Evento' }}</div>
                <div class="text-xs text-zinc-500">Check-in: {{ formatDate(c.checkin || c.inicio) }} • Check-out: {{ formatDate(c.checkout || c.fim) }}</div>
              </div>
              <div class="shrink-0 text-xs text-zinc-500">{{ c.status || '-' }}</div>
            </li>
          </ul>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div>
          <div class="text-[11px] uppercase text-zinc-500">CPF</div>
          <div class="font-medium">{{ detail.cpf || '-' }}</div>
        </div>
        <div>
          <div class="text-[11px] uppercase text-zinc-500">RG</div>
          <div class="font-medium">{{ detail.rg || '-' }}</div>
        </div>
        <div>
          <div class="text-[11px] uppercase text-zinc-500">Nascimento</div>
          <div class="font-medium flex items-center gap-2">
            <span>{{ formatDate(detail.dataNasc) }}</span>
            <span v-if="calcIdade(detail.dataNasc) !== null" class="text-xs text-zinc-500">({{ calcIdade(detail.dataNasc) }} anos)</span>
          </div>
        </div>
        <div>
          <div class="text-[11px] uppercase text-zinc-500">Sexo</div>
          <div class="font-medium">{{ detail.sexo || detail.gender || '-' }}</div>
        </div>
        <div>
          <div class="text-[11px] uppercase text-zinc-500">Mãe</div>
          <div class="font-medium">{{ detail.nomeMae || '-' }}</div>
        </div>
        <div>
          <div class="text-[11px] uppercase text-zinc-500">Pai</div>
          <div class="font-medium">{{ detail.nomePai || '-' }}</div>
        </div>
        <div>
          <div class="text-[11px] uppercase text-zinc-500">Expedição (RG)</div>
          <div class="font-medium">{{ formatDate(detail.dataExp) }}</div>
        </div>
      </div>

      <!-- Seção: Contato -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm border-t pt-3">
        <div class="sm:col-span-2">
          <div class="text-[11px] uppercase text-zinc-500">E-mail</div>
          <div class="font-medium break-all">{{ detail.email || '-' }}</div>
        </div>
        <div>
          <div class="text-[11px] uppercase text-zinc-500">Telefone 1</div>
          <div class="font-medium flex items-center gap-2">
            <a :href="toWhatsUrl(detail.telefone1)" target="_blank" rel="noopener" class="text-green-600 hover:underline" v-if="detail.telefone1">{{ detail.telefone1 }}</a>
            <span v-else>-</span>
          </div>
        </div>
        <div>
          <div class="text-[11px] uppercase text-zinc-500">Telefone 2</div>
          <div class="font-medium">{{ detail.telefone2 || '-' }}</div>
        </div>
        <div>
          <div class="text-[11px] uppercase text-zinc-500">Gestor</div>
          <div class="font-medium">{{ detail.gestor || '-' }}</div>
        </div>
      </div>

      <!-- Seção: Endereço -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm border-t pt-3">
        <div>
          <div class="text-[11px] uppercase text-zinc-500">CEP</div>
          <div class="font-medium">{{ detail.cep || '-' }}</div>
        </div>
        <div>
          <div class="text-[11px] uppercase text-zinc-500">Endereço</div>
          <div class="font-medium">{{ detail.endereco || '-' }}</div>
        </div>
        <div>
          <div class="text-[11px] uppercase text-zinc-500">Número</div>
          <div class="font-medium">{{ detail.numero || '-' }}</div>
        </div>
        <div>
          <div class="text-[11px] uppercase text-zinc-500">Complemento</div>
          <div class="font-medium">{{ detail.complemento || '-' }}</div>
        </div>
        <div>
          <div class="text-[11px] uppercase text-zinc-500">Bairro</div>
          <div class="font-medium">{{ detail.bairro || '-' }}</div>
        </div>
        <div>
          <div class="text-[11px] uppercase text-zinc-500">Cidade/UF</div>
          <div class="font-medium">{{ detail.cidade || '-' }}<span v-if="detail.uf || detail.estado">/{{ (detail.uf || detail.estado) }}</span></div>
        </div>
        <div>
          <div class="text-[11px] uppercase text-zinc-500">Região</div>
          <div class="font-medium">{{ detail.regiao || detail.regiao_sp || detail.zona || '-' }}</div>
        </div>
      </div>

      <!-- Seção: Pagamento -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm border-t pt-3">
        <div>
          <div class="text-[11px] uppercase text-zinc-500">Tipo de Pagamento</div>
          <div class="font-medium">{{ detail.tipoPagto || '-' }}</div>
        </div>
        <div>
          <div class="text-[11px] uppercase text-zinc-500">Banco</div>
          <div class="font-medium">{{ detail.banco || '-' }}</div>
        </div>
        <div>
          <div class="text-[11px] uppercase text-zinc-500">Agência</div>
          <div class="font-medium">{{ detail.agencia || '-' }}</div>
        </div>
        <div>
          <div class="text-[11px] uppercase text-zinc-500">Conta</div>
          <div class="font-medium">{{ detail.conta || '-' }}</div>
        </div>
        <div>
          <div class="text-[11px] uppercase text-zinc-500">Dígito</div>
          <div class="font-medium">{{ detail.digConta || '-' }}</div>
        </div>
      </div>

      <!-- Seção: Documentos -->
      <div class="border-t pt-3">
        <div class="flex items-center justify-between mb-2">
          <div class="text-[11px] uppercase text-zinc-500">Documentos</div>
          <div class="flex items-center gap-1">
            <span v-if="detailDocFlags.foto" class="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">Foto perfil vencida</span>
            <span v-if="detailDocFlags.atestado" class="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">Atestado vencido</span>
            <span v-if="detailDocFlags.antecedentes" class="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">Antecedentes vencidos</span>
            <span v-if="detailDocFlags.uniforme" class="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">Uniforme vencido</span>
          </div>
        </div>
        <div class="text-sm">
          <div v-if="!detailDocumentosList.length" class="text-zinc-500">Nenhum documento enviado.</div>
          <ul v-else class="divide-y divide-zinc-200 dark:divide-zinc-700">
            <li v-for="d in detailDocumentosList" :key="String(d.id || d.label + d.url)" class="py-2 flex items-center justify-between gap-3">
              <div>
                <div class="font-medium">{{ d.label }}</div>
                <div class="text-xs text-zinc-500">Envio: {{ formatDate(d.dataEnvio) }}<span v-if="d.dataVencimento"> • Venc.: {{ formatDate(d.dataVencimento) }}</span></div>
              </div>
              <div>
                <a v-if="d.url" :href="d.url" target="_blank" rel="noopener" class="text-blue-600 hover:underline text-xs">abrir</a>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <!-- Seção: Funções -->
      <div class="border-t pt-3">
        <div class="text-[11px] uppercase text-zinc-500 mb-1">Funções</div>
        <div class="flex flex-wrap gap-1">
          <template v-for="(f, i) in detailFuncoesDedupe" :key="String(f)+i">
            <span class="px-2 py-0.5 text-xs rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">{{ f }}</span>
          </template>
          <span v-if="!detailFuncoesDedupe.length" class="text-sm text-zinc-500">—</span>
        </div>
      </div>

      <!-- Seção: Observações -->
      <div class="border-t pt-3">
        <div class="text-[11px] uppercase text-zinc-500 mb-1">Observações</div>
        <div class="text-sm whitespace-pre-wrap">{{ detail.observacoes || detail.obs || '-' }}</div>
      </div>
    </div>
    <div v-else class="text-sm text-zinc-500">Selecione um cooperado para ver os detalhes.</div>
  </SidePanel>
  <!-- Paginação fixa no footer -->
  <div
    class="fixed w-[calc(100%-15rem)] left-60 bottom-0 z-30 bg-white dark:bg-zinc-900/90 border-t border-zinc-200 dark:border-zinc-700 p-2">
    <div
      class="container max-w-[1400px] mx-auto flex flex-col sm:flex-row sm:items-center gap-2 justify-between text-sm">
      <span
        class="mt-1 text-blue-600 text-xs font-medium me-2 px-2.5 py-0.5 rounded-sm dark:bg-blue-900 dark:text-blue-300">
        Exibindo {{ Math.min((page - 1) * limit + 1, isOfficialPaged ? total : filteredRows.length) }} • {{ Math.min(page * limit, (isOfficialPaged ? total : filteredRows.length)) }}
        de {{ isOfficialPaged ? total : filteredRows.length }} registros</span>
      <div class="inline-flex items-center gap-1">
        <button @click="page = 1; pushStateToQuery(); load()" :disabled="page === 1" class="px-2 py-1 border rounded disabled:opacity-50">«</button>
        <button @click="page = Math.max(1, page - 1); pushStateToQuery(); load()" :disabled="page === 1"
          class="px-2 py-1 border rounded disabled:opacity-50">‹</button>
        <template v-for="p in pageItems" :key="'p'+p">
          <span v-if="typeof p === 'string'" class="px-2 py-1 text-zinc-400">…</span>
          <button v-else @click="page = p as number; pushStateToQuery(); load()" :class="(typeof p === 'number' && page === p) ? 'bg-blue-600 text-white border-blue-600' : ''"
            class="px-2 py-1 border rounded">{{ p }}</button>
        </template>
        <button @click="page = Math.min(totalPages, page + 1); pushStateToQuery(); load()" :disabled="page === totalPages"
          class="px-2 py-1 border rounded disabled:opacity-50">›</button>
        <button @click="page = totalPages; pushStateToQuery(); load()" :disabled="page === totalPages"
          class="px-2 py-1 border rounded disabled:opacity-50">»</button>
      </div>
    </div>
  </div>

</template>

<style scoped>
/* Destaque com fundo e borda que desaparecem suavemente */
.cooperado-highlight {
  /* Aproximação de Tailwind bg-blue-100/50 (bg azul claro com 50% opacidade) */
  background-color: rgba(219, 234, 254, 0.5) !important; /* blue-100 @ 50% */
  border-color: rgb(59, 130, 246) !important; /* border-blue-500 */
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.22);
  transition: background-color 2.6s ease-out, border-color 2.6s ease-out, box-shadow 2.6s ease-out;
}
.cooperado-highlight {
  animation: cooperadoFade 2.6s ease-out forwards;
}
@keyframes cooperadoFade {
  0% {
    background-color: rgba(219, 234, 254, 0.5);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.22);
  }
  30% {
    background-color: rgba(219, 234, 254, 0.32);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.18);
  }
  60% {
    background-color: rgba(219, 234, 254, 0.16);
    box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.10);
  }
  100% {
    background-color: transparent;
    border-color: transparent;
    box-shadow: none;
  }
}
</style>
