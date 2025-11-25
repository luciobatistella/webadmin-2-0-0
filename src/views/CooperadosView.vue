<script setup lang="ts">
import { ref, computed, onMounted, onActivated, watch, nextTick } from 'vue'
import { ChatBubbleLeftEllipsisIcon } from '@heroicons/vue/24/outline'
import Breadcrumbs from '@/components/Breadcrumbs.vue'
import ClientActions from '@/components/ClientActions.vue'
import { listCooperados, getCooperado, paginateCooperadosDocuments, countCooperadosStatistics, listCooperadoPayments, listCooperadoCheckins, updateCooperado, listFuncoesCooperados, getDocumentStatistics } from '@/services/cooperados'
import SidePanel from '@/components/SidePanel.vue'
import { useRoute, useRouter } from 'vue-router'
import { COOPERADO_DETAIL_VIEW_MODE } from '@/config/featureFlags'
import { OP_STATUS_LABEL, normalizeOpStatusKey } from '@/constants/operationalStatus'

type Row = Record<string, any>

defineOptions({ name: 'CooperadosView' })

const rows = ref<Row[]>([])
const loading = ref(false)
const loadingMore = ref(false)
// Novo modo de carregamento bloqueante com progresso (%)
const aggregating = ref(false)
const progressPercent = ref(0)
const progressLabel = ref('')
const progressTotalHint = ref<number | null>(null)
let currentAbort: AbortController | null = null
const page = ref(1)
  const limit = ref(18)
const total = ref(0)
// Rastreia a última página carregada do backend quando usamos paginação oficial
const lastLoadedPage = ref(1)
// Modo híbrido: usa backend oficial (limit fixo) e fatia local para 18/36/etc
const officialHybridMode = ref(false)
// Sinaliza que o próximo load deve ignorar a cache
const ignoreCacheOnce = ref(false)

// Debounce de recarregamento para evitar tempestade de requisições
let _loadTimer: any = null
function scheduleLoad(delay = 300) {
  try { if (_loadTimer) clearTimeout(_loadTimer) } catch {}
  _loadTimer = setTimeout(() => {
    _loadTimer = null
    load()
  }, Math.max(0, Number(delay) || 0))
}

// Cache leve para evitar recargas com os mesmos filtros (persistido em sessionStorage)
type CacheEntry = {
  k: string
  mode: 'docsOR' | 'local' | 'official' | 'hybrid'
  at: number
  ttl: number
  page?: number
  limit?: number
  rows?: Row[]
  items?: Row[]
  total?: number
  remoteCounts?: { all: number; active: number; inactive: number; blocked: number; pending: number }
}
const LIST_CACHE_KEY = 'cooperados:listCache:v3'
const LIST_CACHE_TTL = 60 * 60 * 1000 // 60 minutos (cache por sessão mais longo)
const LIST_CACHE_CAP = 6 // máximo de entradas a manter
const listCache = ref<Record<string, CacheEntry>>({})

function loadCacheFromSession() {
  try {
    const raw = sessionStorage.getItem(LIST_CACHE_KEY)
    if (!raw) return
    const obj = JSON.parse(raw || '{}')
    if (obj && typeof obj === 'object') listCache.value = obj
  } catch { /* noop */ }
}
function saveCacheToSession() {
  try {
    const entries = Object.values(listCache.value)
    // Capacidade: mantém os mais recentes
    entries.sort((a,b) => b.at - a.at)
    const trimmed = entries.slice(0, LIST_CACHE_CAP)
    const map: Record<string, CacheEntry> = {}
    for (const e of trimmed) map[e.k] = e
    sessionStorage.setItem(LIST_CACHE_KEY, JSON.stringify(map))
    listCache.value = map
  } catch { /* noop */ }
}

function clearCooperadosCacheAndReload() {
  try {
    sessionStorage.removeItem(LIST_CACHE_KEY)
    sessionStorage.removeItem('cooperados:viewState')
    sessionStorage.removeItem('cooperados:restore')
    sessionStorage.removeItem('cooperados:last')
  } catch { /* noop */ }
  listCache.value = {}
  saveCacheToSession()
  // Ignora cache no próximo carregamento
  ignoreCacheOnce.value = true
  page.value = 1
  load()
}
function makeFiltersSignature() {
  // Assinatura somente dos filtros (sem paginação) — igual para docsOR/local
  const sig = {
    q: q.value,
    sortBy: sortBy.value,
    sexo: sexoFilter.value,
    estado: estadoFilter.value,
    cidade: cidadeFilter.value,
    regiao: regiaoFilter.value,
    status: statusFilter.value,
    opStatusFilter: opStatusFilter.value,
    useOpStatusTabs: useOpStatusTabs.value,
    opTab: opTab.value,
    funcao: funcaoFilter.value,
    vencFoto: vencFotoPerfil.value,
    vencAtestado: vencAtestado.value,
    vencAntecedentes: vencAntecedentes.value,
    vencUniforme: vencUniforme.value,
    // currentTab intencionalmente fora do cache base em modos locais,
    // para permitir reuso do dataset entre as abas (Todos/Ativos/etc).
  }
  return JSON.stringify(sig)
}
function makeFullSignature(includePageLimit = false) {
  const base = JSON.parse(makeFiltersSignature())
  if (includePageLimit) {
    ;(base as any).page = page.value
    ;(base as any).limit = limit.value
  }
  // Em modos oficiais/híbridos, a aba (Situação) altera o filtro remoto; inclua currentTab
  ;(base as any).currentTab = currentTab.value
  return JSON.stringify(base)
}

const q = ref('')
const sortBy = ref<'nome'|'mais_recentes'|'codigo'>('mais_recentes')
const showFilters = ref(false)
const showFuncFilter = ref(false)
const showSort = ref(false)
const showOpStatus = ref(false)
const opStatusFilter = ref<string>('') // '', 'disponivel', 'contratacao', 'pre_doc', 'agendado', 'trabalhando', 'concluido', 'faltou_cancelou'
// Modo de abas por Status Operacional
const useOpStatusTabs = ref(false)

// Animação de contagem de números
const animatedNumbers = ref<Record<string, number>>({})
const animatedBarWidths = ref<Record<string, number>>({})
const hasAnimatedDashboard = ref(false)

function animateNumber(key: string, target: number, duration: number = 1000, delay: number = 0) {
  setTimeout(() => {
    const start = 0
    const startTime = Date.now()
    const animate = () => {
      const now = Date.now()
      const progress = Math.min((now - startTime) / duration, 1)
      const easeOutQuart = 1 - Math.pow(1 - progress, 4)
      animatedNumbers.value[key] = Math.round(start + (target - start) * easeOutQuart)
      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        animatedNumbers.value[key] = target
      }
    }
    animate()
  }, delay)
}

function animateBarWidth(key: string, target: number, duration: number = 1000, delay: number = 0) {
  setTimeout(() => {
    const start = 0
    const startTime = Date.now()
    const animate = () => {
      const now = Date.now()
      const progress = Math.min((now - startTime) / duration, 1)
      const easeOutQuart = 1 - Math.pow(1 - progress, 4)
      animatedBarWidths.value[key] = start + (target - start) * easeOutQuart
      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        animatedBarWidths.value[key] = target
      }
    }
    animate()
  }, delay)
}
const opTab = ref<string>('') // '' significa Todos no modo abas operacionais
// Filtro de documentos (vencimentos)
const showDocsFilter = ref(false)
const vencFotoPerfil = ref(false)
const vencAtestado = ref(false)
const vencAntecedentes = ref(false)
const vencUniforme = ref(false)

const docFiltersActive = computed(() => vencFotoPerfil.value || vencAtestado.value || vencAntecedentes.value || vencUniforme.value)

// Quando usamos a agregação via backend (OR entre flags de documentos), marcamos este flag
// para não re-aplicar o filtro de documentos no cliente (evitando duplo filtro)
const appliedDocsORBackend = ref(false)

const showLocation = ref(false)
const route = useRoute()
const router = useRouter()
const viewMode = computed(() => (route.query.view || COOPERADO_DETAIL_VIEW_MODE))

// Alguns filtros não existem no backend; quando ativos, precisamos buscar todas as páginas e paginar localmente
const hasClientOnlyFilterActive = computed(() => {
  return !!(
    // Dropdown de status operacional (cliente)
    opStatusFilter.value ||
    // Status de completude (cliente)
    statusFilter.value === 'completo' || statusFilter.value === 'incompleto' ||
    // Localização e função (cliente)
    String(estadoFilter.value || '') ||
    String(cidadeFilter.value || '') ||
    String(regiaoFilter.value || '') ||
    String(funcaoFilter.value || '')
  )
})

// Persistência de estado (filtros/página) via querystring e destaque do último visitado
const initializing = ref(true)
const lastVisitedId = ref<string | null>(null)
// Evita que watchers resetem a página durante sincronização a partir da URL
const syncing = ref(false)

function toBool(v: unknown): boolean {
  return v === '1' || v === 'true' || v === true
}

function syncFromQuery() {
  // URL desativada: não sincroniza estado por querystring
  syncing.value = false
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
const activeDetailTab = ref<'perfil' | 'documentos' | 'financeiro' | 'presencas' | 'alertas' | 'ofertas' | 'agenda'>('perfil')
const payments = ref<Row[]>([])
const checkins = ref<Row[]>([])
// Menu de opções no detalhe
const showDetailOptions = ref(false)

// Filtro por função
const funcaoFilter = ref('')
const FILTRO_SEM_FUNCAO = '__SEM_FUNCAO__'
const funcoesRankingLimit = ref(10)
const funcoesRankingData = ref<Array<{ id: number; name: string; count: number }>>([])
const FILTRO_COM_FUNCAO = '__COM_FUNCAO__'
const funcoesOptions = ref<Array<{ id: number; name: string }>>([])
const funcoesLoading = ref(false)
const selectedFuncaoId = ref<number | null>(null)

// Função para normalizar e agrupar funções similares
function normalizeFuncaoName(name: string): string {
  // Remove variações comuns: números, horas, especialidades, locais, níveis hierárquicos
  return name
    .toUpperCase()
    .replace(/\s+\d+\s*HORAS?$/i, '') // Remove "10 HORAS", "12 HORAS"
    .replace(/\s+\d+\s*HRS?\.?$/i, '') // Remove "10 HRS", "12 HRS", etc
    .replace(/\s+\d+$/i, '') // Remove números no final: "2", "4", "14", etc
    .replace(/\s+\+\d+$/i, '') // Remove "+18", "+21", etc
    .replace(/\s+(ATENDIMENTO|ESTADIO|EVENTO|SALA|COZINHA|BAR|BARMAN|LOJA|RECEP[CÇ][AÃ]O|RESTAURANTE|CORREDOR|SOCIAL)(\s+\d+)?(\s+\d+\s*HRS?\.?)?$/i, '') // Remove locais específicos
    .replace(/\s+ESP\.?$/i, '') // Remove "ESP."
    .replace(/\s+(L[IÍ]DER|LIDER)$/i, '') // Remove "LIDER" ou "LÍDER"
    .replace(/\s+CMD$/i, '') // Remove "CMD"
    .replace(/\s+PERFIL$/i, '') // Remove "PERFIL"
    .replace(/\s+C\s+\d+$/i, '') // Remove "C 4", "C 5", etc
    .replace(/\s+C$/i, '') // Remove "C" solitário
    .replace(/\s+M$/i, '') // Remove "M" solitário
    .replace(/\s+G$/i, '') // Remove "G"
    .replace(/\s+ESPECIAL(ISTA)?$/i, '') // Remove "ESPECIAL" ou "ESPECIALISTA"
    .replace(/\s+I{1,3}$/i, '') // Remove "I", "II", "III"
    .replace(/\s+JR\.?$/i, '') // Remove "JR"
    .replace(/\s+SR\.?$/i, '') // Remove "SR"
    .replace(/\s+P(LEN)?O$/i, '') // Remove "PLENO"
    .replace(/\s+\([AO]\)$/i, '') // Remove "(A)" ou "(O)"
    .replace(/\s+[A-Z]$/i, '') // Remove letra solitária no final
    .trim()
}

function groupSimilarFuncoes(list: Array<{ id: number; name: string }>): Array<{ id: number; name: string; ids: number[] }> {
  const groups = new Map<string, { id: number; name: string; ids: number[] }>()
  
  for (const item of list) {
    const normalized = normalizeFuncaoName(item.name)
    
    if (groups.has(normalized)) {
      // Adiciona o ID ao grupo existente
      const group = groups.get(normalized)!
      group.ids.push(item.id)
    } else {
      // Cria novo grupo
      // Usa o nome original mais curto como representante do grupo
      const existingName = groups.get(normalized)?.name || item.name
      const shorterName = item.name.length < existingName.length ? item.name : existingName
      
      groups.set(normalized, {
        id: item.id,
        name: shorterName,
        ids: [item.id]
      })
    }
  }
  
  // Converte Map para Array e ordena alfabeticamente
  return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name))
}

async function ensureFuncoesLoaded(force = false) {
  try {
    if (!force && funcoesOptions.value.length > 0) return
    funcoesLoading.value = true
    const list = await listFuncoesCooperados()
    // Agrupa funções similares antes de atribuir
    const grouped = groupSimilarFuncoes(Array.isArray(list) ? list : [])
    funcoesOptions.value = grouped as any
  } catch (e) {
    console.warn('[cooperados.funcoes] falha ao carregar', e)
    funcoesOptions.value = funcoesOptions.value || []
  } finally {
    funcoesLoading.value = false
  }
}

async function onToggleFuncFilter() {
  showFuncFilter.value = !showFuncFilter.value
  if (showFuncFilter.value) await ensureFuncoesLoaded(false)
}

// Carregar ranking de funções
async function loadFuncoesRanking() {
  try {
    const data = await listFuncoesCooperados(funcoesRankingLimit.value)
    funcoesRankingData.value = data
    console.log('[Dashboard] Funções carregadas:', data.length, 'exemplo:', data[0])
  } catch (error) {
    console.error('[Dashboard] Erro ao carregar funções:', error)
    funcoesRankingData.value = []
  }
}

// Carregar estatísticas de documentos
async function loadDocumentStatistics() {
  try {
    const data = await getDocumentStatistics()
    documentStatistics.value = data
    console.log('[Dashboard] Documentos carregados:', data)
  } catch (error) {
    console.error('[Dashboard] Erro ao carregar documentos:', error)
    documentStatistics.value = null
  }
}

// Carregar estatísticas para o dashboard
async function loadStatistics() {
  try {
    loadingStatistics.value = true
    
    // Carregar funções ranking e documentos em paralelo
    await Promise.all([
      loadFuncoesRanking(),
      loadDocumentStatistics()
    ])
    
    // Montar parâmetros com filtros ativos
    const params: Record<string, any> = {}
    
    // Filtro de sexo
    if (sexoFilter.value) {
      params.sexo = sexoFilter.value
    }
    
    // Filtro de situação (aba atual)
    if (currentTab.value && currentTab.value !== 'dashboard' && currentTab.value !== 'todos') {
      params.situacao = currentTab.value
    }
    
    // Filtro de status operacional
    if (opTab.value) {
      params.opStatus = opTab.value
    }
    
    // Filtro de estado/cidade/região
    if (estadoFilter.value) {
      params.uf = estadoFilter.value
    }
    if (cidadeFilter.value) {
      params.cidade = cidadeFilter.value
    }
    if (regiaoFilter.value) {
      params.regiao = regiaoFilter.value
    }
    
    // Filtros de documentos
    if (vencFotoPerfil.value) params.vencFoto = '1'
    if (vencAtestado.value) params.vencAtestado = '1'
    if (vencAntecedentes.value) params.vencAntecedentes = '1'
    if (vencUniforme.value) params.vencUniforme = '1'
    
    const data = await countCooperadosStatistics(params)
    statisticsData.value = data
    
    // Atualizar também os contadores das abas (remoteCounts)
    remoteCounts.value = {
      all: data.all || 0,
      active: data.active || 0,
      inactive: data.inactive || 0,
      blocked: data.blocked || 0,
      pending: data.pending || 0,
    }
  } catch (error) {
    console.error('[Dashboard] Erro ao carregar estatísticas:', error)
    statisticsData.value = null
  } finally {
    loadingStatistics.value = false
  }
}

// Ação ao clicar em um card de estatística
function onStatCardClick(filter: 'todos' | 'ativos' | 'inativos' | 'bloqueados' | 'pendentes' | string, type: 'situacao' | 'sexo' | 'opStatus' | 'funcao' = 'situacao') {
  if (type === 'situacao' && ['todos', 'ativos', 'inativos', 'bloqueados', 'pendentes'].includes(filter)) {
    // Limpar outros filtros ao selecionar situação
    sexoFilter.value = ''
    opTab.value = ''
    currentTab.value = filter as any
  } else if (type === 'sexo') {
    // Toggle: se já estava selecionado, desselecionar
    if (sexoFilter.value === filter) {
      sexoFilter.value = ''
    } else {
      sexoFilter.value = filter // 'M' ou 'F'
    }
    // Não muda de aba, mantém o usuário onde está
    opTab.value = ''
  } else if (type === 'opStatus') {
    // Limpar filtro de sexo ao selecionar status operacional
    sexoFilter.value = ''
    // Ativar modo de abas operacionais
    useOpStatusTabs.value = true
    opTab.value = filter // 'disponivel', 'contratacao', etc
  } else if (type === 'funcao') {
    // Toggle: se já estava selecionado, desselecionar
    if (funcaoFilter.value === filter) {
      funcaoFilter.value = ''
    } else {
      funcaoFilter.value = filter
    }
    // Não muda de aba
    opTab.value = ''
  }
  
  nextTick(() => {
    // Recarregar estatísticas do dashboard com os novos filtros
    if (currentTab.value === 'dashboard') {
      loadStatistics()
    }
    // Recarregar lista quando não estiver no dashboard
    if (currentTab.value !== 'dashboard') {
      load()
    }
  })
}

// Funções auxiliares para o mapa do Brasil
function getStateClass(stateId: string): string {
  const normalizedId = stateId.toLowerCase()
  if (normalizedId === 'br-sp') return 'state-sp state-active'
  if (normalizedId === 'br-rj') return 'state-rj state-active'
  if (normalizedId === 'br-mg') return 'state-mg state-active'
  return 'state-default'
}

function getStateTooltip(stateId: string): string {
  const normalizedId = stateId.toLowerCase()
  if (normalizedId === 'br-sp') return 'São Paulo: 1250 cooperados'
  if (normalizedId === 'br-rj') return 'Rio de Janeiro: 840 cooperados'
  if (normalizedId === 'br-mg') return 'Minas Gerais: 620 cooperados'
  return ''
}



// Tabs (Situação)
const currentTab = ref('dashboard') // 'dashboard' | 'todos' | 'ativos' | 'inativos' | 'bloqueados' | 'pendentes'

// Contadores oficiais do backend
const remoteCounts = ref<{ all: number; active: number; inactive: number; blocked: number; pending: number }>({ all: 0, active: 0, inactive: 0, blocked: 0, pending: 0 })

// Dados do Dashboard
const statisticsData = ref<{
  all: number
  active: number
  inactive: number
  blocked: number
  pending: number
  regioes?: Record<string, number>
  sexo?: { M?: number; F?: number }
  opStatus?: {
    disponivel?: number
    contratacao?: number
    pre_doc?: number
    agendado?: number
    trabalhando?: number
    concluido?: number
    faltou_cancelou?: number
  }
} | null>(null)
const loadingStatistics = ref(false)
const showDebugData = ref(false)
const documentStatistics = ref<any>(null)

// Filtros adicionais
const showStatusFilter = ref(false)
const statusFilter = ref('nenhum') // 'nenhum' | 'completo' | 'incompleto'
const sexoFilter = ref('')         // 'M' | 'F' | ''
const estadoFilter = ref('')      // UF (vazio = todas)
const cidadeFilter = ref('')
const regiaoFilter = ref('')

// Dropdown combinado (Ordenação + Sexo + Documentos)
const showCombined = ref(false)

// Logging auxiliar para depurar filtros de documentos
function logDocs(...args: any[]) {
  try {
    // Ajuste aqui caso queira condicionar logs a um flag de ambiente / localStorage
    console.log('[cooperados.docs]', ...args)
  } catch {}
}


// Mapa UF -> Região
const UF_TO_REGIAO: Record<string,string> = { AC: 'N', AP: 'N', AM: 'N', PA: 'N', RO: 'N', RR: 'N', TO: 'N', AL: 'NE', BA: 'NE', CE: 'NE', MA: 'NE', PB: 'NE', PE: 'NE', PI: 'NE', RN: 'NE', SE: 'NE', DF: 'CO', GO: 'CO', MS: 'CO', MT: 'CO', ES: 'SE', MG: 'SE', RJ: 'SE', SP: 'SE', PR: 'S', RS: 'S', SC: 'S' }
const UF_OPTIONS = Object.keys(UF_TO_REGIAO)
// Macro-regiões do Brasil (fallback)
const MACRO_REGIOES: string[] = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul']
// Regiões específicas de SP (alinhadas com a API)
const SP_REGION_LABELS = ['Zona Norte','Zona Oeste','Zona Sul','Zona Leste','Grande ABC','Campinas','Vale','Baixada']
// Regiões por UF (ex.: zonas de São Paulo)
const REGIOES_POR_UF = {
  SP: SP_REGION_LABELS
}

const regionOptions = computed(() => {
  if (String(estadoFilter.value).toUpperCase() === 'SP') {
    return (REGIOES_POR_UF.SP || SP_REGION_LABELS).map(label => ({ label, value: label }))
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
  // status: 0=Todos, 1=Ativo, 2=Inativo, 3=Bloqueado, 4=Pendente
  if (currentTab.value === 'todos') return 0
  if (currentTab.value === 'ativos') return 1
  if (currentTab.value === 'inativos') return 2
  if (currentTab.value === 'bloqueados') return 3
  if (currentTab.value === 'pendentes') return 4
  return undefined
}

function buildApiParams(opts?: { includeDocFilters?: boolean; forStatistics?: boolean }): URLSearchParams {
  const p = new URLSearchParams()
  // Backend é 0-based; UI é 1-based
  p.append('page', String(page.value - 1))
  p.append('limit', String(limit.value))
  // Busca livre mapeada para nome/matricula/cpf conforme padrão do texto
  if (q.value) {
    const raw = String(q.value).trim()
    const onlyDigits = raw.replace(/\D+/g, '')
    // Regra: 11 dígitos (ou formato 000.000.000-00) => CPF
    const looksLikeCpf = /^(\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11})$/.test(raw)
    if (looksLikeCpf) {
      p.append('cpf', onlyDigits.length === 11 ? onlyDigits : raw)
    } else if (/^\d+$/.test(raw)) {
      // Qualquer número (>=1 dígito) que não seja CPF => matrícula
      p.append('matricula', onlyDigits)
    } else {
      // Caso geral => nome
      p.append('nome', raw)
    }
  }
  if (sexoFilter.value === 'M' || sexoFilter.value === 'F') {
    p.append('sexo', String(sexoFilter.value))
  }
  // Abas de situação -> status oficial (1=Ativo,2=Inativo,3=Bloqueado,4=Pendente). Para "Todos" omite ou 0.
  const st = mapStatusTabToApi()
  // Só envia status para o backend quando for um valor específico (>0). Para "Todos", não enviar.
  // IMPORTANTE: para estatísticas, não enviar 'status' — o endpoint devolve todos os contadores
  if (!opts?.forStatistics && st != null && Number(st) > 0) {
    p.append('status', String(st))
  }
  // Ordenação oficial: não enviar (ordenaremos no cliente para evitar incompatibilidades)
  // nome => nome, codigo => id, mais_recentes => id (no cliente)
  // função: filtro apenas no cliente (não faz parte dos parâmetros oficiais)
  // NÃO enviar status: alguns ambientes não suportam esse parâmetro; filtramos no cliente
  // Vencimentos (apenas enviar quando true) — opcional
  const includeDocs = opts?.includeDocFilters !== false
  if (includeDocs) {
    if (vencFotoPerfil.value) p.append('fotoPerfilVencimento', 'true')
    if (vencAtestado.value) p.append('atestadoVencimento', 'true')
    if (vencAntecedentes.value) p.append('antecedentesVencimento', 'true')
    if (vencUniforme.value) p.append('uniformeVencimento', 'true')
  }
  // NÃO enviar orderBy: ordenamos no cliente
  return p
}

// Busca incremental de todas as páginas para paginação local (suporta grandes volumes)
async function fetchAllForLocalPaging(
  opts?: { signal?: AbortSignal; onProgress?: (pct: number, info?: any) => void; expectedTotal?: number }
): Promise<Row[]> {
  // Não enviamos filtros de documentos para o backend (OR aplicado localmente ou por abas)
  const baseParams = buildApiParams({ includeDocFilters: false })
  // No modo local, não queremos restringir por status no backend; agregamos tudo e filtramos no cliente
  baseParams.delete('status')
  baseParams.set('page', '0')

  // Tentar limites maiores primeiro
  const perPageCandidates = ['1000', '500', '200', '100', '50']
  const maxRecords = 12000 // trava de segurança para não baixar infinitamente
  const aggregated: Row[] = []
  const seen = new Set<string | number>()

  let chosenLimit: string | null = null
  let totalServer = 0
  // Tenta limites maiores primeiro para reduzir número de requisições
  for (const lim of perPageCandidates) {
    try {
      const p0 = new URLSearchParams(baseParams as any)
      p0.set('limit', lim)
      const resp0 = await paginateCooperadosDocuments(p0, { signal: opts?.signal })
      const data0 = (resp0?.data || []) as Row[]
      totalServer = Number(resp0?.total || data0.length || 0)
      for (const it of data0) {
        const id = resolveCooperadoId(it)
        if (id == null || !seen.has(id)) {
          if (id != null) seen.add(id)
          aggregated.push(it)
        }
      }
      chosenLimit = lim
      // progresso inicial
      if (opts?.onProgress) {
        const base = Number(opts?.expectedTotal || 0)
        const denom = base > 0 ? base : totalServer
        const pct = denom > 0 ? Math.min(100, Math.round((aggregated.length / denom) * 100)) : 0
        try { opts.onProgress(pct, { page: 0, perPage: Number(lim), received: aggregated.length, total: totalServer }) } catch {}
      }
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
  // Quando o backend não informa total, seguimos buscando até vir vazio ou não aumentar.
  const totalPagesHint = Math.max(1, Math.ceil(totalServer / perPage))
  const hardPageCap = 300
  let lastSize = aggregated.length
  for (let pageIdx = 1; pageIdx < Math.min(totalPagesHint + 50, hardPageCap); pageIdx++) {
    if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (aggregated.length >= maxRecords) break
    try {
      const p = new URLSearchParams(baseParams as any)
      p.set('page', String(pageIdx))
      p.set('limit', String(perPage))
      const resp = await paginateCooperadosDocuments(p, { signal: opts?.signal })
      const data = (resp?.data || []) as Row[]
      if (!Array.isArray(data) || data.length === 0) break
      for (const it of data) {
        const id = resolveCooperadoId(it)
        if (id == null || !seen.has(id)) {
          if (id != null) seen.add(id)
          aggregated.push(it)
        }
      }
      if (opts?.onProgress) {
        const base = Number(opts?.expectedTotal || 0)
        const denom = base > 0 ? base : Math.max(1, totalServer)
        const pct = totalServer > 0 || base > 0
          ? Math.min(100, Math.round((aggregated.length / denom) * 100))
          : Math.min(100, Math.round(((pageIdx + 1) / Math.max(1, totalPagesHint)) * 100))
        try { opts.onProgress(pct, { page: pageIdx, perPage, received: aggregated.length, total: totalServer }) } catch {}
      }
      // Se não cresceu, assumimos que não há mais páginas úteis
      if (aggregated.length === lastSize) break
      lastSize = aggregated.length
      // Se o backend informar total e já atingimos, paramos
      if (totalServer > 0 && aggregated.length >= totalServer) break
    } catch (e) {
      continue
    }
  }

  return aggregated.slice(0, maxRecords)
}

// Agrega via backend os documentos com OR entre as flags ativas de vencimento
async function fetchAllForLocalDocsOR(
  opts?: { signal?: AbortSignal; onProgress?: (pct: number, info?: any) => void; expectedTotal?: number }
): Promise<Row[]> {
  logDocs('fetchAllForLocalDocsOR:start')
  const flags: Array<{ key: string; set: (p: URLSearchParams) => void }> = []
  if (vencFotoPerfil.value) flags.push({ key: 'fotoPerfilVencimento', set: (p) => p.set('fotoPerfilVencimento', 'true') })
  if (vencAtestado.value) flags.push({ key: 'atestadoVencimento', set: (p) => p.set('atestadoVencimento', 'true') })
  if (vencAntecedentes.value) flags.push({ key: 'antecedentesVencimento', set: (p) => p.set('antecedentesVencimento', 'true') })
  if (vencUniforme.value) flags.push({ key: 'uniformeVencimento', set: (p) => p.set('uniformeVencimento', 'true') })
  logDocs('fetchAllForLocalDocsOR:flags', flags.map(f => f.key))

  if (flags.length === 0) { logDocs('fetchAllForLocalDocsOR:no-flags'); return [] }

  const maxRecords = 12000
  const perPageCandidates = ['1000', '500', '200', '100']
  const merged: Row[] = []
  const seen = new Set<string | number>()

  // Para cada flag ativa, percorre a paginação completa e agrega resultados
  for (const f of flags) {
    logDocs('flag:start', f.key)
    // Base sem outras flags para esta rodada
  const base = buildApiParams({ includeDocFilters: false })
  // No modo local (docs OR), nunca limitar por status no backend
  base.delete('status')
    // Copia e injeta a flag
    const baseWithFlag = new URLSearchParams(base as any)
    f.set(baseWithFlag)
    baseWithFlag.set('page', '0')

    let chosenLimit: string | null = null
    let chosenValue: 'true' | null = null
    let totalServer = 0
    // Tenta apenas boolean true, conforme API
    for (const lim of perPageCandidates) {
      try {
        const p0 = new URLSearchParams(baseWithFlag as any)
        p0.set(f.key, 'true')
        p0.set('limit', lim)
        logDocs('try:first-page', { flag: f.key, val: 'true', limit: lim })
  const resp0 = await paginateCooperadosDocuments(p0, { signal: opts?.signal })
        const data0 = (resp0?.data || []) as Row[]
        totalServer = Number(resp0?.total || data0.length || 0)
        logDocs('first-page:result', { flag: f.key, val: 'true', limit: lim, totalServer, received: Array.isArray(data0) ? data0.length : 0 })
        if (Array.isArray(data0) && data0.length > 0) {
          for (const it of data0) {
            const id = resolveCooperadoId(it)
            if (id != null && !seen.has(id)) { seen.add(id); merged.push(it) }
          }
          if (opts?.onProgress) {
            const base = Number(opts?.expectedTotal || 0)
            const denom = base > 0 ? base : totalServer
            const pct = denom > 0 ? Math.min(100, Math.round((merged.length / denom) * 100)) : 0
            try { opts.onProgress(pct, { flag: f.key, page: 0, perPage: Number(lim), received: merged.length, total: totalServer }) } catch {}
          }
          chosenLimit = lim
          chosenValue = 'true'
          logDocs('first-page:chosen', { flag: f.key, chosenValue: 'true', chosenLimit: lim, totalServer })
          break
        }
        if (totalServer > 0) {
          chosenLimit = lim
          chosenValue = 'true'
          logDocs('first-page:chosen-by-total', { flag: f.key, chosenValue: 'true', chosenLimit: lim, totalServer })
          break
        }
      } catch (e) {
        logDocs('first-page:error', { flag: f.key, val: 'true', limit: lim, error: (e as any)?.message || String(e) })
        continue
      }
    }

    if (!chosenLimit) continue

    const perPage = Number(chosenLimit)
    const totalPages = Math.max(1, Math.ceil(totalServer / perPage))
    for (let pageIdx = 1; pageIdx < totalPages; pageIdx++) {
      if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      if (merged.length >= maxRecords) break
      try {
        const p = new URLSearchParams(baseWithFlag as any)
        p.set('page', String(pageIdx))
        p.set('limit', String(perPage))
        if (chosenValue) p.set(f.key, chosenValue)
        logDocs('page:request', { flag: f.key, pageIdx, perPage, chosenValue })
        const resp = await paginateCooperadosDocuments(p, { signal: opts?.signal })
        const data = (resp?.data || []) as Row[]
        if (!Array.isArray(data) || data.length === 0) break
        for (const it of data) {
          const id = resolveCooperadoId(it)
          if (id != null && !seen.has(id)) { seen.add(id); merged.push(it) }
        }
        if (opts?.onProgress) {
          const base = Number(opts?.expectedTotal || 0)
          const denom = base > 0 ? base : Math.max(1, totalServer)
          const pct = totalServer > 0 || base > 0
            ? Math.min(100, Math.round((merged.length / denom) * 100))
            : Math.min(100, Math.round(((pageIdx + 1) / Math.max(1, totalPages)) * 100))
          try { opts.onProgress(pct, { flag: f.key, page: pageIdx, perPage, received: merged.length, total: totalServer }) } catch {}
        }
      } catch (e) { continue }
    }

    logDocs('flag:done', { flag: f.key, mergedCount: merged.length, totalServer, chosenValue, chosenLimit })
    if (merged.length >= maxRecords) break
  }

  return merged.slice(0, maxRecords)
}

async function load() {
  // Cancelar buscas anteriores
  if (currentAbort) { try { currentAbort.abort() } catch {} }
  currentAbort = new AbortController()
  const signal = currentAbort.signal
  loading.value = true
  aggregating.value = false
  progressPercent.value = 0
  progressLabel.value = ''
  try { if (localStorage.getItem('debug:cooperados') === '1') console.log('[CooperadosView.load] start', { page: page.value, limit: limit.value, currentTab: currentTab.value, isOfficialPaged: isOfficialPaged.value, officialHybridMode: officialHybridMode.value }) } catch {}
  try {
    const officialAllowed = [1, 10, 20, 50, 100]
  // Paginação oficial do backend usa estes limites
    const canUseOfficial = officialAllowed.includes(Number(limit.value))
    const useLocalDocsOR = docFiltersActive.value
    // Abas de situação: usar backend (status) quando possível; só local se houver outros filtros client-only
    const useLocalOpTabs = false
    const useLocalClientOnly = hasClientOnlyFilterActive.value
  // por padrão, considere que não houve filtro de documentos aplicado via backend
  appliedDocsORBackend.value = false

    // Tenta cache por modo e assinatura de filtros
    const now = Date.now()
    const baseKey = makeFiltersSignature()
    // Modos: docsOR, local (op tabs/client-only), official (limit oficial), hybrid (ui limit com backend 100)
    let mode: CacheEntry['mode'] = 'official'
  if (useLocalDocsOR) mode = 'docsOR'
  else if (useLocalClientOnly) mode = 'local'
  else if (canUseOfficial) mode = 'official'
  else mode = 'hybrid'
    // Estabiliza o modo híbrido antes das próximas reações/computeds
    officialHybridMode.value = (mode === 'hybrid')
  const cacheKey = `${mode}:${mode === 'official' || mode === 'hybrid' ? makeFullSignature(true) : baseKey}`
    const entry = listCache.value[cacheKey]
    if (!ignoreCacheOnce.value && entry && now - entry.at < (entry.ttl || LIST_CACHE_TTL)) {
      // Hidrata da cache e retorna
  if (mode === 'hybrid' && Array.isArray(entry.items)) rows.value = entry.items
      else if (Array.isArray(entry.rows)) rows.value = entry.rows
      total.value = Number(entry.total || 0)
      if (entry.remoteCounts) remoteCounts.value = entry.remoteCounts
      // Mantém paginação atual; para modos locais, totalPages recalcula do filteredRows
      loading.value = false
      aggregating.value = false
      progressPercent.value = 100
      progressLabel.value = 'Em cache'
  try { console.log('[CooperadosView.load] cache-hit', { mode, count: rows.value.length, total: total.value }) } catch {}
      return
    }

    if (useLocalDocsOR) {
      // Quando filtros de documentos estão ativos, agregamos via backend (OR entre flags)
      logDocs('load:docsOR:start')
      loadingMore.value = false
      aggregating.value = true
      progressPercent.value = 2
      progressLabel.value = 'Preparando filtros…'
      // Busca total esperado via estatísticas, para exibir progresso real (itens baixados/total)
      try {
        const countParams = buildApiParams({ includeDocFilters: false, forStatistics: true })
        countParams.delete('page')
        countParams.delete('limit')
        const stats = await countCooperadosStatistics(countParams)
        // Preenche totais das tabs/paginação imediatamente
        remoteCounts.value = {
          all: Number(stats?.all || 0) || 0,
          active: Number(stats?.active || 0) || 0,
          inactive: Number(stats?.inactive || 0) || 0,
          blocked: Number(stats?.blocked || 0) || 0,
          pending: Number(stats?.pending || 0) || 0,
        }
        progressTotalHint.value = Number(stats?.all || 0) || null
      } catch { progressTotalHint.value = null }
      let docsORServerApplied = false
      const list = await fetchAllForLocalDocsOR({
        signal,
        expectedTotal: progressTotalHint.value || undefined,
        onProgress: (pct, info) => {
          progressPercent.value = Math.max(2, Math.min(99, pct))
          const received = Number(info?.received || 0)
          const total = Number(progressTotalHint.value || info?.total || 0)
          progressLabel.value = total > 0
            ? `Carregando ${received.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} (${progressPercent.value}%)…`
            : `Carregando (${progressPercent.value}%)…`
        }
      })
      docsORServerApplied = Array.isArray(list) && list.length > 0
      if (!Array.isArray(list) || list.length === 0) {
        try {
          logDocs('load:docsOR:fallback-local')
          const alt = await fetchAllForLocalPaging({
            signal,
            expectedTotal: progressTotalHint.value || undefined,
            onProgress: (pct, info) => {
              progressPercent.value = Math.max(2, Math.min(99, pct))
              const received = Number(info?.received || 0)
              const total = Number(progressTotalHint.value || info?.total || 0)
              progressLabel.value = total > 0
                ? `Carregando ${received.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} (${progressPercent.value}%)…`
                : `Carregando (${progressPercent.value}%)…`
            }
          })
          rows.value = alt
          total.value = alt.length
          docsORServerApplied = false
        } catch {}
      }
      if (!rows.value.length) {
        rows.value = list
        total.value = list.length
      }
      lastLoadedPage.value = page.value
      appliedDocsORBackend.value = !!docsORServerApplied
      loadingMore.value = false
      aggregating.value = false
      progressPercent.value = 100
      progressLabel.value = 'Concluído'
  try { console.log('[CooperadosView.load] docsOR', { count: rows.value.length, total: total.value, appliedDocsORBackend: appliedDocsORBackend.value }) } catch {}

      // Contadores oficiais já preenchidos acima via estatísticas
      // Salva cache
      listCache.value[cacheKey] = {
        k: cacheKey, mode, at: Date.now(), ttl: LIST_CACHE_TTL,
        rows: rows.value, total: total.value, remoteCounts: remoteCounts.value
      }
      saveCacheToSession()
  } else if (useLocalClientOnly) {
      // Paginação local: quando usamos abas operacionais, filtros só do cliente
      // OU quando o limit não é um dos oficiais, buscamos TODAS as páginas e paginamos localmente
      loadingMore.value = false
      aggregating.value = true
      progressPercent.value = 2
      progressLabel.value = 'Carregando…'
      // total esperado via estatísticas
      try {
        const countParams = buildApiParams({ includeDocFilters: false, forStatistics: true })
        countParams.delete('page')
        countParams.delete('limit')
        const stats = await countCooperadosStatistics(countParams)
        remoteCounts.value = {
          all: Number(stats?.all || 0) || 0,
          active: Number(stats?.active || 0) || 0,
          inactive: Number(stats?.inactive || 0) || 0,
          blocked: Number(stats?.blocked || 0) || 0,
          pending: Number(stats?.pending || 0) || 0,
        }
        progressTotalHint.value = Number(stats?.all || 0) || null
      } catch { progressTotalHint.value = null }
      const list = await fetchAllForLocalPaging({
        signal,
        expectedTotal: progressTotalHint.value || undefined,
        onProgress: (pct, info) => {
          progressPercent.value = Math.max(2, Math.min(99, pct))
          const received = Number(info?.received || 0)
          const total = Number(progressTotalHint.value || info?.total || 0)
          progressLabel.value = total > 0
            ? `Carregando ${received.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} (${progressPercent.value}%)…`
            : `Carregando (${progressPercent.value}%)…`
        }
      })
      rows.value = list
      total.value = list.length
      lastLoadedPage.value = page.value
      appliedDocsORBackend.value = false
      loadingMore.value = false
      aggregating.value = false
      progressPercent.value = 100
      progressLabel.value = 'Concluído'
  try { console.log('[CooperadosView.load] localPaging', { count: rows.value.length, total: total.value, page: page.value, limit: limit.value }) } catch {}

      // Contadores oficiais já preenchidos acima via estatísticas
      // Salva cache
      listCache.value[cacheKey] = {
        k: cacheKey, mode, at: Date.now(), ttl: LIST_CACHE_TTL,
        rows: rows.value, total: total.value, remoteCounts: remoteCounts.value
      }
      saveCacheToSession()
  } else if (canUseOfficial) {
      const p = buildApiParams()
      // Chamada oficial de paginação
      const resp = await paginateCooperadosDocuments(p)
      rows.value = (resp?.data || []) as Row[]
      if (!rows.value.length) {
        console.warn('[CooperadosView] Nenhum item recebido do backend (oficial). Params:', Object.fromEntries(p))
      }
      total.value = Number(resp?.total || 0)
      lastLoadedPage.value = page.value
      appliedDocsORBackend.value = false
      try { if (localStorage.getItem('debug:cooperados') === '1') console.log('[CooperadosView.load] official', { count: rows.value.length, total: total.value, page: page.value, limit: limit.value, params: Object.fromEntries(p) }) } catch {}

      // Se total>0 e a página solicitada estiver fora do alcance (resposta vazia), volta para a última página válida e recarrega uma vez
      try {
        const tp = Math.max(1, Math.ceil(total.value / limit.value))
        if (total.value > 0 && rows.value.length === 0 && page.value > tp) {
          console.warn('[CooperadosView] Página fora do alcance no modo oficial. Ajustando para', tp)
          page.value = tp
          lastLoadedPage.value = tp
          pushStateToQuery()
          await load()
          return
        }
      } catch {}

      // Contadores oficiais (mesmos filtros, sem page/limit)
      try {
        const countParams = buildApiParams({ forStatistics: true })
        countParams.delete('page')
        countParams.delete('limit')
        remoteCounts.value = await countCooperadosStatistics(countParams)
      } catch {
        remoteCounts.value = { all: total.value, active: 0, inactive: 0, blocked: 0, pending: 0 }
      }
      // Salva cache (considerando página/limit na assinatura para oficial)
      const signedKey = `${mode}:${makeFullSignature(true)}`
      listCache.value[signedKey] = {
        k: signedKey, mode, at: Date.now(), ttl: LIST_CACHE_TTL,
        rows: rows.value, total: total.value, remoteCounts: remoteCounts.value,
        page: page.value, limit: limit.value
      }
      saveCacheToSession()
    } else {
      // Modo híbrido: quando o limite UI não é oficial (ex.: 18) e não há filtros só do cliente,
      // usamos a paginação oficial com limit=100 e fatiamos localmente a página solicitada.
      // Carrega estatísticas primeiro (alimenta totalPages em casos sem total no backend)
      try {
        const countParams = buildApiParams({ forStatistics: true })
        countParams.delete('page')
        countParams.delete('limit')
        remoteCounts.value = await countCooperadosStatistics(countParams)
      } catch { /* noop */ }
  const tabPred = getTabPredicate()
      const hybrid = tabPred ? await fetchHybridOfficialFilteredPage(tabPred) : await fetchHybridOfficialPage()
      rows.value = hybrid.items
      total.value = Number(hybrid.total || 0)
      lastLoadedPage.value = page.value
      appliedDocsORBackend.value = false
      officialHybridMode.value = true
  try { if (localStorage.getItem('debug:cooperados') === '1') console.log('[CooperadosView.load] hybrid-official', { count: rows.value.length, total: total.value, page: page.value, uiLimit: limit.value }) } catch {}

        // Ajuste de página inválida no modo híbrido (quando total muda e a subpágina deixa de existir)
        try {
          const tp = Math.max(1, Math.ceil(total.value / Math.max(1, limit.value)))
          if (total.value > 0 && rows.value.length === 0 && page.value > tp) {
            console.warn('[CooperadosView] Página fora do alcance no modo híbrido. Ajustando para', tp)
            page.value = tp
            lastLoadedPage.value = tp
            pushStateToQuery()
            await load()
            return
          }
        } catch {}

      // Se estatísticas falharam acima, tenta uma vez aqui; senão, usa fallback com total do backend
      if (!remoteCounts.value || Number(remoteCounts.value.all || 0) === 0) {
        try {
          const countParams = buildApiParams({ forStatistics: true })
          countParams.delete('page')
          countParams.delete('limit')
          remoteCounts.value = await countCooperadosStatistics(countParams)
        } catch {
          remoteCounts.value = { all: total.value, active: 0, inactive: 0, blocked: 0, pending: 0 }
        }
      }
      // Salva cache (assinatura completa com page/limit e aba)
      listCache.value[cacheKey] = {
        k: cacheKey, mode, at: Date.now(), ttl: LIST_CACHE_TTL,
        items: rows.value, total: total.value, remoteCounts: remoteCounts.value,
        page: page.value, limit: limit.value
      }
      saveCacheToSession()
    }
  } catch (err) {
    console.warn('[cooperados] paginate/documents falhou, aplicando fallback', err)
    try {
  // Se a intenção era usar filtros locais (documentos ou outros filtros client-only), faz o fallback para paginação local completa
  if (docFiltersActive.value || hasClientOnlyFilterActive.value) {
        logDocs('load:catch:fallback-local')
        loadingMore.value = false
        aggregating.value = true
        progressPercent.value = 2
        progressLabel.value = 'Carregando…'
        const list = await fetchAllForLocalPaging({
          signal,
          expectedTotal: progressTotalHint.value || undefined,
          onProgress: (pct, info) => {
            progressPercent.value = Math.max(2, Math.min(99, pct))
            const received = Number(info?.received || 0)
            const total = Number(progressTotalHint.value || info?.total || 0)
            progressLabel.value = total > 0
              ? `Carregando ${received.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} (${progressPercent.value}%)…`
              : `Carregando (${progressPercent.value}%)…`
          }
        })
        rows.value = list
        total.value = list.length
  const countParams = buildApiParams({ includeDocFilters: false, forStatistics: true })
        countParams.delete('page')
        countParams.delete('limit')
        remoteCounts.value = await countCooperadosStatistics(countParams)
        appliedDocsORBackend.value = false
        loadingMore.value = false
        aggregating.value = false
        progressPercent.value = 100
        progressLabel.value = 'Concluído'
        return
      }
    } catch (e) {
      console.warn('[cooperados] fallback local falhou, usando legado', e)
    }
    // Fallback final: endpoint legado simples
    const legacy = new URLSearchParams()
    legacy.append('page', String(page.value - 1))
    legacy.append('limit', String(limit.value))
    if (q.value) legacy.append('q', q.value)
    const data: any = await listCooperados(legacy)
    rows.value = Array.isArray(data) ? (data as Row[]) : ((data?.data || data?.rows || []) as Row[])
    total.value = Array.isArray(data) ? (data as any[]).length : Number(data?.total || rows.value.length)
    remoteCounts.value = { all: total.value, active: 0, inactive: 0, blocked: 0, pending: 0 }
    appliedDocsORBackend.value = false
  try { console.log('[CooperadosView.load] legacy', { count: rows.value.length, total: total.value, page: page.value, limit: limit.value, params: Object.fromEntries(legacy) }) } catch {}
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
    // Finalização de estados
    if (loading.value) loading.value = false
    loadingMore.value = false
    aggregating.value = false
    // Atualiza contadores de região com os filtros atuais
    try { refreshRegionCounts() } catch {}
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
      // Snapshot leve do estado atual para restaurar ao voltar (sem depender da URL)
      const snapshotTTL = 120000 // 2 minutos
      const state = {
        at: Date.now(),
        ttl: snapshotTTL,
        q: q.value,
        sortBy: sortBy.value,
        page: page.value,
        limit: limit.value,
        currentTab: currentTab.value,
        sexoFilter: sexoFilter.value,
        estadoFilter: estadoFilter.value,
        cidadeFilter: cidadeFilter.value,
        regiaoFilter: regiaoFilter.value,
        statusFilter: statusFilter.value,
        opStatusFilter: opStatusFilter.value,
        useOpStatusTabs: useOpStatusTabs.value,
        opTab: opTab.value,
        funcaoFilter: funcaoFilter.value,
        vencFotoPerfil: vencFotoPerfil.value,
        vencAtestado: vencAtestado.value,
        vencAntecedentes: vencAntecedentes.value,
        vencUniforme: vencUniforme.value,
        // dataset em memória (cap para evitar sessionStorage grande)
        rows: (Array.isArray(rows.value) ? rows.value.slice(0, 600) : []),
        total: total.value,
        remoteCounts: remoteCounts.value,
        officialHybridMode: officialHybridMode.value,
        appliedDocsORBackend: appliedDocsORBackend.value,
      }
      sessionStorage.setItem('cooperados:viewState', JSON.stringify(state))
      // Flag para disparar restauração ao voltar
      sessionStorage.setItem('cooperados:restore', '1')
      // Destacar imediatamente o card clicado
      lastVisitedId.value = String(safeId)
      sessionStorage.setItem('cooperados:last', JSON.stringify({ id: String(safeId), at: Date.now() }))
      // Salva o objeto completo para o detalhe usar sem precisar refetch por id
      sessionStorage.setItem('cooperados:detail', JSON.stringify(it))
    } catch { /* noop */ }
    // Levar a query atual junto para que o botão Voltar preserve busca/filtros
    router.push({ name: 'cooperado-detail', params: { id: String(safeId) }, query: { ...route.query } })
    return
  }
  try {
    selectedCooperadoId.value = Number(safeId) || null
    showDetail.value = true
    detailLoading.value = true
    // Preenche imediatamente com o item clicado (sem refetch).
    detail.value = it
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
// Persiste as alterações do formulário de edição e atualiza o detalhe/lista
async function saveEdit() {
  try {
    const id = selectedCooperadoId.value
    if (!id || !detail.value) {
      ;(window as any).$toast?.error?.('Nada para salvar')
      return
    }

    // Monta o payload com os campos editáveis mostrados no formulário
    const d: any = detail.value
    const payload: any = {
      nome: d.nome,
      cpf: d.cpf,
      rg: d.rg,
      dataNasc: d.dataNasc,
      sexo: d.sexo,
      cooperativa: d.cooperativa,
      status: d.status,
      nomeMae: d.nomeMae,
      nomePai: d.nomePai,
      dataExp: d.dataExp,
      email: d.email,
      telefone1: d.telefone1,
      telefone2: d.telefone2,
  gestor: d.gestor,
      cidade: d.cidade,
      uf: d.uf ?? d.estado,
      estado: d.uf ?? d.estado,
      bairro: d.bairro,
      endereco: d.endereco,
      numero: d.numero,
      complemento: d.complemento,
      cep: d.cep,
  regiao: d.regiao ?? d.regiao_sp ?? d.zona,
      tipoPagto: d.tipoPagto,
      banco: d.banco,
      agencia: d.agencia,
      conta: d.conta,
      digConta: d.digConta,
      observacoes: d.observacoes,
    }

    const resp = await updateCooperado(id, payload)
    const serverObj = (resp && (resp.data || resp))
    // Mescla: prioriza retorno do servidor, mantendo payload como fallback
    const merged = typeof serverObj === 'object' && serverObj
      ? { ...detail.value, ...payload, ...serverObj }
      : { ...detail.value, ...payload }

    detail.value = merged
    // Atualiza a lista visível em memória
    try {
      const idx = rows.value.findIndex((it) => String(resolveCooperadoId(it)) === String(id))
      if (idx >= 0) {
        rows.value[idx] = { ...rows.value[idx], ...merged }
      }
    } catch {}

    editing.value = false
    ;(window as any).$toast?.success?.('Dados salvos')
  } catch (e) {
    console.error('[cooperados.saveEdit] falhou', e)
    ;(window as any).$toast?.error?.('Não foi possível salvar as alterações')
  }
}

// Helpers de status para abas (Situação)
function normStatusText(v: unknown) {
  return String(v || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .toLowerCase()
    .trim()
}
// Normaliza texto (acentos, caixa)
function normalizeText(s: unknown){
  return String(s||'')
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .toLowerCase()
    .trim()
}
// Label amigável para sexo
function sexoLabel(v: unknown): string {
  const s = String(v || '').trim().toUpperCase()
  if (!s) return ''
  if (s.startsWith('M')) return 'Masculino'
  if (s.startsWith('F')) return 'Feminino'
  return String(v || '')
}
function getStatusCode(it: Row): number | null {
  // Procura código em múltiplos campos
  const candidates = [
    (it as any)?.status,
    (it as any)?.statusCadastro,
    (it as any)?.status_geral,
    (it as any)?.statusGeral,
  ]
  for (const raw of candidates) {
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}
function getStatusLabel(it: Row): 'ativo' | 'inativo' | 'bloqueado' | 'pendente' | null {
  const code = getStatusCode(it)
  if (code != null) {
    if (code === 1) return 'ativo'
    if (code === 2) return 'inativo'
    if (code === 3) return 'bloqueado'
    if (code === 4) return 'pendente'
  }
  const txt = normStatusText((it as any)?.situacao || (it as any)?.status || (it as any)?.statusCadastroDesc)
  if (!txt) return null
  // Usa regex para evitar colisão (ex.: "inativo" conter "ativo")
  if (/(^|\b)(bloquead[oa]|bloq)(\b|$)/.test(txt)) return 'bloqueado'
  if (/(^|\b)(pend|pendente|aguardando|incompleto)(\b|$)/.test(txt)) return 'pendente'
  if (/(^|\b)(inativ[oa]|desativad[oa])(\b|$)/.test(txt)) return 'inativo'
  if (/(^|\b)(ativ[oa]|aprovad[oa])(\b|$)/.test(txt)) return 'ativo'
  return null
}
function isAtivo(it: Row) { return getStatusLabel(it) === 'ativo' }
function isInativo(it: Row) { return getStatusLabel(it) === 'inativo' }
function isBloqueado(it: Row) { return getStatusLabel(it) === 'bloqueado' }
function isPendente(it: Row) { return getStatusLabel(it) === 'pendente' }

// Deriva a chave de Status Operacional a partir de múltiplos campos possíveis, usando o normalizador centralizado
function getOpStatusKey(it: Row): ReturnType<typeof normalizeOpStatusKey> {
  const cand = [
    (it as any)?.opStatusKey,
    (it as any)?.op_status_key,
    (it as any)?.operationalStatus,
    (it as any)?.operational_status,
    (it as any)?.statusOperacional,
    (it as any)?.status_operacional,
    (it as any)?.statusOp,
    (it as any)?.status_op,
    (it as any)?.situacao_operacional,
    (it as any)?.situacaoOp,
    (it as any)?.situacao_op,
    (it as any)?.situacao,
  ]
  for (const v of cand) {
    const k = normalizeOpStatusKey(v)
    if (k) return k
  }
  return ''
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
  // Só aplicamos no cliente se NÃO tivermos aplicado via backend
  if (!appliedDocsORBackend.value && (vencFotoPerfil.value || vencAtestado.value || vencAntecedentes.value || vencUniforme.value)) {
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
  // Construir top priorizando marcadores especiais e completando com os mais frequentes
  const entries = Object.entries(counts).sort((a,b) => b[1]-a[1])
  const topObj: Record<string, number> = {}
  // Garante presença dos especiais primeiro
  for (const special of [FILTRO_COM_FUNCAO, FILTRO_SEM_FUNCAO]) {
    if (counts[special] !== undefined) topObj[special] = counts[special]
  }
  for (const [k,v] of entries) {
    if (k === FILTRO_COM_FUNCAO || k === FILTRO_SEM_FUNCAO) continue
    if (Object.keys(topObj).length >= 5) break
    topObj[k] = v
  }
  return topObj
})

const totalPreFuncao = computed(() => Array.isArray(preFuncaoRows?.value) ? preFuncaoRows.value.length : 0)

// Dados fake das funções (todos os cooperados - sem filtro) - Total: 5902
const funcoesDataAll = [
  { name: 'NÃO PREENCHEU', countM: 9, countF: 7 },
  { name: 'GARCOM', countM: 460, countF: 280 },
  { name: 'STEWARD', countM: 390, countF: 212 },
  { name: 'AJUDANTE DE COZINHA', countM: 252, countF: 185 },
  { name: 'COZINHEIRO', countM: 274, countF: 163 },
  { name: 'ATENDENTE', countM: 125, countF: 274 },
  { name: 'BARMAN', countM: 262, countF: 80 },
  { name: 'CUMIM', countM: 174, countF: 126 },
  { name: 'COPEIRO', countM: 118, countF: 134 },
  { name: 'COORDENADOR', countM: 145, countF: 106 },
  { name: 'AUX. LIMPEZA', countM: 76, countF: 174 },
  { name: 'HOSTESS', countM: 11, countF: 154 },
  { name: 'RUNNER CORREDOR', countM: 86, countF: 76 },
  { name: 'CAIXA', countM: 38, countF: 125 },
  { name: 'PIZZAIOLO', countM: 76, countF: 18 },
  { name: 'BARMAN 12 ESP.', countM: 67, countF: 11 },
  { name: 'LIDER', countM: 57, countF: 38 },
  { name: 'GESTOR STEWARD', countM: 47, countF: 28 },
  { name: 'CHAPELARIA', countM: 28, countF: 47 },
  { name: 'AJUDANTE DE COZINHA ESP.', countM: 47, countF: 28 },
  { name: 'CREDENCIAMENTO', countM: 25, countF: 47 },
  { name: 'GARCONETE', countM: 7, countF: 60 },
  { name: 'CONFEITEIRO', countM: 38, countF: 28 },
  { name: 'ENCARREGADO', countM: 47, countF: 16 },
  { name: 'COORDENADOR GARCOM', countM: 42, countF: 18 },
  { name: 'ASG', countM: 28, countF: 30 },
  { name: 'CUMIN ESP.', countM: 33, countF: 21 },
  { name: 'GESTORA', countM: 4, countF: 46 },
  { name: 'ATENDENTE CAIXA', countM: 16, countF: 33 },
  { name: 'ESTOQUISTA', countM: 37, countF: 11 },
  { name: 'CAMAREIRA 2', countM: 2, countF: 42 },
  { name: 'LOGISTICO', countM: 33, countF: 7 },
  { name: 'PADEIRO', countM: 28, countF: 11 },
  { name: 'LAVADOR', countM: 25, countF: 12 },
  { name: 'AÇOUGUEIRO', countM: 28, countF: 7 },
  { name: 'AJUDANTE DE CONFEITARIA', countM: 11, countF: 21 },
  { name: 'BARBACK', countM: 21, countF: 7 },
  { name: 'GESTOR', countM: 16, countF: 12 },
  { name: 'AJUDANTE GERAL M', countM: 19, countF: 7 }
]

// Ranking de funções (usa dados da API se disponíveis, senão fallback para fake)
const funcoesRanking = computed(() => {
  // Se temos dados da API, usar eles
  if (funcoesRankingData.value.length > 0) {
    return funcoesRankingData.value
      .filter(item => item.count > 0)
      .sort((a, b) => b.count - a.count)
  }
  
  // Fallback: dados fake filtrados por gênero
  const filtered = funcoesDataAll.map(item => {
    let count = 0
    if (sexoFilter.value === 'M') {
      count = item.countM
    } else if (sexoFilter.value === 'F') {
      count = item.countF
    } else {
      count = item.countM + item.countF
    }
    return { name: item.name, count }
  })
  
  // Ordena por contagem decrescente e remove itens com count 0
  return filtered
    .filter(item => item.count > 0)
    .sort((a, b) => b.count - a.count)
})

// Total de cooperados no ranking (para cálculo de porcentagens)
const totalCooperadosRanking = computed(() => {
  return funcoesRanking.value.reduce((sum, item) => sum + item.count, 0)
})


// Contadores locais de região (fallback)
const regiaoCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {}
  const list = preRegiaoRows.value
  const isSP = String(estadoFilter.value).toUpperCase() === 'SP'
  if (isSP) {
    for (const label of SP_REGION_LABELS) {
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

// Contadores remotos (estatísticas) por região
const remoteRegionCounts = ref<Record<string, number>>({})
const remoteRegionAll = ref<number>(0)
const remoteRegionKeys = computed<string[]>(() => Object.keys(remoteRegionCounts.value || {}))

// Exposição unificada para a UI: usa remotos se disponíveis; caso contrário, fallback local
const uiRegiaoCounts = computed<Record<string, number>>(() => {
  const rc = remoteRegionCounts.value || {}
  return Object.keys(rc).length > 0 ? rc : regiaoCounts.value
})
const uiRegiaoAll = computed<number>(() => {
  return Number(remoteRegionAll.value || 0) > 0 ? Number(remoteRegionAll.value || 0) : totalPreRegiao.value
})

let _regionTimer: any = null
function toApiRegiao(label: string): string {
  const t = normalizeText(label).toUpperCase()
  if (t.includes('ZONA') && t.includes('NORTE')) return 'ZONA NORTE'
  if (t.includes('ZONA') && t.includes('OESTE')) return 'ZONA OESTE'
  if (t.includes('ZONA') && t.includes('SUL')) return 'ZONA SUL'
  if (t.includes('ZONA') && t.includes('LESTE')) return 'ZONA LESTE'
  if (t.includes('GRANDE') && t.includes('ABC')) return 'GRANDE ABC'
  if (t.includes('CAMPINAS')) return 'CAMPINAS'
  if (t.includes('VALE')) return 'VALE'
  if (t.includes('BAIXADA')) return 'BAIXADA'
  return label.toUpperCase()
}
async function refreshRegionCounts() {
  try { if (_regionTimer) { clearTimeout(_regionTimer); _regionTimer = null } } catch {}
  _regionTimer = setTimeout(async () => {
    _regionTimer = null
    try {
      // Base com filtros atuais (sexo, uf, cidade, docs, função, etc.) – o endpoint retorna um objeto "regioes"
      const base = buildApiParams({ forStatistics: true })
      base.delete('page'); base.delete('limit')
      const stats = await countCooperadosStatistics(base)
      remoteRegionAll.value = Number(stats?.all || 0) || 0
      const incoming = (stats?.regioes || stats?.regions || {}) as Record<string, number>
      const upper: Record<string, number> = {}
      for (const [k,v] of Object.entries(incoming)) upper[String(k).toUpperCase()] = Number(v||0)
      const isSP = String(estadoFilter.value || '').toUpperCase() === 'SP'
      const map: Record<string, number> = {}
      if (isSP) {
        for (const label of SP_REGION_LABELS) {
          const key = toApiRegiao(label) // 'ZONA NORTE', etc.
          map[label] = Number(upper[key] || 0)
        }
      } else {
        for (const k of ['N','NE','CO','SE','S']) map[k] = Number(upper[k] || 0)
      }
      remoteRegionCounts.value = map
    } catch (e) {
      // Em falha, zera remotos para ativar fallback local
      remoteRegionCounts.value = {}
      // mantém remoteRegionAll como estava ou 0
    }
  }, 120)
}


function getRegiaoCount(key: string) {
  try {
    const rc = (regiaoCounts && 'value' in regiaoCounts) ? (regiaoCounts?.value || {}) : (regiaoCounts as any)
    return (rc as Record<string, number>)?.[key] ?? 0
  } catch (e) { return 0 }
}





const totalSexoM = computed(() => preSexoRows.value.filter((it: Row) => String(it.sexo || it.gender || '').toUpperCase().startsWith('M')).length)
const totalSexoF = computed(() => preSexoRows.value.filter((it: Row) => String(it.sexo || it.gender || '').toUpperCase().startsWith('F')).length)



// Totais das abas (Situação):
// - Em paginação oficial/híbrida, usamos contadores do backend (remoteCounts) para refletir o total global.
// - Em paginação local, calculamos a partir do que está filtrado em memória (baseFilteredRows).
const totalTodos = computed(() => {
  // Quando filtros de documentos estão ativos, os totais devem refletir o dataset filtrado localmente
  if (docFiltersActive.value) return baseFilteredRows.value.length
  const all = Number(remoteCounts.value.all || 0)
  if (all > 0) return all
  if (isOfficialPaged.value) return Number(total.value || 0)
  return baseFilteredRows.value.length
})
const totalAtivos = computed(() => {
  if (docFiltersActive.value) return baseFilteredRows.value.filter(isAtivo as any).length
  const n = Number(remoteCounts.value.active || 0)
  if (n > 0) return n
  if (isOfficialPaged.value) return Number(remoteCounts.value.active || 0)
  return baseFilteredRows.value.filter(isAtivo as any).length
})
const totalInativos = computed(() => {
  if (docFiltersActive.value) return baseFilteredRows.value.filter(isInativo as any).length
  const n = Number(remoteCounts.value.inactive || 0)
  if (n > 0) return n
  if (isOfficialPaged.value) return Number(remoteCounts.value.inactive || 0)
  return baseFilteredRows.value.filter(isInativo as any).length
})
const totalBloqueados = computed(() => {
  if (docFiltersActive.value) return baseFilteredRows.value.filter(isBloqueado as any).length
  const n = Number(remoteCounts.value.blocked || 0)
  if (n > 0) return n
  if (isOfficialPaged.value) return Number(remoteCounts.value.blocked || 0)
  return baseFilteredRows.value.filter(isBloqueado as any).length
})
const totalPendentesTab = computed(() => {
  if (docFiltersActive.value) return baseFilteredRows.value.filter(isPendente as any).length
  const n = Number(remoteCounts.value.pending || 0)
  if (n > 0) return n
  if (isOfficialPaged.value) return Number(remoteCounts.value.pending || 0)
  return baseFilteredRows.value.filter(isPendente as any).length
})


const filteredRows = computed<Row[]>(() => {
  let list: Row[] = baseFilteredRows.value

  // Aba (Situação): em paginação local aplicamos no cliente; em oficial/híbrida confiamos no backend
  if (!useOpStatusTabs.value && !isOfficialPaged.value) {
    if (currentTab.value === 'ativos') list = list.filter(isAtivo as any)
    else if (currentTab.value === 'inativos') list = list.filter(isInativo as any)
    else if (currentTab.value === 'bloqueados') list = list.filter(isBloqueado as any)
    else if (currentTab.value === 'pendentes') list = list.filter(isPendente as any)
  }

  // Nota: atualização de contadores de região é feita por refreshRegionCounts() fora deste computed
  return list
})
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

// Busca uma subpágina usando paginação oficial (limit=100) e fatia localmente para o limite da UI
async function fetchHybridOfficialPage(): Promise<{ items: Row[]; total: number }>{
  const uiLimit = Number(limit.value) || 18
  const backendLimit = 100
  // página remota e deslocamento para cobrir a página local atual
  const startIndex = (Math.max(1, Number(page.value)) - 1) * uiLimit
  const remotePage = Math.floor(startIndex / backendLimit) // 0-based
  const p = buildApiParams()
  p.set('limit', String(backendLimit))
  p.set('page', String(remotePage))
  const resp = await paginateCooperadosDocuments(p)
  const totalAll = Number(resp?.total || 0)
  const batchA = Array.isArray(resp?.data) ? (resp.data as Row[]) : []
  const offsetWithinBatch = startIndex - (remotePage * backendLimit)
  // Se a subpágina local atravessa o fim do batchA, buscarmos o próximo batch e concatenamos
  let combined: Row[] = batchA
  if (offsetWithinBatch + uiLimit > backendLimit) {
    const p2 = buildApiParams()
    p2.set('limit', String(backendLimit))
    p2.set('page', String(remotePage + 1))
    try {
      const resp2 = await paginateCooperadosDocuments(p2)
      const batchB = Array.isArray(resp2?.data) ? (resp2.data as Row[]) : []
      combined = [...batchA, ...batchB]
    } catch {}
  }
  const slice = combined.slice(offsetWithinBatch, offsetWithinBatch + uiLimit)
  return { items: slice, total: totalAll }
}

// Obtém um predicado de filtragem correspondente à aba de Situação atual
function getTabPredicate(): ((r: Row) => boolean) | null {
  if (useOpStatusTabs.value) return null
  if (currentTab.value === 'ativos') return (isAtivo as any)
  if (currentTab.value === 'inativos') return (isInativo as any)
  if (currentTab.value === 'bloqueados') return (isBloqueado as any)
  if (currentTab.value === 'pendentes') return (isPendente as any)
  return null
}

// Busca híbrida filtrando por aba no cliente e avançando por lotes até preencher a página da UI
async function fetchHybridOfficialFilteredPage(predicate: (r: Row) => boolean): Promise<{ items: Row[]; total: number }>{
  const uiLimit = Number(limit.value) || 18
  const backendLimit = 100
  const desiredOffset = Math.max(0, (Math.max(1, Number(page.value)) - 1) * uiLimit)
  let totalAll = 0
  let skipped = 0
  let collected: Row[] = []
  for (let remotePage = 0; collected.length < uiLimit; remotePage++) {
    const p = buildApiParams()
    p.set('limit', String(backendLimit))
    p.set('page', String(remotePage))
    const resp = await paginateCooperadosDocuments(p)
    if (remotePage === 0) totalAll = Number(resp?.total || 0)
    const data = Array.isArray(resp?.data) ? (resp.data as Row[]) : []
    if (data.length === 0) break
    const filtered = data.filter(predicate)
    if (skipped < desiredOffset) {
      const toSkip = Math.min(filtered.length, desiredOffset - skipped)
      skipped += toSkip
      collected.push(...filtered.slice(toSkip))
    } else {
      collected.push(...filtered)
    }
    if (data.length < backendLimit) break
  }
  return { items: collected.slice(0, uiLimit), total: totalAll }
}

function setLimit(v: unknown) {
          const num = Number(v)
          const isValid = Number.isFinite(num) && num > 0
          const n = isValid ? num : 18
  limit.value = n
  page.value = 1
  pushStateToQuery()
  load()
}

// Navegação de página com logs para depuração
function _dbgBase() {
  try {
    return {
      page: page.value,
      limit: limit.value,
      isOfficialPaged: isOfficialPaged.value,
      officialHybridMode: officialHybridMode.value,
      hasKnownTotal: hasKnownTotal.value,
      totalPages: totalPages.value,
      displayTotal: displayTotal.value,
      currentTab: currentTab.value,
    }
  } catch { return {} as any }
}
function goFirst() {
  if (syncing.value) return
  const prev = page.value
  page.value = 1
  try { if (localStorage.getItem('debug:cooperados') === '1') console.log('[CooperadosView.nav] « first', { from: prev, ..._dbgBase() }) } catch {}
  pushStateToQuery()
  if (isOfficialPaged.value) scheduleLoad(0)
}
function goPrev() {
  if (syncing.value) return
  const prev = page.value
  page.value = Math.max(1, page.value - 1)
  try { if (localStorage.getItem('debug:cooperados') === '1') console.log('[CooperadosView.nav] ‹ prev', { from: prev, ..._dbgBase() }) } catch {}
  pushStateToQuery()
  if (isOfficialPaged.value) scheduleLoad(0)
}
function goTo(p: number) {
  if (syncing.value) return
  const prev = page.value
  page.value = Math.max(1, Number(p) || 1)
  try { if (localStorage.getItem('debug:cooperados') === '1') console.log('[CooperadosView.nav] · goTo', { to: p, from: prev, ..._dbgBase() }) } catch {}
  pushStateToQuery()
  if (isOfficialPaged.value) scheduleLoad(0)
}
function goNext() {
  if (syncing.value) return
  const prev = page.value
  const next = hasKnownTotal.value ? Math.min(totalPages.value, page.value + 1) : (page.value + 1)
  page.value = next
  try { if (localStorage.getItem('debug:cooperados') === '1') console.log('[CooperadosView.nav] › next', { from: prev, ..._dbgBase() }) } catch {}
  pushStateToQuery()
  if (isOfficialPaged.value) scheduleLoad(0)
}
function goLast() {
  if (syncing.value) return
  const prev = page.value
  page.value = totalPages.value
  try { if (localStorage.getItem('debug:cooperados') === '1') console.log('[CooperadosView.nav] » last', { from: prev, ..._dbgBase() }) } catch {}
  pushStateToQuery()
  if (isOfficialPaged.value) scheduleLoad(0)
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
const isOfficialPaged = computed(() => {
  const noLocal = !docFiltersActive.value && !useOpStatusTabs.value && !hasClientOnlyFilterActive.value
  return noLocal && (officialAllowed.includes(Number(limit.value)) || officialHybridMode.value)
})
const displayTotal = computed<number>(() => {
  if (isOfficialPaged.value) {
    // Para abas, usar o total específico se disponível; senão, cair para o total do backend
    const tab = String(currentTab.value || 'todos')
    // Primeiro tenta estatísticas do backend (respeitam sexo/região quando enviados)
    const preferCounts: Record<string, number> = {
      ativos: Number(remoteCounts.value.active || 0),
      inativos: Number(remoteCounts.value.inactive || 0),
      bloqueados: Number(remoteCounts.value.blocked || 0),
      pendentes: Number(remoteCounts.value.pending || 0),
      todos: Number(remoteCounts.value.all || 0),
    }
    const fromCounts = preferCounts[tab]
    if (fromCounts && fromCounts > 0) return fromCounts
    // Se estatísticas não ajudaram, evitar usar total.value quando ele aparenta ser apenas o tamanho da página exibida
    // (ex.: 18), o que ocorre quando o backend não informa total. Nestes casos retornamos 0 (total desconhecido)
    const backendTotal = Number(total.value || 0)
    const pageSize = Array.isArray(filteredRows.value) ? filteredRows.value.length : 0
    if (backendTotal > 0 && backendTotal !== pageSize) return backendTotal
    return 0
  }
  // Em paginação local, usamos o total realmente filtrado em memória
  return Number(filteredRows.value.length || 0)
})
const visibleRows = computed<Row[]>(() => {
  // Em paginação oficial/híbrida, já recebemos a página correta do backend
  if (isOfficialPaged.value) return filteredRows.value
  // Em paginação local (inclui abas), fatiamos conforme página/limite da UI
  const start = (page.value - 1) * limit.value
  return filteredRows.value.slice(start, start + limit.value)
})

// Paginação: total de páginas e lista de páginas com elipses
const totalPages = computed<number>(() => {
  const totalForPaging = Number(displayTotal.value || 0)
  return Math.max(1, Math.ceil(Math.max(0, totalForPaging) / Math.max(1, Number(limit.value || 1))))
})

// Quando estamos em paginação oficial/híbrida e o backend não informa total (ou estatísticas vieram 0),
// permitimos navegação "às cegas": mostramos uma janela móvel de páginas ao redor da atual.
const hasKnownTotal = computed<boolean>(() => {
  return isOfficialPaged.value && Number(displayTotal.value || 0) > 0
})

const headerRangeStart = computed<number>(() => {
  const totalForPaging = Number(displayTotal.value || 0)
  if (!totalForPaging) return 0
  return Math.min(((page.value - 1) * limit.value) + 1, totalForPaging)
})
const headerRangeEnd = computed<number>(() => {
  const totalForPaging = Number(displayTotal.value || 0)
  return Math.min(page.value * limit.value, totalForPaging)
})

const pageItems = computed<Array<number | '…'>>(() => {
  const total = totalPages.value
  const current = page.value
  const delta = 2 // quantidade de páginas vizinhas de cada lado
  // Caso especial: total desconhecido em modo oficial/híbrido → janela móvel
  if (isOfficialPaged.value && !hasKnownTotal.value) {
    const items: Array<number | '…'> = []
    const start = Math.max(1, current - delta)
    const end = current + delta
    for (let p = start; p <= end; p++) items.push(p)
    return items
  }
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

function clearAllFilters() {
  q.value = ''
  sortBy.value = 'mais_recentes'
  currentTab.value = 'todos'
  sexoFilter.value = ''
  estadoFilter.value = ''
  cidadeFilter.value = ''
  regiaoFilter.value = ''
  statusFilter.value = 'nenhum'
  opStatusFilter.value = ''
  useOpStatusTabs.value = false
  opTab.value = ''
  funcaoFilter.value = ''
  vencFotoPerfil.value = false
  vencAtestado.value = false
  vencAntecedentes.value = false
  vencUniforme.value = false
  page.value = 1
  // limpar cache para evitar assinaturas antigas com dados muito grandes
  listCache.value = {}
  saveCacheToSession()
  pushStateToQuery()
  load()
}

// Recarrega contadores de região quando filtros que impactam estatísticas mudarem
watch([q, sexoFilter, estadoFilter, cidadeFilter, statusFilter, opStatusFilter, funcaoFilter, vencFotoPerfil, vencAtestado, vencAntecedentes, vencUniforme], () => {
  try { refreshRegionCounts() } catch {}
})

function onCreate() {
  // Ao incluir cadastro, zera qualquer rascunho salvo para iniciar do zero
  try {
    localStorage.removeItem('draft:cooperado-form')
    localStorage.removeItem('draft:cooperado-funcoes')
  } catch {}
  router.push({ name: 'cooperado-new' })
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


// Watcher para animar números quando statisticsData mudar
watch(() => statisticsData.value, (newData) => {
  if (newData && currentTab.value === 'dashboard') {
    const total = newData.all || 1
    
    // Se já animamos uma vez, apenas atualizar valores diretamente sem animação
    if (hasAnimatedDashboard.value) {
      // Atualizar valores instantaneamente
      animatedNumbers.value['active'] = newData.active || 0
      animatedNumbers.value['pending'] = newData.pending || 0
      animatedNumbers.value['blocked'] = newData.blocked || 0
      animatedNumbers.value['inactive'] = newData.inactive || 0
      animatedNumbers.value['all'] = newData.all || 0
      
      animatedBarWidths.value['activeBar'] = (newData.active / total * 100) || 0
      animatedBarWidths.value['pendingBar'] = (newData.pending / total * 100) || 0
      animatedBarWidths.value['blockedBar'] = (newData.blocked / total * 100) || 0
      animatedBarWidths.value['inactiveBar'] = (newData.inactive / total * 100) || 0
      
      animatedNumbers.value['sexoM'] = newData.sexo?.M || 0
      animatedNumbers.value['sexoF'] = newData.sexo?.F || 0
      
      if (newData.opStatus) {
        animatedNumbers.value['opDisponivel'] = newData.opStatus.disponivel || 0
        animatedNumbers.value['opContratacao'] = newData.opStatus.contratacao || 0
        animatedNumbers.value['opFaltouCancelou'] = newData.opStatus.faltou_cancelou || 0
        animatedNumbers.value['opPreDoc'] = newData.opStatus.pre_doc || 0
        animatedNumbers.value['opAgendado'] = newData.opStatus.agendado || 0
        animatedNumbers.value['opTrabalhando'] = newData.opStatus.trabalhando || 0
        animatedNumbers.value['opConcluido'] = newData.opStatus.concluido || 0
      }
      
      return // Sair sem animar
    }
    
    // Primeira vez: animar tudo
    hasAnimatedDashboard.value = true
    
    // Animar números do Status dos Cooperados
    animateNumber('active', newData.active || 0, 1000, 100)
    animateNumber('pending', newData.pending || 0, 1000, 100)
    animateNumber('blocked', newData.blocked || 0, 1000, 100)
    animateNumber('inactive', newData.inactive || 0, 1000, 100)
    animateNumber('all', newData.all || 0, 1000, 100)
    
    // Animar barras do Status dos Cooperados
    animateBarWidth('activeBar', (newData.active / total * 100) || 0, 1000, 100)
    animateBarWidth('pendingBar', (newData.pending / total * 100) || 0, 1000, 150)
    animateBarWidth('blockedBar', (newData.blocked / total * 100) || 0, 1000, 200)
    animateBarWidth('inactiveBar', (newData.inactive / total * 100) || 0, 1000, 250)
    
    // Animar Distribuição por Sexo
    animateNumber('sexoM', newData.sexo?.M || 0, 1000, 200)
    animateNumber('sexoF', newData.sexo?.F || 0, 1000, 200)
    
    // Animar Performance Global
    animateNumber('performanceScore', 87, 1000, 300)
    
    // Animar Documentação Pendente
    animateNumber('docFotoPerfil', 23, 1000, 200)
    animateNumber('docFotoUniforme', 15, 1000, 200)
    animateNumber('docAtestado', 17, 1000, 200)
    animateNumber('docAntecedentes', 11, 1000, 200)
    
    // Animar Indicadores de Performance
    animateNumber('indPontualidade', 92, 1000, 300)
    animateNumber('indPresenca', 96, 1000, 300)
    animateNumber('indCheckout', 88, 1000, 300)
    animateNumber('indAvaliacao', 4.7, 1000, 300)
    
    // Animar Engajamento
    animateNumber('engEventosAceitos', 342, 1000, 400)
    animateNumber('engEventosRecusados', 28, 1000, 400)
    animateNumber('engTaxaAceitacao', 92, 1000, 400)
    
    // Animar Status Operacional
    if (newData.opStatus) {
      animateNumber('opDisponivel', newData.opStatus.disponivel || 0, 1000, 500)
      animateNumber('opContratacao', newData.opStatus.contratacao || 0, 1000, 500)
      animateNumber('opFaltouCancelou', newData.opStatus.faltou_cancelou || 0, 1000, 500)
      animateNumber('opPreDoc', newData.opStatus.pre_doc || 0, 1000, 500)
      animateNumber('opAgendado', newData.opStatus.agendado || 0, 1000, 500)
      animateNumber('opTrabalhando', newData.opStatus.trabalhando || 0, 1000, 500)
      animateNumber('opConcluido', newData.opStatus.concluido || 0, 1000, 500)
    }
    
    // Animar Turnover e Retenção
    animateNumber('turnNovos', 45, 1000, 600)
    animateNumber('turnSaidas', 12, 1000, 600)
    animateNumber('turnSaldo', 33, 1000, 600)
    animateNumber('turnRetencao', 97.8, 1000, 600)

    // Widgets Adicionais - Disponibilidade
    animateNumber('widgetLivres', 127, 1000, 700)
    animateNumber('widgetAgendaCheia', 34, 1000, 700)
    animateNumber('widgetRecusas', 8, 1000, 700)

    // Widgets Adicionais - Qualidade
    animateNumber('widgetQualidadeCompletos', 87, 1000, 750)
    animateNumber('widgetQualidadePendencia', 9, 1000, 750)
    animateNumber('widgetQualidadeBloqueados', 3, 1000, 750)
    animateNumber('widgetQualidadeFotos', 1, 1000, 750)

    // Widgets Adicionais - Documentos Expirando
    animateNumber('widgetDocsAtestados', 12, 1000, 800)
    animateNumber('widgetDocsAntecedentes', 7, 1000, 800)
    animateNumber('widgetDocsCarteiras', 5, 1000, 800)
    animateNumber('widgetDocsTotal', 24, 1000, 800)

    // Widgets Adicionais - Risco Operacional
    animateNumber('widgetRiscoBaixo', 4892, 1000, 850)
    animateNumber('widgetRiscoMedio', 821, 1000, 850)
    animateNumber('widgetRiscoAlto', 189, 1000, 850)

    // Widgets Adicionais - Fidelização
    animateNumber('widgetFidelAtivo', 3421, 1000, 900)
    animateNumber('widgetFidelModerado', 1287, 1000, 900)
    animateNumber('widgetFidelRisco', 673, 1000, 900)
    animateNumber('widgetFidelInativo', 521, 1000, 900)

    // Widgets Adicionais - Novos Cooperados
    animateNumber('widgetNovosTotal', 156, 1000, 950)
    animateNumber('widgetNovosCompletos', 124, 1000, 950)
    animateNumber('widgetNovosIncompletos', 29, 1000, 950)
    animateNumber('widgetNovosBloqueados', 3, 1000, 950)
    animateNumber('widgetNovosTaxaConclusao', 79.5, 1000, 950)

    // Widgets Adicionais - Engajamento
    animateNumber('widgetEngConvites', 2847, 1000, 1000)
    animateNumber('widgetEngAceitos', 2419, 1000, 1000)
    animateNumber('widgetEngRecusados', 428, 1000, 1000)
    animateNumber('widgetEngTaxa', 85, 1000, 1000)
  }
}, { immediate: true })

// Watcher para animar barras de Funções Cadastradas
watch(() => funcoesRanking.value, (newFuncoes) => {
  if (newFuncoes && newFuncoes.length > 0 && currentTab.value === 'dashboard') {
    const maxCount = newFuncoes[0]?.count || 1
    newFuncoes.forEach((item, index) => {
      const widthPercent = (item.count / maxCount) * 100
      const key = `funcao_${item.name}_${index}`
      animateBarWidth(key, widthPercent, 1000, 400 + (index * 50))
      animateNumber(`funcaoCount_${item.name}_${index}`, item.count, 1000, 400 + (index * 50))
    })
  }
}, { immediate: true })

// Inicialização com restauração de estado via query e destaque do último visitado
onMounted(async () => {
  loadCacheFromSession()
  syncFromQuery()
  
  // Carregar estatísticas para o dashboard ao invés de carregar cooperados automaticamente
  await loadStatistics()
  
  // NÃO carregar cooperados automaticamente - usuário deve fazer busca ou clicar em card
  // Se vier do detalhe com pedido explícito de restauração, tenta restaurar do sessionStorage
  // const restored = restoreListStateIfRequested()
  // if (!restored) {
  //   await load()
  // }
  
  initializing.value = false
  restoreLastVisited()
})

// Quando voltar do detalhe (KeepAlive ativo), reativar a view preserva a página e filtros da query
onActivated(async () => {
  // Re-sincroniza com a query atual (mantendo página corrente)
  syncFromQuery()
  // Tenta restaurar estado salvo ao sair para o detalhe (sem depender da URL)
  const restored = restoreListStateIfRequested()
  // Se nada foi restaurado e não há dados carregados, faça um load
  if (!restored && !rows.value?.length) {
    await load()
  }
  // Reaplica destaque do último visitado
  lastVisitedId.value = null
  restoreLastVisited()
  // Em paginação oficial/híbrida, se a página atual divergir da última carregada, recarrega para alinhar
  if (!restored && isOfficialPaged.value && lastLoadedPage.value !== page.value) {
    await load()
  }
})

function pushStateToQuery() {
  // URL desativada: não escreve estado na querystring
  return
}

// Restauração leve do estado ao voltar do detalhe
function restoreListStateIfRequested(): boolean {
  try {
    // Evita que watchers reajam durante a restauração
    syncing.value = true
    const shouldRestore = sessionStorage.getItem('cooperados:restore') === '1'
    const raw = sessionStorage.getItem('cooperados:viewState')
    if (!shouldRestore || !raw) return false
    const state = JSON.parse(raw || '{}') as any
    const at = Number(state?.at || 0)
    const ttl = Number(state?.ttl || 0)
    if (!at || !ttl || (Date.now() - at > ttl)) {
      sessionStorage.removeItem('cooperados:restore')
      return false
    }
    // Atribui filtros/estado
    q.value = state.q || ''
    sortBy.value = state.sortBy || 'mais_recentes'
    page.value = Number(state.page || 1)
    limit.value = Number(state.limit || 18)
    currentTab.value = state.currentTab || 'todos'
    sexoFilter.value = state.sexoFilter || ''
    estadoFilter.value = state.estadoFilter || ''
    cidadeFilter.value = state.cidadeFilter || ''
    regiaoFilter.value = state.regiaoFilter || ''
    statusFilter.value = state.statusFilter || 'nenhum'
    opStatusFilter.value = state.opStatusFilter || ''
    useOpStatusTabs.value = !!state.useOpStatusTabs
    opTab.value = state.opTab || ''
    funcaoFilter.value = state.funcaoFilter || ''
    vencFotoPerfil.value = !!state.vencFotoPerfil
    vencAtestado.value = !!state.vencAtestado
    vencAntecedentes.value = !!state.vencAntecedentes
    vencUniforme.value = !!state.vencUniforme
    // Dataset
    rows.value = Array.isArray(state.rows) ? state.rows : []
    total.value = Number(state.total || 0)
    try { remoteCounts.value = state.remoteCounts || remoteCounts.value } catch {}
    try { officialHybridMode.value = !!state.officialHybridMode } catch {}
    try { appliedDocsORBackend.value = !!state.appliedDocsORBackend } catch {}
    // Limpa a flag para não restaurar em loops posteriores
    sessionStorage.removeItem('cooperados:restore')
    // Se restauramos alguma coisa, evitamos um refetch imediato
    return true
  } catch {
    return false
  } finally {
    // Libera watchers após a restauração
    syncing.value = false
  }
}

// Recarrega e sincroniza ao mudar de aba (situação)
watch(currentTab, (newTab) => {
  if (initializing.value || syncing.value) return
  // Resetar animações ao voltar para dashboard
  if (newTab === 'dashboard') {
    hasAnimatedDashboard.value = false
  }
  // Não recarregar ao mudar para 'todos', apenas atualizar estado
  if (newTab === 'todos') {
    page.value = 1
    pushStateToQuery()
    return
  }
  page.value = 1
  pushStateToQuery()
  // Em paginação local, apenas re-filtra em memória; evita refetch
  if (!isOfficialPaged.value) return
  scheduleLoad()
})
// Recarrega e sincroniza ao mudar sexo
watch(sexoFilter, () => {
  if (initializing.value || syncing.value) return
  page.value = 1
  pushStateToQuery()
  if (!isOfficialPaged.value) return
  scheduleLoad()
})
// Recarrega e sincroniza ao mudar ordenação
watch(sortBy, () => {
  if (initializing.value || syncing.value) return
  page.value = 1
  pushStateToQuery()
  if (!isOfficialPaged.value) return
  scheduleLoad()
})
// Recarrega e sincroniza ao alterar filtros de vencimento
watch([vencFotoPerfil, vencAtestado, vencAntecedentes, vencUniforme], () => { if (initializing.value || syncing.value) return; page.value = 1; pushStateToQuery(); scheduleLoad() }, { deep: true })
// Sincroniza filtros adicionais
watch(statusFilter, () => {
  if (initializing.value || syncing.value) return
  page.value = 1
  pushStateToQuery()
  if (!isOfficialPaged.value) return
  scheduleLoad()
})
watch(opStatusFilter, () => {
  if (initializing.value || syncing.value) return
  page.value = 1
  pushStateToQuery()
  if (!isOfficialPaged.value) return
  scheduleLoad()
})
watch(useOpStatusTabs, (val) => {
  if (initializing.value || syncing.value) return
  page.value = 1
  if (val) { opStatusFilter.value = '' } else { opTab.value = '' }
  pushStateToQuery()
  // Ao alternar o modo de abas operacionais, garantimos um dataset completo.
  // O cache torna essa operação instantânea quando já carregado.
  scheduleLoad()
})
watch(opTab, () => {
  if (initializing.value || syncing.value) return
  page.value = 1
  pushStateToQuery()
  if (!isOfficialPaged.value) return
  scheduleLoad()
})
watch(funcaoFilter, () => {
  if (initializing.value || syncing.value) return
  page.value = 1
  pushStateToQuery()
  if (!isOfficialPaged.value) return
  scheduleLoad()
})

// Recarregar estatísticas do dashboard quando filtros mudarem
watch(
  [sexoFilter, currentTab, opTab, estadoFilter, cidadeFilter, regiaoFilter, vencFotoPerfil, vencAtestado, vencAntecedentes, vencUniforme],
  () => {
    if (initializing.value || syncing.value) return
    // Recarregar estatísticas se estiver no dashboard
    if (currentTab.value === 'dashboard') {
      loadStatistics()
    }
  },
  { deep: true }
)

// Garante que a página atual esteja dentro do intervalo após mudanças no filtro (modo local, todas as abas)
watch(filteredRows, () => {
  try {
    if (initializing.value) return
    // Não clampa enquanto está carregando, para não interferir na navegação oficial/híbrida
    if (loading.value) return
    if (!isOfficialPaged.value) {
      const totalForPaging = filteredRows.value.length
      const tp = Math.max(1, Math.ceil(Math.max(0, totalForPaging) / Math.max(1, limit.value)))
      if (page.value > tp) page.value = tp
      if (page.value < 1) page.value = 1
    }
  } catch {}
})
watch(page, () => {
  if (initializing.value || syncing.value) return
  try { if (localStorage.getItem('debug:cooperados') === '1') console.log('[CooperadosView.watch] page ->', page.value, { isOfficialPaged: isOfficialPaged.value, totalPages: totalPages.value, hasKnownTotal: hasKnownTotal.value }) } catch {}
  pushStateToQuery()
  if (isOfficialPaged.value) scheduleLoad(0)
})
watch(limit, () => {
  if (initializing.value || syncing.value) return
  try { if (localStorage.getItem('debug:cooperados') === '1') console.log('[CooperadosView.watch] limit ->', limit.value, { isOfficialPaged: isOfficialPaged.value }) } catch {}
  pushStateToQuery()
  if (isOfficialPaged.value) scheduleLoad(0)
})
// Recarrega ao buscar por q ao pressionar Enter (já chama filter()); para mudança geral, debounce seria melhor

</script>

<template>
  <section class="">

    <Breadcrumbs />
    <header class="mb-6 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <h1 class="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Cooperados</h1>
        <span v-if="currentTab !== 'dashboard'"
          class="bg-blue-100 mt-1 text-blue-800 text-xs font-medium me-2 px-2.5 py-0.5 rounded-sm dark:bg-blue-900 dark:text-blue-300">
          Exibindo {{ headerRangeStart }} • {{ headerRangeEnd }} de {{ displayTotal }} registros</span>
      </div>
      <div class="flex items-center gap-2">
        <button @click="clearCooperadosCacheAndReload" class="px-2 py-1.5 rounded border border-zinc-300 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800" title="Limpar cache e recarregar">
          Recarregar dados
        </button>
        <ClientActions @print="printWindow" @create="onCreate" @action="onMoreAction" />
      </div>
    </header>

    <!-- Barra de progresso leve (não bloqueia) -->
    <div v-if="aggregating" class="mb-2">
      <div class="h-1 w-full bg-zinc-200 dark:bg-zinc-800 rounded">
        <div class="h-1 bg-blue-600 rounded" :style="{ width: Math.max(2, Math.min(100, progressPercent)) + '%' }"></div>
      </div>
      <div class="mt-1 text-xs text-zinc-500">{{ progressLabel || `Carregando (${progressPercent}%)…` }}</div>
    </div>

    <!-- Barra de busca e filtros em uma linha (padrão de Clientes) -->
    <div class="card p-4 ">
      <div class="flex flex-wrap items-center gap-4">
        <!-- Campo de busca com lupa e botão limpar (igual Clientes) -->
        <div class="relative flex-1">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg class="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input v-model="q" @keyup.enter="filter" @input="onSearchInput"
            class="w-full pl-10 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-600 dark:text-zinc-100"
            :class="q ? 'pr-10' : 'pr-4'" placeholder="Buscar por cooperado" />

          <!-- Badges de filtros ativos dentro do input -->
          <div class="absolute inset-y-0 right-8 flex items-center gap-1 overflow-x-auto max-w-[55%] pr-1">
            <!-- Cada badge é um botão clicável para limpar -->
            <button v-if="estadoFilter" @click="clearEstado" type="button"
              class="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200 hover:opacity-90 active:scale-[0.98]">
              UF: {{ estadoFilter }}
            </button>
            <button v-if="regiaoFilter" @click="clearRegiao" type="button"
              class="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200 hover:opacity-90 active:scale-[0.98]">
              Região: {{ regiaoFilter }}
            </button>
            <button v-if="cidadeFilter" @click="clearCidade" type="button"
              class="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200 hover:opacity-90 active:scale-[0.98]">
              Cidade: {{ cidadeFilter }}
            </button>
            <button v-if="sexoFilter" @click="clearSexo" type="button"
              class="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 hover:opacity-90 active:scale-[0.98]">
              {{ sexoLabel(sexoFilter) }}
            </button>
            <button v-if="statusFilter !== 'nenhum'" @click="clearStatus" type="button"
              class="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200 hover:opacity-90 active:scale-[0.98]">
              Status: {{ statusFilter }}
            </button>
            <button v-if="funcaoFilter" @click="clearFuncao" type="button"
              class="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200 hover:opacity-90 active:scale-[0.98]">
              Função: {{ funcaoFilter }}
            </button>

            <button v-if="opStatusFilter" @click="clearOpStatus" type="button"
              class="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200 hover:opacity-90 active:scale-[0.98]">
              Status Op.: {{ OP_STATUS_LABEL[opStatusFilter] || opStatusFilter }}
            </button>

            <!-- Badges: vencimentos de documentos -->
            <button v-if="vencFotoPerfil" @click="vencFotoPerfil = false" type="button"
              class="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200 hover:opacity-90 active:scale-[0.98]">
              Foto perfil venc.
            </button>
            <button v-if="vencAtestado" @click="vencAtestado = false" type="button"
              class="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200 hover:opacity-90 active:scale-[0.98]">
              Atestado venc.
            </button>
            <button v-if="vencAntecedentes" @click="vencAntecedentes = false" type="button"
              class="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200 hover:opacity-90 active:scale-[0.98]">
              Antecedentes venc.
            </button>
            <button v-if="vencUniforme" @click="vencUniforme = false" type="button"
              class="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200 hover:opacity-90 active:scale-[0.98]">
              Uniforme venc.
            </button>

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
          <button @click="onToggleFuncFilter"
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
                  <!-- Opções vindas do backend -->
                  <div class="w-full" v-if="funcoesLoading">
                    <span class="text-xs text-zinc-500">carregando…</span>
                  </div>
                  <template v-else>
                    <div v-if="!funcoesOptions || funcoesOptions.length === 0" class="w-full flex items-center justify-between gap-2 text-xs text-zinc-500">
                      <span>Nenhuma função encontrada</span>
                      <button @click.stop="ensureFuncoesLoaded(true)" class="px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-700">recarregar</button>
                    </div>
                    <button v-for="opt in funcoesOptions" :key="opt.id" @click="(selectedFuncaoId = opt.id, funcaoFilter = opt.name)"
                      class="px-2 py-1 text-[11px] rounded border transition-colors"
                      :class="funcaoFilter === opt.name ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">
                      {{ opt.name }}
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
                  <button @click="sortBy = 'nome'; filter()"
                    class="px-2 py-1 text-xs rounded border transition-colors"
                    :class="sortBy === 'nome' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">nome</button>
                  <button @click="sortBy = 'mais_recentes'; filter()"
                    class="px-2 py-1 text-xs rounded border transition-colors"
                    :class="sortBy === 'mais_recentes' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">mais recentes</button>
                  <button @click="sortBy = 'codigo'; filter()"
                    class="px-2 py-1 text-xs rounded border transition-colors"
                    :class="sortBy === 'codigo' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">código</button>
                </div>
              </div>

              <div>
                <h3 class="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-2">Sexo</h3>
                <div class="flex gap-1">
                  <button @click="sexoFilter = ''; loadStatistics()" class="px-2 py-1 text-xs rounded border transition-colors"
                    :class="sexoFilter === '' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Todos</button>
                  <button @click="sexoFilter = 'M'; loadStatistics()" class="px-2 py-1 text-xs rounded border transition-colors"
                    :class="sexoFilter === 'M' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Masculino ({{ totalSexoM }})</button>
                  <button @click="sexoFilter = 'F'; loadStatistics()" class="px-2 py-1 text-xs rounded border transition-colors"
                    :class="sexoFilter === 'F' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Feminino ({{ totalSexoF }})</button>
                </div>
              </div>

              <div>
                <h3 class="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-2">Documentos (vencimentos)</h3>
                <div class="flex flex-wrap gap-1">
                  <button @click="vencFotoPerfil = !vencFotoPerfil; filter()" class="px-2 py-1 text-xs rounded border transition-colors"
                    :class="vencFotoPerfil ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Foto perfil</button>
                  <button @click="vencAtestado = !vencAtestado; filter()" class="px-2 py-1 text-xs rounded border transition-colors"
                    :class="vencAtestado ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Atestado médico</button>
                  <button @click="vencAntecedentes = !vencAntecedentes; filter()" class="px-2 py-1 text-xs rounded border transition-colors"
                    :class="vencAntecedentes ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Antecedentes</button>
                  <button @click="vencUniforme = !vencUniforme; filter()" class="px-2 py-1 text-xs rounded border transition-colors"
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
                </div>
                <div v-if="!useOpStatusTabs" class="flex flex-wrap gap-1">
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
                      ({{ uiRegiaoAll }})</button>
                    <button v-for="r in SP_REGION_LABELS" :key="r"
                      @click="regiaoFilter = r" class="px-2 py-1 text-[11px] rounded border transition-colors"
                      :class="regiaoFilter === r ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">{{
                      r }} ({{ (uiRegiaoCounts && uiRegiaoCounts[r]) || 0 }})</button>
                  </template>
                  <template v-else>
                    <button @click="regiaoFilter = ''" class="px-2 py-1 text-[11px] rounded border transition-colors"
                      :class="regiaoFilter === '' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Todas
                      ({{ uiRegiaoAll }})</button>
                    <button @click="regiaoFilter = 'N'" class="px-2 py-1 text-[11px] rounded border transition-colors"
                      :class="regiaoFilter === 'N' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Norte
                      ({{ (uiRegiaoCounts && uiRegiaoCounts.N) || 0 }})</button>
                    <button @click="regiaoFilter = 'NE'" class="px-2 py-1 text-[11px] rounded border transition-colors"
                      :class="regiaoFilter === 'NE' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Nordeste
                      ({{ (uiRegiaoCounts && uiRegiaoCounts.NE) || 0 }})</button>
                    <button @click="regiaoFilter = 'CO'" class="px-2 py-1 text-[11px] rounded border transition-colors"
                      :class="regiaoFilter === 'CO' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Centro
                      Oeste ({{ (uiRegiaoCounts && uiRegiaoCounts.CO) || 0 }})</button>
                    <button @click="regiaoFilter = 'SE'" class="px-2 py-1 text-[11px] rounded border transition-colors"
                      :class="regiaoFilter === 'SE' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Sudeste
                      ({{ (uiRegiaoCounts && uiRegiaoCounts.SE) || 0 }})</button>
                    <button @click="regiaoFilter = 'S'" class="px-2 py-1 text-[11px] rounded border transition-colors"
                      :class="regiaoFilter === 'S' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Sul
                      ({{ (uiRegiaoCounts && uiRegiaoCounts.S) || 0 }})</button>
                  </template>
                </div>
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

    <!-- Tabs de Situação (Dashboard, Todos, Ativos, etc) -->
    <div class="mb-3 mt-3">
      <nav class="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-700">
        <template v-if="!useOpStatusTabs">
          <div class="flex gap-2">
            <button @click="currentTab = 'dashboard'; loadStatistics()"
              :class="currentTab === 'dashboard' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'"
              class="px-3 py-2 text-sm">📊 Dashboard</button>
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
        <div class="ml-auto flex items-center gap-2 text-sm" v-if="currentTab !== 'dashboard'">
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

    <!-- Dashboard: Gráficos (exibido quando currentTab === 'dashboard') -->
    <div v-if="currentTab === 'dashboard'" class="space-y-6 mt-4">
      <div v-if="loadingStatistics" class="space-y-6">
        <!-- Skeleton Loader -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:col-span-2">
            <!-- Skeleton Status dos Cooperados -->
            <div class="card p-6 animate-pulse">
              <div class="h-5 bg-zinc-200 dark:bg-zinc-700 rounded w-2/3 mb-4"></div>
              <div class="space-y-3">
                <div class="h-12 bg-zinc-200 dark:bg-zinc-700 rounded"></div>
                <div class="h-12 bg-zinc-200 dark:bg-zinc-700 rounded"></div>
                <div class="h-12 bg-zinc-200 dark:bg-zinc-700 rounded"></div>
                <div class="h-12 bg-zinc-200 dark:bg-zinc-700 rounded"></div>
              </div>
            </div>
            
            <!-- Skeleton Coluna com Sexo e Documentação -->
            <div class="space-y-4">
              <div class="card p-4 animate-pulse">
                <div class="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-1/2 mb-3"></div>
                <div class="space-y-2">
                  <div class="h-20 bg-zinc-200 dark:bg-zinc-700 rounded"></div>
                  <div class="h-20 bg-zinc-200 dark:bg-zinc-700 rounded"></div>
                </div>
              </div>
              <div class="card p-4 animate-pulse">
                <div class="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-1/2 mb-3"></div>
                <div class="space-y-2">
                  <div class="h-16 bg-zinc-200 dark:bg-zinc-700 rounded"></div>
                  <div class="h-16 bg-zinc-200 dark:bg-zinc-700 rounded"></div>
                  <div class="h-16 bg-zinc-200 dark:bg-zinc-700 rounded"></div>
                </div>
              </div>
            </div>
            
            <!-- Skeleton Performance Global -->
            <div class="card p-6 animate-pulse">
              <div class="h-5 bg-zinc-200 dark:bg-zinc-700 rounded w-2/3 mb-4"></div>
              <div class="h-40 bg-zinc-200 dark:bg-zinc-700 rounded-full w-40 mx-auto mb-4"></div>
              <div class="grid grid-cols-2 gap-2">
                <div class="h-20 bg-zinc-200 dark:bg-zinc-700 rounded"></div>
                <div class="h-20 bg-zinc-200 dark:bg-zinc-700 rounded"></div>
                <div class="h-20 bg-zinc-200 dark:bg-zinc-700 rounded"></div>
                <div class="h-20 bg-zinc-200 dark:bg-zinc-700 rounded"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="statisticsData" class="space-y-6">
        <!-- Conteúdo dos Gráficos -->
        <!-- Grid Principal: 2 colunas -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <!-- Grid de 3 colunas: Status dos Cooperados + Status Operacional | Coluna Sexo+Documentação | Performance Global -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:col-span-2">
          <!-- Coluna: Status dos Cooperados + Status Operacional -->
          <div class="space-y-4">
          <!-- Status dos Cooperados -->
          <div class="card p-6 dashboard-card" style="animation-delay: 0.01s">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold text-zinc-800 dark:text-zinc-100">Status dos Cooperados</h3>
              <select class="text-xs px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-500">
                <option value="hoje">Hoje</option>
                <option value="15dias">Há 15 dias</option>
                <option value="30dias">Há 30 dias</option>
              </select>
            </div>
            <div class="space-y-3">
              <button @click="onStatCardClick('ativos')" class="w-full text-left hover:bg-blue-50 dark:hover:bg-blue-900/10 rounded-lg p-2 -mx-2 transition-colors">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-sm text-zinc-600 dark:text-zinc-400">Ativos</span>
                  <span class="text-sm font-bold text-blue-700 dark:text-blue-400 transition-all duration-300">{{ animatedNumbers['active'] || 0 }}</span>
                </div>
                <div class="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2">
                  <div class="bg-blue-600 h-2 rounded-full transition-all duration-700" :style="`width: ${animatedBarWidths['activeBar'] || 0}%`"></div>
                </div>
              </button>
              <button @click="onStatCardClick('pendentes')" class="w-full text-left hover:bg-blue-50 dark:hover:bg-blue-900/10 rounded-lg p-2 -mx-2 transition-colors">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-sm text-zinc-600 dark:text-zinc-400">Pendentes</span>
                  <span class="text-sm font-bold text-blue-700 dark:text-blue-400">{{ animatedNumbers['pending'] || 0 }}</span>
                </div>
                <div class="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2">
                  <div class="bg-blue-600 h-2 rounded-full transition-all duration-700" :style="`width: ${animatedBarWidths['pendingBar'] || 0}%`"></div>
                </div>
              </button>
              <button @click="onStatCardClick('bloqueados')" class="w-full text-left hover:bg-blue-50 dark:hover:bg-blue-900/10 rounded-lg p-2 -mx-2 transition-colors">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-sm text-zinc-600 dark:text-zinc-400">Bloqueados</span>
                  <span class="text-sm font-bold text-blue-700 dark:text-blue-400">{{ animatedNumbers['blocked'] || 0 }}</span>
                </div>
                <div class="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2">
                  <div class="bg-blue-600 h-2 rounded-full transition-all duration-700" :style="`width: ${animatedBarWidths['blockedBar'] || 0}%`"></div>
                </div>
              </button>
              <button @click="onStatCardClick('inativos')" class="w-full text-left hover:bg-blue-50 dark:hover:bg-blue-900/10 rounded-lg p-2 -mx-2 transition-colors">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-sm text-zinc-600 dark:text-zinc-400">Inativos</span>
                  <span class="text-sm font-bold text-blue-700 dark:text-blue-400">{{ animatedNumbers['inactive'] || 0 }}</span>
                </div>
                <div class="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2">
                  <div class="bg-blue-600 h-2 rounded-full transition-all duration-700" :style="`width: ${animatedBarWidths['inactiveBar'] || 0}%`"></div>
                </div>
              </button>
            </div>
            <div class="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700">
              <button @click="onStatCardClick('todos')" class="w-full text-left hover:bg-blue-50 dark:hover:bg-blue-900/10 rounded-lg p-2 -mx-2 transition-colors">
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium text-zinc-600 dark:text-zinc-400">Total</span>
                  <span class="text-2xl font-bold text-blue-700 dark:text-blue-400">{{ animatedNumbers['all'] || 0 }}</span>
                </div>
              </button>
            </div>
          </div>

          <!-- Status Operacional - Versão Compacta -->
          <div v-if="statisticsData.opStatus" class="card p-4 dashboard-card" style="animation-delay: 0.02s">
            <h3 class="text-sm font-semibold text-zinc-800 dark:text-zinc-100 mb-3">Status Operacional</h3>
            <div class="grid grid-cols-2 gap-2">
              <!-- Disponível -->
              <button 
                @click="onStatCardClick('disponivel', 'opStatus')"
                class="bg-zinc-50 dark:bg-zinc-800/50 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-md p-2 transition-all text-left border border-zinc-200 dark:border-zinc-700">
                <div class="flex items-center gap-2">
                  <div class="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                    <svg class="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-xs text-zinc-600 dark:text-zinc-400 truncate">Disponível</div>
                    <div class="text-lg font-bold text-emerald-700 dark:text-emerald-400">{{ animatedNumbers['opDisponivel'] || 0 }}</div>
                  </div>
                </div>
              </button>

              <!-- Contratação -->
              <button 
                @click="onStatCardClick('contratacao', 'opStatus')"
                class="bg-zinc-50 dark:bg-zinc-800/50 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md p-2 transition-all text-left border border-zinc-200 dark:border-zinc-700">
                <div class="flex items-center gap-2">
                  <div class="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                    <svg class="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6" />
                    </svg>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-xs text-zinc-600 dark:text-zinc-400 truncate">Contratação</div>
                    <div class="text-lg font-bold text-blue-700 dark:text-blue-400">{{ animatedNumbers['opContratacao'] || 0 }}</div>
                  </div>
                </div>
              </button>

              <!-- Faltou/Cancelou -->
              <button 
                @click="onStatCardClick('faltou_cancelou', 'opStatus')"
                class="bg-zinc-50 dark:bg-zinc-800/50 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md p-2 transition-all text-left border border-zinc-200 dark:border-zinc-700">
                <div class="flex items-center gap-2">
                  <div class="w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                    <svg class="w-3 h-3 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-xs text-zinc-600 dark:text-zinc-400 truncate">Faltou/Cancel.</div>
                    <div class="text-lg font-bold text-red-700 dark:text-red-400">{{ animatedNumbers['opFaltouCancelou'] || 0 }}</div>
                  </div>
                </div>
              </button>

              <!-- Pré-doc -->
              <button 
                @click="onStatCardClick('pre_doc', 'opStatus')"
                class="bg-zinc-50 dark:bg-zinc-800/50 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-md p-2 transition-all text-left border border-zinc-200 dark:border-zinc-700">
                <div class="flex items-center gap-2">
                  <div class="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                    <svg class="w-3 h-3 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6" />
                    </svg>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-xs text-zinc-600 dark:text-zinc-400 truncate">Pré-doc</div>
                    <div class="text-lg font-bold text-amber-700 dark:text-amber-400">{{ animatedNumbers['opPreDoc'] || 0 }}</div>
                  </div>
                </div>
              </button>

              <!-- Agendado -->
              <button 
                @click="onStatCardClick('agendado', 'opStatus')"
                class="bg-zinc-50 dark:bg-zinc-800/50 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-md p-2 transition-all text-left border border-zinc-200 dark:border-zinc-700">
                <div class="flex items-center gap-2">
                  <div class="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                    <svg class="w-3 h-3 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3" />
                    </svg>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-xs text-zinc-600 dark:text-zinc-400 truncate">Agendado</div>
                    <div class="text-lg font-bold text-purple-700 dark:text-purple-400">{{ animatedNumbers['opAgendado'] || 0 }}</div>
                  </div>
                </div>
              </button>

              <!-- Trabalhando -->
              <button 
                @click="onStatCardClick('trabalhando', 'opStatus')"
                class="bg-zinc-50 dark:bg-zinc-800/50 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 rounded-md p-2 transition-all text-left border border-zinc-200 dark:border-zinc-700">
                <div class="flex items-center gap-2">
                  <div class="w-6 h-6 rounded-full bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center flex-shrink-0">
                    <svg class="w-3 h-3 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.931 23.931 0 0112 15" />
                    </svg>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-xs text-zinc-600 dark:text-zinc-400 truncate">Trabalhando</div>
                    <div class="text-lg font-bold text-cyan-700 dark:text-cyan-400">{{ animatedNumbers['opTrabalhando'] || 0 }}</div>
                  </div>
                </div>
              </button>

              <!-- Concluído -->
              <button 
                @click="onStatCardClick('concluido', 'opStatus')"
                class="bg-zinc-50 dark:bg-zinc-800/50 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-md p-2 transition-all text-left border border-zinc-200 dark:border-zinc-700 col-span-2">
                <div class="flex items-center gap-2">
                  <div class="w-6 h-6 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center flex-shrink-0">
                    <svg class="w-3 h-3 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4" />
                    </svg>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-xs text-zinc-600 dark:text-zinc-400 truncate">Concluído</div>
                    <div class="text-lg font-bold text-teal-700 dark:text-teal-400">{{ animatedNumbers['opConcluido'] || 0 }}</div>
                  </div>
                </div>
              </button>
            </div>
          </div>
          </div>

          <!-- Coluna: Distribuição por Sexo + Documentação Pendente -->
          <div class="space-y-4 dashboard-card" style="animation-delay: 0.2s">
            <!-- Distribuição por Sexo -->
            <div class="card p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-base font-semibold text-zinc-800 dark:text-zinc-100">Distribuição por Sexo</h3>
              <select class="text-xs px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-500">
                <option value="hoje">Hoje</option>
                <option value="15dias">Há 15 dias</option>
                <option value="30dias">Há 30 dias</option>
              </select>
            </div>
            <div class="space-y-2">
              <!-- Card Masculino -->
              <button 
                @click="onStatCardClick('M', 'sexo')"
                class="w-full cursor-pointer transition-all p-3 rounded-lg text-left"
                :class="sexoFilter === 'M' ? 'bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border border-blue-300 dark:border-blue-700' : 'bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'"
              >
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs font-medium text-blue-900 dark:text-blue-100">Masculino</span>
                  <div class="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                    <svg class="w-3 h-3 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z"/>
                    </svg>
                  </div>
                </div>
                <div class="text-xl font-bold text-blue-700 dark:text-blue-400">{{ animatedNumbers['sexoM'] || 0 }}</div>
                <div class="text-xs text-blue-600 dark:text-blue-400">{{ statisticsData.all && statisticsData.sexo?.M ? Math.round((statisticsData.sexo.M / statisticsData.all) * 100) : 0 }}% do total</div>
              </button>

              <!-- Card Feminino -->
              <button 
                @click="onStatCardClick('F', 'sexo')"
                class="w-full cursor-pointer transition-all p-3 rounded-lg text-left"
                :class="sexoFilter === 'F' ? 'bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-900/20 dark:to-rose-900/20 border border-pink-300 dark:border-pink-700' : 'bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'"
              >
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs font-medium text-pink-900 dark:text-pink-100">Feminino</span>
                  <div class="w-6 h-6 rounded-full bg-pink-100 dark:bg-pink-900/50 flex items-center justify-center">
                    <svg class="w-3 h-3 text-pink-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm0 10a3 3 0 100-6 3 3 0 000 6zm0 2a5 5 0 100-10 5 5 0 000 10zm1 2v3a1 1 0 11-2 0v-3a1 1 0 112 0z" clip-rule="evenodd"/>
                    </svg>
                  </div>
                </div>
                <div class="text-xl font-bold text-pink-700 dark:text-pink-400">{{ animatedNumbers['sexoF'] || 0 }}</div>
                <div class="text-xs text-pink-600 dark:text-pink-400">{{ statisticsData.all && statisticsData.sexo?.F ? Math.round((statisticsData.sexo.F / statisticsData.all) * 100) : 0 }}% do total</div>
              </button>
            </div>
          </div>

          <!-- Documentação Pendente -->
          <div class="card p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-base font-semibold text-zinc-800 dark:text-zinc-100">Documentação</h3>
            </div>
            
            <!-- Resumo Geral -->
            <div v-if="documentStatistics" class="mb-3 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
              <div class="flex items-center justify-between">
                <div class="flex-1">
                  <div class="text-xs text-zinc-600 dark:text-zinc-400">Pendentes</div>
                  <div class="text-2xl font-bold text-amber-700 dark:text-amber-400">{{ documentStatistics.pendentes || 0 }}</div>
                </div>
                <div class="flex-1 text-right">
                  <div class="text-xs text-zinc-600 dark:text-zinc-400">Vencidos</div>
                  <div class="text-2xl font-bold text-red-700 dark:text-red-400">{{ documentStatistics.vencidos || 0 }}</div>
                </div>
              </div>
            </div>
            
            <div class="grid grid-cols-2 gap-2">
              <!-- Foto de Perfil -->
              <div class="border border-zinc-200 dark:border-zinc-700 rounded-lg p-3">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs font-medium text-orange-900 dark:text-orange-100">Foto Perfil</span>
                  <div class="w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center">
                    <svg class="w-3 h-3 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <div class="flex-1">
                    <div class="text-sm font-bold text-amber-700 dark:text-amber-400">{{ documentStatistics?.porTipo?.foto_perfil?.pendentes || 0 }}</div>
                    <div class="text-[10px] text-amber-600 dark:text-amber-400">pend.</div>
                  </div>
                  <div class="flex-1 text-right">
                    <div class="text-sm font-bold text-red-700 dark:text-red-400">{{ documentStatistics?.porTipo?.foto_perfil?.vencidos || 0 }}</div>
                    <div class="text-[10px] text-red-600 dark:text-red-400">venc.</div>
                  </div>
                </div>
              </div>

              <!-- Foto de Uniforme -->
              <div class="border border-zinc-200 dark:border-zinc-700 rounded-lg p-3">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs font-medium text-blue-900 dark:text-blue-100">Foto Uniforme</span>
                  <div class="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                    <svg class="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <div class="flex-1">
                    <div class="text-sm font-bold text-amber-700 dark:text-amber-400">{{ documentStatistics?.porTipo?.foto_uniforme?.pendentes || 0 }}</div>
                    <div class="text-[10px] text-amber-600 dark:text-amber-400">pend.</div>
                  </div>
                  <div class="flex-1 text-right">
                    <div class="text-sm font-bold text-red-700 dark:text-red-400">{{ documentStatistics?.porTipo?.foto_uniforme?.vencidos || 0 }}</div>
                    <div class="text-[10px] text-red-600 dark:text-red-400">venc.</div>
                  </div>
                </div>
              </div>

              <!-- Atestado Médico -->
              <div class="border border-zinc-200 dark:border-zinc-700 rounded-lg p-3">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs font-medium text-red-900 dark:text-red-100">Atestado Médico</span>
                  <div class="w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center">
                    <svg class="w-3 h-3 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <div class="flex-1">
                    <div class="text-sm font-bold text-amber-700 dark:text-amber-400">{{ documentStatistics?.porTipo?.atestado?.pendentes || 0 }}</div>
                    <div class="text-[10px] text-amber-600 dark:text-amber-400">pend.</div>
                  </div>
                  <div class="flex-1 text-right">
                    <div class="text-sm font-bold text-red-700 dark:text-red-400">{{ documentStatistics?.porTipo?.atestado?.vencidos || 0 }}</div>
                    <div class="text-[10px] text-red-600 dark:text-red-400">venc.</div>
                  </div>
                </div>
              </div>

              <!-- Antecedentes Criminais -->
              <div class="border border-zinc-200 dark:border-zinc-700 rounded-lg p-3">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs font-medium text-amber-900 dark:text-amber-100">Antecedentes</span>
                  <div class="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                    <svg class="w-3 h-3 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <div class="flex-1">
                    <div class="text-sm font-bold text-amber-700 dark:text-amber-400">{{ documentStatistics?.porTipo?.antecedentes?.pendentes || 0 }}</div>
                    <div class="text-[10px] text-amber-600 dark:text-amber-400">pend.</div>
                  </div>
                  <div class="flex-1 text-right">
                    <div class="text-sm font-bold text-red-700 dark:text-red-400">{{ documentStatistics?.porTipo?.antecedentes?.vencidos || 0 }}</div>
                    <div class="text-[10px] text-red-600 dark:text-red-400">venc.</div>
                  </div>
                </div>
              </div>
            </div>
            </div>

          <!-- Engajamento -->
          
            <!-- Widget: Histórico de Engajamento -->
            <div class="card p-6 dashboard-card" style="animation-delay: 0.05s">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-base font-semibold text-zinc-800 dark:text-zinc-100">Histórico de Engajamento</h3>
                <select class="text-xs px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-500">
                  <option>Últimos 6 meses</option>
                  <option>Este ano</option>
                </select>
              </div>
              <div class="space-y-4">
                <div class="grid grid-cols-3 gap-3">
                  <div class="text-center p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                    <div class="text-2xl font-bold text-blue-700 dark:text-blue-400">{{ animatedNumbers['widgetEngConvites']?.toLocaleString() || 0 }}</div>
                    <div class="text-xs text-zinc-600 dark:text-zinc-400 mt-1">Convites</div>
                  </div>
                  <div class="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <div class="text-2xl font-bold text-green-700 dark:text-green-400">{{ animatedNumbers['widgetEngAceitos']?.toLocaleString() || 0 }}</div>
                    <div class="text-xs text-zinc-600 dark:text-zinc-400 mt-1">Aceitos</div>
                  </div>
                  <div class="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                    <div class="text-2xl font-bold text-red-700 dark:text-red-400">{{ animatedNumbers['widgetEngRecusados'] || 0 }}</div>
                    <div class="text-xs text-zinc-600 dark:text-zinc-400 mt-1">Recusados</div>
                  </div>
                </div>
                <div class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Taxa de Engajamento</span>
                    <span class="text-2xl font-bold text-blue-700 dark:text-blue-400">{{ animatedNumbers['widgetEngTaxa'] || 0 }}%</span>
                  </div>
                  <div class="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2">
                    <div class="bg-blue-600 h-2 rounded-full transition-all duration-700" :style="`width: ${animatedNumbers['widgetEngTaxa'] || 0}%`"></div>
                  </div>
                  <div class="mt-2 flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clip-rule="evenodd" />
                    </svg>
                    +3.2% vs mês anterior
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- Fim Coluna: Sexo + Documentação + Engajamento -->

          <!-- Performance Global -->
           
        <div class="space-y-4">

        <div class="card p-4 dashboard-card" style="animation-delay: 0.06s">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold text-indigo-900 dark:text-indigo-100">Performance Global</h3>
              <select class="text-xs px-2 py-1 rounded-md border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="hoje">Hoje</option>
                <option value="15dias">Há 15 dias</option>
                <option value="30dias">Há 30 dias</option>
              </select>
            </div>
            <div class="flex items-center justify-center mb-4">
              <div class="relative w-40 h-40">
                <svg viewBox="0 0 100 100" class="transform -rotate-90">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="10" class="text-indigo-200 dark:text-indigo-900/50"></circle>
                  <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="10" class="text-indigo-600" 
                    stroke-dasharray="246 282.6" stroke-linecap="round"></circle>
                </svg>
                <div class="absolute inset-0 flex items-center justify-center">
                  <div class="text-center">
                    <div class="text-4xl font-bold text-indigo-700 dark:text-indigo-400">{{ animatedNumbers['performanceScore'] || 0 }}</div>
                    <div class="text-xs text-indigo-600 dark:text-indigo-400">/100</div>
                  </div>
                </div>
              </div>
            </div>
            <div class="text-center mb-4">
              <div class="inline-flex items-center gap-2 px-3 py-1 bg-green-100 dark:bg-green-900/30 rounded-full">
                <svg class="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clip-rule="evenodd" />
                </svg>
                <span class="text-xs font-medium text-green-700 dark:text-green-400">+5 pontos vs período anterior</span>
              </div>
            </div>

            <!-- Indicadores de Performance -->
            <div class="pt-4 border-t border-indigo-200 dark:border-indigo-800">
              <h4 class="text-sm font-semibold text-indigo-900 dark:text-indigo-100 mb-3">Indicadores</h4>
              <div class="grid grid-cols-2 gap-2">
                <!-- Pontualidade -->
                <div class="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/30 dark:to-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800/50">
                  <div class="flex items-center gap-1.5 mb-1.5">
                    <svg class="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span class="text-xs font-medium text-green-700 dark:text-green-400">Pontualidade</span>
                  </div>
                  <div class="text-xl font-bold text-green-700 dark:text-green-400">{{ animatedNumbers['indPontualidade'] || 0 }}%</div>
                </div>
                
                <!-- Presença -->
                <div class="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800/50">
                  <div class="flex items-center gap-1.5 mb-1.5">
                    <svg class="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span class="text-xs font-medium text-blue-700 dark:text-blue-400">Presença</span>
                  </div>
                  <div class="text-xl font-bold text-blue-700 dark:text-blue-400">{{ animatedNumbers['indPresenca'] || 0 }}%</div>
                </div>
                
                <!-- Check-out -->
                <div class="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/30 dark:to-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800/50">
                  <div class="flex items-center gap-1.5 mb-1.5">
                    <svg class="w-3.5 h-3.5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <span class="text-xs font-medium text-purple-700 dark:text-purple-400">Check-out</span>
                  </div>
                  <div class="text-xl font-bold text-purple-700 dark:text-purple-400">{{ animatedNumbers['indCheckout'] || 0 }}%</div>
                </div>
                
                <!-- Avaliação -->
                <div class="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950/30 dark:to-amber-900/20 rounded-lg p-3 border border-amber-200 dark:border-amber-800/50">
                  <div class="flex items-center gap-1.5 mb-1.5">
                    <svg class="w-3.5 h-3.5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span class="text-xs font-medium text-amber-700 dark:text-amber-400">Avaliação</span>
                  </div>
                  <div class="text-xl font-bold text-amber-700 dark:text-amber-400">{{ (animatedNumbers['indAvaliacao'] || 0).toFixed(1) }}/5</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Turnover e Retenção -->
         <div class="grid grid-cols-1 lg:grid-cols-1 gap-6">
            
            <!-- Widget: Funil de Novos Cooperados -->
            <div class="card p-6 dashboard-card" style="animation-delay: 0.07s">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-base font-semibold text-zinc-800 dark:text-zinc-100">Novos Cooperados</h3>
                <select class="text-xs px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-500">
                  <option>Últimos 30 dias</option>
                  <option>Últimos 7 dias</option>
                  <option>Hoje</option>
                </select>
              </div>
              <div class="space-y-3">
                <div class="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div>
                    <div class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Total de cadastros</div>
                    <div class="text-2xl font-bold text-blue-700 dark:text-blue-400 mt-1">{{ animatedNumbers['widgetNovosTotal'] || 0 }}</div>
                  </div>
                  <svg class="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                </div>
                <div class="grid grid-cols-3 gap-3">
                  <div class="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
                    <div class="text-2xl font-bold text-green-700 dark:text-green-400">{{ animatedNumbers['widgetNovosCompletos'] || 0 }}</div>
                    <div class="text-xs text-zinc-600 dark:text-zinc-400 mt-1">Completos</div>
                  </div>
                  <div class="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-center">
                    <div class="text-2xl font-bold text-amber-700 dark:text-amber-400">{{ animatedNumbers['widgetNovosIncompletos'] || 0 }}</div>
                    <div class="text-xs text-zinc-600 dark:text-zinc-400 mt-1">Incompletos</div>
                  </div>
                  <div class="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-center">
                    <div class="text-2xl font-bold text-red-700 dark:text-red-400">{{ animatedNumbers['widgetNovosBloqueados'] || 0 }}</div>
                    <div class="text-xs text-zinc-600 dark:text-zinc-400 mt-1">Bloqueados</div>
                  </div>
                </div>
                <div class="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
                  <div class="flex items-center justify-between text-sm">
                    <span class="text-zinc-600 dark:text-zinc-400">Taxa de conclusão</span>
                    <span class="font-semibold text-green-700 dark:text-green-400">{{ (animatedNumbers['widgetNovosTaxaConclusao'] || 0).toFixed(1) }}%</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        </div>

        <!-- Funções Cadastradas (ocupa 2 colunas) -->
        <div class="card p-6 lg:col-span-2 dashboard-card" style="animation-delay: 0.08s">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-4">
              <h3 class="text-xl font-semibold text-zinc-800 dark:text-zinc-100">Funções Cadastradas</h3>
              <select v-model="funcoesRankingLimit" @change="loadFuncoesRanking" class="text-xs px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-500">
                <option :value="10">Top 10</option>
                <option :value="20">Top 20</option>
              </select>
            </div>
            <span class="text-sm text-zinc-500 dark:text-zinc-400">{{ funcoesRanking.length }} funções · {{ totalCooperadosRanking }} cooperados</span>
          </div>
          
          <div v-if="funcoesRanking.length === 0" class="text-center py-12 text-zinc-500 dark:text-zinc-400">
            <svg class="w-16 h-16 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path>
            </svg>
            <p class="text-base">Nenhuma função encontrada</p>
          </div>

          <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            <button 
              v-for="(item, index) in funcoesRanking" 
              :key="item.name" 
              @click="onStatCardClick(item.name, 'funcao')"
              class="flex items-center gap-2 p-3 rounded-lg transition-all text-left"
              :class="funcaoFilter === item.name 
                ? 'bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border border-blue-300 dark:border-blue-700' 
                : 'bg-zinc-50 dark:bg-zinc-800/50 border border-transparent hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700/50'"
            >
              <!-- Função e Barra -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between mb-1.5">
                  <span class="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate" :title="item.name">
                    {{ item.name }}
                  </span>
                  <span class="text-sm font-bold text-zinc-900 dark:text-zinc-100 ml-2">
                    {{ animatedNumbers[`funcaoCount_${item.name}_${index}`] || 0 }}
                  </span>
                </div>
                <div class="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2">
                  <div 
                    class="h-2 rounded-full transition-all duration-700"
                    :class="index < 10 ? 'bg-blue-600 dark:bg-blue-500' : 'bg-zinc-500'"
                    :style="`width: ${animatedBarWidths[`funcao_${item.name}_${index}`] || 0}%`"
                  ></div>
                </div>
              </div>
            </button>
          </div>
        </div>

        </div><!-- Fim do grid principal -->

        <!-- Widgets Adicionais -->
        <div v-if="loadingStatistics" class="mt-6 space-y-6">
          <!-- Skeleton Loading para Widgets -->
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div v-for="n in 3" :key="'sk-w1-' + n" class="card p-6 space-y-4">
              <div class="h-5 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse"></div>
              <div class="space-y-3">
                <div class="h-16 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse"></div>
                <div class="h-16 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse"></div>
                <div class="h-16 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse"></div>
              </div>
            </div>
          </div>
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div v-for="n in 3" :key="'sk-w2-' + n" class="card p-6 space-y-4">
              <div class="h-5 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse"></div>
              <div class="space-y-3">
                <div class="h-20 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse"></div>
                <div class="h-20 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse"></div>
              </div>
            </div>
          </div>
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div v-for="n in 2" :key="'sk-w3-' + n" class="card p-6 space-y-4">
              <div class="h-5 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse"></div>
              <div class="space-y-3">
                <div class="h-24 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse"></div>
                <div class="h-24 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="statisticsData" class="mt-6 space-y-6">
          <!-- Linha 1: Disponibilidade + Risco Operacional + Fidelização -->
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            <!-- Widget: Disponibilidade Imediata -->
            <div class="card p-6 dashboard-card" style="animation-delay: 0.09s">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-base font-semibold text-zinc-800 dark:text-zinc-100">Disponibilidade Imediata</h3>
                <svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div class="space-y-3">
                <div class="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <span class="text-sm text-zinc-700 dark:text-zinc-300">Livres próximos 7 dias</span>
                  <span class="text-2xl font-bold text-green-700 dark:text-green-400">{{ animatedNumbers['widgetLivres'] || 0 }}</span>
                </div>
                <div class="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  <span class="text-sm text-zinc-700 dark:text-zinc-300">Agenda cheia</span>
                  <span class="text-2xl font-bold text-amber-700 dark:text-amber-400">{{ animatedNumbers['widgetAgendaCheia'] || 0 }}</span>
                </div>
                <div class="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <span class="text-sm text-zinc-700 dark:text-zinc-300">Recusas seguidas (>3)</span>
                  <span class="text-2xl font-bold text-red-700 dark:text-red-400">{{ animatedNumbers['widgetRecusas'] || 0 }}</span>
                </div>
              </div>
            </div>

            <!-- Widget: Risco Operacional -->
            <div class="card p-6 dashboard-card" style="animation-delay: 0.1s">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-base font-semibold text-zinc-800 dark:text-zinc-100">⚠️ Risco Operacional</h3>
                <svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div class="space-y-4">
                <div class="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border-l-4 border-green-500">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-sm font-medium text-green-900 dark:text-green-100">Baixo Risco</span>
                    <span class="text-2xl font-bold text-green-700 dark:text-green-400">{{ animatedNumbers['widgetRiscoBaixo']?.toLocaleString() || 0 }}</span>
                  </div>
                  <div class="text-xs text-green-700 dark:text-green-400">83% da base</div>
                </div>
                <div class="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border-l-4 border-amber-500">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-sm font-medium text-amber-900 dark:text-amber-100">Médio Risco</span>
                    <span class="text-2xl font-bold text-amber-700 dark:text-amber-400">{{ animatedNumbers['widgetRiscoMedio'] || 0 }}</span>
                  </div>
                  <div class="text-xs text-amber-700 dark:text-amber-400">14% da base</div>
                </div>
                <div class="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border-l-4 border-red-500">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-sm font-medium text-red-900 dark:text-red-100">Alto Risco</span>
                    <span class="text-2xl font-bold text-red-700 dark:text-red-400">{{ animatedNumbers['widgetRiscoAlto'] || 0 }}</span>
                  </div>
                  <div class="text-xs text-red-700 dark:text-red-400">3% da base</div>
                </div>
              </div>
            </div>

            <!-- Widget: Fidelização -->
            <div class="card p-6 dashboard-card" style="animation-delay: 0.11s">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-base font-semibold text-zinc-800 dark:text-zinc-100">💙 Fidelização</h3>
                <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div class="space-y-3">
                <div class="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Ativo (últimos 15d)</span>
                    <span class="text-xl font-bold text-green-700 dark:text-green-400">{{ animatedNumbers['widgetFidelAtivo']?.toLocaleString() || 0 }}</span>
                  </div>
                  <div class="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-1.5">
                    <div class="bg-green-600 h-1.5 rounded-full transition-all duration-700" style="width: 58%"></div>
                  </div>
                </div>
                <div class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Moderado (15-30d)</span>
                    <span class="text-xl font-bold text-blue-700 dark:text-blue-400">{{ animatedNumbers['widgetFidelModerado']?.toLocaleString() || 0 }}</span>
                  </div>
                  <div class="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-1.5">
                    <div class="bg-blue-600 h-1.5 rounded-full transition-all duration-700" style="width: 22%"></div>
                  </div>
                </div>
                <div class="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Em risco (30-60d)</span>
                    <span class="text-xl font-bold text-amber-700 dark:text-amber-400">{{ animatedNumbers['widgetFidelRisco'] || 0 }}</span>
                  </div>
                  <div class="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-1.5">
                    <div class="bg-amber-600 h-1.5 rounded-full transition-all duration-700" style="width: 11%"></div>
                  </div>
                </div>
                <div class="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Inativo (>60d)</span>
                    <span class="text-xl font-bold text-red-700 dark:text-red-400">{{ animatedNumbers['widgetFidelInativo'] || 0 }}</span>
                  </div>
                  <div class="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-1.5">
                    <div class="bg-red-600 h-1.5 rounded-full transition-all duration-700" style="width: 9%"></div>
                  </div>
                </div>
              </div>
            </div>
       
          </div>

          <!-- Linha 2: Ranking de Liderança + Qualidade do Cadastro -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            <!-- Widget: Top 10 Melhores Cooperados -->
            <div class="card p-6 dashboard-card" style="animation-delay: 0.12s">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-base font-semibold text-zinc-800 dark:text-zinc-100">🏆 Top 10 Liderança</h3>
                <select class="text-xs px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-500">
                  <option>Este mês</option>
                  <option>Este ano</option>
                </select>
              </div>
              <div class="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                <div v-for="n in 10" :key="n" class="flex items-center gap-3 p-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-lg cursor-pointer transition-colors">
                  <span class="text-lg font-bold text-zinc-400 w-6">{{ n }}</span>
                  <div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                    JD
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">João da Silva</div>
                    <div class="text-xs text-zinc-500">Score: 98.5</div>
                  </div>
                  <svg class="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clip-rule="evenodd" />
                  </svg>
                </div>
              </div>
            </div>

            <!-- Widget: Qualidade do Cadastro -->
            <div class="card p-6 dashboard-card" style="animation-delay: 0.13s">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-base font-semibold text-zinc-800 dark:text-zinc-100">Qualidade do Cadastro</h3>
                <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div class="mb-4">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-sm text-zinc-600 dark:text-zinc-400">Cadastros Completos</span>
                  <span class="text-lg font-bold text-green-700 dark:text-green-400">{{ animatedNumbers['widgetQualidadeCompletos'] || 0 }}%</span>
                </div>
                <div class="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2">
                  <div class="bg-green-600 h-2 rounded-full transition-all duration-700" :style="`width: ${animatedNumbers['widgetQualidadeCompletos'] || 0}%`"></div>
                </div>
              </div>
              <div class="space-y-2">
                <div class="flex items-center justify-between text-sm">
                  <span class="text-zinc-600 dark:text-zinc-400">Com pendência</span>
                  <span class="font-semibold text-amber-700 dark:text-amber-400">{{ animatedNumbers['widgetQualidadePendencia'] || 0 }}%</span>
                </div>
                <div class="flex items-center justify-between text-sm">
                  <span class="text-zinc-600 dark:text-zinc-400">Bloqueados</span>
                  <span class="font-semibold text-red-700 dark:text-red-400">{{ animatedNumbers['widgetQualidadeBloqueados'] || 0 }}%</span>
                </div>
                <div class="flex items-center justify-between text-sm">
                  <span class="text-zinc-600 dark:text-zinc-400">Fotos desatualizadas (>1 ano)</span>
                  <span class="font-semibold text-zinc-700 dark:text-zinc-300">{{ animatedNumbers['widgetQualidadeFotos'] || 0 }}%</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Linha 3: Novos Cooperados + Histórico de Engajamento -->
          
        </div>

        <!-- Debug: Dados completos da API -->
        <div v-if="statisticsData" class="mt-6">
          <div class="card p-6 dashboard-card" style="animation-delay: 0.14s">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold text-zinc-800 dark:text-zinc-100">📊 Dados Completos da API</h3>
              <button @click="showDebugData = !showDebugData" class="text-xs px-3 py-1.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                {{ showDebugData ? 'Ocultar' : 'Mostrar' }}
              </button>
            </div>
            <div v-if="showDebugData" class="space-y-3">
              <pre class="text-xs bg-zinc-50 dark:bg-zinc-900 p-4 rounded-lg overflow-auto max-h-[600px] text-zinc-800 dark:text-zinc-200">{{ JSON.stringify(statisticsData, null, 2) }}</pre>
            </div>
          </div>
        </div>

      </div><!-- Fim v-else-if statisticsData -->
    </div><!-- Fim v-if currentTab === 'dashboard' -->
    
    <!-- Cards de cooperados (como Clientes) - ocultar quando dashboard -->
    <div v-if="currentTab !== 'dashboard'" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <template v-if="loading || aggregating">
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

        <div v-if="!loading && visibleRows.length === 0" class="card p-6 text-center text-sm text-zinc-600 dark:text-zinc-300">
          <div class="mb-2 font-medium">Nenhum cooperado encontrado com os filtros atuais.</div>
          <div class="mb-3 text-xs">Revise a busca e os filtros aplicados ou limpe tudo para ver os resultados.</div>
          <div class="flex items-center justify-center gap-2">
            <button @click="clearAllFilters" class="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800">
              Limpar filtros
            </button>
          </div>
        </div>
      </template>
    </div><!-- Fim da lista de cooperados -->
  </section>
  
  <!-- Painel lateral de detalhes do cooperado -->
  <SidePanel v-if="viewMode !== 'page'" :open="showDetail" title="Detalhes do cooperado" @close="closeDetail">
    <div v-if="detailLoading" class="space-y-3">
      <div class="h-4 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse"></div>
      <div class="h-3 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse"></div>
      <div class="h-3 w-1/3 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse"></div>
    </div>
    <div v-else-if="detail" class="space-y-4">
      <!-- Cabeçalho dentro de um card -->
      <div class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 shadow-sm">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="h-28 w-20 rounded-none overflow-hidden bg-zinc-200 text-zinc-600 flex items-center justify-center ring-1 ring-zinc-300">
              <img v-if="getAvatarUrl(detail)" :src="getAvatarUrl(detail)" alt="avatar" class="h-full w-full object-cover" />
              <span v-else class="text-[12px] font-semibold">{{ getInitials(detail) }}</span>
            </div>
            <div class="min-w-0">
              <div class="text-lg font-semibold truncate">{{ detail.nome || detail.name || '—' }}</div>
              <div class="flex flex-wrap items-center gap-2 text-xs text-zinc-600 mt-1">
                <span v-if="detail.cidade" class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">{{ detail.cidade }}<span v-if="detail.uf || detail.estado">/{{ detail.uf || detail.estado }}</span></span>
                <span v-if="detail.status" class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">{{ detail.status }}</span>
                <span v-if="detail.sexo" class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">{{ sexoLabel(detail.sexo) }}</span>
                <span v-if="detail.cooperativa" class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">{{ detail.cooperativa }}</span>
              </div>
              <div class="text-xs text-zinc-500 mt-1 truncate">Matrícula #{{ detail.matricula || detail.matricola || detail.registration || '-' }}</div>
            </div>
          </div>
          <div class="shrink-0 flex items-center gap-2 relative">
            <button @click="startEdit" class="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-blue-600 text-white hover:bg-blue-700" title="Editar">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
              <span>Editar</span>
            </button>
            <div class="relative" @mouseleave="showDetailOptions = false">
              <button @click="showDetailOptions = !showDetailOptions" class="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800">
                Opções
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.106l3.71-3.875a.75.75 0 111.08 1.04l-4.24 4.43a.75.75 0 01-1.08 0l-4.24-4.43a.75.75 0 01.02-1.06z" clip-rule="evenodd"/></svg>
              </button>
              <div v-if="showDetailOptions" class="absolute right-0 mt-1 w-56 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md shadow-lg z-10">
                <ul class="py-1 text-sm">
                  <li>
                    <button class="w-full text-left px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800" @click="copyEmail(detail.email); showDetailOptions=false">Copiar e-mail</button>
                  </li>
                  <li>
                    <button class="w-full text-left px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800" @click="openWhats(detail.telefone1); showDetailOptions=false">Abrir WhatsApp</button>
                  </li>
                  <li>
                    <button class="w-full text-left px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800" @click="showDetailOptions=false">Atualizar status…</button>
                  </li>
                </ul>
              </div>
            </div>
          </div>
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
            <button @click="activeDetailTab = 'financeiro'" :class="activeDetailTab === 'financeiro' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'" class="px-1 py-2">Financeiro</button>
          </li>
          <li>
            <button @click="activeDetailTab = 'presencas'" :class="activeDetailTab === 'presencas' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'" class="px-1 py-2">Presenças</button>
          </li>
          <li>
            <button @click="activeDetailTab = 'alertas'" :class="activeDetailTab === 'alertas' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'" class="px-1 py-2">Alertas</button>
          </li>
          <li>
            <button @click="activeDetailTab = 'ofertas'" :class="activeDetailTab === 'ofertas' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'" class="px-1 py-2">Ofertas</button>
          </li>
          <li>
            <button @click="activeDetailTab = 'agenda'" :class="activeDetailTab === 'agenda' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'" class="px-1 py-2">Agenda</button>
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
            <div class="font-medium">{{ sexoLabel(detail.sexo || detail.gender) || '-' }}</div>
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
        <!-- Form de edição mantendo a mesma disposição visual -->
        <div v-else class="space-y-4">
          <!-- Pessoais -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <label class="text-[11px] uppercase text-zinc-500">Nome
              <input v-model="(detail as any).nome" class="form-input w-full" />
            </label>
            <label class="text-[11px] uppercase text-zinc-500">CPF
              <input v-model="(detail as any).cpf" class="form-input w-full" />
            </label>
            <label class="text-[11px] uppercase text-zinc-500">RG
              <input v-model="(detail as any).rg" class="form-input w-full" />
            </label>
            <label class="text-[11px] uppercase text-zinc-500">Nascimento
              <input v-model="(detail as any).dataNasc" type="date" class="form-input w-full" />
            </label>
            <label class="text-[11px] uppercase text-zinc-500">Sexo
              <select v-model="(detail as any).sexo" class="form-input w-full">
                <option value="">-</option>
                <option value="M">M</option>
                <option value="F">F</option>
              </select>
            </label>
            <label class="text-[11px] uppercase text-zinc-500">Cooperativa
              <input v-model="(detail as any).cooperativa" class="form-input w-full" />
            </label>
            <label class="text-[11px] uppercase text-zinc-500">Status
              <input v-model="(detail as any).status" class="form-input w-full" />
            </label>
            <label class="text-[11px] uppercase text-zinc-500">Mãe
              <input v-model="(detail as any).nomeMae" class="form-input w-full" />
            </label>
            <label class="text-[11px] uppercase text-zinc-500">Pai
              <input v-model="(detail as any).nomePai" class="form-input w-full" />
            </label>
            <label class="text-[11px] uppercase text-zinc-500">Expedição (RG)
              <input v-model="(detail as any).dataExp" type="date" class="form-input w-full" />
            </label>
          </div>

          <!-- Contato -->
          <div class="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm border-t pt-3">
            <label class="sm:col-span-2 text-[11px] uppercase text-zinc-500">E-mail
              <input v-model="(detail as any).email" class="form-input w-full" />
            </label>
            <label class="text-[11px] uppercase text-zinc-500">Telefone 1
              <input v-model="(detail as any).telefone1" class="form-input w-full" />
            </label>
            <label class="text-[11px] uppercase text-zinc-500">Telefone 2
              <input v-model="(detail as any).telefone2" class="form-input w-full" />
            </label>
            <label class="text-[11px] uppercase text-zinc-500">Gestor
              <input v-model="(detail as any).gestor" class="form-input w-full" />
            </label>
          </div>

          <!-- Endereço -->
          <div class="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm border-t pt-3">
            <label class="text-[11px] uppercase text-zinc-500">Cidade
              <input v-model="(detail as any).cidade" class="form-input w-full" />
            </label>
            <label class="text-[11px] uppercase text-zinc-500">UF
              <input v-model="(detail as any).uf" class="form-input w-full" />
            </label>
            <label class="text-[11px] uppercase text-zinc-500">Bairro
              <input v-model="(detail as any).bairro" class="form-input w-full" />
            </label>
            <label class="text-[11px] uppercase text-zinc-500">Endereço
              <input v-model="(detail as any).endereco" class="form-input w-full" />
            </label>
            <label class="text-[11px] uppercase text-zinc-500">Número
              <input v-model="(detail as any).numero" class="form-input w-full" />
            </label>
            <label class="text-[11px] uppercase text-zinc-500">Complemento
              <input v-model="(detail as any).complemento" class="form-input w-full" />
            </label>
            <label class="text-[11px] uppercase text-zinc-500">CEP
              <input v-model="(detail as any).cep" class="form-input w-full" />
            </label>
            <label class="text-[11px] uppercase text-zinc-500">Região
              <input v-model="(detail as any).regiao" class="form-input w-full" />
            </label>
          </div>

          <!-- Dados Bancários -->
          <div class="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm border-t pt-3">
            <label class="text-[11px] uppercase text-zinc-500">Tipo Pagamento
              <input v-model="(detail as any).tipoPagto" class="form-input w-full" />
            </label>
            <label class="text-[11px] uppercase text-zinc-500">Banco
              <input v-model="(detail as any).banco" class="form-input w-full" />
            </label>
            <label class="text-[11px] uppercase text-zinc-500">Agência
              <input v-model="(detail as any).agencia" class="form-input w-full" />
            </label>
            <label class="text-[11px] uppercase text-zinc-500">Conta
              <input v-model="(detail as any).conta" class="form-input w-full" />
            </label>
            <label class="text-[11px] uppercase text-zinc-500">Dígito da Conta
              <input v-model="(detail as any).digConta" class="form-input w-full" />
            </label>
          </div>

          <!-- Observações -->
          <div class="sm:col-span-2 border-t pt-3">
            <label class="text-[11px] uppercase text-zinc-500">Observações
              <textarea v-model="(detail as any).observacoes" rows="3" class="form-input w-full"></textarea>
            </label>
          </div>

          <div class="flex justify-end gap-2">
            <button @click="cancelEdit" class="px-3 h-9 rounded-md border border-zinc-300 dark:border-zinc-700">Cancelar</button>
            <button @click="saveEdit" class="px-3 h-9 rounded-md bg-blue-600 text-white hover:bg-blue-700">Salvar</button>
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

      <div v-else-if="activeDetailTab === 'financeiro'">
        <div class="pt-3">
          <div class="text-[11px] uppercase text-zinc-500 mb-2">Financeiro</div>
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
      <div v-else-if="activeDetailTab === 'alertas'">
        <div class="pt-3">
          <div class="text-[11px] uppercase text-zinc-500 mb-2">Alertas</div>
          <div class="text-sm text-zinc-500">Sem alertas.</div>
        </div>
      </div>
      <div v-else-if="activeDetailTab === 'ofertas'">
        <div class="pt-3">
          <div class="text-[11px] uppercase text-zinc-500 mb-2">Ofertas</div>
          <div class="text-sm text-zinc-500">Sem ofertas.</div>
        </div>
      </div>
      <div v-else-if="activeDetailTab === 'agenda'">
        <div class="pt-3">
          <div class="text-[11px] uppercase text-zinc-500 mb-2">Agenda</div>
          <div class="text-sm text-zinc-500">Sem itens de agenda.</div>
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
          <div class="font-medium">{{ sexoLabel(detail.sexo || detail.gender) || '-' }}</div>
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
          <!-- URLs diretas (urlImg1..4), se existirem -->
          <div class="mt-2 space-y-1">
            <div v-if="detail.urlImg1" class="text-xs">
              <span class="text-zinc-500 mr-1">Imagem 1:</span>
              <a :href="detail.urlImg1" target="_blank" rel="noopener" class="text-blue-600 hover:underline">abrir</a>
            </div>
            <div v-if="detail.urlImg2" class="text-xs">
              <span class="text-zinc-500 mr-1">Imagem 2:</span>
              <a :href="detail.urlImg2" target="_blank" rel="noopener" class="text-blue-600 hover:underline">abrir</a>
            </div>
            <div v-if="detail.urlImg3" class="text-xs">
              <span class="text-zinc-500 mr-1">Imagem 3:</span>
              <a :href="detail.urlImg3" target="_blank" rel="noopener" class="text-blue-600 hover:underline">abrir</a>
            </div>
            <div v-if="detail.urlImg4" class="text-xs">
              <span class="text-zinc-500 mr-1">Imagem 4:</span>
              <a :href="detail.urlImg4" target="_blank" rel="noopener" class="text-blue-600 hover:underline">abrir</a>
            </div>
          </div>
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
    v-if="currentTab !== 'dashboard'"
    class="fixed w-[calc(100%-15rem)] left-60 bottom-0 z-30 bg-white dark:bg-zinc-900/90 border-t border-zinc-200 dark:border-zinc-700 p-2">
    <div
      class="container max-w-[1400px] mx-auto flex flex-col sm:flex-row sm:items-center gap-2 justify-between text-sm">
      <span
        class="mt-1 text-blue-600 text-xs font-medium me-2 px-2.5 py-0.5 rounded-sm dark:bg-blue-900 dark:text-blue-300">
        Exibindo {{ headerRangeStart }} • {{ headerRangeEnd }} de {{ displayTotal }} registros</span>
  <div class="inline-flex items-center gap-1">
        <button @click="goFirst()" :disabled="page === 1" class="px-2 py-1 border rounded disabled:opacity-50">«</button>
        <button @click="goPrev()" :disabled="page === 1"
          class="px-2 py-1 border rounded disabled:opacity-50">‹</button>
        <template v-for="p in pageItems" :key="'p'+p">
          <span v-if="typeof p === 'string'" class="px-2 py-1 text-zinc-400">…</span>
          <button v-else @click="goTo(p as number)" :class="(typeof p === 'number' && page === p) ? 'bg-blue-600 text-white border-blue-600' : ''"
            class="px-2 py-1 border rounded">{{ p }}</button>
        </template>
        <button @click="goNext()" :disabled="hasKnownTotal ? (page === totalPages) : false"
          class="px-2 py-1 border rounded disabled:opacity-50">›</button>
        <button v-if="hasKnownTotal" @click="goLast()" :disabled="page === totalPages"
          class="px-2 py-1 border rounded disabled:opacity-50">»</button>
      </div>
    </div>
  </div>

</template>

<style scoped>
/* Animações do Dashboard */
@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.dashboard-card {
  animation: slideInUp 0.6s ease-out forwards;
  opacity: 0;
}

/* Custom scrollbar para o ranking de funções */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 3px;
}
:global(.dark) .custom-scrollbar::-webkit-scrollbar-thumb {
  background: #52525b;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}
:global(.dark) .custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #71717a;
}

/* Estilos para o mapa do Brasil */
.state-default { fill: #e5e7eb; stroke: #d1d5db; stroke-width: 0.5; }
:global(.dark) .state-default { fill: #3f3f46; stroke: #52525b; }
.state-sp { fill: #6366f1; stroke: #4f46e5; stroke-width: 1; opacity: 0.9; }
:global(.dark) .state-sp { fill: #818cf8; stroke: #6366f1; }
.state-rj { fill: #0ea5e9; stroke: #0284c7; stroke-width: 1; opacity: 0.9; }
:global(.dark) .state-rj { fill: #38bdf8; stroke: #0ea5e9; }
.state-mg { fill: #8b5cf6; stroke: #7c3aed; stroke-width: 1; opacity: 0.9; }
:global(.dark) .state-mg { fill: #a78bfa; stroke: #8b5cf6; }
.state-active:hover { opacity: 1; filter: brightness(1.1); cursor: pointer; }

/* Destaque com fundo e borda que desaparecem suavemente */
.cooperado-highlight {
  /* Aproximação de Tailwind bg-amber-100/50 (bg amarelo claro com 50% opacidade) */
  background-color: rgba(254, 243, 199, 0.5) !important; /* amber-100 @ 50% */
  border-color: rgb(245, 158, 11) !important; /* border-amber-500 */
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.22);
  transition: background-color 2.6s ease-out, border-color 2.6s ease-out, box-shadow 2.6s ease-out;
}
.cooperado-highlight {
  animation: cooperadoFade 2.6s ease-out forwards;
}
@keyframes cooperadoFade {
  0% {
    background-color: rgba(254, 243, 199, 0.5);
    box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.22);
  }
  30% {
    background-color: rgba(254, 243, 199, 0.32);
    box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.18);
  }
  60% {
    background-color: rgba(254, 243, 199, 0.16);
    box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.10);
  }
  100% {
    background-color: transparent;
    border-color: transparent;
    box-shadow: none;
  }
}
</style>
