<script setup lang="ts">
import { ref, computed, onMounted, type Ref } from 'vue'
import { findEventsRequests, findEventDetails } from '@/services/dashboard'
import ClientActions from '@/components/ClientActions.vue'
import DashboardCards from './dashboard/DashboardCards.vue'
import DashboardDetails from './dashboard/DashboardDetails.vue'
import SidePanel from '@/components/SidePanel.vue'
import Breadcrumbs from '@/components/Breadcrumbs.vue'

const loadingRequests = ref(false)
const loadingDetails = ref(false)
type EventRequest = Record<string, any>

const eventsRequests = ref<EventRequest[]>([])
const eventDetails = ref<Record<string, any>>({})
const selectedKey = ref<string>('')
const currentDate = ref<string>(new Date().toISOString().slice(0, 10))

const getRequested = computed(() => {
  const fromDetails = Number(eventDetails.value?.requested_professional)
  if (!Number.isNaN(fromDetails) && fromDetails > 0) return fromDetails
  return eventsRequests.value.reduce((a, i) => a + (i.requested || 0), 0)
})
const getAccepted = computed(() => {
  const fromDetails = Number(eventDetails.value?.invitations_accepted)
  if (!Number.isNaN(fromDetails) && fromDetails > 0) return fromDetails
  return eventsRequests.value.reduce((a, i) => a + (i.accepted || 0), 0)
})

const summaryData = computed(() => {
  const base = eventDetails.value || {}
  const totals = {
    requested_professional: getRequested.value,
    invitations_accepted: getAccepted.value,
  }
  return {
    ...totals,
    ...base,
    requested_professional: base?.requested_professional ?? totals.requested_professional,
    invitations_accepted: base?.invitations_accepted ?? totals.invitations_accepted,
  }
})

const selectedTitle = computed(() => {
  const d = parseYMD(currentDate.value || ymdLocal())
  const dayWeek = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']
  const dt = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return `${dayWeek[d.getDay()]}, ${dt}`
})

function ymdLocal(d=new Date()) { const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}` }
function parseYMD(ymd: string){ if(!ymd) return new Date(); const [y,m,day]=ymd.split('-').map(Number); return new Date(y, (m||1)-1, day||1) }

function pick(vals: unknown[]) { for (const v of vals) if (v !== undefined && v !== null && v !== '') return v as any; return undefined }
function getIds(it: any) {
  return {
    client: pick([it.id_cliente, it.idCliente, it.cliente_id, it.idclient]),
    unit: pick([it.id_unidade, it.idUnidade, it.unidade_id]),
    sector: pick([it.id_setor, it.idSetor, it.setor_id]),
    date: pick([it.data_evento, it.data, it.date, currentDate.value]),
  }
}
function getKey(it: any){ const { client, unit, sector, date } = getIds(it) || {}; return `${client ?? ''}-${unit ?? ''}-${sector ?? ''}-${date ?? ''}` }

async function loadRequests(paramsOverride?: URLSearchParams) {
  loadingRequests.value = true
  try {
    const params = paramsOverride instanceof URLSearchParams ? paramsOverride : new URLSearchParams()
    if (!(paramsOverride instanceof URLSearchParams)) {
      const today = new Date().toISOString().slice(0, 10)
      params.append('data_evento', today)
    }
    eventsRequests.value = await findEventsRequests(params) as any[]
  } catch (e) {
    console.warn('[solicitacoes] requests failed', e)
    eventsRequests.value = []
  } finally {
    loadingRequests.value = false
  }
}

async function loadDetails(client?: string|number, unit?: string|number, sector?: string|number, dt_event?: string) {
  loadingDetails.value = true
  try {
    const params = new URLSearchParams()
    if (dt_event) params.append('data_evento', dt_event)
    if (client != null) params.append('id_cliente', String(client))
    if (unit != null) params.append('id_unidade', String(unit))
    if (sector != null) params.append('id_setor', String(sector))
    eventDetails.value = await findEventDetails(params)
  } catch (e) {
    console.warn('[solicitacoes] details failed', e)
    eventDetails.value = {}
  } finally {
    loadingDetails.value = false
  }
}

function onFilter(client?: string|number, unit?: string|number, sector?: string|number, dt_event?: string) {
  const p = new URLSearchParams()
  if (dt_event) p.append('data_evento', dt_event)
  if (client != null) p.append('id_cliente', String(client))
  if (unit != null) p.append('id_unidade', String(unit))
  if (sector != null) p.append('id_setor', String(sector))
  loadRequests(p)
  loadDetails(client, unit, sector, dt_event)
}

function onDateChange(dt: string) { currentDate.value = dt }

onMounted(loadRequests)
</script>

<template>
  <section>
    <Breadcrumbs />
  
    <header class="mb-6 flex items-center justify-between gap-3 mb-3">
      <div class="flex items-center gap-2">
        <h1 class="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{{ selectedTitle }}</h1>
        <span class="bg-blue-100 mt-1 text-blue-800 text-xs font-medium me-2 px-2.5 py-0.5 rounded-sm dark:bg-blue-900 dark:text-blue-300">(Solicitações: {{ getRequested }} | Confirmados: {{ getAccepted }})</span>
      </div>
    </header>

    <DashboardCards :data="summaryData" />

    <div class="card">
      <div class="flex items-center justify-between border-b p-3">
        <h3 class="text-sm font-medium">Solicitações</h3>
        <button class="btn btn-primary" @click="loadRequests()">Recarregar</button>
      </div>
      <div class="relative max-h-[50vh] overflow-auto">
        <div v-if="loadingRequests" class="absolute inset-0 grid place-items-center bg-white/60">
          <span class="animate-pulse text-sm">Carregando…</span>
        </div>
        <ul>
          <li v-for="it in eventsRequests" :key="it.id"
              class="flex cursor-pointer items-center justify-between border-b p-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
              :class="{ 'bg-brand-50 dark:bg-brand-900/20': selectedKey === getKey(it) }"
              @click="(()=>{ const ids=getIds(it); selectedKey = getKey(it); loadDetails(ids.client, ids.unit, ids.sector, ids.date) })()">
            <div class="text-sm">{{ it?.nome_comercial || it?.name || it?.title || it?.event }}</div>
            <div class="text-xs text-zinc-600">req: {{ it.requested }} • ok: {{ it.accepted }}</div>
          </li>
        </ul>
      </div>
    </div>

    <SidePanel :open="Boolean(selectedKey)" title="Detalhes do evento" @close="selectedKey='';">
      <div class="relative">
        <div v-if="loadingDetails" class="absolute inset-0 grid place-items-center bg-white/60 dark:bg-zinc-900/60">
          <span class="animate-pulse text-sm">Carregando…</span>
        </div>
        <DashboardDetails :details="eventDetails" :items="eventDetails?.data" :managers="eventDetails?.managers" />
      </div>
    </SidePanel>
  </section>
</template>

