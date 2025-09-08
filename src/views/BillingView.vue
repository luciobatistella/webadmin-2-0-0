<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import Breadcrumbs from '@/components/Breadcrumbs.vue'
import ClientActions from '@/components/ClientActions.vue'
import { listBilling } from '@/services/billing'

// Estado básico
const loading = ref(false)
const q = ref('')
const page = ref(1)
const limit = ref(18)
const total = ref(0)

// Filtro de data do cadastro (apenas via popover)

// Abas: Todos | Aguardando | Aprovados | Aguardando NF | Faturados
type TabKey = 'todos'|'aguardando'|'aprovados'|'aguardando_nf'|'faturados'|'cancelados'
const currentTab = ref<TabKey>('todos')
const tabToStatus: Record<TabKey, string> = { todos: '', aguardando: 'PENDING', aprovados: 'APPROVED', aguardando_nf: 'AWAITING_INVOICE', faturados: 'BILLED', cancelados: 'CANCELED' }

// Exibição amigável de status (case-insensitive; aceita '-' e '_')
const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Aguardando',
  APPROVED: 'Aprovados',
  AWAITING_INVOICE: 'Aguardando NF',
  BILLED: 'Faturados',
  CANCELED: 'Cancelados',
  ALL: 'Todos'
}
function statusLabel(v: unknown): string {
  const raw = String(v || '').trim()
  if (!raw) return '-'
  const norm = raw.replace(/[-\s]+/g, '_').toUpperCase()
  return STATUS_LABELS[norm] || raw
}

// Helpers de normalização e contadores por status
function normalizeStatus(v: unknown): string {
  return String(v || '').trim().replace(/[-\s]+/g, '_').toUpperCase()
}
function getStatusCanon(it: Row): string {
  // tenta múltiplas chaves e normaliza
  const raw = it.status ?? it.situacao ?? (it as any).status_faturamento ?? (it as any).situacao_faturamento ?? ''
  return normalizeStatus(raw)
}
function countByStatus(canon: 'PENDING'|'APPROVED'|'AWAITING_INVOICE'|'BILLED'|'CANCELED'){
  return baseRows.value.filter(it => getStatusCanon(it) === canon).length
}
const totalTodos = computed<number>(() => baseRows.value.length)
const totalAguardando = computed<number>(() => countByStatus('PENDING'))
const totalAprovados = computed<number>(() => countByStatus('APPROVED'))
const totalAguardandoNF = computed<number>(() => countByStatus('AWAITING_INVOICE'))
const totalFaturados = computed<number>(() => countByStatus('BILLED'))
const totalCancelados = computed<number>(() => countByStatus('CANCELED'))


// Linhas
type Row = Record<string, any>
const rows = ref<Row[]>([])

// Base sem filtro por aba (apenas busca)
const baseRows = computed<Row[]>(() => {
  const term = String(q.value || '').trim().toLowerCase()
  let list = Array.isArray(rows.value) ? rows.value : []
  if (!term) return list
  return list.filter(it => {
    const texto = `${it.id||''} ${it.nome||''} ${it.cliente||''} ${it.evento||''}`.toLowerCase()
    return texto.includes(term)
  })
})

// Aplicar filtro da aba (status) sobre a base
const filteredRows = computed<Row[]>(() => {
  const st = tabToStatus[currentTab.value]
  if (!st) return baseRows.value
  return baseRows.value.filter(it => getStatusCanon(it) === st)
})

const visibleRows = computed<Row[]>(() => {
  const start = (page.value - 1) * limit.value
  return filteredRows.value.slice(start, start + limit.value)
})

function clearSearch(){ q.value = ''; page.value = 1 }

// Paginação (igual Cooperados)
const totalPages = computed<number>(() => {
  const total = filteredRows.value.length
  return Math.max(1, Math.ceil(total / limit.value))
})
const pageItems = computed<Array<number | '…'>>(() => {
  const total = totalPages.value
  const current = page.value
  const delta = 2
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

function onSearchInput(){ page.value = 1 }
function setLimit(v: unknown){ limit.value = Math.max(10, Number(v) || 20); page.value = 1 }


function handleClickOutside(event: MouseEvent) {
  const target = event.target as Element | null
  if (!target?.closest('.relative')) {
    showDateFilter.value = false
  }
}

function printWindow(){ (window as any).print() }

function formatBRL(v: unknown){
  const n = Number(v)
  if (!isFinite(n)) return '-'
  try{ return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n) }catch{ return String(v ?? '-') }
}


// Filtro de data (padrão ClientsView)
const showDateFilter = ref(false)
const dateFilterType = ref<'sem_filtro'|'periodo'|'mes'>('sem_filtro')
const dateStart = ref('')
const dateEnd = ref('')
const selectedMonth = ref<string>('')

function getDateFilterLabel(){ return 'por data do cadastro' }
function applyDateFilter(){ showDateFilter.value = false; filter() }


async function load(){
  loading.value = true
  try{
    const p = new URLSearchParams()
    p.append('page', String(page.value))
    p.append('perPage', String(limit.value))
    if (q.value) p.append('q', q.value)
    // Filtro de data
    if (dateFilterType.value === 'periodo' && (dateStart.value || dateEnd.value)){
      if (dateStart.value) p.append('date_start', dateStart.value)
      if (dateEnd.value) p.append('date_end', dateEnd.value)
    } else if (dateFilterType.value === 'mes' && selectedMonth.value) {
      p.append('month', selectedMonth.value)
    }
    // Status por aba
    const st = tabToStatus[currentTab.value]
    if (st) p.append('status', st)

    const data: any = await listBilling(p)
    rows.value = Array.isArray(data) ? data as Row[] : ((data?.data || data?.rows || []) as Row[])
    total.value = Array.isArray(data) ? (data as any[]).length : ((data?.total || rows.value.length) as number)
  } finally { loading.value = false }
}

function filter(){ page.value = 1; load() }

onMounted(() => { document.addEventListener('click', handleClickOutside); load() })
onUnmounted(() => { document.removeEventListener('click', handleClickOutside) })
</script>

<template>
  <section>
    <Breadcrumbs />
    <header class="mb-6 flex items-center justify-between gap-3">
      <h1 class="text-2xl font-semibold">Faturamento</h1>
      <ClientActions @print="printWindow" @create="() => {}" @action="() => {}" />
    </header>


    <!-- Filtros -->
    <div class="card p-4 ">
      <div class="flex flex-wrap items-center gap-4">
        <!-- Busca -->
        <div class="relative flex-1 min-w-[280px]">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg class="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input v-model="q" @keyup.enter="filter" @input="onSearchInput" class="w-full pl-10 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-600 dark:text-zinc-100" :class="q ? 'pr-10' : 'pr-4'" placeholder="Buscar" />
          <button v-if="q" @click="clearSearch" class="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" type="button">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Filtro por data do cadastro (padrão ClientsView) -->
        <div class="relative">
          <button
            @click="showDateFilter = !showDateFilter"
            class="flex items-center gap-2 px-3 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
            :class="{ 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/20 dark:border-blue-600 dark:text-blue-300': dateFilterType !== 'sem_filtro' }"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span class="font-medium">{{ getDateFilterLabel() }}</span>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <div v-if="showDateFilter" class="absolute z-10 mt-2 w-80 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700">
            <div class="p-4">
              <h3 class="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-3">Data do Cadastro</h3>
              <div class="flex gap-1 mb-4">
                <button @click="dateFilterType='sem_filtro'; applyDateFilter()" class="px-2 py-1 text-xs rounded border transition-colors" :class="dateFilterType==='sem_filtro' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">sem filtro</button>
                <button @click="dateFilterType='periodo'" class="px-2 py-1 text-xs rounded border transition-colors" :class="dateFilterType==='periodo' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Data do Cadastro</button>
                <button @click="dateFilterType='mes'" class="px-2 py-1 text-xs rounded border transition-colors" :class="dateFilterType==='mes' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">mês</button>
              </div>
              <div v-if="dateFilterType==='periodo'" class="space-y-3">
                <div>
                  <label class="block text-xs font-medium mb-1">Data inicial</label>
                  <input v-model="dateStart" type="date" class="w-full px-3 py-2 border rounded-lg dark:bg-zinc-700 dark:border-zinc-600" />
                </div>
                <div>
                  <label class="block text-xs font-medium mb-1">Data final</label>
                  <input v-model="dateEnd" type="date" class="w-full px-3 py-2 border rounded-lg dark:bg-zinc-700 dark:border-zinc-600" />
                </div>
              </div>
              <div v-if="dateFilterType==='mes'" class="space-y-3">
                <div>
                  <label class="block text-xs font-medium mb-1">Mês</label>
                  <input v-model="selectedMonth" type="month" class="w-full px-3 py-2 border rounded-lg dark:bg-zinc-700 dark:border-zinc-600" />
                </div>
              </div>
              <div v-if="dateFilterType!=='sem_filtro'" class="flex justify-end gap-2 mt-4">
                <button @click="applyDateFilter" class="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">aplicar</button>
                <button @click="showDateFilter = false" class="px-3 py-1.5 text-zinc-600 text-xs hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700 rounded">cancelar</button>
              </div>
            </div>
          </div>
        </div>


      </div>
    </div>


    <!-- Tabs (abaixo do filtro) -->
     <div class="mb-3 mt-3">
    <nav class="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-700">
      <button @click="currentTab = 'todos'" :class="currentTab==='todos' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'" class="px-3 py-2 text-sm">Todos <span>({{ totalTodos }})</span></button>
      <button @click="currentTab = 'aguardando'" :class="currentTab==='aguardando' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'" class="px-3 py-2 text-sm">Aguardando <span>({{ totalAguardando }})</span></button>
      <button @click="currentTab = 'aprovados'" :class="currentTab==='aprovados' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'" class="px-3 py-2 text-sm">Aprovados <span>({{ totalAprovados }})</span></button>
      <button @click="currentTab = 'aguardando_nf'" :class="currentTab==='aguardando_nf' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'" class="px-3 py-2 text-sm">Aguardando NF <span>({{ totalAguardandoNF }})</span></button>
      <button @click="currentTab = 'faturados'" :class="currentTab==='faturados' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'" class="px-3 py-2 text-sm">Faturados <span>({{ totalFaturados }})</span></button>
      <button @click="currentTab = 'cancelados'" :class="currentTab==='cancelados' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'" class="px-3 py-2 text-sm">Cancelados <span>({{ totalCancelados }})</span></button>
      <div class="ml-auto flex items-center gap-2 text-sm">
        <span class="text-zinc-500">Exibir</span>
        <select :value="limit" @change="setLimit(($event.target as HTMLSelectElement).value)" class="px-2 py-1 border border-zinc-300 rounded-md text-sm dark:bg-zinc-800 dark:border-zinc-600">
          <option :value="18">18</option>
          <option :value="36">36</option>
          <option :value="72">72</option>
        </select>
        <span class="text-zinc-500">por página</span>
      </div>
    </nav>
    </div>
    <!-- Cards -->
    <div v-if="loading" class="card p-4">Carregando...</div>
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <div v-for="it in visibleRows" :key="it.id" class="card p-4 flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <h3 class="font-medium truncate">{{ it.cliente || it.cliente_nome || it.nome || it.name || '—' }}</h3>
          <span class="text-xs px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">{{ statusLabel(it.status || it.situacao) }}</span>


        </div>
        <div class="text-sm text-zinc-600 dark:text-zinc-300 space-y-1">


          <div class="flex gap-2 flex-wrap">
            <span class="text-xs text-zinc-500">RPS:</span> <span>{{ it.rps || it.rps_num || '-' }}</span>
            <span class="text-xs text-zinc-500 ml-3">NF:</span> <span>{{ it.nota_fiscal || it.nf || '-' }}</span>
            <span class="text-xs text-zinc-500 ml-3">Valor:</span> <span>{{ formatBRL(it.valor || it.total || it.vlr) }}</span>
          </div>
          <div><span class="text-xs text-zinc-500">Emissão:</span> {{ it.data_emissao || it.data || it.created_at || '-' }}</div>
          <div><span class="text-xs text-zinc-500">Vencimento:</span> {{ it.data_vencimento || '-' }}</div>
          <div class="flex gap-3 flex-wrap">
            <div><span class="text-xs text-zinc-500">Unidade:</span> {{ it.unidade || it.unidade_nome || '-' }}</div>
            <div><span class="text-xs text-zinc-500">Setor:</span> {{ it.setor || it.setor_nome || '-' }}</div>
          </div>
        </div>
        <div class="mt-2 text-right">
          <button class="btn btn-secondary btn-sm">Detalhes</button>
        </div>
      </div>
    </div>

    <!-- Paginação inferior (igual Cooperados) -->
    <div
      class="fixed w-[calc(100%-15rem)] left-60 bottom-0 z-30 bg-white dark:bg-zinc-900/90 border-t border-zinc-200 dark:border-zinc-700 p-2">
      <div
        class="container max-w-[1400px] mx-auto flex flex-col sm:flex-row sm:items-center gap-2 justify-between text-sm">
        <span
          class="mt-1 text-blue-600 text-xs font-medium me-2 px-2.5 py-0.5 rounded-sm dark:bg-blue-900 dark:text-blue-300">
          Exibindo {{ Math.min((page - 1) * limit + 1, filteredRows.length) }} • {{ Math.min(page * limit, filteredRows.length) }}
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

  </section>
</template>

