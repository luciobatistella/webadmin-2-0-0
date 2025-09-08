<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import Breadcrumbs from '@/components/Breadcrumbs.vue'
import ClientActions from '@/components/ClientActions.vue'
import { listCooperados } from '@/services/cooperados'

type Row = Record<string, any>

defineOptions({ name: 'CooperadosView' })

const rows = ref<Row[]>([])
const loading = ref(false)
const page = ref(1)
const limit = ref(18)
const total = ref(0)

const q = ref('')
const sortBy = ref<'nome'|'mais_recentes'|'codigo'>('mais_recentes')
const showFilters = ref(false)
const showFuncFilter = ref(false)
const showSort = ref(false)
const showOpStatus = ref(false)
const opStatusFilter = ref<string>('') // '', 'disponivel', 'contratacao', 'pre_doc', 'agendado', 'trabalhando', 'concluido', 'faltou_cancelou'

const showLocation = ref(false)

// Filtro por função
const funcaoFilter = ref('')
const FILTRO_SEM_FUNCAO = '__SEM_FUNCAO__'
const FILTRO_COM_FUNCAO = '__COM_FUNCAO__'

// Tabs (Situação)
const currentTab = ref('todos') // 'todos' | 'ativos' | 'inativos' | 'bloqueados' | 'pendentes'


// Filtros adicionais
const showStatusFilter = ref(false)
const statusFilter = ref('nenhum') // 'nenhum' | 'completo' | 'incompleto'
const sexoFilter = ref('')         // 'M' | 'F' | ''
const estadoFilter = ref('SP')      // UF ou nome
const cidadeFilter = ref('')
const regiaoFilter = ref('')


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


async function load() {
  loading.value = true
  try {
    const p = new URLSearchParams()
    p.append('page', String(page.value - 1))
    p.append('limit', String(limit.value))
    if (q.value) p.append('q', q.value)
    // Filtro por funções não depende de parâmetros na API; aplicado somente no front-end
    const data: any = await listCooperados(p)
    rows.value = Array.isArray(data) ? data as Row[] : ((data?.data || data?.rows || []) as Row[])
    total.value = Array.isArray(data) ? (data as any[]).length : ((data?.total || rows.value.length) as number)


  } finally { loading.value = false }


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

  if (opStatusFilter.value) {
    list = list.filter(it => getOpStatusKey(it) === opStatusFilter.value)
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



const totalTodos = computed(() => baseFilteredRows.value.length)
const totalAtivos = computed(() => baseFilteredRows.value.filter(isAtivo).length)
const totalInativos = computed(() => baseFilteredRows.value.filter(isInativo).length)
const totalBloqueados = computed(() => baseFilteredRows.value.filter(isBloqueado).length)
const totalPendentesTab = computed(() => baseFilteredRows.value.filter(isPendente).length)


const filteredRows = computed<Row[]>(() => {
  let list: Row[] = baseFilteredRows.value

  // Aba (Situação)
  if (currentTab.value === 'ativos') list = list.filter(isAtivo as any)
  else if (currentTab.value === 'inativos') list = list.filter(isInativo as any)
  else if (currentTab.value === 'bloqueados') list = list.filter(isBloqueado as any)
  else if (currentTab.value === 'pendentes') list = list.filter(isPendente as any)

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
  const raw = String((it as any).status_operacional || (it as any).operational_status || (it as any).status_evento || (it as any).status_evento_atual || '').trim()
  if (!raw) return ''
  const s = normalizeText(raw)
  if (s.includes('trabalhando') || s.includes('check-in') || s.includes('checkin')) return 'trabalhando'
  if (s.includes('concluido') || s.includes('check-out') || s.includes('checkout')) return 'concluido'
  if (s.includes('agendado') || s.includes('escalad')) return 'agendado'
  if (s.includes('pre') || s.includes('aguardando') || s.includes('documenta')) return 'pre_doc'
  if (s.includes('processo') || s.includes('contratacao') || s.includes('convite')) return 'contratacao'
  if (s.includes('faltou') || s.includes('cancelou') || s.includes('no show') || s.includes('noshow')) return 'faltou_cancelou'
  if (s.includes('disponivel') || s.includes('livre')) return 'disponivel'
  return ''
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

function setLimit(v: unknown) {
  const n = Math.max(18, Number(v) || 18)
  limit.value = n
  page.value = 1
}

function toWhatsUrl(number: unknown) {
  const digits = String(number || '').replace(/[^0-9]/g, '')
  if (!digits) return ''
  return `https://api.whatsapp.com/send/?phone=55${digits}&text&type=phone_number&app_absent=0`
}

const visibleRows = computed<Row[]>(() => {
  const start = (page.value - 1) * limit.value
  return filteredRows.value.slice(start, start + limit.value)
})

// Paginação: total de páginas e lista de páginas com elipses
const totalPages = computed<number>(() => {
  const total = filteredRows.value.length
  return Math.max(1, Math.ceil(total / limit.value))
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
function clearEstado() { estadoFilter.value = ''; page.value = 1 }
function clearRegiao() { regiaoFilter.value = ''; page.value = 1 }
function clearCidade() { cidadeFilter.value = ''; page.value = 1 }
function clearSexo() { sexoFilter.value = ''; page.value = 1 }
function clearStatus() { statusFilter.value = 'nenhum'; page.value = 1 }
function clearFuncao() { funcaoFilter.value = ''; page.value = 1 }
function clearOpStatus() { opStatusFilter.value = ''; page.value = 1 }

function clearSearch() { q.value = ''; page.value = 1 }

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
  load()
}

function printWindow(){ (window as any).print() }


onMounted(load)

</script>

<template>
  <section class="">

    <Breadcrumbs />
    <header class="mb-6 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <h1 class="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Cooperados</h1>
        <span
          class="bg-blue-100 mt-1 text-blue-800 text-xs font-medium me-2 px-2.5 py-0.5 rounded-sm dark:bg-blue-900 dark:text-blue-300">
          Exibindo {{ Math.min((page - 1) * limit + 1, filteredRows.length) }} • {{ Math.min(page * limit,
            filteredRows.length) }} de {{ filteredRows.length }} registros</span>
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
              Status Op.: {{ opStatusFilter }}
              <button @click="clearOpStatus" type="button" class="ml-1 hover:text-indigo-900">
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

        <!-- Dropdown de ordenação (igual Clientes) -->
        <div class="relative">
          <button @click="showSort = !showSort"
            class="flex items-center gap-2 px-3 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
            :class="{ 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/20 dark:border-blue-600 dark:text-blue-300': showSort || sortBy !== 'mais_recentes' }">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span class="font-medium">{{ getSortLabel() }}</span>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <!-- Dropdown de ordenação -->
          <div v-if="showSort"
            class="absolute z-10 mt-2 w-64 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700">
            <div class="p-4">
              <h3 class="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-3">Ordenar por</h3>
              <div class="flex gap-1">
                <button @click="sortBy = 'nome'; filter(); showSort = false"
                  class="px-2 py-1 text-xs rounded border transition-colors"
                  :class="sortBy === 'nome' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">nome</button>
                <button @click="sortBy = 'mais_recentes'; filter(); showSort = false"
                  class="px-2 py-1 text-xs rounded border transition-colors"
                  :class="sortBy === 'mais_recentes' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">mais
                  recentes</button>
                <button @click="sortBy = 'codigo'; filter(); showSort = false"
                  class="px-2 py-1 text-xs rounded border transition-colors"
                  :class="sortBy === 'codigo' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">código</button>
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
                <div class="flex flex-wrap gap-1">
                  <button @click="opStatusFilter = ''; showOpStatus=false" class="px-2 py-1 text-[11px] rounded border transition-colors"
                    :class="opStatusFilter === '' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">
                    Todos
                  </button>
                  <button @click="opStatusFilter = 'disponivel'; showOpStatus=false" class="px-2 py-1 text-[11px] rounded border transition-colors"
                    :class="opStatusFilter === 'disponivel' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">
                    Disponível
                  </button>
                  <button @click="opStatusFilter = 'contratacao'; showOpStatus=false" class="px-2 py-1 text-[11px] rounded border transition-colors"
                    :class="opStatusFilter === 'contratacao' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">
                    Em processo de contratação
                  </button>
                  <button @click="opStatusFilter = 'pre_doc'; showOpStatus=false" class="px-2 py-1 text-[11px] rounded border transition-colors"
                    :class="opStatusFilter === 'pre_doc' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">
                    Pré-confirmado / Aguardando documentação
                  </button>
                  <button @click="opStatusFilter = 'agendado'; showOpStatus=false" class="px-2 py-1 text-[11px] rounded border transition-colors"
                    :class="opStatusFilter === 'agendado' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">
                    Agendado
                  </button>
                  <button @click="opStatusFilter = 'trabalhando'; showOpStatus=false" class="px-2 py-1 text-[11px] rounded border transition-colors"
                    :class="opStatusFilter === 'trabalhando' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">
                    Trabalhando
                  </button>
                  <button @click="opStatusFilter = 'concluido'; showOpStatus=false" class="px-2 py-1 text-[11px] rounded border transition-colors"
                    :class="opStatusFilter === 'concluido' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">
                    Concluído
                  </button>
                  <button @click="opStatusFilter = 'faltou_cancelou'; showOpStatus=false" class="px-2 py-1 text-[11px] rounded border transition-colors"
                    :class="opStatusFilter === 'faltou_cancelou' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">
                    Faltou / Cancelou
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>


        <!-- Dropdown “Sexo” (cards) -->
        <div class="relative">
          <button @click="showFilters = !showFilters"
            class="flex items-center gap-2 px-3 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
            :class="{ 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/20 dark:border-blue-600 dark:text-blue-300': showFilters }">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span class="font-medium">Sexo</span>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <div v-if="showFilters"
            class="absolute z-10 mt-2 w-[20rem] bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 p-4">
            <div class="grid grid-cols-1 gap-4">
              <div>
                <h3 class="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-3">Sexo</h3>
                <div class="flex gap-1">
                  <button @click="sexoFilter = ''" class="px-2 py-1 text-xs rounded border transition-colors"
                    :class="sexoFilter === '' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Todos</button>
                  <button @click="sexoFilter = 'M'" class="px-2 py-1 text-xs rounded border transition-colors"
                    :class="sexoFilter === 'M' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Masculino
                    ({{ totalSexoM }})</button>
                  <button @click="sexoFilter = 'F'" class="px-2 py-1 text-xs rounded border transition-colors"
                    :class="sexoFilter === 'F' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Feminino
                    ({{ totalSexoF }})</button>
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
        <div class="flex gap-2">
          <button @click="currentTab = 'todos'"
            :class="currentTab === 'todos' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'"
            class="px-3 py-2 text-sm">Todos <span>({{ totalTodos }})</span></button>
          <button @click="currentTab = 'ativos'"
            :class="currentTab === 'ativos' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'"
            class="px-3 py-2 text-sm">Ativos <span>({{ totalAtivos }})</span></button>
          <button @click="currentTab = 'inativos'"
            :class="currentTab === 'inativos' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'"
            class="px-3 py-2 text-sm">Inativo <span>({{ totalInativos }})</span></button>
          <button @click="currentTab = 'bloqueados'"
            :class="currentTab === 'bloqueados' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'"
            class="px-3 py-2 text-sm">Bloqueado <span>({{ totalBloqueados }})</span></button>
          <button @click="currentTab = 'pendentes'"
            :class="currentTab === 'pendentes' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'"
            class="px-3 py-2 text-sm">Pendente <span>({{ totalPendentesTab }})</span></button>
        </div>
        <div class="ml-auto flex items-center gap-2 text-sm">
          <span class="text-zinc-500">Exibir</span>
          <select :value="limit" @change="setLimit(($event.target as HTMLSelectElement).value)"
            class="px-2 py-1 border border-zinc-300 rounded-md text-sm dark:bg-zinc-800 dark:border-zinc-600">
            <option :value="18">18</option>
            <option :value="20">20</option>
            <option :value="30">30</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select>
          <span class="text-zinc-500">por página</span>
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
        <article v-for="it in visibleRows" :key="it.id" class="card p-3">
          <div class="grid grid-cols-[80px,1fr] gap-1 items-start">
            <div class="row-span-2 self-center flex items-center justify-center">
              <div
                class="h-14 w-14 rounded-full overflow-hidden bg-zinc-200 text-zinc-600 flex items-center justify-center">
                <img v-if="getAvatarUrl(it)" :src="getAvatarUrl(it)" alt="avatar" class="h-full w-full object-cover" />
                <span v-else class="text-[12px] font-semibold">{{ getInitials(it) }}</span>
              </div>
            </div>
            <header class="flex items-center min-w-0">
              <strong class="truncate block max-w-full">{{ it.nome || it.name || '—' }}</strong>
            </header>
            <dl class="min-w-0 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
              <div class="grid-cols-1 sm:grid-cols-3">
                <span class="text-xs font-medium ">Matrícula #{{
                  it.matricula || it.matricola || it.registration || '-' }}</span>
                <!-- <dd>{{ it.cpf || it.cnpj || it.documento || '-' }}</dd> -->
                <!-- <dd >{{ it.email || '-' }}</dd> -->
                <div class="text-xs font-medium ">{{ it.cidade || '-' }}
                  | {{ it.regiao || '-' }}</div>
                <!-- <dd >{{ it.cooperativa }}</dd> -->
                <dd v-if="it.telefone1">
                  <a :href="toWhatsUrl(it.telefone1)" target="_blank" rel="noopener"
                    class="inline-flex items-center gap-1 hover:text-blue-600">

                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                      class="feather feather-message-circle">
                      <path
                        d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z">
                      </path>
                    </svg>
                    <span>{{ it.telefone1 }}</span>
                  </a>
                </dd>
                <dd>{{ it.email }}</dd>
                <dd>{{ it.funcao1 }}</dd>
                <dd>{{ it.funcao2 }}</dd>
                <dd>{{ it.funcao3 }}</dd>
              </div>
            </dl>
          </div>
        </article>
      </template>
    </div>
  </section>
  <!-- Paginação fixa no footer -->
  <div
    class="fixed w-[calc(100%-15rem)] left-60 bottom-0 z-30 bg-white dark:bg-zinc-900/90 border-t border-zinc-200 dark:border-zinc-700 p-2">
    <div
      class="container max-w-[1400px] mx-auto flex flex-col sm:flex-row sm:items-center gap-2 justify-between text-sm">
      <span
        class="mt-1 text-blue-600 text-xs font-medium me-2 px-2.5 py-0.5 rounded-sm dark:bg-blue-900 dark:text-blue-300">
        Exibindo {{ Math.min((page - 1) * limit + 1, filteredRows.length) }} • {{ Math.min(page * limit, filteredRows.length)
        }}
        de {{ filteredRows.length }} registros</span>
      <div class="inline-flex items-center gap-1">
        <button @click="page = 1" :disabled="page === 1" class="px-2 py-1 border rounded disabled:opacity-50">«</button>
        <button @click="page = Math.max(1, page - 1)" :disabled="page === 1"
          class="px-2 py-1 border rounded disabled:opacity-50">‹</button>
        <template v-for="p in pageItems" :key="'p'+p">
          <span v-if="p === '…'" class="px-2 py-1 text-zinc-400">…</span>
          <button v-else @click="page = p" :class="page === p ? 'bg-blue-600 text-white border-blue-600' : ''"
            class="px-2 py-1 border rounded">{{ p }}</button>
        </template>
        <button @click="page = Math.min(totalPages, page + 1)" :disabled="page === totalPages"
          class="px-2 py-1 border rounded disabled:opacity-50">›</button>
        <button @click="page = totalPages" :disabled="page === totalPages"
          class="px-2 py-1 border rounded disabled:opacity-50">»</button>
      </div>
    </div>
  </div>

</template>
