<script setup lang="ts">
import { ref, onMounted, watch, computed, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Breadcrumbs from '@/components/Breadcrumbs.vue'
import { getCooperado, listCooperadoPayments, listCooperadoCheckins, updateCooperado, listFuncoesCooperados, listAvisos, listEscalas } from '@/services/cooperados'

// Função para parsear datas no formato 'dd/MM/yyyy HH:mm' ou ISO
function parseDateString(dateStr: string | Date): number {
  if (!dateStr) return NaN;
  if (typeof dateStr === 'string' && dateStr.includes('/')) {
    // Ex: 01/07/2025 12:15
    const [d, m, rest] = dateStr.split('/');
    const [y, time] = rest.split(' ');
    const [h = '0', min = '0'] = (time || '').split(':');
    return new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min)).getTime();
  }
  return new Date(dateStr).getTime();
}

function compareTimes(real: string|Date, previsto: string|Date): 'late'|'ontime'|'early'|'' {
  if (!real || !previsto) return '';
  const r = parseDateString(real);
  const p = parseDateString(previsto);
  if (isNaN(r) || isNaN(p)) return '';
  if (r > p) return 'late';
  if (r === p) return 'ontime';
  return 'early';
}

type Row = Record<string, any>

const route = useRoute()
const router = useRouter()
const idParam = computed(() => route.params.id as string | undefined)

const loading = ref(false)
const form = ref<Row>({})
const activeTab = ref<'perfil'|'documentos'|'financeiro'|'presencas'|'alertas'|'ofertas'|'agenda'>('perfil')
const editing = ref(false)
const payments = ref<Row[]>([])
const checkins = ref<Row[]>([])
// Lazy-load de históricos
const extrasLoaded = ref(false)
const extrasLoading = ref(false)
// Lazy-load de avisos (alertas)
const avisos = ref<Row[]>([])
const avisosLoaded = ref(false)
const avisosLoading = ref(false)
const avisosFiltro = ref<string>('todos') // filtro por título
const avisosFiltroStatus = ref<string>('todos') // filtro por status
const avisosLimit = ref<number>(20) // limite de registros
// Lazy-load de escalas (presenças)
const escalas = ref<Row[]>([])
const escalasLoaded = ref(false)
const escalasLoading = ref(false)
const escalasFiltroCliente = ref<string>('todos') // filtro por cliente
const escalasFiltroStatus = ref<string>('todos') // filtro por status
// Funções utilitárias para contagem de faltas e recusados (dependem de escalas)
const totalFaltas = computed(() => escalas.value.filter(e => e.status === 'faltou' || e.status === 'falta').length)
const totalRecusados = computed(() => escalas.value.filter(e => e.status === 'recusado').length)
// (removidos contadores agregados antigos; agora usamos resumoCheckIn e resumoCheckOut)
// Debug helpers
const rawResponse = ref<any>(null)
const rawDataArray = ref<any[] | null>(null)
const showDebug = computed(() => String(route.query.debug || '') === '1')
const pageTitle = computed(() => {
  const f = form.value || {}
  return (f.nome || f.name || 'Cooperado') as string
})

// Avisos filtrados
const avisosFiltrados = computed(() => {
  let resultado = avisos.value
  
  // Filtrar por título
  if (avisosFiltro.value !== 'todos') {
    resultado = resultado.filter(aviso => aviso.titulo === avisosFiltro.value)
  }
  
  // Filtrar por status
  if (avisosFiltroStatus.value !== 'todos') {
    resultado = resultado.filter(aviso => aviso.status === avisosFiltroStatus.value)
  }
  
  return resultado
})

// Contadores por titulo
const avisosContadores = computed(() => {
  const contadores: Record<string, number> = {
    todos: avisos.value.length
  }
  avisos.value.forEach(aviso => {
    const titulo = aviso.titulo || 'Sem título'
    if (titulo in contadores) {
      contadores[titulo]++
    } else {
      contadores[titulo] = 1
    }
  })
  return contadores
})

// Contadores por status
const avisosContadoresStatus = computed(() => {
  // Filtra primeiro por título se necessário
  let avisosParaContar = avisos.value
  if (avisosFiltro.value !== 'todos') {
    avisosParaContar = avisos.value.filter(aviso => aviso.titulo === avisosFiltro.value)
  }
  
  const contadores: Record<string, number> = {
    todos: avisosParaContar.length
  }
  avisosParaContar.forEach(aviso => {
    const status = aviso.status || 'sem status'
    if (status in contadores) {
      contadores[status]++
    } else {
      contadores[status] = 1
    }
  })
  return contadores
})

// Títulos únicos para os filtros
const titulosUnicos = computed(() => {
  const titulos = new Set<string>()
  avisos.value.forEach(aviso => {
    if (aviso.titulo) {
      titulos.add(aviso.titulo)
    }
  })
  return Array.from(titulos).sort()
})

// Status únicos para os filtros (baseado no título selecionado)
const statusUnicos = computed(() => {
  // Filtra primeiro por título se necessário
  let avisosFiltradosPorTitulo = avisos.value
  if (avisosFiltro.value !== 'todos') {
    avisosFiltradosPorTitulo = avisos.value.filter(aviso => aviso.titulo === avisosFiltro.value)
  }
  
  const statuses = new Set<string>()
  avisosFiltradosPorTitulo.forEach(aviso => {
    if (aviso.status) {
      statuses.add(aviso.status)
    }
  })
  return Array.from(statuses).sort()
})

// Escalas filtradas
const escalasFiltradas = computed(() => {
  let resultado = escalas.value
  
  // Filtrar por cliente
  if (escalasFiltroCliente.value !== 'todos') {
    resultado = resultado.filter(escala => String(escala.evento?.id_cliente) === escalasFiltroCliente.value)
  }
  
  // Filtrar por status
  if (escalasFiltroStatus.value !== 'todos') {
    resultado = resultado.filter(escala => escala.status === escalasFiltroStatus.value)
  }
  
  return resultado
})

// Helper para diferença em minutos
const toMinutesDiff = (real: any, previsto: any): number | null => {
  if (!real || !previsto) return null
  const r = parseDateString(real)
  const p = parseDateString(previsto)
  if (isNaN(r) || isNaN(p)) return null
  return Math.round((r - p) / 60000)
}

// Helper para status inválidos que não entram nos "válidos"
const isInvalidStatus = (status: any): boolean => {
  const s = String(status || '').toLowerCase()
  return s === 'sem vaga' || s === 'removido' || s === 'lido' || s === 'recusado' || s === 'falta' || s === 'faltou' || s === 'nao compareceu' || s === 'não compareceu'
}

// Resumo por faixas para Check-in
const resumoCheckIn = computed(() => {
  const counts = { adiantado: 0, pontual: 0, atrasado: 0, aposHorario: 0 }
  for (const e of escalasFiltradas.value) {
    if (isInvalidStatus(e.status)) continue
    const d = toMinutesDiff(e.check_in_real, e.check_in)
    if (d === null) continue
    if (d <= -1 && d >= -15) counts.adiantado++
    else if (d >= 0 && d <= 5) counts.pontual++
    else if (d >= 6 && d <= 15) counts.atrasado++
    else if (d >= 16) counts.aposHorario++
  }
  return counts
})

// Resumo por faixas para Check-out
const resumoCheckOut = computed(() => {
  const counts = { adiantado: 0, pontual: 0, atrasado: 0, aposHorario: 0 }
  for (const e of escalasFiltradas.value) {
    if (isInvalidStatus(e.status)) continue
    const d = toMinutesDiff(e.check_out_real, e.check_out)
    if (d === null) continue
    if (d <= -1 && d >= -15) counts.adiantado++
    else if (d >= 0 && d <= 5) counts.pontual++
    else if (d >= 6 && d <= 15) counts.atrasado++
    else if (d >= 16) counts.aposHorario++
  }
  return counts
})

// Termômetro: métricas e score
const totalValidCheckIn = computed(() => {
  const r = resumoCheckIn.value
  return r.adiantado + r.pontual + r.atrasado + r.aposHorario
})
const punctualidadePct = computed(() => {
  const r = resumoCheckIn.value
  const total = totalValidCheckIn.value
  if (!total) return 0
  return ((r.adiantado + r.pontual) / total) * 100
})
const totalEventos = computed(() => escalas.value.length)
const confirmadosCount = computed(() => escalas.value.filter(e => e.confirmado_ida_evento).length)
const presencaPct = computed(() => {
  const tot = totalEventos.value
  if (!tot) return 0
  return (confirmadosCount.value / tot) * 100
})
const checkOutCount = computed(() => escalas.value.filter(e => e.confirmado_ida_evento && e.check_out_real).length)
const checkOutPct = computed(() => {
  const denom = confirmadosCount.value
  if (!denom) return 0
  return (checkOutCount.value / denom) * 100
})
const avaliacaoAvg = computed(() => {
  const vals = escalas.value
    .map(e => Number(e.avaliacao))
    .filter(v => !isNaN(v) && v > 0)
  if (!vals.length) return 0
  return vals.reduce((a, b) => a + b, 0) / vals.length
})
const avaliacaoPct = computed(() => {
  if (!avaliacaoAvg.value) return 0
  return Math.min(100, (avaliacaoAvg.value / 5) * 100)
})
// Check-in score por faixas (inclui sem registro = 0)
const checkInScorePct = computed(() => {
  const total = escalasFiltradas.value.length
  if (!total) return 0
  let points = 0
  for (const e of escalasFiltradas.value) {
    // classifica pela diferença de check-in
    const d = toMinutesDiff(e.check_in_real, e.check_in)
    if (d === null || isInvalidStatus(e.status)) {
      points += 0 // sem registro/ inválido
      continue
    }
    if (d <= -1 && d >= -15) points += 100 // Adiantado
    else if (d >= 0 && d <= 5) points += 90 // Pontual
    else if (d >= 6 && d <= 15) points += 70 // Atrasado
    else if (d >= 16) points += 40 // Após o horário
  }
  return points / total
})
// Termômetro final com novos pesos: CI 40%, Presença 25%, CO 10%, Pontualidade 15%, Avaliação 10%
const finalScore = computed(() => {
  const s = (checkInScorePct.value * 0.4)
          + (presencaPct.value * 0.25)
          + (checkOutPct.value * 0.1)
          + (punctualidadePct.value * 0.15)
          + (avaliacaoPct.value * 0.1)
  return Number(s.toFixed(1))
})
const classificacao = computed(() => {
  const s = finalScore.value
  if (s < 50) return 'Ruim'
  if (s < 75) return 'Regular'
  return 'Excelente'
})
const thermoBarClass = computed(() => {
  const s = finalScore.value
  if (s < 50) return 'bg-red-500'
  if (s < 75) return 'bg-amber-500'
  return 'bg-green-500'
})
const thermoBadgeClass = computed(() => {
  const s = finalScore.value
  if (s < 50) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
  if (s < 75) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
  return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
})
const thermoStrokeClass = computed(() => {
  const s = finalScore.value
  if (s < 50) return 'stroke-red-500'
  if (s < 75) return 'stroke-amber-500'
  return 'stroke-green-500'
})

// BG do card de Histórico acompanhando a classificação/termômetro
const thermoCardBgClass = computed(() => {
  const s = finalScore.value
  if (s < 50) return 'bg-red-50 dark:bg-red-900/20'
  if (s < 75) return 'bg-amber-50 dark:bg-amber-900/20'
  return 'bg-green-50 dark:bg-green-900/20'
})

// Helpers p/ gráficos redondos (SVG)
const ringR = 18
const ringC = 2 * Math.PI * ringR
function dashOffset(p: number){
  const pct = Math.max(0, Math.min(100, Number(p) || 0))
  return ringC - (ringC * pct / 100)
}

// Contador de "Sem registro" (check-in sem real/previsto ou status inválido)
const semRegistroCheckIn = computed(() => {
  return escalasFiltradas.value.filter(e => isInvalidStatus(e.status) || !e.check_in || !e.check_in_real).length
})

// Clientes únicos das escalas
const escalasClientesUnicos = computed(() => {
  const clientes = new Map<string, string>()
  escalas.value.forEach(escala => {
    const idCliente = escala.evento?.id_cliente
    if (idCliente) {
      // Armazena id_cliente como chave e um nome amigável se existir
      const nomeCliente = escala.evento?.nome_cliente || `Cliente ${idCliente}`
      clientes.set(String(idCliente), nomeCliente)
    }
  })
  return Array.from(clientes.entries())
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([id, nome]) => ({ id, nome }))
})

// Status únicos das escalas (baseado no filtro de cliente)
const escalasStatusUnicos = computed(() => {
  // Filtra primeiro por cliente se necessário
  let escalasParaContar = escalas.value
  if (escalasFiltroCliente.value !== 'todos') {
    escalasParaContar = escalas.value.filter(escala => 
      String(escala.evento?.id_cliente) === escalasFiltroCliente.value
    )
  }
  
  const statuses = new Set<string>()
  escalasParaContar.forEach(escala => {
    if (escala.status) {
      statuses.add(escala.status)
    }
  })
  return Array.from(statuses).sort()
})

// Contadores por cliente das escalas
const escalasContadoresCliente = computed(() => {
  const contadores: Record<string, number> = {
    todos: escalas.value.length
  }
  escalas.value.forEach(escala => {
    const idCliente = String(escala.evento?.id_cliente || 'sem cliente')
    if (idCliente in contadores) {
      contadores[idCliente]++
    } else {
      contadores[idCliente] = 1
    }
  })
  return contadores
})

// Contadores por status das escalas (considerando filtro de cliente)
const escalasContadoresStatus = computed(() => {
  // Filtra primeiro por cliente se necessário
  let escalasParaContar = escalas.value
  if (escalasFiltroCliente.value !== 'todos') {
    escalasParaContar = escalas.value.filter(escala => 
      String(escala.evento?.id_cliente) === escalasFiltroCliente.value
    )
  }
  
  const contadores: Record<string, number> = {
    todos: escalasParaContar.length
  }
  escalasParaContar.forEach(escala => {
    const status = escala.status || 'sem status'
    if (status in contadores) {
      contadores[status]++
    } else {
      contadores[status] = 1
    }
  })
  return contadores
})

// Totais de horas trabalhadas
const escalasTotaisHoras = computed(() => {
  let escalasParaCalcular = escalas.value
  
  // Aplica filtros se necessário
  if (escalasFiltroCliente.value !== 'todos') {
    escalasParaCalcular = escalasParaCalcular.filter(escala => 
      String(escala.evento?.id_cliente) === escalasFiltroCliente.value
    )
  }
  
  if (escalasFiltroStatus.value !== 'todos') {
    escalasParaCalcular = escalasParaCalcular.filter(escala => 
      escala.status === escalasFiltroStatus.value
    )
  }
  
  let totalNormais = 0
  let totalExtras = 0
  let totalNoturnas = 0
  let totalGeral = 0
  
  escalasParaCalcular.forEach(escala => {
    if (escala.horas_normais) totalNormais += Number(escala.horas_normais) / 60
    if (escala.horas_extras) totalExtras += Number(escala.horas_extras) / 60
    if (escala.horas_noturnas) totalNoturnas += Number(escala.horas_noturnas) / 60
  })
  
  totalGeral = totalNormais + totalExtras + totalNoturnas
  
  return {
    normais: totalNormais,
    extras: totalExtras,
    noturnas: totalNoturnas,
    geral: totalGeral
  }
})

function resolveCooperadoId(it: Row | null | undefined): string | number | null {
  const cand: any = it || {}
  const id = cand.id ?? cand.cooperadoId ?? cand.cooperado_id ?? cand.codigo ?? cand.matricula
  return (id !== undefined && id !== null && String(id).trim() !== '') ? id : null
}

function getAvatarUrl(it: Row) {
  // 1) Campos diretos
  const direct = (it as any).urlImg1 || (it as any).foto || (it as any).photo || (it as any).avatar || (it as any).picture
  if (direct) return String(direct)
  // 2) Buscar em documentos (normalizados ou brutos)
  const fromDocs = getAvatarFromDocuments(it)
  if (fromDocs) return fromDocs
  return ''
}
function getAvatarFromDocuments(it: Row): string {
  if (!it) return ''
  const gather = (obj: any): any[] => {
    if (!obj || typeof obj !== 'object') return []
    const arrs: any[] = []
    const pushIfArray = (a: any) => { if (Array.isArray(a)) arrs.push(...a) }
    // Prioriza documentos normalizados
    pushIfArray((obj as any).documentos)
    // Alternativos (caso ainda não normalizado)
    pushIfArray((obj as any).docs)
    pushIfArray((obj as any).documentosEnviados)
    pushIfArray((obj as any).arquivos)
    pushIfArray((obj as any).anexos)
    pushIfArray((obj as any).listaDocumentos)
    pushIfArray((obj as any).documentosCooperado)
    pushIfArray((obj as any).images)
    pushIfArray((obj as any).imagens)
    pushIfArray((obj as any).uploads)
    return arrs
  }
  const docs = gather(it)
  if (!docs.length) return ''
  // Heurística: procurar tipo "fotoPerfil" (ou contendo 'foto' e 'perfil'), priorizando por dataEnvio/ordem
  const toUrl = (d: any) => d?.urlDocumento ?? d?.url ?? d?.link ?? d?.arquivoUrl ?? d?.path ?? d?.caminho ?? d?.downloadUrl
  const score = (d: any): number => {
    // maior é melhor
    let s = 0
    const tipo = String(d?.tipo ?? d?.documento ?? d?.nomeTipo ?? '').toLowerCase()
    const nome = String(d?.nomeImagem ?? d?.nomeArquivo ?? d?.filename ?? '').toLowerCase()
    if (tipo === 'fotoperfil' || tipo === 'foto_perfil' || tipo === 'foto-perfil') s += 5
    if (tipo.includes('foto') && tipo.includes('perfil')) s += 4
    if (nome.includes('foto') && nome.includes('perfil')) s += 2
    // bônus por ter dataEnvio válida mais recente
    const de = new Date(String(d?.dataEnvio || d?.enviadoEm || d?.data))
    if (!isNaN(de.getTime())) s += Math.min(3, Math.floor((de.getTime() / 1e3) % 3))
    return s
  }
  let best: any = null
  let bestScore = -1
  for (const d of docs) {
    const url = toUrl(d)
    if (!url) continue
    const s = score(d)
    if (s > bestScore) { best = d; bestScore = s }
  }
  return best ? String(toUrl(best)) : ''
}
function getInitials(it: Row) {
  const name = String(it.nome || it.name || '').trim()
  if (!name) return '?'
  const parts = name.split(/\s+/).slice(0, 2)
  return parts.map(p => p[0]?.toUpperCase() || '').join('')
}

function toWhatsUrl(number: unknown) {
  const digits = String(number || '').replace(/[^0-9]/g, '')
  if (!digits) return ''
  return `https://api.whatsapp.com/send/?phone=55${digits}&text&type=phone_number&app_absent=0`
}

// Modal de visualização de imagem
const showImageModal = ref(false)
const imageToPreview = ref<string | null>(null)
function openImage(src: unknown) {
  const s = String(src || '').trim()
  if (!s) return
  imageToPreview.value = s
  showImageModal.value = true
}
function closeImage(){
  showImageModal.value = false
  imageToPreview.value = null
}
let escHandler: ((e: KeyboardEvent) => void) | null = null

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

function formatDateTime(val: unknown): string {
  if (!val) return '-'
  try {
    const s = String(val)
    const d = new Date(s)
    if (isNaN(d.getTime())) return '-'
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    const hh = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`
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

function sexoLabel(v: unknown): string {
  const s = String(v || '').trim().toUpperCase()
  if (!s) return ''
  if (s.startsWith('M')) return 'Masculino'
  if (s.startsWith('F')) return 'Feminino'
  return String(v || '')
}

// Classes de badge por status (leve no claro, sutil no escuro)
function normStatus(v: unknown): string {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}
function statusToBadge(v: unknown): string {
  const s = normStatus(v)
  if (!s) return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
  // Warning
  if (s.includes('pendente') || s.includes('aguard')) {
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
  }
  // Sucesso / Ativo
  if (s.includes('ativo') || s.includes('aprov') || s.includes('liber')) {
    return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
  }
  // Erro / Negado / Inativo
  if (s.includes('reprov') || s.includes('inativo') || s.includes('bloque') || s.includes('cancel')) {
    return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
  }
  // Informativo / Em análise / Processando
  if (s.includes('analise') || s.includes('análise') || s.includes('process') || s.includes('valid')) {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
  }
  // Neutro
  return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
}
const statusBadgeClass = computed(() => statusToBadge((form.value as any)?.status))

function truthyFlag(v: any): boolean {
  return v === true || v === 'true' || v === 1 || v === '1'
}

const docFlags = computed(() => {
  const f = form.value || {}
  return {
    foto: truthyFlag((f as any).fotoPerfilVencimento ?? (f as any).fotoPerfiVencimento),
    atestado: truthyFlag((f as any).atestadoVencimento),
    antecedentes: truthyFlag((f as any).antecedentesVencimento),
    uniforme: truthyFlag((f as any).uniformeVencimento),
  }
})

// Catálogo opcional para mapear IDs -> nomes, quando o backend envia apenas IDs
const funcoesCatalog = ref<Array<{ id: number; name: string }> | null>(null)
async function ensureFuncoesCatalog(){
  try {
    if (!funcoesCatalog.value) {
      const list = await listFuncoesCooperados()
      funcoesCatalog.value = Array.isArray(list) ? list : []
    }
  } catch (e) {
    // silencioso
  }
}

const funcoesDedupe = computed<string[]>(() => {
  const f = form.value || {}
  const out: string[] = []
  const seen = new Set<string>()
  const push = (v: unknown) => {
    const s = String(v ?? '').trim()
    if (!s) return
    if (seen.has(s)) return
    seen.add(s)
    out.push(s)
  }

  // 1) Campos simples comuns e variações encontradas
  const directCandidates = [
    (f as any).funcao,
    (f as any).funcao1, (f as any).funcao2, (f as any).funcao3, (f as any).funcao4,
    (f as any).funcao5, (f as any).funcao6, (f as any).funcao7, (f as any).funcao8,
    (f as any).profissao, (f as any).cargo, (f as any).ocupacao,
    (f as any).especialidade, (f as any).habilidade, (f as any).atividade,
  ]
  for (const v of directCandidates) {
    if (typeof v === 'string') {
      // valores concatenados "cargo1, cargo2; cargo3"
      const parts = String(v).split(/[;,|]/).map(s => s.trim()).filter(Boolean)
      if (parts.length > 1) parts.forEach(push)
      else push(v)
    }
  }

  // 2) Vasculha quaisquer campos string cujo nome contenha palavras-chave
  try {
    for (const [k, v] of Object.entries(f)) {
      if (typeof v !== 'string') continue
      if (/(funcao|função|profissao|profissão|cargo|ocupacao|ocupação|especialidade|habilidade|atividade)/i.test(k)) {
        const parts = String(v).split(/[;,|]/).map(s => s.trim()).filter(Boolean)
        if (parts.length > 1) parts.forEach(push)
        else push(v)
      }
    }
  } catch {}

  // 3) Arrays típicos (funcoes, profissoes, cargos, ...)
  const arrayKeys = ['funcoes','profissoes','cargos','ocupacoes','especialidades','habilidades','atividades']
  for (const key of arrayKeys) {
    const arr: any = (f as any)[key]
    if (!arr) continue
    if (Array.isArray(arr)) {
      for (const it of arr) {
        if (typeof it === 'string') { push(it); continue }
        if (it && typeof it === 'object') {
          const name = (it as any).profissao ?? (it as any).funcao ?? (it as any).name ?? (it as any).nome ?? (it as any).descricao ?? (it as any).titulo
          if (name) push(String(name))
        }
      }
    }
  }

  // 4) IDs mapeados pelo catálogo (funcaoId, idFuncao, funcao1Id...)
  const idNames: string[] = []
  const catalog = funcoesCatalog.value
  if (catalog && catalog.length) {
    const idSet = new Set<number>()
    try {
      for (const [k, v] of Object.entries(f)) {
        if (/^(funcao\d*id|idFuncao\d*)$/i.test(k) && (typeof v === 'number' || (typeof v === 'string' && v.trim() !== ''))) {
          const n = Number(v)
          if (Number.isFinite(n)) idSet.add(n)
        }
        // arrays de IDs
        if (/^(funcoesIds|idsFuncoes)$/i.test(k) && Array.isArray(v)) {
          for (const x of v) { const n = Number(x); if (Number.isFinite(n)) idSet.add(n) }
        }
      }
    } catch {}
    if (idSet.size) {
      const byId = new Map<number, string>(catalog.map(x => [x.id, x.name]))
      for (const id of idSet) {
        const nm = byId.get(id)
        if (nm) idNames.push(nm)
      }
    }
  }
  idNames.forEach(push)

  return out
})

type DocItem = {
  id?: number|string
  tipo?: string
  label: string
  dataEnvio?: string
  dataVencimento?: string
  url?: string
  avaliacao?: any
  matricula?: number
  nomeImagem?: string
  cooperativa?: number
  dataAvaliacao?: string
  motivoReprovacao?: string
  usuarioAvaliacao?: string
}
const documentosList = computed<DocItem[]>(() => {
  const f = form.value || {}
  const alt = [
    (f as any).documentos,
    (f as any).docs,
    (f as any).documentosEnviados,
    (f as any).arquivos,
    (f as any).anexos,
    (f as any).listaDocumentos,
    (f as any).documentosCooperado,
    (f as any).images,
    (f as any).imagens,
    (f as any).uploads,
  ]
  const arrSrc = Array.isArray((f as any).documentos) ? (f as any).documentos : (alt.find(a => Array.isArray(a)) as any[] | undefined)
  const arr = Array.isArray(arrSrc) ? arrSrc : []
  const labelMap: Record<string,string> = {
    fotoPerfil: 'Foto de Perfil',
    atestadoMedico: 'Atestado Médico',
    antecedentesCriminais: 'Antecedentes Criminais',
    uniforme: 'Uniforme',
  }
  return arr.map((d: any) => {
    const tipo = d?.tipo ?? d?.documento ?? d?.nomeTipo ?? d?.categoria ?? d?.tipoDocumento
    const label = labelMap[tipo as string] || String(tipo || 'Documento')
    const url = d?.urlDocumento ?? d?.url ?? d?.link ?? d?.arquivoUrl ?? d?.path ?? d?.caminho ?? d?.downloadUrl
    return {
      id: d?.id ?? d?.documentoId ?? d?.docId ?? d?.codigo,
      tipo,
      label,
  dataEnvio: d?.dataEnvio ?? d?.enviadoEm ?? d?.data ?? d?.dtEnvio,
      dataVencimento: d?.dataVencimento ?? d?.vencimento ?? d?.validade ?? d?.dataValidade ?? d?.dtVencimento,
      url,
      avaliacao: d?.avaliacao,
      matricula: d?.matricula,
      nomeImagem: d?.nomeImagem ?? d?.nomeArquivo ?? d?.filename,
      cooperativa: d?.cooperativa,
      dataAvaliacao: d?.dataAvaliacao,
      motivoReprovacao: d?.motivoReprovacao,
      usuarioAvaliacao: d?.usuarioAvaliacao,
    } as DocItem
  })
})

const requiredDocStatuses = computed(() => {
  const list = documentosList.value || []
  const hasFotoPerfil = list.some((d) => {
    const tipo = String(d?.tipo || '').toLowerCase()
    const label = String(d?.label || '').toLowerCase()
    return tipo === 'fotoperfil' || label.includes('foto de perfil')
  })
  const hasAtestado = list.some((d) => {
    const tipo = String(d?.tipo || '').toLowerCase()
    const label = String(d?.label || '').toLowerCase()
    return tipo.includes('atestado') || label.includes('atestado')
  })
  const hasAntecedentes = list.some((d) => {
    const tipo = String(d?.tipo || '').toLowerCase()
    const label = String(d?.label || '').toLowerCase()
    return tipo.includes('antecedente') || label.includes('antecedente')
  })
  const hasFotoUniforme = list.some((d) => {
    const tipo = String(d?.tipo || '').toLowerCase()
    const label = String(d?.label || '').toLowerCase()
    const nome = String((d as any)?.nomeImagem || '').toLowerCase()
    return tipo === 'fotouniforme' || (label.includes('uniforme') && label.includes('foto')) || (tipo === 'uniforme' && (label.includes('foto') || nome.includes('foto')))
  })
  return { fotoPerfil: hasFotoPerfil, atestado: hasAtestado, antecedentes: hasAntecedentes, fotoUniforme: hasFotoUniforme }
})

// Helper: identifica documento de Foto de Perfil
function isFotoPerfilDoc(d: any): boolean {
  const tipo = String(d?.tipo || '').toLowerCase()
  const label = String(d?.label || '').toLowerCase()
  return tipo === 'fotoperfil' || label.includes('foto de perfil')
}
// Helper: monta tooltip com informações completas do documento
function buildDocTooltip(d: any): string {
  const parts: string[] = []
  parts.push(`Envio:${formatDate(d?.dataEnvio)}`)
  if (d?.dataVencimento) parts.push(`Venc.:${formatDate(d?.dataVencimento)}`)
  if (d?.avaliacao != null) parts.push(`Avaliação:${String(d?.avaliacao)}`)
  if (d?.dataAvaliacao) parts.push(`Avaliado em:${formatDate(d?.dataAvaliacao)}`)
  if (d?.usuarioAvaliacao) parts.push(`Usuário:${String(d?.usuarioAvaliacao)}`)
  if (d?.matricula) parts.push(`Matrícula:${String(d?.matricula)}`)
  if (d?.cooperativa != null) parts.push(`Coop:${String(d?.cooperativa)}`)
  return parts.join('\n')
}

const antecedentesApiToken = import.meta.env.VITE_INFO_SIMPLES_TOKEN || ''
const antecedentesApiEndpoint = '/api/infosimples/api/v2/consultas/antecedentes-criminais/sp'
const antecedentesLoading = ref(false)
const antecedentesMessage = ref('')
const antecedentesMessageType = ref<'info' | 'error' | 'success'>('info')
const antecedentesLinks = ref<string[]>([])
const antecedentesLastResponse = ref<any | null>(null)

// Debug: log do token no console (remover em produção)
console.log('[Antecedentes] Token configurado:', antecedentesApiToken ? 'SIM (' + antecedentesApiToken.substring(0, 8) + '...)' : 'NÃO')

const antecedentesMessageClass = computed(() => {
  if (antecedentesMessageType.value === 'error') return 'text-red-600'
  if (antecedentesMessageType.value === 'success') return 'text-green-600'
  return 'text-zinc-500'
})

function toIsoDateString(val: unknown): string | null {
  if (!val) return null
  const raw = String(val).trim()
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [dd, mm, yyyy] = raw.split('/')
    return `${yyyy}-${mm}-${dd}`
  }
  const date = new Date(raw)
  if (!isNaN(date.getTime())) {
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }
  return null
}

function splitRg(val: unknown): { base: string | null; digit: string | null } {
  const cleaned = String(val || '').replace(/[^0-9Xx]/g, '')
  if (!cleaned) return { base: null, digit: null }
  if (cleaned.length === 1) return { base: cleaned, digit: null }
  return { base: cleaned.slice(0, -1), digit: cleaned.slice(-1).toUpperCase() }
}

function resolveGenero(): string | null {
  const rawGenero = (form.value as any)?.genero ?? (form.value as any)?.sexo ?? ''
  const s = String(rawGenero || '').trim().toUpperCase()
  if (!s) return null
  if (s === 'MASCULINO' || s === 'FEMININO') return s
  if (s.startsWith('M')) return 'MASCULINO'
  if (s.startsWith('F')) return 'FEMININO'
  return null
}

async function consultarAntecedentes() {
  antecedentesLinks.value = []
  antecedentesLastResponse.value = null
  antecedentesMessage.value = ''
  antecedentesMessageType.value = 'info'

  if (!antecedentesApiToken) {
    antecedentesMessage.value = 'Configure a variável VITE_INFO_SIMPLES_TOKEN no ambiente para habilitar a consulta.'
    antecedentesMessageType.value = 'error'
    return
  }

  const nome = String((form.value as any)?.nome || (form.value as any)?.name || '').trim()
  const birthdateIso = toIsoDateString((form.value as any)?.dataNasc ?? (form.value as any)?.birthdate)
  const genero = resolveGenero()

  if (!nome || !birthdateIso || !genero) {
    antecedentesMessage.value = 'Preencha nome, data de nascimento e gênero do cooperado para realizar a consulta.'
    antecedentesMessageType.value = 'error'
    return
  }

  const { base: rgBase, digit: rgDigit } = splitRg((form.value as any)?.rg)
  const rgExpedicaoIso = toIsoDateString((form.value as any)?.dataExp ?? (form.value as any)?.rgExpedicao)
  const cinCpf = String((form.value as any)?.cpf || '').replace(/[^0-9]/g, '')
  const cinExpedicaoIso = toIsoDateString(
    (form.value as any)?.cinExpedicao ??
    (form.value as any)?.cpfExpedicao ??
    (form.value as any)?.cinDataExpedicao
  )
  const pai = String((form.value as any)?.nomePai ?? (form.value as any)?.pai ?? '').trim()
  const mae = String((form.value as any)?.nomeMae ?? (form.value as any)?.mae ?? '').trim()

  const payload: Record<string, string> = {
    token: antecedentesApiToken,
    nome,
    birthdate: birthdateIso,
    genero,
    timeout: '300',
  }
  if (rgBase) payload.rg = rgBase
  if (rgDigit) payload.rg_digito = rgDigit
  if (rgExpedicaoIso) payload.rg_expedicao = rgExpedicaoIso
  if (cinCpf) payload.cin_cpf = cinCpf
  if (cinExpedicaoIso) payload.cin_expedicao = cinExpedicaoIso
  if (pai) payload.pai = pai
  if (mae) payload.mae = mae

  antecedentesLoading.value = true
  console.log('[Antecedentes] Payload:', payload)
  
  try {
    const response = await fetch(antecedentesApiEndpoint, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(payload),
      mode: 'cors',
    })
    
    console.log('[Antecedentes] Response status:', response.status)
    const json = await response.json().catch(() => ({}))
    console.log('[Antecedentes] Response JSON:', json)
    antecedentesLastResponse.value = json

    const code = Number(json?.code)
    const codeMessage = json?.code_message || json?.message || ''

    if (code === 200) {
      antecedentesMessage.value = codeMessage ? `Consulta realizada: ${codeMessage}` : 'Consulta realizada com sucesso.'
      antecedentesMessageType.value = 'success'
      const receipts = Array.isArray(json?.site_receipts)
        ? json.site_receipts.filter((link: any) => typeof link === 'string' && link)
        : []
      antecedentesLinks.value = receipts
    } else {
      const baseMessage = code ? `(${code})` : ''
      antecedentesMessage.value = `Não foi possível concluir a consulta ${baseMessage} ${codeMessage}`.trim()
      antecedentesMessageType.value = 'error'
      antecedentesLinks.value = []
    }

    if (!response.ok && !json?.code) {
      antecedentesMessage.value = `Erro ${response.status}: ${response.statusText || 'falha na consulta.'}`
      antecedentesMessageType.value = 'error'
      antecedentesLinks.value = []
    }
  } catch (err: any) {
    console.error('Erro ao consultar antecedentes', err)
    
    // Detecta erro de CORS
    if (err?.message?.includes('fetch') || err?.name === 'TypeError') {
      antecedentesMessage.value = 'Erro de CORS: A API Infosimples bloqueia chamadas diretas do navegador. É necessário criar um endpoint no backend para fazer a consulta.'
      antecedentesMessageType.value = 'error'
    } else {
      antecedentesMessage.value = `Erro ao consultar: ${err?.message || 'Verifique o console para detalhes.'}`
      antecedentesMessageType.value = 'error'
    }
    
    antecedentesLinks.value = []
  } finally {
    antecedentesLoading.value = false
  }
}

async function load(){
  try{
    loading.value = true
    const id = idParam.value
    if (!id || id === 'new') return
    // 1) Tenta usar o objeto completo salvo ao clicar no card (sem refetch)
    let data: any = null
    let usedCache = false
    try {
      const raw = sessionStorage.getItem('cooperados:detail')
      if (raw) {
        const obj = JSON.parse(raw)
        const objId = resolveCooperadoId(obj)
        if (obj && objId != null && String(objId) === String(id)) {
          data = obj
          usedCache = true
          // Opcional: limpar logo após o uso para evitar confusão ao navegar entre detalhes diferentes
          // sessionStorage.removeItem('cooperados:detail')
        }
      }
    } catch {}
    // 2) Fallback: se não achou no sessionStorage, buscar por id
    if (!data) {
      data = await getCooperado(id, new URLSearchParams())
    }
    // 2.1) Se usamos cache do card mas não há documentos, buscar o detalhe para enriquecer
    try {
      const hasDocsIn = (obj: any): boolean => {
        if (!obj || typeof obj !== 'object') return false
        const candidates = [
          obj?.documentos,
          obj?.docs,
          obj?.documentosEnviados,
          obj?.arquivos,
          obj?.anexos,
          obj?.listaDocumentos,
          obj?.documentosCooperado,
          obj?.images,
          obj?.imagens,
          obj?.uploads,
        ]
        return candidates.some(arr => Array.isArray(arr) && arr.length > 0)
      }
      if (usedCache && !hasDocsIn(data)) {
        const fresh = await getCooperado(id, new URLSearchParams())
        if (fresh && typeof fresh === 'object') {
          data = { ...(data || {}), ...(fresh || {}) }
        }
      }
    } catch {}
    // Debug: payload bruto e array 'data' (se houver)
    try {
      console.log('[cooperado.detail][raw]', data)
      if (data && Array.isArray((data as any).data)) {
        console.log('[cooperado.detail][raw.data] length=', (data as any).data.length, (data as any).data)
      }
    } catch {}
  rawResponse.value = data
  rawDataArray.value = (data && Array.isArray((data as any).data)) ? (data as any).data : null
  // Normalização do objeto principal
  let parsed: any = data
  if (data && typeof data === 'object' && 'data' in data) {
    const inner = (data as any).data
    if (Array.isArray(inner)) parsed = inner[0] || {}
    else if (inner && typeof inner === 'object') parsed = inner
  }
  if (parsed && typeof parsed === 'object' && (parsed as any).cooperado) parsed = (parsed as any).cooperado
  if (parsed && typeof parsed === 'object' && (parsed as any).cooperator) parsed = (parsed as any).cooperator
  form.value = (parsed || {}) as Row

  // Normalização de documentos: agrega de múltiplas origens e mapeia campos conhecidos
  try {
    const collectDocs = (obj: any): any[] => {
      if (!obj || typeof obj !== 'object') return []
      const out: any[] = []
      const pushIfArray = (arr: any) => { if (Array.isArray(arr)) out.push(...arr) }
      pushIfArray((obj as any).documentos)
      pushIfArray((obj as any).docs)
      pushIfArray((obj as any).documentosEnviados)
      pushIfArray((obj as any).arquivos)
      pushIfArray((obj as any).anexos)
      pushIfArray((obj as any).listaDocumentos)
      pushIfArray((obj as any).documentosCooperado)
      pushIfArray((obj as any).images)
      pushIfArray((obj as any).imagens)
      pushIfArray((obj as any).uploads)
      // também vasculha em data, se houver
      const inner = (obj && (obj as any).data && typeof (obj as any).data === 'object') ? (obj as any).data : null
      if (inner) {
        pushIfArray((inner as any).documentos)
        pushIfArray((inner as any).docs)
        pushIfArray((inner as any).documentosEnviados)
        pushIfArray((inner as any).arquivos)
        pushIfArray((inner as any).anexos)
        pushIfArray((inner as any).listaDocumentos)
        pushIfArray((inner as any).documentosCooperado)
        pushIfArray((inner as any).images)
        pushIfArray((inner as any).imagens)
        pushIfArray((inner as any).uploads)
      }
      return out
    }
    const rawDocs = [...collectDocs(form.value), ...collectDocs(data)]
    // Normaliza e remove duplicidades mantendo a ordem (id -> url -> nome/tipo como chave)
    const seen = new Set<string>()
    const normalized: any[] = []
    for (const d of rawDocs) {
      const item = {
        id: d?.id ?? d?.documentoId ?? d?.docId ?? d?.codigo,
        tipo: d?.tipo ?? d?.documento ?? d?.nomeTipo ?? d?.categoria ?? d?.tipoDocumento,
        dataEnvio: d?.dataEnvio ?? d?.enviadoEm ?? d?.data ?? d?.dtEnvio,
        dataVencimento: d?.dataVencimento ?? d?.vencimento ?? d?.validade ?? d?.dataValidade ?? d?.dtVencimento,
        urlDocumento: d?.urlDocumento ?? d?.url ?? d?.link ?? d?.arquivoUrl ?? d?.path ?? d?.caminho ?? d?.downloadUrl,
        avaliacao: d?.avaliacao,
        matricula: d?.matricula,
        nomeImagem: d?.nomeImagem ?? d?.nomeArquivo ?? d?.filename,
        cooperativa: d?.cooperativa,
        dataAvaliacao: d?.dataAvaliacao,
        motivoReprovacao: d?.motivoReprovacao,
        usuarioAvaliacao: d?.usuarioAvaliacao,
      }
      const key = String(
        item.id != null && String(item.id).trim() !== ''
          ? `id:${item.id}`
          : item.urlDocumento
            ? `url:${item.urlDocumento}`
            : `nm:${item.nomeImagem || ''}|t:${item.tipo || ''}|e:${item.dataEnvio || ''}|v:${item.dataVencimento || ''}`
      )
      if (seen.has(key)) continue
      seen.add(key)
      normalized.push(item)
    }
    ;(form.value as any).documentos = normalized
    console.log('[cooperado.detail][documentos.normalized]', normalized.length)
  } catch (e) {
    console.warn('[cooperado.detail] normalização de documentos falhou', e)
  }
    // Debug: objeto normalizado, documentos e urls de imagem
    try {
      console.log('[cooperado.detail][parsed]', form.value)
      const docs = (form.value as any)?.documentos
      console.log('[cooperado.detail][documentos]', Array.isArray(docs) ? docs : 'documentos não é array')
      console.log('[cooperado.detail][urls]', {
        urlImg1: (form.value as any)?.urlImg1,
        urlImg2: (form.value as any)?.urlImg2,
        urlImg3: (form.value as any)?.urlImg3,
        urlImg4: (form.value as any)?.urlImg4,
      })
    } catch {}
    // históricos: carregaremos sob demanda ao abrir as abas
    payments.value = []
    checkins.value = []
    extrasLoaded.value = false
    // avisos: resetar cache ao trocar de cooperado
    avisos.value = []
    avisosLoaded.value = false
  } finally { loading.value = false }
}

async function ensureExtrasLoaded(){
  if (extrasLoaded.value) return
  const id = idParam.value
  if (!id || id === 'new') return
  try {
    extrasLoading.value = true
    const [p, c] = await Promise.all([
      listCooperadoPayments(String(id)),
      listCooperadoCheckins(String(id)),
    ])
    payments.value = Array.isArray(p) ? p : []
    checkins.value = Array.isArray(c) ? c : []
    extrasLoaded.value = true
  } catch (e) {
    payments.value = payments.value || []
    checkins.value = checkins.value || []
  } finally {
    extrasLoading.value = false
  }
}

async function ensureAvisosLoaded(){
  if (avisosLoaded.value) return
  const id = idParam.value
  if (!id || id === 'new') return
  
  // Extrai cooperativa e matrícula do form
  const cooperativa = (form.value as any)?.cooperativa
  const matricula = (form.value as any)?.matricula
  
  if (!cooperativa || !matricula) {
    console.warn('[CooperadoDetail] Avisos: cooperativa ou matricula não disponível', { cooperativa, matricula })
    avisos.value = []
    avisosLoaded.value = true
    return
  }
  
  try {
    avisosLoading.value = true
    // Passa cooperativa e matricula como parâmetros
    const params = new URLSearchParams({
      cooperativa: String(cooperativa),
      matricula: String(matricula),
      limit: String(avisosLimit.value)
    })
    const result = await listAvisos(params)
    avisos.value = Array.isArray(result) ? result : []
    avisosLoaded.value = true
  } catch (e) {
    console.error('[CooperadoDetail] Erro ao carregar avisos:', e)
    avisos.value = []
  } finally {
    avisosLoading.value = false
  }
}

// Função para recarregar avisos quando o limite mudar
async function reloadAvisos() {
  avisosLoaded.value = false
  await ensureAvisosLoaded()
}

async function ensureEscalasLoaded(){
  if (escalasLoaded.value) return
  const id = idParam.value
  if (!id || id === 'new') return
  
  // Extrai cooperativa e matrícula do form
  const cooperativa = (form.value as any)?.cooperativa
  const matricula = (form.value as any)?.matricula
  
  if (!cooperativa || !matricula) {
    console.warn('[CooperadoDetail] Escalas: cooperativa ou matricula não disponível', { cooperativa, matricula })
    escalas.value = []
    escalasLoaded.value = true
    return
  }
  
  try {
    escalasLoading.value = true
    let todasEscalas: any[] = []
    let paginaAtual = 0
    let totalPaginas = 1
    
    // Loop para buscar todas as páginas
    while (paginaAtual < totalPaginas) {
      const params = new URLSearchParams({
        cooperativa: String(cooperativa),
        matricula: String(matricula),
        page: String(paginaAtual),
        limit: '100' // Busca 100 por vez
      })
      
      console.log(`[CooperadoDetail] Carregando escalas - página ${paginaAtual + 1}`)
      const response = await listEscalas(params)
      
      // Se a resposta tem estrutura de paginação
      if (response && typeof response === 'object' && 'data' in response) {
        const dados = response.data || []
        todasEscalas = todasEscalas.concat(dados)
        totalPaginas = response.totalPages || 1
        console.log(`[CooperadoDetail] Página ${paginaAtual + 1}/${totalPaginas} - ${dados.length} registros (total acumulado: ${todasEscalas.length})`)
      } else if (Array.isArray(response)) {
        // Se veio array direto, não tem paginação
        todasEscalas = response
        break
      }
      
      paginaAtual++
    }
    
    console.log('[CooperadoDetail] Total de escalas carregadas:', todasEscalas.length)
    escalas.value = todasEscalas
    escalasLoaded.value = true
  } catch (e) {
    console.error('[CooperadoDetail] Erro ao carregar escalas:', e)
    escalas.value = []
  } finally {
    escalasLoading.value = false
  }
}

// Função para recarregar escalas
async function reloadEscalas() {
  escalasLoaded.value = false
  await ensureEscalasLoaded()
}

function goBack(){
  try {
    sessionStorage.setItem('cooperados:restore', '1')
    const id = idParam.value
    if (id) {
      sessionStorage.setItem('cooperados:last', JSON.stringify({ id: String(id), at: Date.now() }))
    }
  } catch {}
  if (window.history.length > 1) router.back()
  else router.push({ name: 'cooperados' })
}

function startEdit(){ 
  const id = idParam.value
  if (id && id !== 'new') {
    router.push({ name: 'cooperado-edit', params: { id } })
  } else {
    editing.value = true
  }
}
function cancelEdit(){ editing.value = false }
async function saveEdit(){
  try{
    const id = idParam.value
    if (!id) return
    const payload: any = {
      nome: form.value.nome,
      cidade: form.value.cidade,
      uf: form.value.uf || form.value.estado,
      status: form.value.status,
    }
    await updateCooperado(String(id), payload)
    editing.value = false
  }catch(e){
    console.error('Falha ao salvar alterações', e)
  }
}

onMounted(async () => {
  await Promise.all([ensureFuncoesCatalog(), load()])
  escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeImage()
  }
  window.addEventListener('keydown', escHandler)
})
onBeforeUnmount(() => {
  if (escHandler) window.removeEventListener('keydown', escHandler)
})
// Lazy-load quando o usuário abrir as abas que dependem de históricos
watch(activeTab, async (tab) => {
  if (tab === 'financeiro') {
    await ensureExtrasLoaded()
  }
  if (tab === 'alertas') {
    await ensureAvisosLoaded()
  }
  if (tab === 'presencas' || tab === 'perfil') {
    await ensureEscalasLoaded()
  }
})
watch(idParam, load)

// Resetar filtro de status quando o filtro de título mudar
watch(avisosFiltro, () => {
  avisosFiltroStatus.value = 'todos'
})

watch(escalasFiltroCliente, () => {
  escalasFiltroStatus.value = 'todos'
})
</script>

<template>
  <div>
    <section>
      <!-- Breadcrumb acima do título + botão Editar -->
      <div class="flex items-center justify-between">
        <Breadcrumbs />
        <button
          @click="startEdit"
          class="rounded-full bg-[#0B61F3] px-3 py-1 text-sm font-semibold text-white shadow-sm hover:bg-blue-600 inline-flex items-center gap-2"
          title="Editar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9"/>
            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
          <span>Editar</span>
        </button>
      </div>
      <!-- Cabeçalho com avatar e botão editar -->
      <header class="mb-3 flex items-center justify-between gap-3 card p-3 mt-3">
      <div class="flex items-center gap-3 min-w-0">
        <div class="h-20 w-20 overflow-hidden bg-zinc-200 text-zinc-600 flex items-center justify-center ring-1 ring-zinc-300 rounded">
          <img
            v-if="getAvatarUrl(form)"
            :src="getAvatarUrl(form)"
            class="h-full w-full object-cover cursor-zoom-in"
            @click="openImage(getAvatarUrl(form))"
          />
          <span v-else class="text-[12px] font-semibold"></span>
        </div>
        <div class="min-w-0">
          <h1 class="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 truncate">
            {{ pageTitle }}
            <span v-if="form.status" :class="['ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded align-middle text-xs', statusBadgeClass]">
              {{ form.status }}
            </span>
          </h1>
          <div class="flex flex-wrap items-center gap-2 text-xs text-zinc-600 mt-1">
            <span v-if="form.cidade || form.regiao || form.regiao_sp || form.zona" class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">
              {{ form.cidade || '-' }}
              <span v-if="form.regiao || form.regiao_sp || form.zona"> - {{ form.regiao || form.regiao_sp || form.zona }}</span>
            </span>
            <span v-if="form.dataNasc" class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">
              {{ formatDate(form.dataNasc) }}
              <span v-if="calcIdade(form.dataNasc) !== null"> ({{ calcIdade(form.dataNasc) }} anos)</span>
            </span>
          </div>
        </div>
      </div>
      
    </header>

    <!-- Abas -->
    <nav class="mb-4 border-b border-zinc-200 dark:border-zinc-700 text-sm">
      <ul class="flex gap-4">
        <li><button @click="activeTab='perfil'" :class="activeTab==='perfil'?'border-b-2 border-blue-600 text-blue-700':'text-zinc-600'" class="px-1 py-2">Perfil</button></li>
        <li><button @click="activeTab='financeiro'" :class="activeTab==='financeiro'?'border-b-2 border-blue-600 text-blue-700':'text-zinc-600'" class="px-1 py-2">Financeiro</button></li>
        <li><button @click="activeTab='presencas'" :class="activeTab==='presencas'?'border-b-2 border-blue-600 text-blue-700':'text-zinc-600'" class="px-1 py-2">Presenças</button></li>
        <li><button @click="activeTab='alertas'" :class="activeTab==='alertas'?'border-b-2 border-blue-600 text-blue-700':'text-zinc-600'" class="px-1 py-2">Alertas</button></li>
        <li><button @click="activeTab='ofertas'" :class="activeTab==='ofertas'?'border-b-2 border-blue-600 text-blue-700':'text-zinc-600'" class="px-1 py-2">Ofertas</button></li>
        <li><button @click="activeTab='agenda'" :class="activeTab==='agenda'?'border-b-2 border-blue-600 text-blue-700':'text-zinc-600'" class="px-1 py-2">Agenda</button></li>
      </ul>
    </nav>

    <div v-if="loading" class="card p-4 animate-pulse">
      <div class="h-5 w-1/4 bg-zinc-200 rounded"></div>
      <div class="mt-2 h-4 w-1/3 bg-zinc-200 rounded"></div>
    </div>
    <div v-else class="space-y-3">
      <!-- ...conteúdo existente... -->
    </div>
      <!-- Perfil -->
      <div v-if="activeTab==='perfil'" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <!-- Coluna 1: Informações Pessoais + Funções -->
        <div class="flex flex-col gap-3">
          <div class="card p-4 h-full">
          <div class="text-[11px] uppercase text-zinc-500 mb-2">Informações Pessoais</div>
          <div v-if="!editing" class="text-sm space-y-3">
            <!-- Linha 1: Nome (2 colunas) + Nascimento (1 coluna) -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div class="sm:col-span-2">
                <div class="text-[11px] uppercase text-zinc-500">Nome</div>
                <div class="font-medium">{{ form.nome || pageTitle }}</div>
              </div>
              <div>
                <div class="text-[11px] uppercase text-zinc-500">Nascimento</div>
                <div class="font-medium flex items-center gap-2">
                  <span>{{ formatDate(form.dataNasc) }}</span>
                  <span v-if="calcIdade(form.dataNasc) !== null" class="text-xs text-zinc-500">({{ calcIdade(form.dataNasc) }} anos)</span>
                </div>
              </div>
            </div>
            <!-- Linha 2: CPF + RG + Expedição -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <div class="text-[11px] uppercase text-zinc-500">CPF</div>
                <div class="font-medium">{{ form.cpf || '-' }}</div>
              </div>
              <div>
                <div class="text-[11px] uppercase text-zinc-500">RG</div>
                <div class="font-medium">{{ form.rg || '-' }}</div>
              </div>
              <div>
                <div class="text-[11px] uppercase text-zinc-500">Expedição (RG)</div>
                <div class="font-medium">{{ formatDate(form.dataExp) }}</div>
              </div>
            </div>
            <!-- Linha 3: Mãe + Pai -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div class="text-[11px] uppercase text-zinc-500">Mãe</div>
                <div class="font-medium">{{ form.nomeMae || '-' }}</div>
              </div>
              <div>
                <div class="text-[11px] uppercase text-zinc-500">Pai</div>
                <div class="font-medium">{{ form.nomePai || '-' }}</div>
              </div>
            </div>
          </div>
          <!-- Form edição -->
          <div v-else class="space-y-3">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label class="text-sm">Nome
                <input v-model="(form as any).nome" class="px-2 py-1 border rounded w-full" />
              </label>
              <label class="text-sm">Cidade
                <input v-model="(form as any).cidade" class="px-2 py-1 border rounded w-full" />
              </label>
              <label class="text-sm">UF
                <input v-model="(form as any).uf" class="px-2 py-1 border rounded w-full" />
              </label>
              <label class="text-sm">Status
                <input v-model="(form as any).status" class="px-2 py-1 border rounded w-full" />
              </label>
            </div>
            <div class="flex justify-end gap-2">
              <button @click="cancelEdit" class="px-3 py-1.5 rounded border">Cancelar</button>
              <button @click="saveEdit" class="px-3 py-1.5 rounded bg-blue-600 text-white">Salvar</button>
            </div>
          </div>
          </div>
          <!-- Endereço -->
          <div class="card p-4 h-full">
            <div class="text-[11px] uppercase text-zinc-500 mb-2">Endereço</div>
            <div class="text-sm space-y-3">
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <div class="text-[11px] uppercase text-zinc-500">Logradouro</div>
                  <div class="font-medium">{{ form.logradouro || form.endereco || form.rua || '-' }}</div>
                </div>
                <div>
                  <div class="text-[11px] uppercase text-zinc-500">Número</div>
                  <div class="font-medium">{{ form.numero || form.num || '-' }}</div>
                </div>
                <div>
                  <div class="text-[11px] uppercase text-zinc-500">Complemento</div>
                  <div class="font-medium">{{ form.complemento || form.compl || '-' }}</div>
                </div>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <div class="text-[11px] uppercase text-zinc-500">Bairro</div>
                  <div class="font-medium">{{ form.bairro || '-' }}</div>
                </div>
                <div>
                  <div class="text-[11px] uppercase text-zinc-500">Cidade</div>
                  <div class="font-medium">{{ form.cidade || '-' }}</div>
                </div>
                <div>
                  <div class="text-[11px] uppercase text-zinc-500">UF</div>
                  <div class="font-medium">{{ form.uf || form.estado || '-' }}</div>
                </div>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <div class="text-[11px] uppercase text-zinc-500">CEP</div>
                  <div class="font-medium">{{ form.cep || '-' }}</div>
                </div>
                <div class="sm:col-span-2">
                  <div class="text-[11px] uppercase text-zinc-500">Região/Zona</div>
                  <div class="font-medium">{{ form.regiao || form.regiao_sp || form.zona || '-' }}</div>
                </div>
              </div>
            </div>
          </div>
          <!-- (Funções movido para a coluna do meio) -->
        </div>

        <!-- Coluna 2: Informações de Contato + Funções -->
        <div class="flex flex-col gap-3">
          <!-- Informações de Contato -->
          <div v-if="!editing" class="card p-4">
            <div class="text-[11px] uppercase text-zinc-500 mb-2">Informações de Contato</div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div class="sm:col-span-2">
                <div class="text-[11px] uppercase text-zinc-500">E-mail</div>
                <div class="font-medium break-all">{{ form.email || '-' }}</div>
              </div>
              <div>
                <div class="text-[11px] uppercase text-zinc-500">Telefone 1</div>
                <div class="font-medium flex items-center gap-2">
                  <a :href="toWhatsUrl(form.telefone1)" target="_blank" rel="noopener" class="text-green-600 hover:underline" v-if="form.telefone1">{{ form.telefone1 }}</a>
                  <span v-else>-</span>
                </div>
              </div>
              <div>
                <div class="text-[11px] uppercase text-zinc-500">Telefone 2</div>
                <div class="font-medium">{{ form.telefone2 || '-' }}</div>
              </div>
            </div>
          </div>
          <!-- Funções -->
          <div class="card p-4 h-full">
            <div class="text-[11px] uppercase text-zinc-500 mb-2">Funções</div>
            <div class="flex flex-wrap gap-1">
              <template v-for="(f, i) in funcoesDedupe" :key="String(f)+i">
                <span class="px-2 py-0.5 text-xs rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">{{ f }}</span>
              </template>
              <span v-if="!funcoesDedupe.length" class="text-sm text-zinc-500">—</span>
            </div>
          </div>
        </div>

        <!-- Coluna 3: Histórico + Documentos -->
        <div class="flex flex-col gap-3">
          <!-- Card: Histórico do Cooperado -->
          <div class="card p-4" :class="thermoCardBgClass">
            <div class="mb-3 flex items-center justify-between">
              <div class="text-[11px] uppercase text-zinc-500">Histórico do Cooperado</div>
              <span :class="['px-2 py-0.5 rounded text-[10px] font-medium ml-auto', thermoBadgeClass]">{{ classificacao }}</span>
            </div>
            <!-- Gráficos redondos (lado a lado) -->
            <div class="flex items-center gap-6 flex-wrap">
              <!-- Final (colorido) -->
              <div class="text-center">
                <div class="relative w-16 h-16">
                  <svg viewBox="0 0 44 44" class="w-16 h-16 rotate-[-90deg]">
                    <circle cx="22" cy="22" r="18" class="stroke-zinc-200 dark:stroke-zinc-700" stroke-width="4" fill="none" />
                    <circle cx="22" cy="22" r="18" :class="thermoStrokeClass" stroke-width="4" fill="none"
                      :stroke-dasharray="ringC" :stroke-dashoffset="dashOffset(finalScore)" stroke-linecap="round" />
                  </svg>
                  <div class="absolute inset-0 flex items-center justify-center">
                    <span class="text-xs font-semibold text-zinc-700 dark:text-zinc-100">{{ finalScore.toFixed(0) }}%</span>
                  </div>
                </div>
                <div class="mt-1 text-[10px] text-zinc-600 dark:text-zinc-300">Classificação</div>
              </div>

              <!-- Check-in -->
              <div class="text-center">
                <div class="relative w-16 h-16">
                  <svg viewBox="0 0 44 44" class="w-16 h-16 rotate-[-90deg]">
                    <circle cx="22" cy="22" r="18" class="stroke-zinc-200 dark:stroke-zinc-700" stroke-width="4" fill="none" />
                    <circle cx="22" cy="22" r="18" class="stroke-zinc-500 dark:stroke-zinc-300" stroke-width="4" fill="none"
                      :stroke-dasharray="ringC" :stroke-dashoffset="dashOffset(checkInScorePct)" stroke-linecap="round" />
                  </svg>
                  <div class="absolute inset-0 flex items-center justify-center">
                    <span class="text-xs font-semibold text-zinc-700 dark:text-zinc-100">{{ checkInScorePct.toFixed(0) }}%</span>
                  </div>
                </div>
                <div class="mt-1 text-[10px] text-zinc-600 dark:text-zinc-300">Check-in</div>
              </div>

              <!-- Checkout -->
              <div class="text-center">
                <div class="relative w-16 h-16">
                  <svg viewBox="0 0 44 44" class="w-16 h-16 rotate-[-90deg]">
                    <circle cx="22" cy="22" r="18" class="stroke-zinc-200 dark:stroke-zinc-700" stroke-width="4" fill="none" />
                    <circle cx="22" cy="22" r="18" class="stroke-zinc-500 dark:stroke-zinc-300" stroke-width="4" fill="none"
                      :stroke-dasharray="ringC" :stroke-dashoffset="dashOffset(checkOutPct)" stroke-linecap="round" />
                  </svg>
                  <div class="absolute inset-0 flex items-center justify-center">
                    <span class="text-xs font-semibold text-zinc-700 dark:text-zinc-100">{{ checkOutPct.toFixed(0) }}%</span>
                  </div>
                </div>
                <div class="mt-1 text-[10px] text-zinc-600 dark:text-zinc-300">Checkout</div>
              </div>

              <!-- Pontualidade -->
              <div class="text-center">
                <div class="relative w-16 h-16">
                  <svg viewBox="0 0 44 44" class="w-16 h-16 rotate-[-90deg]">
                    <circle cx="22" cy="22" r="18" class="stroke-zinc-200 dark:stroke-zinc-700" stroke-width="4" fill="none" />
                    <circle cx="22" cy="22" r="18" class="stroke-zinc-500 dark:stroke-zinc-300" stroke-width="4" fill="none"
                      :stroke-dasharray="ringC" :stroke-dashoffset="dashOffset(punctualidadePct)" stroke-linecap="round" />
                  </svg>
                  <div class="absolute inset-0 flex items-center justify-center">
                    <span class="text-xs font-semibold text-zinc-700 dark:text-zinc-100">{{ punctualidadePct.toFixed(0) }}%</span>
                  </div>
                </div>
                <div class="mt-1 text-[10px] text-zinc-600 dark:text-zinc-300">Pontualidade</div>
              </div>

              <!-- Avaliação -->
              <div class="text-center">
                <div class="relative w-16 h-16">
                  <svg viewBox="0 0 44 44" class="w-16 h-16 rotate-[-90deg]">
                    <circle cx="22" cy="22" r="18" class="stroke-zinc-200 dark:stroke-zinc-700" stroke-width="4" fill="none" />
                    <circle cx="22" cy="22" r="18" class="stroke-zinc-500 dark:stroke-zinc-300" stroke-width="4" fill="none"
                      :stroke-dasharray="ringC" :stroke-dashoffset="dashOffset(avaliacaoPct)" stroke-linecap="round" />
                  </svg>
                  <div class="absolute inset-0 flex items-center justify-center">
                    <span class="text-xs font-semibold text-zinc-700 dark:text-zinc-100">{{ avaliacaoPct.toFixed(0) }}%</span>
                  </div>
                </div>
                <div class="mt-1 text-[10px] text-zinc-600 dark:text-zinc-300">Avaliação</div>
              </div>
            </div>
          </div>

          <!-- Card: Documentos -->
          <div class="card p-4 h-full">
            <div class="flex items-center justify-between mb-2">
              <div class="text-[11px] uppercase text-zinc-500">Documentos</div>
              <div class="flex items-center gap-2">
                <span v-if="docFlags.antecedentes" class="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">Antecedentes vencidos</span>
                <span v-if="docFlags.uniforme" class="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">Uniforme vencido</span>
              </div>
            </div>
            <div class="text-sm">
              <div v-if="!documentosList.length" class="text-zinc-500">Nenhum documento enviado.</div>
              <ul v-else class="divide-y divide-zinc-200 dark:divide-zinc-700">
                <li v-for="d in documentosList" :key="String(d.id || d.label + d.url)" class="py-2 flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="font-medium flex items-center gap-2">
                      <span>{{ d.label }}</span>
                    </div>
                    <div class="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                      <div class="text-zinc-500"><span class="mr-1">Envio:</span><span class="text-zinc-800 dark:text-zinc-200 font-medium">{{ formatDate(d.dataEnvio) }}</span></div>
                      <div v-if="d.dataVencimento" class="text-zinc-500"><span class="mr-1">Validade:</span><span class="text-zinc-800 dark:text-zinc-200 font-medium">{{ formatDate(d.dataVencimento) }}</span></div>
                      <div v-if="d.avaliacao != null" class="text-zinc-500">
                        <span class="mr-1">Avaliação:</span>
                        <span :class="['inline-flex items-center gap-1 px-1.5 py-0.5 rounded align-middle', statusToBadge(d.avaliacao)]">{{ String(d.avaliacao) }}</span>
                      </div>
                      <div v-if="d.dataAvaliacao" class="text-zinc-500"><span class="mr-1">Avaliado em:</span><span class="text-zinc-800 dark:text-zinc-200 font-medium">{{ formatDate(d.dataAvaliacao) }}</span></div>
                      <div v-if="d.motivoReprovacao" class="text-zinc-500"><span class="mr-1">Motivo:</span><span class="text-zinc-800 dark:text-zinc-200 font-medium">{{ d.motivoReprovacao }}</span></div>
                    </div>
                  </div>
                  <div class="shrink-0 flex items-center gap-3">
                    <button
                      v-if="d.url"
                      type="button"
                      class="block h-10 w-10 rounded overflow-hidden ring-1 ring-zinc-300 cursor-zoom-in"
                      @click="openImage(d.url)"
                      title="Ampliar"
                    >
                      <img :src="d.url" alt="doc" class="h-full w-full object-cover" />
                    </button>
                  </div>
                </li>
              </ul>
              <!-- Requisitos obrigatórios abaixo, seguindo padrão de divisão -->
              <div
                v-if="!requiredDocStatuses.fotoPerfil || !requiredDocStatuses.atestado || !requiredDocStatuses.antecedentes || !requiredDocStatuses.fotoUniforme"
                class="mt-2 divide-y divide-zinc-200 dark:divide-zinc-700"
              >
                <div v-if="!requiredDocStatuses.fotoPerfil" class="py-2 flex items-center justify-between">
                  <div class="font-medium">Foto de Perfil</div>
                  <span class="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800">Pendente</span>
                </div>
                <div v-if="!requiredDocStatuses.atestado" class="py-2 flex items-center justify-between">
                  <div class="font-medium">Atestado Médico</div>
                  <span class="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800">Pendente</span>
                </div>
                <div v-if="!requiredDocStatuses.antecedentes" class="py-2 flex items-center justify-between">
                  <div class="font-medium">Antecedentes Criminais</div>
                  <span class="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800">Pendente</span>
                </div>
                
              </div>
              
            </div>
          </div>
        </div>
      </div>

      <!-- Financeiro (Aba) -->
  <div v-if="activeTab==='financeiro'" class="grid grid-cols-1 gap-3">
        <div class="card p-4">
          <div class="text-[11px] uppercase text-zinc-500 mb-2">Financeiro</div>
          <div v-if="extrasLoading" class="text-sm text-zinc-500">Carregando…</div>
          <div v-else-if="!payments.length" class="text-sm text-zinc-500">Sem registros.</div>
          <ul v-else class="divide-y divide-zinc-200 dark:divide-zinc-700 text-sm">
            <li v-for="(p,i) in payments" :key="'p'+i" class="py-2 flex items-center justify-between">
              <div class="min-w-0">
                <div class="font-medium truncate">{{ p.descricao || p.descr || p.referencia || 'Pagamento' }}</div>
                <div class="text-xs text-zinc-500">{{ formatDate(p.data || p.data_pagamento || p.dt) }}</div>
              </div>
              <div class="shrink-0 font-medium">{{ p.valor || p.total || '-' }}</div>
            </li>
          </ul>
        </div>
      </div>
      <!-- Alertas -->
  <div v-if="activeTab==='alertas'" class="space-y-4">
        <!-- Cabeçalho com Filtros -->
        <div class="card p-4">
          
          <!-- Filtros e Limite -->
          <div class="space-y-3">
            <!-- Linha de Selects -->
            <div class="flex flex-wrap items-end gap-3">
              <!-- Filtro por Título -->
              <div class="flex flex-col gap-1 w-64">
                <label class="text-xs font-medium text-zinc-600 dark:text-zinc-400">Título:</label>
                <select 
                  v-model="avisosFiltro"
                  class="px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="todos">Todos ({{ avisosContadores.todos }})</option>
                  <option v-for="titulo in titulosUnicos" :key="titulo" :value="titulo">
                    {{ titulo }} ({{ avisosContadores[titulo] || 0 }})
                  </option>
                </select>
              </div>
              
              <!-- Filtro por Status -->
              <div class="flex flex-col gap-1 w-64">
                <label class="text-xs font-medium text-zinc-600 dark:text-zinc-400">Status:</label>
                <select 
                  v-model="avisosFiltroStatus"
                  class="px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="todos">Todos ({{ avisosContadoresStatus.todos }})</option>
                  <option v-for="status in statusUnicos" :key="status" :value="status">
                    {{ status }} ({{ avisosContadoresStatus[status] || 0 }})
                  </option>
                </select>
              </div>
              
              <!-- Seletor de Limite -->
              <div class="flex flex-col gap-1 ml-auto">
                <label class="text-xs font-medium text-zinc-600 dark:text-zinc-400">Limite:</label>
                <select 
                  v-model.number="avisosLimit" 
                  @change="reloadAvisos"
                  class="px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent w-32"
                >
                  <option :value="20">20</option>
                  <option :value="40">40</option>
                  <option :value="60">60</option>
                  <option :value="80">80</option>
                  <option :value="100">100</option>
                  <option :value="1000">1000</option>
                </select>
              </div>
            </div>
            
            <!-- Chips de Filtros Ativos -->
            <div v-if="avisosFiltro !== 'todos' || avisosFiltroStatus !== 'todos'" class="flex flex-wrap gap-2">
              <span 
                v-if="avisosFiltro !== 'todos'"
                class="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded text-xs border border-blue-300 dark:border-blue-700"
              >
                Título: {{ avisosFiltro }}
                <button 
                  @click="avisosFiltro = 'todos'"
                  class="hover:bg-blue-200 dark:hover:bg-blue-800 rounded px-1"
                >×</button>
              </span>
              
              <span 
                v-if="avisosFiltroStatus !== 'todos'"
                class="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded text-xs border border-purple-300 dark:border-purple-700"
              >
                Status: {{ avisosFiltroStatus }}
                <button 
                  @click="avisosFiltroStatus = 'todos'"
                  class="hover:bg-purple-200 dark:hover:bg-purple-800 rounded px-1"
                >×</button>
              </span>
            </div>
          </div>
        </div>
        
        <!-- Loading -->
        <div v-if="avisosLoading" class="card p-8">
          <div class="flex items-center justify-center">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </div>
        
        <!-- Grid de Avisos (3 por linha) -->
        <div v-else-if="avisosFiltrados.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div 
            v-for="aviso in avisosFiltrados" 
            :key="aviso.id" 
            class="card p-4 rounded-lg border-l-4 transition-shadow hover:shadow-md"
            :class="{
              'border-l-yellow-500 bg-yellow-50/50 dark:bg-yellow-900/10': aviso.titulo === 'ATENÇÃO!' || aviso.titulo === 'Atenção',
              'border-l-blue-500 bg-blue-50/50 dark:bg-blue-900/10': aviso.titulo === 'NOVO EVENTO' || aviso.titulo === 'Novo evento',
              'border-l-gray-500 bg-gray-50/50 dark:bg-gray-800/50': aviso.status === 'removido',
              'border-l-zinc-400 bg-zinc-50/50 dark:bg-zinc-800/50': aviso.titulo !== 'ATENÇÃO!' && aviso.titulo !== 'Atenção' && aviso.titulo !== 'NOVO EVENTO' && aviso.titulo !== 'Novo evento' && aviso.status !== 'removido'
            }"
          >
            <!-- Cabeçalho: Ícone + Título -->
            <div class="flex items-start gap-2 mb-2">
              <div class="flex items-start gap-2 min-w-0 flex-1">
                <svg v-if="aviso.status === 'removido'" class="w-5 h-5 text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <svg v-else-if="aviso.titulo === 'ATENÇÃO!' || aviso.titulo === 'Atenção'" class="w-5 h-5 text-yellow-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <svg v-else-if="aviso.titulo === 'NOVO EVENTO' || aviso.titulo === 'Novo evento'" class="w-5 h-5 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <svg v-else class="w-5 h-5 text-zinc-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                
                <!-- Título -->
                <h3 class="font-semibold text-sm line-clamp-2 min-w-0" :class="{
                  'text-gray-900 dark:text-gray-400': aviso.status === 'removido',
                  'text-yellow-900 dark:text-yellow-400': aviso.status !== 'removido' && (aviso.titulo === 'ATENÇÃO!' || aviso.titulo === 'Atenção'),
                  'text-blue-900 dark:text-blue-400': aviso.status !== 'removido' && (aviso.titulo === 'NOVO EVENTO' || aviso.titulo === 'Novo evento'),
                  'text-zinc-900 dark:text-zinc-300': aviso.status !== 'removido' && aviso.titulo !== 'ATENÇÃO!' && aviso.titulo !== 'Atenção' && aviso.titulo !== 'NOVO EVENTO' && aviso.titulo !== 'Novo evento'
                }">
                  {{ aviso.titulo }}
                </h3>
              </div>
              
              <!-- Badge de Status -->
              <span v-if="aviso.status" class="text-xs px-2 py-0.5 rounded-full flex-shrink-0" :class="{
                'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400': aviso.status === 'erro',
                'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400': aviso.status === 'alerta',
                'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400': aviso.status === 'info',
                'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400': aviso.status === 'interagir',
                'bg-zinc-100 text-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-400': aviso.status === 'pendente',
                'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400': aviso.status === 'removido'
              }">
                {{ aviso.status }}
              </span>
            </div>
            
            <!-- Mensagem Principal -->
            <p class="text-xs text-zinc-700 dark:text-zinc-300 mb-2 line-clamp-3">
              {{ aviso.msg1 }}
            </p>
            
            <!-- Mensagem Secundária (se existir) -->
            <p v-if="aviso.msg2" class="text-xs text-zinc-600 dark:text-zinc-400 mb-2 line-clamp-2">
              {{ aviso.msg2 }}
            </p>
            
            <!-- Rodapé -->
            <div class="mt-auto pt-2 border-t border-zinc-200 dark:border-zinc-700">
              <div class="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span v-if="aviso.user_create" class="inline-flex items-center gap-1 truncate">
                  <svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  {{ aviso.user_create }}
                </span>
                <span v-if="aviso.data_create" class="truncate">
                  {{ new Date(aviso.data_create).toLocaleString('pt-BR', { 
                    day: '2-digit', 
                    month: '2-digit', 
                    year: 'numeric',
                    hour: '2-digit', 
                    minute: '2-digit' 
                  }) }}
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Vazio -->
        <div v-else class="card p-8">
          <div class="text-center text-sm text-zinc-500">
            <svg class="w-12 h-12 mx-auto mb-2 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            {{ avisosFiltro === 'todos' ? 'Sem alertas' : `Nenhum alerta do tipo "${avisosFiltro}"` }}
          </div>
        </div>
      </div>

      <!-- Ofertas -->
  <div v-if="activeTab==='ofertas'" class="card p-4">
        <div class="text-[11px] uppercase text-zinc-500 mb-2">Ofertas</div>
        <div class="text-sm text-zinc-500">Sem ofertas.</div>
      </div>

      <!-- Agenda -->
  <div v-if="activeTab==='agenda'" class="card p-4">
        <div class="text-[11px] uppercase text-zinc-500 mb-2">Agenda</div>
        <div class="text-sm text-zinc-500">Sem itens de agenda.</div>
      </div>

  <!-- Presenças -->
  <div v-if="activeTab==='presencas'">

        <!-- Cards de resumo: Total de Horas + Histórico do Cooperado -->
        <div v-if="escalasFiltradas.length > 0" class="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <!-- Card: Total de Horas Trabalhadas -->
          <div class="bg-gradient-to-r from-zinc-50 to-zinc-100 dark:from-zinc-800/30 dark:to-zinc-800/10 border border-zinc-200 dark:border-zinc-700 rounded-lg p-4">
            <div class="flex items-center gap-3 mb-3">
              <svg class="w-5 h-5 text-zinc-700 dark:text-zinc-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Total de Horas Trabalhadas</h3>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div class="bg-white dark:bg-zinc-800 rounded-lg p-3 border border-zinc-200 dark:border-zinc-700">
                <div class="text-xs text-zinc-600 dark:text-zinc-400 mb-1">Horas Normais</div>
                <div class="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  {{ escalasTotaisHoras.geral > 0 ? escalasTotaisHoras.normais.toFixed(1) : '0.0' }}h
                </div>
              </div>
              <div class="bg-white dark:bg-zinc-800 rounded-lg p-3 border border-zinc-200 dark:border-zinc-700">
                <div class="text-xs text-zinc-600 dark:text-zinc-400 mb-1">Horas Extras</div>
                <div class="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  {{ escalasTotaisHoras.extras > 0 ? escalasTotaisHoras.extras.toFixed(1) : '0.0' }}h
                </div>
              </div>
              <div class="bg-white dark:bg-zinc-800 rounded-lg p-3 border border-zinc-200 dark:border-zinc-700">
                <div class="text-xs text-zinc-600 dark:text-zinc-400 mb-1">Horas Noturnas</div>
                <div class="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  {{ escalasTotaisHoras.noturnas > 0 ? escalasTotaisHoras.noturnas.toFixed(1) : '0.0' }}h
                </div>
              </div>
              <div class="bg-white dark:bg-zinc-800 rounded-lg p-3 border border-zinc-200 dark:border-zinc-700">
                <div class="text-xs text-zinc-600 dark:text-zinc-400 mb-1">Total Geral</div>
                <div class="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  {{ escalasTotaisHoras.geral.toFixed(1) }}h
                </div>
              </div>
            </div>
          </div>

          <!-- Card: Histórico do Cooperado -->
          <div class="bg-gradient-to-r from-zinc-50 to-zinc-100 dark:from-zinc-800/30 dark:to-zinc-800/10 border border-zinc-200 dark:border-zinc-700 rounded-lg p-4">
            <div class="flex items-center gap-3 mb-3">
              <svg class="w-5 h-5 text-zinc-700 dark:text-zinc-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7h18M3 12h18M3 17h18"/>
              </svg>
              <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Histórico do Cooperado</h3>
            </div>
            <!-- Grid com 4 cards de métricas -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <!-- Pontualidade -->
              <div class="bg-white dark:bg-zinc-800 rounded-lg p-3 border border-zinc-200 dark:border-zinc-700">
                <div class="text-xs text-zinc-600 dark:text-zinc-400 mb-1">Pontualidade</div>
                <div class="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{{ punctualidadePct.toFixed(0) }}%</div>
              </div>
              <!-- Presença -->
              <div class="bg-white dark:bg-zinc-800 rounded-lg p-3 border border-zinc-200 dark:border-zinc-700">
                <div class="text-xs text-zinc-600 dark:text-zinc-400 mb-1">Presença</div>
                <div class="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{{ presencaPct.toFixed(0) }}%</div>
              </div>
              <!-- Check-out -->
              <div class="bg-white dark:bg-zinc-800 rounded-lg p-3 border border-zinc-200 dark:border-zinc-700">
                <div class="text-xs text-zinc-600 dark:text-zinc-400 mb-1">Check-out</div>
                <div class="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{{ checkOutPct.toFixed(0) }}%</div>
              </div>
              <!-- Avaliação -->
              <div class="bg-white dark:bg-zinc-800 rounded-lg p-3 border border-zinc-200 dark:border-zinc-700">
                <div class="text-xs text-zinc-600 dark:text-zinc-400 mb-1">Avaliação</div>
                <div class="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{{ avaliacaoPct.toFixed(0) }}%</div>
              </div>
            </div>
          </div>
        </div>
        <!-- Filtros -->
        <div v-if="escalas.length > 0" class="mb-4 space-y-3 card p-4">
          <div class="flex flex-wrap items-center gap-2">
            <!-- Filtro por Cliente -->
            <div class="flex items-center gap-2">
              <label class="text-xs text-zinc-600 dark:text-zinc-400 font-medium">Cliente:</label>
              <select v-model="escalasFiltroCliente" class="text-xs px-3 py-1.5 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 w-48">
                <option value="todos">Todos ({{ escalasContadoresCliente.todos }})</option>
                <option v-for="cliente in escalasClientesUnicos" :key="cliente.id" :value="cliente.id">
                  {{ cliente.nome }} ({{ escalasContadoresCliente[cliente.id] || 0 }})
                </option>
              </select>
            </div>

            <!-- Filtro por Status -->
            <div class="flex items-center gap-2">
              <label class="text-xs text-zinc-600 dark:text-zinc-400 font-medium">Status:</label>
              <select v-model="escalasFiltroStatus" class="text-xs px-3 py-1.5 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 w-48">
                <option value="todos">Todos ({{ escalasContadoresStatus.todos }})</option>
                <option v-for="status in escalasStatusUnicos" :key="status" :value="status">
                  {{ status }} ({{ escalasContadoresStatus[status] || 0 }})
                </option>
              </select>
            </div>
          </div>

          <!-- Chips de Filtros Ativos -->
          <div v-if="escalasFiltroCliente !== 'todos' || escalasFiltroStatus !== 'todos'" class="flex flex-wrap gap-2">
            <span v-if="escalasFiltroCliente !== 'todos'" class="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded text-xs border border-blue-300 dark:border-blue-700">
              Cliente: {{ escalasClientesUnicos.find(c => c.id === escalasFiltroCliente)?.nome || escalasFiltroCliente }}
              <button @click="escalasFiltroCliente = 'todos'" class="hover:bg-blue-200 dark:hover:bg-blue-800 rounded px-1">×</button>
            </span>
            <span v-if="escalasFiltroStatus !== 'todos'" class="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded text-xs border border-purple-300 dark:border-purple-700">
              Status: {{ escalasFiltroStatus }}
              <button @click="escalasFiltroStatus = 'todos'" class="hover:bg-purple-200 dark:hover:bg-purple-800 rounded px-1">×</button>
            </span>
          </div>

          <!-- Contador de Resultados -->
          <!-- <div class="text-xs text-zinc-500 dark:text-zinc-400">
            Mostrando {{ escalasFiltradas.length }} de {{ escalas.length }} escalas
          </div> -->
        </div>

        

        <div v-if="escalasLoading" class="text-sm text-zinc-500">Carregando…</div>
        <div v-else-if="!escalas.length" class="text-sm text-zinc-500">Sem escalas registradas.</div>
        <div v-else>
          <div v-if="escalasFiltradas.length === 0" class="text-sm text-zinc-500">Nenhuma escala encontrada com os filtros selecionados.</div>
          <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <div v-for="(escala,i) in escalasFiltradas" :key="'e'+i">
              <div class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-t-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                <!-- Header colorido com evento e data -->
                <div :class="[
                  'px-4 py-3 border-b',
                  escala.status === 'confirmado' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' :
                escala.status === 'sem vaga' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' :
                escala.status === 'recusado' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' :
                escala.status === 'lido' ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' :
                'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700'
              ]">
                <div class="flex items-center justify-between gap-3">
                  <div class="flex-1 min-w-0">
                    <h3 class="font-semibold text-sm text-zinc-900 dark:text-zinc-100 mb-1 line-clamp-2">
                      {{ escala.evento?.nome_evento || 'Evento sem nome' }}
                    </h3>
                    <p class="text-xs text-zinc-600 dark:text-zinc-400">
                      {{ escala.evento?.data_evento_view || formatDate(escala.evento?.data_evento) }}
                    </p>
                  </div>
                  <span :class="[
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wide shrink-0',
                    escala.status === 'confirmado' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' :
                    escala.status === 'removido' ? 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300' :
                    escala.status === 'sem vaga' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
                    escala.status === 'recusado' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
                    escala.status === 'lido' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                    'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300'
                  ]">
                    <svg v-if="escala.status === 'confirmado'" class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                    </svg>
                    <svg v-else-if="escala.status === 'removido'" class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                    </svg>
                    <svg v-else-if="escala.status === 'recusado' || escala.status === 'sem vaga'" class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
                    </svg>
                    {{ escala.status || 'indefinido' }}
                  </span>
                </div>
              </div>

              <!-- Corpo do card -->
              <div class="p-4 space-y-3">
                <!-- Função -->
                <div v-if="escala.funcao" class="flex items-center gap-2">
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                    <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm1 5a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clip-rule="evenodd"/>
                      <path d="M2 13.692V16a2 2 0 002 2h12a2 2 0 002-2v-2.308A24.974 24.974 0 0110 15c-2.796 0-5.487-.46-8-1.308z"/>
                    </svg>
                    {{ escala.funcao.profissao }}
                  </span>
                  <!-- CBO ocultado conforme solicitação -->
                </div>
                
                <!-- Valores -->
                <div class="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3">
                  <div class="flex items-center justify-between gap-4 text-xs">
                    <div class="flex items-center gap-2">
                      <span class="text-zinc-600 dark:text-zinc-400">Valor Base</span>
                      <span v-if="escala.valor" class="font-semibold text-zinc-900 dark:text-zinc-100">R$ {{ Number(escala.valor).toFixed(2) }}</span>
                      <span v-else class="text-xs px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400">Não informado</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="text-zinc-600 dark:text-zinc-400">Valor Final</span>
                      <span v-if="escala.valor_final && escala.valor_final !== escala.valor" class="font-semibold text-green-600 dark:text-green-400">R$ {{ Number(escala.valor_final).toFixed(2) }}</span>
                      <span v-else class="text-xs px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400">—</span>
                    </div>
                  </div>
                </div>

                <!-- Horários -->
                <div class="grid grid-cols-2 gap-3 text-xs">
                  <div class="flex items-start gap-2">
                    <svg class="w-4 h-4 text-zinc-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/>
                    </svg>
                    <div class="flex-1 min-w-0">
                      <div class="font-medium text-zinc-700 dark:text-zinc-300 mb-1 flex items-center gap-2">
                        Check-in
                        <span v-if="escala.check_in && escala.check_in_real"
                          :class="{
                            'text-red-700 font-semibold': compareTimes(escala.check_in_real, escala.check_in) === 'late',
                            'text-green-700 font-semibold': compareTimes(escala.check_in_real, escala.check_in) === 'ontime',
                            'text-blue-700 font-semibold': compareTimes(escala.check_in_real, escala.check_in) === 'early'
                          }">
                          <span v-if="compareTimes(escala.check_in_real, escala.check_in) === 'late'">Atrasado</span>
                          <span v-else-if="compareTimes(escala.check_in_real, escala.check_in) === 'ontime'">Pontual</span>
                          <span v-else-if="compareTimes(escala.check_in_real, escala.check_in) === 'early'">Adiantado</span>
                        </span>
                      </div>
                      <div v-if="escala.check_in" class="text-zinc-600 dark:text-zinc-400">
                        <span class="text-zinc-500 dark:text-zinc-500">Previsto:</span> {{ formatDateTime(escala.check_in) }}
                      </div>
                      <div v-else class="text-xs px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400">Não registrado</div>
                      <div v-if="escala.check_in_real" class="flex items-center gap-1 mt-1">
                        <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                        </svg>
                        <span :class="{
                          'text-red-700 font-semibold': compareTimes(escala.check_in_real, escala.check_in) === 'late',
                          'text-green-700 font-semibold': compareTimes(escala.check_in_real, escala.check_in) === 'ontime',
                          'text-blue-700 font-semibold': compareTimes(escala.check_in_real, escala.check_in) === 'early'
                        }">
                          Real: {{ formatDateTime(escala.check_in_real) }}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div class="flex items-start gap-2">
                    <svg class="w-4 h-4 text-zinc-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                    </svg>
                    <div class="flex-1 min-w-0">
                      <div class="font-medium text-zinc-700 dark:text-zinc-300 mb-1 flex items-center gap-2">
                        Check-out
                        <span v-if="escala.check_out && escala.check_out_real"
                          :class="{
                            'text-red-700 font-semibold': compareTimes(escala.check_out_real, escala.check_out) === 'early',
                            'text-green-700 font-semibold': compareTimes(escala.check_out_real, escala.check_out) === 'ontime',
                            'text-blue-700 font-semibold': compareTimes(escala.check_out_real, escala.check_out) === 'late'
                          }">
                            <span v-if="compareTimes(escala.check_out_real, escala.check_out) === 'early'">Atrasado</span>
                            <span v-else-if="compareTimes(escala.check_out_real, escala.check_out) === 'ontime'">Pontual</span>
                            <span v-else-if="compareTimes(escala.check_out_real, escala.check_out) === 'late'">Adiantado</span>
                        </span>
                      </div>
                      <div v-if="escala.check_out" class="text-zinc-600 dark:text-zinc-400">
                        <span class="text-zinc-500 dark:text-zinc-500">Previsto:</span> {{ formatDateTime(escala.check_out) }}
                      </div>
                      <div v-else class="text-xs px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400">Não registrado</div>
                      <div v-if="escala.check_out_real" class="flex items-center gap-1 mt-1">
                        <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                        </svg>
                        <span :class="{
                          'text-red-700 font-semibold': compareTimes(escala.check_out_real, escala.check_out) === 'early',
                          'text-green-700 font-semibold': compareTimes(escala.check_out_real, escala.check_out) === 'ontime',
                          'text-blue-700 font-semibold': compareTimes(escala.check_out_real, escala.check_out) === 'late'
                        }">
                          Real: {{ formatDateTime(escala.check_out_real) }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Horas trabalhadas -->
                <div class="pt-3 border-t border-zinc-200 dark:border-zinc-700">
                  <div class="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">Horas Trabalhadas</div>
                  <div v-if="escala.horas_normais || escala.horas_extras || escala.horas_noturnas" class="grid grid-cols-2 gap-2 text-xs">
                    <div v-if="escala.horas_normais && Number(escala.horas_normais) > 0" class="flex items-center gap-1.5">
                      <div class="w-2 h-2 rounded-full bg-blue-500"></div>
                      <span class="text-zinc-600 dark:text-zinc-400">{{ (Number(escala.horas_normais) / 60).toFixed(1) }}h</span>
                    </div>
                    <div v-if="escala.horas_extras && Number(escala.horas_extras) > 0" class="flex items-center gap-1.5">
                      <div class="w-2 h-2 rounded-full bg-orange-500"></div>
                      <span class="text-zinc-600 dark:text-zinc-400">{{ (Number(escala.horas_extras) / 60).toFixed(1) }}h extra</span>
                    </div>
                    <div v-if="escala.horas_noturnas && Number(escala.horas_noturnas) > 0" class="flex items-center gap-1.5">
                      <div class="w-2 h-2 rounded-full bg-purple-500"></div>
                      <span class="text-zinc-600 dark:text-zinc-400">{{ (Number(escala.horas_noturnas) / 60).toFixed(1) }}h not.</span>
                    </div>
                  </div>
                  <div v-else class="text-xs px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 inline-block">
                    Sem horas registradas
                  </div>
                </div>
              </div>
            </div>

            <!-- Footer com informações extras (fora do card) -->
            <div class="bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 border-t-0 rounded-b-lg px-4 py-2 text-xs flex items-center justify-between gap-3 -mt-px">
              <div class="flex-1 text-zinc-600 dark:text-zinc-400 space-y-2">
                <div v-if="escala.status_motivo" class="flex items-start gap-2">
                  <svg class="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
                  </svg>
                  <span>{{ escala.status_motivo }}</span>
                </div>
                <div v-if="escala.confirmado_ida_evento" class="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                  </svg>
                  <span>Presença confirmada</span>
                </div>
                <div v-else class="text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 inline-block">
                  Presença não confirmada
                </div>
              </div>
              
              <!-- Avaliação no lado direito -->
              <div v-if="escala.avaliacao" class="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-zinc-900 rounded-md border border-zinc-200 dark:border-zinc-700">
                <svg class="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                </svg>
                <span class="font-semibold text-zinc-700 dark:text-zinc-300">{{ escala.avaliacao }}</span>
                <span v-if="escala.avaliacao_motivo" class="text-zinc-500 dark:text-zinc-400">({{ escala.avaliacao_motivo }})</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Debug (visível quando ?debug=1 na URL) -->
      <div v-if="showDebug" class="card p-4">
        <div class="text-[11px] uppercase text-zinc-500 mb-2">Debug do Response</div>
        <div class="text-xs text-zinc-500 mb-1">rawResponse</div>
        <pre class="text-xs bg-zinc-50 dark:bg-zinc-900/40 rounded p-2 overflow-auto max-h-64">{{ JSON.stringify(rawResponse, null, 2) }}</pre>
        <div v-if="rawDataArray" class="text-xs text-zinc-500 mt-3 mb-1">rawResponse.data (array)</div>
        <pre v-if="rawDataArray" class="text-xs bg-zinc-50 dark:bg-zinc-900/40 rounded p-2 overflow-auto max-h-64">{{ JSON.stringify(rawDataArray, null, 2) }}</pre>
        <div class="text-xs text-zinc-500 mt-3 mb-1">form (parsed)</div>
        <pre class="text-xs bg-zinc-50 dark:bg-zinc-900/40 rounded p-2 overflow-auto max-h-64">{{ JSON.stringify(form, null, 2) }}</pre>
        <div class="text-xs text-zinc-500 mt-3 mb-1">form.documentos</div>
        <pre class="text-xs bg-zinc-50 dark:bg-zinc-900/40 rounded p-2 overflow-auto max-h-64">{{ JSON.stringify((form as any)?.documentos, null, 2) }}</pre>
      </div>
    </div>
  </section>
  <!-- Modal de imagem -->
  <teleport to="body">
    <div
      v-if="showImageModal && imageToPreview"
      class="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
      @click.self="closeImage"
    >
      <div class="relative max-h-full max-w-full">
        <button
          class="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-white/90 text-zinc-800 shadow flex items-center justify-center hover:bg-white"
          @click="closeImage"
          aria-label="Fechar"
          title="Fechar"
        >
          ✕
        </button>
        <img :src="String(imageToPreview || '')" class="max-h-[85vh] max-w-[90vw] object-contain rounded shadow-lg bg-zinc-900/20" />
      </div>
    </div>
  </teleport>
  <!--/ Modal de imagem -->
  </div>
</template>
