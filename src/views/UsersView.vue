<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Breadcrumbs from '@/components/Breadcrumbs.vue'
import ClientActions from '@/components/ClientActions.vue'

import { listUsers } from '@/services/users'
import type { User } from '@/types/User'

const router = useRouter()

type SortKey = 'nome' | 'mais_recentes' | 'codigo'

const rows = ref<User[]>([])
const loading = ref(false)
const page = ref(1)
const limit = ref(20)
const total = ref(0)

const sortBy = ref<SortKey>('mais_recentes')

// Normaliza texto (acentos, caixa)
function normalizeText(s: unknown){
  return String(s||'')
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .toLowerCase()
}

// Tabs de situação
const currentTab = ref('todos') // 'todos' | 'ativos' | 'inativos'
function isActiveUser(it: User){ return Boolean((it as any).active ?? (it as any).ativo ?? true) }
function isInactiveUser(it: User){ return !isActiveUser(it) }

// Lista base (busca) SEM aplicar aba – usada para contadores
const baseFilteredRows = computed(() => {
  let list = Array.isArray(rows.value) ? rows.value : []
  const term = normalizeText(q.value || '')
  if (term) {
    list = list.filter(it => {
      const name = normalizeText(it.name || it.nome || it.usuario)
      const email = normalizeText(it.email)
      const id = String(it.id || '')
      return name.includes(term) || email.includes(term) || id.includes(String(q.value || ''))
    })
  }
  return list
})

const totalTodos = computed(() => baseFilteredRows.value.length)
const totalAtivos = computed(() => baseFilteredRows.value.filter(isActiveUser).length)
const totalInativos = computed(() => baseFilteredRows.value.filter(isInactiveUser).length)

// Aplica aba + ordenação
const filteredRows = computed(() => {
  let list = baseFilteredRows.value
  if (currentTab.value === 'ativos') list = list.filter(isActiveUser)
  else if (currentTab.value === 'inativos') list = list.filter(isInactiveUser)

  const byName = (it: User) => normalizeText((it as any).name || (it as any).nome || (it as any).usuario)
  if (sortBy.value === 'nome') list = [...list].sort((a,b) => byName(a).localeCompare(byName(b)))
  else if (sortBy.value === 'codigo') list = [...list].sort((a,b) => (Number((a as any).id)||0) - (Number((b as any).id)||0))
  else list = [...list].sort((a,b) => (Number((b as any).id)||0) - (Number((a as any).id)||0))
  return list
})

const visibleRows = computed(() => {
  const start = (page.value - 1) * limit.value
  return filteredRows.value.slice(start, start + limit.value)
})

const showFilters = ref(false)
function getSortLabel(){
  const labels = { nome: 'nome', mais_recentes: 'mais recentes', codigo: 'código' }
  return labels[sortBy.value] || 'mais recentes'
}
function onSearchInput(){ page.value = 1 }
function clearSearch(){ q.value = ''; page.value = 1 }
function printWindow(){ (window as any).print() }


const q = ref('')

async function load() {
  loading.value = true
  try {
    const p = new URLSearchParams()
    p.append('page', String(page.value))
    p.append('limit', String(limit.value))
    if (q.value) p.append('q', q.value)
    const data = await listUsers(p)
    if (Array.isArray(data)) { rows.value = data; total.value = data.length }
    else { rows.value = (data as any)?.data || (data as any)?.rows || []; total.value = (data as any)?.total || rows.value.length }
  } finally {
    loading.value = false
  }
}

function nextPage() { page.value++; load() }
function prevPage() { if (page.value>1) { page.value--; load() } }
function openRegister() { router.push({ name: 'user-register' }) }

onMounted(load)
</script>

<template>
  <section class="">
    <Breadcrumbs />
    <header class="mb-6 flex items-center justify-between gap-3">
      <h1 class="text-2xl font-semibold">Usuários</h1>
      <ClientActions class="ml-auto" @print="printWindow" @create="openRegister" @action="() => {}" />
    </header>

    <!-- Barra de busca e filtros em uma linha -->
    <div class="card p-4 ">
      <div class="flex flex-wrap items-center gap-4">
        <!-- Campo de busca com lupa -->
        <div class="relative flex-1 min-w-[300px]">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg class="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            v-model="q"
            @keyup.enter="load"
            @input="onSearchInput"
            class="w-full pl-10 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-600 dark:text-zinc-100"
            :class="q ? 'pr-10' : 'pr-4'"
            placeholder="Buscar por nome ou e-mail"
          />
          <!-- Botão X para limpar -->
          <button
            v-if="q"
            @click="clearSearch"
            class="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            type="button"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Filtro de ordenação -->
        <div class="relative">
          <button
            @click="showFilters = !showFilters"
            class="flex items-center gap-2 px-3 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
            :class="{ 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/20 dark:border-blue-600 dark:text-blue-300': showFilters || sortBy !== 'mais_recentes' }"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span class="font-medium">{{ getSortLabel() }}</span>
            <span class="text-xs text-zinc-500">por situação</span>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <!-- Dropdown de ordenação -->
          <div v-if="showFilters" class="absolute z-10 mt-2 w-64 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700">
            <div class="p-4">
              <h3 class="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-3">Ordenar por</h3>
              <div class="flex gap-1">
                <button
                  @click="sortBy = 'nome'"
                  class="px-2 py-1 text-xs rounded border transition-colors"
                  :class="sortBy === 'nome' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'"
                >
                  nome
                </button>
                <button
                  @click="sortBy = 'mais_recentes'"
                  class="px-2 py-1 text-xs rounded border transition-colors"
                  :class="sortBy === 'mais_recentes' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'"
                >
                  mais recentes
                </button>
                <button
                  @click="sortBy = 'codigo'"
                  class="px-2 py-1 text-xs rounded border transition-colors"
                  :class="sortBy === 'codigo' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'"
                >
                  código
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="ml-auto text-xs text-zinc-500">Página {{ page }} • {{ total }} registros</div>
      </div>
    </div>

    <!-- Tabs de situação -->
    <div class="mb-3 mt-3">
      <nav class="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-700">
        <div class="flex gap-2">
          <button @click="currentTab = 'todos'" :class="currentTab==='todos' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'" class="px-3 py-2 text-sm">Todos <span>({{ totalTodos }})</span></button>
          <button @click="currentTab = 'ativos'" :class="currentTab==='ativos' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'" class="px-3 py-2 text-sm">Ativos <span>({{ totalAtivos }})</span></button>
          <button @click="currentTab = 'inativos'" :class="currentTab==='inativos' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'" class="px-3 py-2 text-sm">Inativos <span>({{ totalInativos }})</span></button>
        </div>
      </nav>
    </div>

    <!-- Cards -->
    <div class="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      <template v-if="loading">
        <div v-for="n in 6" :key="'sk'+n" class="card p-3 animate-pulse">
          <div class="mb-2 h-4 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800"></div>
          <div class="space-y-2 text-xs">
            <div class="h-3 w-1/3 rounded bg-zinc-200 dark:bg-zinc-800"></div>
            <div class="h-3 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800"></div>
          </div>
        </div>
      </template>
      <template v-else>
        <article v-for="it in visibleRows" :key="it.id" class="card p-3">
          <header class="mb-2 flex items-center justify-between">
            <strong class="truncate">{{ it.name || it.nome || it.usuario || '—' }}</strong>
            <span class="rounded px-2 py-0.5 text-xs bg-zinc-100 dark:bg-zinc-800">#{{ it.id }}</span>
          </header>
          <dl class="space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
            <div class="flex justify-between"><dt class="font-medium">E-mail</dt><dd class="truncate max-w-[12rem]">{{ it.email || '-' }}</dd></div>
            <div class="flex justify-between"><dt class="font-medium">Perfil</dt><dd>{{ it.role || it.perfil || '-' }}</dd></div>
          </dl>
        </article>
      </template>
    </div>

  </section>
</template>


