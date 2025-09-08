<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Breadcrumbs from '@/components/Breadcrumbs.vue'
import { listRequests } from '@/services/requests'

const route = useRoute()
const router = useRouter()

const rows = ref<any[]>([])
const loading = ref(false)
const page = ref(1)
const limit = ref(20)
const total = ref(0)

// filtros
const q = ref('')
const clientId = ref('')
const unitId = ref('')
const sectorId = ref('')
const status = ref('')
const dtRange = ref('') // formato livre, ex: 2024-01-01 até 2024-01-31

function setRouteQuery(filter: Record<string, any>, query: Record<string, any>) {
  const current: Record<string, any> = { ...(query || {}) }
  Object.keys(filter || {}).forEach(k => {
    if (filter[k]) current[k] = filter[k]
    else delete current[k]
  })
  router.replace({ query: current }).catch(() => {})
  return current
}

function buildParamsRouteQuery(query: Record<string, any>) {
  const params = new URLSearchParams()
  const current: Record<string, any> = { ...(query || {}) }
  Object.keys(current).forEach(k => { if (current[k]) params.append(k, current[k]) })
  return params
}

async function load() {
  loading.value = true
  try {
    const params = buildParamsRouteQuery(route.query)
    params.append('page', String(page.value - 1))
    params.append('limit', String(limit.value))

    if (q.value) params.append('q', q.value)
    if (clientId.value) params.append('id_cliente', clientId.value)
    if (unitId.value) params.append('id_unidade', unitId.value)
    if (sectorId.value) params.append('id_setor', sectorId.value)
    if (status.value) params.append('status', status.value)

    if (dtRange.value) {
      const parts = String(dtRange.value).split('até')
      const toYMD = (s: string) => {
        const d = new Date(s)
        if (Number.isNaN(d.getTime())) return ''
        const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,'0'); const da = String(d.getDate()).padStart(2,'0')
        return `${y}-${m}-${da}`
      }
      const di = toYMD(parts[0].trim())
      const df = parts[1] ? toYMD(parts[1].trim()) : di
      if (di) params.append('data_ini', di)
      if (df) params.append('data_fim', df)
    }

    const data = await listRequests(params) as any
    rows.value = Array.isArray(data) ? data : (data?.data || data?.rows || [])
    total.value = Array.isArray(data) ? data.length : (data?.total || rows.value.length)
  } finally {
    loading.value = false
  }
}

function applyFiltersFromUrl() {
  const qy = route.query
  q.value = String(qy.q || '')
  clientId.value = String(qy.id_cliente || '')
  unitId.value = String(qy.id_unidade || '')
  sectorId.value = String(qy.id_setor || '')
  status.value = String(qy.status || '')
  dtRange.value = String(qy.dtRange || '')
}

function filter() {
  page.value = 1
  setRouteQuery({ q: q.value, id_cliente: clientId.value, id_unidade: unitId.value, id_setor: sectorId.value, status: status.value, dtRange: dtRange.value }, route.query)
  load()
}

onMounted(() => { applyFiltersFromUrl(); load() })
watch(() => route.query, () => { applyFiltersFromUrl(); })
</script>

<template>
  <section class="space-y-4 p-4">
    <Breadcrumbs />
    <header class="card p-4">
      <div class="grid grid-cols-1 md:grid-cols-6 gap-3">
        <div class="md:col-span-2">
          <label class="text-xs text-zinc-500">Busca</label>
          <input v-model="q" @keyup.enter="filter" class="w-full rounded border px-2 py-1" placeholder="Nome/cliente/evento" />
        </div>
        <div>
          <label class="text-xs text-zinc-500">Cliente</label>
          <input v-model="clientId" class="w-full rounded border px-2 py-1" placeholder="ID cliente" />
        </div>
        <div>
          <label class="text-xs text-zinc-500">Unidade</label>
          <input v-model="unitId" class="w-full rounded border px-2 py-1" placeholder="ID unidade" />
        </div>
        <div>
          <label class="text-xs text-zinc-500">Setor</label>
          <input v-model="sectorId" class="w-full rounded border px-2 py-1" placeholder="ID setor" />
        </div>
        <div>
          <label class="text-xs text-zinc-500">Status</label>
          <select v-model="status" class="w-full rounded border px-2 py-1">
            <option value="">Todos</option>
            <option value="aberta">Aberta</option>
            <option value="fechada">Fechada</option>
          </select>
        </div>
        <div class="md:col-span-2">
          <label class="text-xs text-zinc-500">Período (YYYY-MM-DD até YYYY-MM-DD)</label>
          <input v-model="dtRange" class="w-full rounded border px-2 py-1" placeholder="2024-01-01 até 2024-01-31" />
        </div>
        <div class="flex items-end gap-2">
          <button class="btn btn-primary" @click="filter">Filtrar</button>
          <button class="btn btn-secondary" @click="() => { q=''; clientId=''; unitId=''; sectorId=''; status=''; dtRange=''; filter(); }">Limpar</button>
        </div>
        <div class="md:col-span-2 flex items-end justify-end text-xs text-zinc-500">{{ total }} registros</div>
      </div>
    </header>

    <div class="card">
      <div v-if="loading" class="p-4">Carregando...</div>
      <table v-else class="min-w-full text-left text-sm">
        <thead class="bg-zinc-100 text-xs dark:bg-zinc-800">
          <tr>
            <th class="px-2 py-1">Data</th>
            <th class="px-2 py-1">Cliente</th>
            <th class="px-2 py-1">Unidade</th>
            <th class="px-2 py-1">Evento</th>
            <th class="px-2 py-1">Setor</th>
            <th class="px-2 py-1">Função</th>
            <th class="px-2 py-1">Qtd</th>
            <th class="px-2 py-1">Solicitante</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="it in rows" :key="it.id" class="border-b">
            <td class="px-2 py-1">{{ it.dataEvento || it.data_evento || it.data || '-' }}</td>
            <td class="px-2 py-1">{{ it.cliente }}</td>
            <td class="px-2 py-1">{{ it.unidade }}</td>
            <td class="px-2 py-1">{{ it.nomeEvento || it.nome_evento }}</td>
            <td class="px-2 py-1">{{ it.setor }}</td>
            <td class="px-2 py-1">{{ it.funcao }}</td>
            <td class="px-2 py-1">{{ it.qtdCliente || it.qtd || '-' }}</td>
            <td class="px-2 py-1">{{ it.solicitante }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
