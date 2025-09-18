<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { getAdminConfig } from '@/services/settings'


// Fallbacks locais caso /settings ainda não esteja preenchido
const FALLBACK_CATALOG = [
  { key: 'garcom', sector: 'A&B', label: 'Garçom', basePrice: 28 },
  { key: 'steward', sector: 'A&B', label: 'Copeiro', basePrice: 24 },
  { key: 'barista', sector: 'A&B', label: 'Barista', basePrice: 30 },
  { key: 'barman', sector: 'A&B', label: 'Bartender', basePrice: 32 },
  { key: 'maitreHotel', sector: 'A&B', label: 'Maître', basePrice: 50 },
  { key: 'cozinheiro', sector: 'Cozinha', label: 'Cozinheiro', basePrice: 45 },
  { key: 'manobrista', sector: 'Estacionamento & Valet', label: 'Manobrista', basePrice: 30 },
  { key: 'coordenadorEstacionamento', sector: 'Estacionamento & Valet', label: 'Coordenador de Estacionamento', basePrice: 48 },
  { key: 'interprete', sector: 'Tradução & Interpretação', label: 'Intérprete', basePrice: 120 },
  { key: 'tecnicoTraducao', sector: 'Tradução & Interpretação', label: 'Técnico de Tradução', basePrice: 70 },
]
const FALLBACK_SERVICE_TO_SECTORS: Record<string, string[]> = {
  alimentacao: ['A&B', 'Cozinha'],
  estacionamento: ['Estacionamento & Valet'],
  traducao: ['Tradução & Interpretação'],
}
const FALLBACK_ROLE_ALIASES: Record<string, string> = {
  'garcom': 'garcom', 'garcon': 'garcom',
  'copeiro': 'steward', 'copa': 'steward', 'steward': 'steward',
  'barista': 'barista', 'bartender': 'barman', 'barman': 'barman',
  'maitre': 'maitreHotel',
  'manobrista': 'manobrista', 'coordenador de estacionamento': 'coordenadorEstacionamento', 'coordenador estacionamento': 'coordenadorEstacionamento',
  'interprete': 'interprete', 'tecnico de traducao': 'tecnicoTraducao', 'tecnico traducao': 'tecnicoTraducao',
}

export interface EquipLine { funcao_key: string; setor: string; turno: string; quantidade: number; horas: number }

const props = withDefaults(defineProps<{
  // seeds vindos do formulário principal
  initialGuests?: number
  initialServiceStyle?: 'prato' | 'buffet'
  initialHasStage?: boolean
  // v-models
  equipes: EquipLine[]
  taxaServicoPct?: number
  fixedCosts?: number
  // datas do evento
  eventDates?: string[]  // Datas do evento no formato YYYY-MM-DD
  // Novos: turnos configurados e serviços selecionados nos steps anteriores
  shifts?: Array<{ nome?: string; inicio: string; fim: string; inicioAbs?: number; fimAbs?: number; isExtra?: boolean; isPausa?: boolean }>
  selectedServices?: string[]
  // Funções planejadas por rótulo (do Step-3)
  plannedRoles?: Array<{ funcao?: string; label?: string; setor?: string; quantidade?: number }>
  // Resumo do evento (emitido pelo DateRangePicker)
  resumoOperacao?: {
    quantidadeDias: number
    quantidadeTurnos: number
    horasPorDia: number
    horasTotalPeriodo: number
    temPausa1h: boolean
    pausaInformada: boolean
    escalaHoras: number | null
    temHoraExtra: boolean
    temFimDeSemana: boolean
    diasFimDeSemana: number
    temFeriado: boolean
    diasFeriado: number
    temAdicionalNoturno: boolean
    horasNoturnasPorDia: number
    horasNormaisPorDia: number
    janelaInicioStr: string
    janelaFimStr: string
    colaboradoresPorDia: number
    tiposTurno: { manha: number; tarde: number; noite: number; madrugada: number }
    perTurno: { totalMinutes: number; hasExtra: boolean }[]
  } | null
  // Segmento selecionado no planejamento
  segmento?: string
}>(), {
  initialGuests: 150,
  initialServiceStyle: 'prato',
  initialHasStage: true,
  taxaServicoPct: 10,
  fixedCosts: 0,
  eventDates: () => [],
  shifts: () => [],
  selectedServices: () => [],
  plannedRoles: () => [],
  resumoOperacao: null,
  segmento: ''
})

const emit = defineEmits<{
  (e: 'update:equipes', v: EquipLine[]): void
  (e: 'update:taxaServicoPct', v: number): void
  (e: 'update:fixedCosts', v: number): void
}>()

// Debug helpers
const debug = ref<boolean>(typeof window !== 'undefined' && window?.localStorage?.getItem('evspDebug') === '1')
function setDebug(v: boolean) {
  debug.value = v
  try { window?.localStorage?.setItem('evspDebug', v ? '1' : '0') } catch { }
}
function log(label: string, data: any) { if (debug.value) { try { console.log('[CastingBuilder]', label, JSON.parse(JSON.stringify(data))) } catch { console.log('[CastingBuilder]', label, data) } } }
const lastEquipes = ref<EquipLine[]>([])
const debugJson = computed(() => {
  try {
    const plannedCount = (props.plannedRoles || []).length
    const plannedQtyTotal = (props.plannedRoles || []).reduce((acc, p: any) => acc + (Number(p?.quantidade) || 0), 0)
    const cartTotals = (cart?.value || []).reduce((acc, line: any) => {
      const q = (line.assignments || []).reduce((s: number, a: any) => s + (Number(a?.qty) || 0), 0)
      return acc + q
    }, 0)
    const data = {
      props: {
        eventDates: props.eventDates,
        shifts: props.shifts,
        selectedServices: props.selectedServices,
        selectedServiceLabels: selectedServiceLabels?.value,
        plannedRoles: props.plannedRoles,
        initialGuests: props.initialGuests,
        segmento: props.segmento || null,
        resumoOperacao: props.resumoOperacao || null
      },
      eventPeriods: eventPeriods?.value,
      counts: {
        periodsCount: eventPeriods?.value?.length || 0,
        uniqueRolesInCart: (cart?.value || []).length,
        totalAssignmentsQty: cartTotals,
        plannedRolesCount: plannedCount,
        plannedRolesQtyTotal: plannedQtyTotal,
        totalProfessionalsRaw: totalProfessionals?.value || 0,
        totalProfessionalsSmart: totalProfessionalsSmart?.value || 0,
        totalFuncoes: totalFuncoes?.value || 0
      },
      resumo: props.resumoOperacao ? {
        horasPorDia: props.resumoOperacao.horasPorDia,
        horasTotalPeriodo: props.resumoOperacao.horasTotalPeriodo,
        escalaHoras: props.resumoOperacao.escalaHoras,
        quantidadeDias: props.resumoOperacao.quantidadeDias,
        quantidadeTurnos: props.resumoOperacao.quantidadeTurnos,
        colaboradoresPorDia: props.resumoOperacao.colaboradoresPorDia,
        temPausa1h: props.resumoOperacao.temPausa1h,
        temHoraExtra: props.resumoOperacao.temHoraExtra,
        temFimDeSemana: props.resumoOperacao.temFimDeSemana,
        diasFimDeSemana: props.resumoOperacao.diasFimDeSemana,
        temFeriado: props.resumoOperacao.temFeriado,
        diasFeriado: props.resumoOperacao.diasFeriado,
        janela: `${props.resumoOperacao.janelaInicioStr}–${props.resumoOperacao.janelaFimStr}`
      } : null,
      effective: {
        horasPorDia: horasPorDiaEffective?.value,
        escalaHoras: escalaHorasEffective?.value,
        perDateMultiplier: perDateMultiplier?.value
      },

      cart: cart?.value,
      equipes: lastEquipes?.value
    }
    return JSON.stringify(data, null, 2)
  } catch { return '' }
})


// Catálogo de Mão de Obra EventosSP - Apenas funções de pessoal
let catalog: any[] = []
// Multiplicadores de preço
let priceMultipliers: any = {
  period: { manha: 1.0, tarde: 1.0, noite: 1.0 },
  dayType: { weekday: 1.0, weekend: 1.0, holiday: 1.0 },
  extra: { on: 1.0, off: 1.0 },
  pause: { hasPausa1h: 1.0, none: 1.0 }
}

// Mapeamento de serviços selecionados -> setores do catálogo (carregado do /settings)
let serviceToSectors: Record<string, string[]> = {}

const allowedSectors = computed<Set<string> | null>(() => {
  const ids = props.selectedServices || []
  if (!ids.length) return null
  const s = new Set<string>()
  ids.forEach(id => (serviceToSectors[id] || []).forEach(sec => s.add(sec)))
  return s
})

function isAllowed(roleKey: string): boolean {
  const sec = catalog.find(r => r.key === roleKey)?.sector || ''
  const set = allowedSectors.value
  return !set || set.has(sec)
}



// Lista de feriados brasileiros 2024/2025 (simplificada)
const holidays = [
  '2024-01-01', '2024-04-21', '2024-04-22', '2024-05-01', '2024-09-07',
  '2024-10-12', '2024-11-02', '2024-11-15', '2024-12-25',
  '2025-01-01', '2025-04-18', '2025-04-21', '2025-05-01', '2025-09-07',
  '2025-10-12', '2025-11-02', '2025-11-15', '2025-12-25'
]
const icons: Record<string, string> = {
  // A&B
  garcom: '🍽️', steward: '🧼', coordenadorAeB: '🧭', cozinheiro: '👨‍🍳', ajudanteCozinha: '🥣', barman: '🍸',
  // Recepção
  recepcionista: '👋', hostess: '💃', maitreHotel: '🎩',
  // Técnica
  tecnicoSom: '🎤', tecnicoLuz: '💡', operadorProjecao: '📽️', tecnicoEletricista: '⚡',
  // Segurança
  seguranca: '🛡️', brigadista: '🚑', medicoPlantao: '👨‍⚕️', enfermeiro: '👩‍⚕️',
  // Logística
  carregador: '📦', coordenadorLogistica: '📋', motorista: '🚛',
  // Limpeza
  auxiliarLimpeza: '🧹', coordenadorLimpeza: '🧽',
  // Produção
  produtorEvento: '🎬', assistenteProdução: '📝', coordenadorGeral: '👑'
}
const icon = (k: string) => icons[k] || '👤'

// Estado local (parametrização)
const guests = ref<number>(props.initialGuests || 0)
const serviceStyle = ref<'prato' | 'buffet'>(props.initialServiceStyle || 'prato')
const hasStage = ref<boolean>(!!props.initialHasStage)

// Nova estrutura do carrinho - por data e período
interface PeriodAssignment {
  date: string
  period: 'manha' | 'tarde' | 'noite' | 'extra'
  qty: number
  price: number
  isExtra?: boolean
}

interface CartLine {
  key: string
  sector: string
  assignments: PeriodAssignment[]
}

const cart = ref<CartLine[]>([])

// Helpers para traduzir turnos (steps) em faixas de período
function timeToMin(hhmm: string): number {
  const [h, m] = (hhmm || '00:00').split(':').map(n => parseInt(n || '0', 10))
  return (h * 60) + (m || 0)
}
function overlaps(a1: number, a2: number, b1: number, b2: number) {
  return Math.max(a1, b1) < Math.min(a2, b2)
}
function deriveBandsFromShifts(): Set<'manha' | 'tarde' | 'noite'> {
  const shifts = props.shifts || []
  if (!shifts.length) return new Set(['manha', 'tarde', 'noite'])
  const bands = new Set<'manha' | 'tarde' | 'noite'>()
  shifts.forEach(s => {
    const start = timeToMin(s.inicio)
    const end = timeToMin(s.fim)
    const a1 = start, a2 = end > start ? end : end + 24 * 60 // simples tratamento se "vira" o dia
    if (overlaps(a1, a2, 6 * 60, 12 * 60)) bands.add('manha')
    if (overlaps(a1, a2, 12 * 60, 18 * 60)) bands.add('tarde')
    if (overlaps(a1, a2, 18 * 60, 24 * 60)) bands.add('noite')
  })
  return bands
}


// Computed para gerar todas as combinações de data/período do evento
const eventPeriods = computed(() => {
  const periods: Array<{ date: string, period: 'manha' | 'tarde' | 'noite', dayType: string, label: string }> = []

  const bands = deriveBandsFromShifts()
  props.eventDates?.forEach(date => {
    const dayType = getDayType(date)
    const dateLabel = formatDate(date)

    if (bands.has('manha')) periods.push({ date, period: 'manha', dayType, label: `${dateLabel} - Manhã (6h-12h)` })
    if (bands.has('tarde')) periods.push({ date, period: 'tarde', dayType, label: `${dateLabel} - Tarde (12h-18h)` })
    if (bands.has('noite')) periods.push({ date, period: 'noite', dayType, label: `${dateLabel} - Noite (18h-24h)` })
  })

  return periods
})

// helpers de classe (tailwind/segmented)
function segBtn(active: boolean) {
  return [
    'inline-flex items-center justify-center rounded-xl border px-3 py-2 text-sm',
    active ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'
  ].join(' ')
}

const feePct = ref<number>(props.taxaServicoPct || 0)
const fixed = ref<number>(props.fixedCosts || 0)

// Funções utilitárias para datas
const getDayType = (dateStr: string): 'weekday' | 'weekend' | 'holiday' => {
  if (holidays.includes(dateStr)) return 'holiday'

  const date = new Date(dateStr + 'T12:00:00')
  const dayOfWeek = date.getDay() // 0 = domingo, 6 = sábado



  return (dayOfWeek === 0 || dayOfWeek === 6) ? 'weekend' : 'weekday'
}

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr + 'T12:00:00')
  return date.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit'
  })
}

// Função para calcular preço baseado em data e período
const calculatePrice = (roleKey: string, dateStr: string, period: 'manha' | 'tarde' | 'noite'): number => {
  const basePrice = catalog.find(r => r.key === roleKey)?.basePrice || 0
  const dayType = getDayType(dateStr)

  const periodMultiplier = priceMultipliers.period[period]
  const dayTypeMultiplier = priceMultipliers.dayType[dayType]

  // Adicionais globais do resumo da operação
  const hasExtra = !!props.resumoOperacao?.temHoraExtra
  const extraMultiplier = hasExtra ? priceMultipliers.extra.on : priceMultipliers.extra.off
  // Pausa 1h não altera preço unitário (já reduz horas efetivas), mas deixo placeholder para regras futuras
  // const pauseMultiplier = props.resumoOperacao?.temPausa1h ? priceMultipliers.pause.hasPausa1h : priceMultipliers.pause.none

  return Math.round(basePrice * periodMultiplier * dayTypeMultiplier * extraMultiplier)
}

// Recalcula todos os preços dos assignments conforme novas regras (ex.: hora extra, feriado)
function recalcAllPrices() {
  try {
    cart.value.forEach(line => {
      line.assignments.forEach(a => {
        if (a.isExtra) {
          a.price = 0
        } else {
          a.price = calculatePrice(line.key, a.date, a.period as 'manha' | 'tarde' | 'noite')
        }
      })
    })
  } catch {}
}


// Carrega configurações administrativas (Settings) e aplica no catálogo e regras
async function loadSettings() {
  try {
    const resp = await getAdminConfig(new URLSearchParams())
    const cfg = (resp as any)?.data || resp || {}
    if (Array.isArray(cfg.catalog_roles) && cfg.catalog_roles.length) {
      catalog = cfg.catalog_roles
    } else {
      catalog = FALLBACK_CATALOG
    }
    if (cfg.price_multipliers) {
      priceMultipliers = cfg.price_multipliers
    }
    if (cfg.role_aliases && Object.keys(cfg.role_aliases).length) {
      roleAliases = cfg.role_aliases
    } else {
      roleAliases = FALLBACK_ROLE_ALIASES
    }
    if (cfg.service_to_sectors && Object.keys(cfg.service_to_sectors).length) {
      serviceToSectors = cfg.service_to_sectors
    } else {
      serviceToSectors = FALLBACK_SERVICE_TO_SECTORS
    }
    if (cfg.defaults) {
      if (typeof cfg.defaults.taxa_servico_pct === 'number') feePct.value = cfg.defaults.taxa_servico_pct
      if (typeof cfg.defaults.fixed_costs === 'number') fixed.value = cfg.defaults.fixed_costs
    }
    recalcAllPrices()
  } catch (e) {
    log('settings.load.error', e)
  }
}




// Horas/dia efetivas a partir dos turnos (fallback quando não houver resumoOperacao)
const shiftWorkMinutes = computed(() => {
  try {
    const arr = shiftsDisplay.value || []
    return arr.reduce((sum: number, t: any) => {
      if (t?.isPausa) return sum
      const s = typeof t?.inicioAbs === 'number' ? t.inicioAbs : timeToMin(t?.inicio || '00:00')
      const e = typeof t?.fimAbs === 'number' ? t.fimAbs : timeToMin(t?.fim || '00:00')
      return sum + Math.max(0, (e - s))
    }, 0)
  } catch { return 0 }
})
const horasPorDiaEffective = computed(() => {
  if (props.resumoOperacao && typeof props.resumoOperacao.horasPorDia === 'number') return props.resumoOperacao.horasPorDia
  return Math.round((shiftWorkMinutes.value / 60) * 100) / 100
})
const escalaHorasEffective = computed(() => {
  if (props.resumoOperacao && typeof props.resumoOperacao.escalaHoras === 'number') return props.resumoOperacao.escalaHoras
  return 8
})


// Helpers catálogo (atualizados)
const rate = (k: string, date?: string, period?: 'manha' | 'tarde' | 'noite') => {
  if (date && period) {
    return calculatePrice(k, date, period)
  }
  return catalog.find(r => r.key === k)?.basePrice || 0
}

const label = (k: string) => (catalog.find(r => r.key === k)?.label) || k
const sectorOf = (k: string) => (catalog.find(r => r.key === k)?.sector) || 'Geral'
const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const bySector = computed(() => {
  const g: Record<string, typeof catalog> = {}
  catalog.forEach(r => { if (!g[r.sector]) g[r.sector] = [] as any; (g[r.sector] as any).push(r) })
  return g
})

// ===== Resumo do evento (helpers de exibição) =====
const fmtDateBR = (d: string) => {
  try { return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) } catch { return d }
}
const dateRangeLabel = computed(() => {
  const ds = (props.eventDates || []).slice().sort()
  if (!ds.length) return ''
  if (ds.length === 1) return fmtDateBR(ds[0])
  return `${fmtDateBR(ds[0])} – ${fmtDateBR(ds[ds.length - 1])}`
})
const shiftsDisplay = computed(() => props.shifts || [])
const serviceIdToLabel: Record<string, string> = {
  alimentacao: 'Alimentação',
  recepcao: 'Recepção',
  tecnica: 'Técnica',
  seguranca: 'Segurança',
  logistica: 'Logística',
  limpeza: 'Limpeza',
  traducao: 'Tradução',
  estacionamento: 'Estacionamento'
}
const selectedServiceLabels = computed(() => (props.selectedServices || []).map(id => serviceIdToLabel[id] || id))


// Funções para gerenciar o novo carrinho
const addQuick = (roleKey: string) => {
  if (eventPeriods.value.length === 0) {
    alert('Configure as datas do evento primeiro!')
    return
  }

  const existing = cart.value.find(item => item.key === roleKey)
  if (existing) {
    // Se já existe, adiciona todos os períodos que ainda não estão
    addAllPeriods(roleKey)
  } else {
    // Cria novo item no carrinho
    const role = catalog.find(r => r.key === roleKey)
    if (role) {
      cart.value.push({
        key: roleKey,
        sector: role.sector,
        assignments: []
      })
      // Adiciona automaticamente todos os períodos
      addAllPeriods(roleKey)
    }
  }
}

const addAllPeriods = (roleKey: string) => {
  const cartItem = cart.value.find(item => item.key === roleKey)
  if (!cartItem) return

  // Períodos normais
  eventPeriods.value.forEach(period => {
    const exists = cartItem.assignments.some(a => a.date === period.date && a.period === period.period)
    if (!exists) {
      cartItem.assignments.push({
        date: period.date,
        period: period.period,
        qty: 1,
        price: calculatePrice(roleKey, period.date, period.period)
      })
    }
  })

  // Hora extra (exibição) — adiciona uma linha por data com preço 0
  if (props.resumoOperacao?.temHoraExtra) {
    const dates = Array.from(new Set(eventPeriods.value.map(p => p.date)))
    dates.forEach(date => {
      const existsExtra = cartItem.assignments.some(a => a.date === date && a.period === 'extra')
      if (!existsExtra) {
        cartItem.assignments.push({ date, period: 'extra', qty: 1, price: 0, isExtra: true })
      }
    })
  }
}


const removePeriod = (roleKey: string, assignmentIndex: number) => {
  const cartItem = cart.value.find(item => item.key === roleKey)
  if (cartItem) {
    cartItem.assignments.splice(assignmentIndex, 1)
  }
}




const clearCart = () => {
  cart.value = []
}

// Funções antigas removidas - substituídas pelas novas acima

// Cálculos atualizados para nova estrutura
const subtotal = computed(() => {
  return cart.value.reduce((total, cartItem) => {
    const itemTotal = cartItem.assignments.reduce((assignmentTotal, assignment) => {
      return assignmentTotal + (assignment.qty * assignment.price)
    }, 0)
    return total + itemTotal
  }, 0)
})

const serviceFee = computed(() => subtotal.value * (feePct.value / 100))
const total = computed(() => subtotal.value + serviceFee.value + (fixed.value || 0))


// Subtotal por item (função)
const itemSubtotal = (item: CartLine) => {
  try {
    return (item.assignments || []).reduce((acc, a) => acc + (Number(a.qty) || 0) * (Number(a.price) || 0), 0)
  } catch { return 0 }
}

// Accordion por função
const openMap = ref<Record<string, boolean>>({})
function isOpen(key: string) { return openMap.value[key] !== false }
function toggleOpen(key: string) { openMap.value[key] = !isOpen(key) }

// Métricas por item
const itemProfessionalsRaw = (item: CartLine) => {
  try { return (item.assignments || []).filter(a => !a.isExtra).reduce((acc, a) => acc + (Number(a.qty) || 0), 0) } catch { return 0 }
}
const itemDaysCount = (item: CartLine) => {
  try { return Array.from(new Set((item.assignments || []).map(a => a.date))).length } catch { return 0 }
}
const itemPeriodsCount = (item: CartLine) => {
  try { return (item.assignments || []).filter(a => !a.isExtra).length } catch { return 0 }
}

// Profissionais ajustado à escala (evita duplicar por períodos do mesmo dia)
const perDateMultiplier = computed(() => Math.max(1, Math.ceil((horasPorDiaEffective.value || 0) / Math.max(1, (escalaHorasEffective.value || 0)))))
function itemProfessionalsSmart(item: CartLine) {
  try {
    const byDate: Record<string, number> = {}
    for (const a of (item.assignments || [])) {
      const d = a.date
      const q = Number(a.qty) || 0
      byDate[d] = Math.max(byDate[d] || 0, q)
    }
    const mult = perDateMultiplier.value
    return Object.values(byDate).reduce((sum, maxQ) => sum + (maxQ * mult), 0)
  } catch { return 0 }
}
const totalProfessionalsSmart = computed(() => (cart.value || []).reduce((acc, it) => acc + itemProfessionalsSmart(it), 0))


// Garante estado inicial "aberto" para novos itens
watch(cart, (v) => {
  try { (v || []).forEach(i => { if (openMap.value[i.key] === undefined) openMap.value[i.key] = true }) } catch { }
}, { deep: true })

// Estatísticas do carrinho
const totalProfessionals = computed(() => {
  return cart.value.reduce((total, cartItem) => {
    const itemTotal = cartItem.assignments.filter(a => !a.isExtra).reduce((assignmentTotal, assignment) => {
      return assignmentTotal + assignment.qty
    }, 0)
    return total + itemTotal
  }, 0)
})

// Total de funções selecionadas no Step anterior (funções únicas)
const totalFuncoes = computed(() => {
  try {
    const roles = (props.plannedRoles || [])
      .map((p:any) => (p?.funcao || p?.label || '').toString().trim().toLowerCase())
      .filter(Boolean)
    return new Set(roles).size
  } catch { return 0 }
})

// Total de profissionais planejados (soma das quantidades em plannedRoles)
const totalPlannedProfessionals = computed(() => {
  try {
    return (props.plannedRoles || []).reduce((acc: number, p: any) => acc + (Number(p?.quantidade) || 0), 0)
  } catch { return 0 }
})

// Preencher carrinho a partir das equipes selecionadas nos steps
function seedFromEquipes() {
  if (!props.equipes || props.equipes.length === 0) return
  if (eventPeriods.value.length === 0) return
  clearCart()
  props.equipes.forEach(line => {
    const key = line.funcao_key
    const role = catalog.find(r => r.key === key)
    if (!role) return
    const newItem: CartLine = { key, sector: role.sector, assignments: [] }
    eventPeriods.value.forEach(period => {
      newItem.assignments.push({
        date: period.date,
        period: period.period,
        qty: Math.max(0, line.quantidade || 0),
        price: calculatePrice(key, period.date, period.period)
      })
    })
    // Hora extra por data (somente exibi e7 e3o)
    if (props.resumoOperacao?.temHoraExtra) {
      const dates = Array.from(new Set(eventPeriods.value.map(p => p.date)))
      dates.forEach(date => {
        newItem.assignments.push({ date, period: 'extra', qty: Math.max(0, line.quantidade || 0), price: 0, isExtra: true })
      })
    }
    cart.value.push(newItem)
  })
}


// Normalização e aliases para casar funções do Step-3 com o catálogo
const norm = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
let roleAliases: Record<string, string> = {}

// Quantidade planejada por função (mapeada por key do catálogo)
const plannedQtyByKey = computed<Record<string, number>>(() => {
  const map: Record<string, number> = {}
  try {
    const planned = props.plannedRoles || []
    planned.forEach((p: any) => {
      const rawName = (p.label || p.funcao || '').trim()
      const n = norm(rawName)
      if (!n) return
      let role = catalog.find(r => norm(r.label) === n)
      if (!role) {
        const aliasKey = roleAliases[n]
        if (aliasKey) role = catalog.find(r => r.key === aliasKey)
      }
      if (!role) return
      map[role.key] = (map[role.key] || 0) + (Number(p?.quantidade) || 0)
    })
  } catch {}
  return map
})

function itemProfessionalsPlanned(item: CartLine): number {
  try { return plannedQtyByKey.value[item.key] || 0 } catch { return 0 }
}


// Preencher carrinho a partir das funções planejadas por rótulo (Step-3)
function seedFromPlannedRoles() {
  const planned = props.plannedRoles || []
  if (!planned.length) return
  if (eventPeriods.value.length === 0) return

  const newCart: CartLine[] = []
  planned.forEach(p => {
    const rawName = (p.label || p.funcao || '').trim()
    const n = norm(rawName)
    if (!n) return
    let role = catalog.find(r => norm(r.label) === n)
    if (!role) {
      const aliasKey = roleAliases[n]
      if (aliasKey) role = catalog.find(r => r.key === aliasKey)
    }
    if (!role) return

    const newItem: CartLine = { key: role.key, sector: role.sector, assignments: [] }
    eventPeriods.value.forEach(period => {
      newItem.assignments.push({
        date: period.date,
        period: period.period,
        qty: Math.max(0, p.quantidade || 0),
        price: calculatePrice(role.key, period.date, period.period)
      })
    })
    if (props.resumoOperacao?.temHoraExtra) {
      const dates = Array.from(new Set(eventPeriods.value.map(pp => pp.date)))
      dates.forEach(date => {
        newItem.assignments.push({ date, period: 'extra', qty: Math.max(0, p.quantidade || 0), price: 0, isExtra: true })
      })
    }
    newCart.push(newItem)
  })
  cart.value = newCart
}


const totalPeriods = computed(() => {
  return cart.value.reduce((total, cartItem) => {
    return total + cartItem.assignments.filter(a => !a.isExtra).length
  }, 0)
})

// Defaults de horas por função
function defaultHours(key: string) {
  const m: Record<string, number> = {
    recepcionista: 5, tecnicoSom: 5, tecnicoLuz: 5, operadorProjecao: 5, suporteTI: 5,
    cozinheiro: 7, ajudanteCozinha: 7, garcom: 6, steward: 6, coordenadorAeB: 6,
    seguranca: 6, brigadista: 6, carregador: 6, fotografo: 6, cinegrafista: 6
  }
  return m[key] || 6
}

// Função auxiliar para adicionar profissional com quantidade específica
function addWithQuantity(roleKey: string, quantity: number) {
  if (eventPeriods.value.length === 0) return

  const existing = cart.value.find(item => item.key === roleKey)
  if (existing) {
    // Se já existe, atualiza as quantidades
    existing.assignments.forEach(assignment => {
      assignment.qty = quantity
    })
    if (props.resumoOperacao?.temHoraExtra) {
      const dates = Array.from(new Set(eventPeriods.value.map(p => p.date)))
      dates.forEach(date => {
        const existsExtra = existing.assignments.some(a => a.date === date && a.period === 'extra')
        if (!existsExtra) existing.assignments.push({ date, period: 'extra', qty: quantity, price: 0, isExtra: true })
      })
    }
  } else {
    // Cria novo item no carrinho
    const role = catalog.find(r => r.key === roleKey)
    if (role) {
      const newItem = {
        key: roleKey,
        sector: role.sector,
        assignments: [] as PeriodAssignment[]
      }

      // Adiciona todos os períodos com a quantidade especificada
      eventPeriods.value.forEach(period => {
        newItem.assignments.push({
          date: period.date,
          period: period.period,
          qty: quantity,
          price: calculatePrice(roleKey, period.date, period.period)
        })
      })
      // Hora extra por data (somente exibição)
      if (props.resumoOperacao?.temHoraExtra) {
        const dates = Array.from(new Set(eventPeriods.value.map(p => p.date)))
        dates.forEach(date => {
          newItem.assignments.push({ date, period: 'extra', qty: quantity, price: 0, isExtra: true })
        })
      }

      cart.value.push(newItem)
    }
  }
}

// Automático
function ceilDiv(a: number, b: number) { return Math.ceil(a / Math.max(1, b)) }
function runAuto() {
  if (eventPeriods.value.length === 0) {
    alert('Configure as datas do evento primeiro!')
    return
  }

  clearCart()
  const g = Math.max(guests.value || 0, 1)
  const ratio = { garcom: serviceStyle.value === 'prato' ? 12 : 15, recepcionista: 60, stewardBase: 90, seguranca: 50 }

  // Recepção
  if (isAllowed('recepcionista')) addWithQuantity('recepcionista', Math.max(2, ceilDiv(g, ratio.recepcionista) + 1))
  // Garçons
  if (isAllowed('garcom')) addWithQuantity('garcom', Math.max(6, ceilDiv(g, ratio.garcom)))
  // Cozinha
  const cozinheiros = 2 + ceilDiv(g, 75)
  const ajudantes = Math.max(1, Math.ceil(cozinheiros * 0.75))
  if (isAllowed('cozinheiro')) addWithQuantity('cozinheiro', cozinheiros)
  if (isAllowed('ajudanteCozinha')) addWithQuantity('ajudanteCozinha', ajudantes)
  if (isAllowed('steward')) addWithQuantity('steward', Math.max(1, ceilDiv(g, ratio.stewardBase)))
  if (isAllowed('coordenadorAeB')) addWithQuantity('coordenadorAeB', 1)
  // AV
  if (hasStage.value) {
    if (isAllowed('tecnicoSom')) addWithQuantity('tecnicoSom', 2)
    if (isAllowed('tecnicoLuz')) addWithQuantity('tecnicoLuz', 2)
    if (isAllowed('operadorProjecao')) addWithQuantity('operadorProjecao', 1)
    if (isAllowed('suporteTI')) addWithQuantity('suporteTI', 2)
  }
  // Segurança / Emergência / Logística
  if (isAllowed('seguranca')) addWithQuantity('seguranca', Math.max(2, ceilDiv(g, ratio.seguranca)) + 1)
  if (isAllowed('brigadista')) addWithQuantity('brigadista', 1)
  if (isAllowed('carregador')) addWithQuantity('carregador', 2)
}

// Sincroniza carrinho -> equipes (payload)
function syncToEquipes() {
  const mapped: EquipLine[] = cart.value.map(cartItem => {
    // Calcula quantidade total e horas médias para compatibilidade
    const normals = cartItem.assignments.filter(a => !a.isExtra)
    const totalQty = normals.reduce((sum, a) => sum + a.qty, 0)
    const avgHours = normals.length * 6 // 6 horas por período

    return {
      funcao_key: cartItem.key,
      setor: cartItem.sector,
      turno: '', // Pode ser expandido futuramente
      quantidade: totalQty,


      horas: avgHours
    }
  })
  lastEquipes.value = mapped
  log('equipes.emit', mapped)
  emit('update:equipes', mapped)
}

watch(cart, syncToEquipes, { deep: true })
watch(feePct, v => emit('update:taxaServicoPct', v))
watch(fixed, v => emit('update:fixedCosts', v))

watch(() => props.resumoOperacao, v => { log('resumoOperacao', v); recalcAllPrices() }, { deep: true })

onMounted(async () => {
  // Carrega Admin Settings primeiro para evitar preços inconsistentes
  await loadSettings()

  log('mounted.props', { eventDates: props.eventDates, shifts: props.shifts, selectedServices: props.selectedServices, plannedRoles: props.plannedRoles })
  if (props.plannedRoles && props.plannedRoles.length > 0) { seedFromPlannedRoles() }
  else if (props.equipes && props.equipes.length > 0) { seedFromEquipes() }
  else { runAuto() }
  log('eventPeriods.init', eventPeriods.value)
  syncToEquipes()
})

// Debug watches
watch(() => props.eventDates, v => log('props.eventDates', v), { deep: true })
watch(() => props.shifts, v => log('props.shifts', v), { deep: true })
watch(() => props.selectedServices, v => log('props.selectedServices', v), { deep: true })
watch(() => props.plannedRoles, v => log('props.plannedRoles', v), { deep: true })
watch(eventPeriods, v => log('eventPeriods', v), { deep: true })
watch(cart, v => log('cart', v), { deep: true })


// Guardas para semear o carrinho de forma segura
const seeding = ref(false)
let unmounted = false
onUnmounted(() => { unmounted = true })

async function trySeedCart() {
  if (unmounted || seeding.value) return
  if (cart.value.length !== 0) return
  if (eventPeriods.value.length === 0) return

  seeding.value = true
  try {
    if (props.plannedRoles && props.plannedRoles.length > 0) {
      seedFromPlannedRoles()
    } else if (props.equipes && props.equipes.length > 0) {
      seedFromEquipes()
    } else {
      runAuto()
    }
  } finally {
    seeding.value = false
  }
}


// Regerar sugestes automaticamente quando steps mudarem (sem sobrescrever edib5es do usu 19rio)
watch([() => props.plannedRoles, eventPeriods], async () => {
  await nextTick()
  trySeedCart()
}, { immediate: true })

</script>

<template>
  <section class="">







    <!-- Carrinho -->

    <!-- Carrinho -->
    <div>
      <!-- <div class="flex items-center justify-between mb-3"> -->
      <!-- <div class="text-sm font-medium text-slate-700">Catálogo & Orçamento</div> -->
      <!-- <label class="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" v-model="debug" @change="setDebug(debug)" /> Debug
      </label> -->
      <!-- </div> -->

      <details v-if="debug" class="mb-4">
        <summary class="text-xs text-slate-600 cursor-pointer">Ver dados (props, períodos, carrinho, equipes)</summary>
        <pre
          class="mt-2 text-[11px] leading-tight bg-slate-50 border border-slate-200 rounded p-2 overflow-auto max-h-64">{{ debugJson }}</pre>
      </details>

      <div class="md:flex md:gap-6">
        <aside class="md:w-[40%] space-y-3">

      <!-- Resumo do evento -->
      <div v-if="(props.eventDates?.length || 0) > 0" class="mb-4">
        <div class="space-y-3">
          <!-- Datas do evento -->
          <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div class="flex items-center gap-2 text-sm text-blue-800 mb-1">
              <div class="text-lg">📅</div>
              <div>
                <strong>Datas:</strong> {{ props.eventDates.length }} {{ props.eventDates.length === 1 ? 'dia' : 'dias' }}
              </div>
            </div>
            <div class="text-xs text-blue-700">
              {{ dateRangeLabel }}
            </div>
          </div>

          <!-- Turnos detectados (inclui Pausa/Hora Extra) -->
          <div class="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
            <div class="flex items-center gap-2 text-sm text-emerald-800 mb-1">
              <div class="text-lg">⏱️</div>
              <div><strong>Turnos:</strong> {{ (shiftsDisplay?.length || 0) }}</div>
            </div>
            <div class="flex flex-wrap gap-2 mt-1">
              <template v-if="(shiftsDisplay?.length || 0) > 0">
                <span v-for="(t, idx) in shiftsDisplay" :key="idx"
                  class="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px]"
                  :class="t.isPausa ? 'bg-amber-100 text-amber-800 border border-amber-200' : (t.isExtra ? 'bg-violet-100 text-violet-800 border border-violet-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200')">
                  {{ t.nome }}
                  <span class="opacity-70">{{ t.inicio }}–{{ t.fim }}</span>
                </span>
              </template>
              <span v-else class="text-xs text-emerald-700">Sem turnos detectados</span>
            </div>
          </div>

          <!-- Serviços selecionados -->

          <!-- Totais (Profissionais, Períodos, Dias) -->


          <div class="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
            <div class="flex items-center gap-2 text-sm text-indigo-800 mb-1">
              <div class="text-lg">🧩</div>
              <div><strong>Serviços:</strong> {{ (selectedServiceLabels?.length || 0) }}</div>
            </div>
            <div class="flex flex-wrap gap-2 mt-1">
              <template v-if="(selectedServiceLabels?.length || 0) > 0">
                <span v-for="(s, idx) in selectedServiceLabels" :key="idx"
                  class="px-2 py-1 rounded bg-indigo-100 text-indigo-800 border border-indigo-200 text-[11px]">{{ s
                  }}</span>
              </template>
              <span v-else class="text-xs text-indigo-700">Nenhum serviço selecionado</span>
            </div>
          </div>
        </div>

        <!-- Totais (Profissionais, Períodos, Dias) -->
        <div class="p-3 bg-fuchsia-50 border border-fuchsia-200 rounded-lg">
          <div class="flex items-center gap-2 text-sm text-fuchsia-800 mb-1">
            <div class="text-lg">📊</div>
            <div><strong>Totais</strong></div>
          </div>
          <div class="grid grid-cols-3 gap-2 text-xs">
            <div class="bg-white/60 rounded px-2 py-1 border border-fuchsia-200">
              <div class="text-[11px] text-fuchsia-700">Profissionais</div>
              <div class="font-semibold text-fuchsia-900">{{ totalPlannedProfessionals }}</div>
            </div>
            <div class="bg-white/60 rounded px-2 py-1 border border-fuchsia-200">
              <div class="text-[11px] text-fuchsia-700">Períodos</div>
              <div class="font-semibold text-fuchsia-900">{{ totalPeriods }}</div>
            </div>
            <div class="bg-white/60 rounded px-2 py-1 border border-fuchsia-200">
              <div class="text-[11px] text-fuchsia-700">Dias</div>
              <div class="font-semibold text-fuchsia-900">{{ (props.eventDates?.length || 0) }}</div>
            </div>
          </div>
          <div class="mt-2 text-[11px] text-fuchsia-700">
            Horas/dia: {{ horasPorDiaEffective }}h • Escala: {{ escalaHorasEffective }}h
            <span v-if="props.resumoOperacao?.temPausa1h">• Pausa 1h</span>
            <span v-if="props.resumoOperacao?.temHoraExtra">• Hora extra</span>
          </div>
        </div>

        <!-- <div class="text-[11px] text-slate-600 mt-2">
            <strong>Regras de preço:</strong> Dias úteis (base) • Fins de semana (+40%) • Feriados (+60%)
          </div> -->
      </div>
        </aside>
        <main class="md:w-[60%]">

      <div v-if="!cart.length"
        class="grid place-items-center rounded-xl border border-dashed border-slate-300 p-6 text-slate-500">
        <div class="text-center">
          <div class="text-4xl mb-2">🛒</div>
          <div class="font-medium mb-1">Carrinho vazio</div>
          <div class="text-sm">Use <b>Gerar automático</b> ou clique no catálogo acima</div>
          <div v-if="eventPeriods.length === 0" class="text-xs text-red-500 mt-2">
            ⚠️ Configure as datas do evento primeiro
          </div>
        </div>
      </div>
      <div v-else>
        <!-- Nova tabela por períodos -->
        <div class="space-y-4">
          <div v-for="cartItem in cart" :key="cartItem.key" class="border border-slate-200 rounded-xl overflow-hidden">
            <!-- Cabeçalho da função -->
            <div class="bg-slate-50 px-4 py-3 border-b border-slate-200 cursor-pointer"
              @click="toggleOpen(cartItem.key)">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <span class="text-xl">{{ icon(cartItem.key) }}</span>
                  <div>
                    <div class="font-semibold text-slate-900">{{ label(cartItem.key) }}</div>
                    <div class="text-sm text-slate-600">{{ cartItem.sector }}</div>
                  </div>
                </div>
                <div class="flex items-center gap-4">
                  <div class="hidden sm:flex items-center gap-4">
                    <div class="text-right">
                      <div class="text-[11px] text-slate-600 leading-none">Profissionais</div>
                      <div class="text-sm font-semibold text-slate-900">{{ itemProfessionalsPlanned(cartItem) }}</div>
                    </div>
                    <div class="text-right">
                      <div class="text-[11px] text-slate-600 leading-none">Dias • Turnos</div>
                      <div class="text-sm font-semibold text-slate-900">{{ itemDaysCount(cartItem) }} • {{
                        itemPeriodsCount(cartItem) }}</div>
                    </div>
                  </div>
                  <div class="text-right">
                    <div class="text-[11px] text-slate-600 leading-none">Subtotal</div>
                    <div class="text-sm font-semibold text-slate-900">{{ money(itemSubtotal(cartItem)) }}</div>
                  </div>
                  <div class="text-slate-400">{{ isOpen(cartItem.key) ? '▾' : '▸' }}</div>
                </div>
              </div>
            </div>

            <!-- Períodos do evento -->
            <div class="p-4" v-show="isOpen(cartItem.key)">
              <div v-if="cartItem.assignments.length === 0" class="text-center py-4 text-slate-500">
                <div class="text-sm">Nenhum período selecionado</div>
                <button @click="addAllPeriods(cartItem.key)"
                  class="mt-2 text-brand-600 hover:text-brand-800 text-sm underline">
                  Adicionar todos os períodos
                </button>
              </div>

              <div v-else class="space-y-2">
                <div v-for="(assignment, idx) in cartItem.assignments" :key="`${assignment.date}-${assignment.period}`"
                  class="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div class="flex-1">
                    <div class="text-sm font-medium">{{ formatDate(assignment.date) }}</div>
                    <div class="text-xs text-slate-600 capitalize">
                      <template v-if="!assignment.isExtra">
                        {{ assignment.period }} • {{ getDayType(assignment.date) === 'holiday' ? 'Feriado' :
                          getDayType(assignment.date) === 'weekend' ? 'Fim de semana' : 'Dia útil' }}
                      </template>
                      <template v-else>
                        Hora extra (1h)
                      </template>
                    </div>
                  </div>

                  <div class="flex items-center gap-3">
                    <!-- Quantidade -->
                    <div class="flex items-center gap-1">
                      <button @click="assignment.qty = Math.max(0, assignment.qty - 1)"
                        class="w-6 h-6 rounded bg-slate-200 hover:bg-slate-300 text-xs">−</button>
                      <input v-model.number="assignment.qty" type="number" min="0"
                        class="w-12 text-center text-xs border border-slate-300 rounded px-1 py-1">
                      <button @click="assignment.qty++"
                        class="w-6 h-6 rounded bg-slate-200 hover:bg-slate-300 text-xs">+</button>
                    </div>

                    <!-- Preço -->
                    <div class="text-right min-w-[80px]">
                      <div class="text-sm font-semibold">{{ money(assignment.price) }}</div>
                      <div class="text-xs text-slate-500">por pessoa</div>
                    </div>

                    <!-- Subtotal -->
                    <div class="text-right min-w-[80px]">
                      <div class="text-sm font-bold text-brand-600">{{ money(assignment.qty * assignment.price) }}</div>
                    </div>

                    <!-- Remover período -->
                    <button @click="removePeriod(cartItem.key, idx)"
                      class="text-red-500 hover:text-red-700 w-6 h-6 rounded hover:bg-red-50">
                      ×
                    </button>
                  </div>
                </div>
              </div>


            </div>
          </div>
        </div>
      </div>


      <!-- Card final com totais gerais -->
      <div class="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-xl">
        <div class="flex items-center justify-between">
          <div class="text-sm text-slate-600">Total de Profissionais</div>
          <div class="text-base font-semibold text-slate-900">{{ totalPlannedProfessionals }}</div>
        </div>
        <div class="flex items-center justify-between mt-2">
          <div class="text-sm text-slate-600">Total em reais</div>
          <div class="text-lg font-bold text-brand-600">{{ money(total) }}</div>
        </div>
      </div>
        </main>
      </div>
      </div>



  </section>
</template>

<style scoped>
.btn {
  @apply inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50;
}

.seg-on {
  @apply border-violet-600 bg-violet-600 text-white;
}
</style>
