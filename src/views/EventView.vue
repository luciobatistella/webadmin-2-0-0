<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { findEventsRequests, findEventDetails } from '@/services/dashboard'
import { useRouter } from 'vue-router'
import SolicitationForm from '@/components/requests/SolicitationForm.vue'

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

const router = useRouter()



// Nova Solicitação: estado + defaults
const showCreatePanel = ref(false)
const newSolic = ref<any>(defaultNewSolic())

function defaultNewSolic(){
  const today = currentDate.value || new Date().toISOString().slice(0,10)
  return {
    cliente_id: '',
    cliente_nome: '',
    evento_nome: '',
    categoria: '',
    venue: { id: '', nome: '', endereco: '', maps_url: '' },
    datas: [today],
    janelas: { montagem_ini: '', evento_ini: '', evento_fim: '', desmontagem_fim: '' },
    turnos: [],
    turnos_detectados: false, // false = turnos não foram detectados pela entrada inteligente
    estrategia_turnos: true, // true = minimizar custos (padrão)
    publico: { convidados_estimados: 0, segmentos: [] },
    acesso: { credenciamento: { ativo: false, impressao_cracha: false }, estacionamento: { vagas: 0, valet: false, vans: 0 } },
    ab: {
      servico: '', horarios_servico: [], cardapio: '',
      restricoes: { veg: false, sem_gluten: false, alergicos: '' },
      infra_apoio: { cozinha: false, agua: false, gelo: false, louca: false }
    },
    tecnica: {
      palco: { largura_m: 0, profundidade_m: 0, backdrop: '' },
      av: { som: [], luz: [], video: [], led: false, traducao: false },
      streaming: { sim: false },
      eletrica: { carga_prevista_kva: 0, gerador: false }
    },
    equipes: [],
    seguranca_saude: { controle_acesso: false, brigadistas: 0, ambulancia: false, limpeza: { pre: 0, durante: 0, pos: 0 } },
    fornecedores: [],
    documentos: { alvara_local: { required: false, status: '' }, avcb: { required: false, status: '' }, ecad: { aplicavel: false } },
    financeiro: { tabela_precos_ref: '', taxa_servico_pct: 0, custos_fixos: 0, condicoes_pagamento: '' },
    observacoes: ''
  }
}

function openNewRequest(){
  router.push({ name: 'request-new' })
}


function fillSample(){
  newSolic.value = {
    cliente_id: "cli_987",
    cliente_nome: "Google",
    evento_nome: "Google Cloud Summit 2025",
    categoria: "Lançamento",
    venue: {
      id: "ven_123",
      nome: "Centro de Convenções XYZ",
      endereco: "Av. Exemplo, 1000 - São Paulo/SP",
      maps_url: "https://maps.google.com/?q=..."
    },
    datas: ["2025-09-14"],
    janelas: {
      montagem_ini: "2025-09-14T06:00:00-03:00",
      evento_ini:   "2025-09-14T10:00:00-03:00",
      evento_fim:   "2025-09-14T16:00:00-03:00",
      desmontagem_fim:"2025-09-14T20:00:00-03:00"
    },
    turnos: [
      { nome: "Manhã", inicio: "08:00", fim: "12:00" },
      { nome: "Tarde", inicio: "12:00", fim: "18:00" }
    ],
    publico: {
      convidados_estimados: 150,
      segmentos: ["VIP", "Imprensa"]
    },
    acesso: {
      credenciamento: { ativo: true, impressao_cracha: true },
      estacionamento: { vagas: 60, valet: true, vans: 2 }
    },
    ab: {
      servico: "Almoço Executivo",
      horarios_servico: ["12:30"],
      cardapio: "Entrada, prato principal, sobremesa, bebidas não alcoólicas.",
      restricoes: { veg: true, sem_gluten: true, alergicos: "castanhas" },
      infra_apoio: { cozinha: true, agua: true, gelo: true, louca: true }
    },
    tecnica: {
      palco: { largura_m: 8, profundidade_m: 4, backdrop: "Logos em tecido" },
      av: { som: ["PA","2 microfones de lapela"], luz: ["Fresnéis","Follow spot"], video: ["Projetor 10k lumens"], led: false, traducao: false },
      streaming: { sim: false },
      eletrica: { carga_prevista_kva: 25, gerador: false }
    },
    equipes: [
      { funcao_key: "recepcionista", setor: "Recepção", turno: "Manhã", quantidade: 2, horas: 5 },
      { funcao_key: "garcom", setor: "A&B", turno: "Tarde", quantidade: 10, horas: 6 },
      { funcao_key: "cozinheiro", setor: "Cozinha", turno: "Tarde", quantidade: 3, horas: 7 },
      { funcao_key: "ajudanteCozinha", setor: "Cozinha", turno: "Tarde", quantidade: 2, horas: 7 },
      { funcao_key: "steward", setor: "A&B", turno: "Tarde", quantidade: 2, horas: 6 },
      { funcao_key: "tecnicoSom", setor: "AV", turno: "Manhã", quantidade: 2, horas: 5 },
      { funcao_key: "tecnicoLuz", setor: "AV", turno: "Manhã", quantidade: 2, horas: 5 },
      { funcao_key: "seguranca", setor: "Segurança", turno: "Tarde", quantidade: 4, horas: 6 },
      { funcao_key: "brigadista", setor: "Emergência", turno: "Tarde", quantidade: 1, horas: 6 }
    ],
    seguranca_saude: {
      controle_acesso: true,
      brigadistas: 1,
      ambulancia: false,
      limpeza: { pre: 2, durante: 2, pos: 3 }
    },
    fornecedores: [
      { nome: "Locadora Luz&Som", servico: "AV", contato: "11 9xxxx-xxxx", chegada: "2025-09-14T07:00:00-03:00" }
    ],
    documentos: {
      alvara_local: { required: true, status: "ok" },
      avcb: { required: true, status: "ok" },
      ecad: { aplicavel: false }
    },
    financeiro: {
      tabela_precos_ref: "2025_Q3",
      taxa_servico_pct: 10,
      custos_fixos: 500,
      condicoes_pagamento: "30 dias"
    },
    observacoes: "Briefing com o cliente D-3."
  }
}

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


function saveNewRequest(){
  // TODO: integrar API de criação (POST webadmin/solicitacoes)
  console.log('[Nova Solicitação] payload:', { ...newSolic.value })
  showCreatePanel.value = false
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
      <ClientActions :show-print-button="false" :show-print-action="false" create-label="Nova Solicitação" @create="openNewRequest" />

    </header>

    <DashboardCards :data="summaryData" />

    <div class="card">
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

    <!-- Painel lateral: Nova Solicitação -->
    <SidePanel :open="showCreatePanel" title="Nova Solicitação" @close="showCreatePanel=false">
      <form class="space-y-3" @submit.prevent="saveNewRequest">
        <SolicitationForm v-model="newSolic" />
        <div class="pt-2 flex justify-end gap-2">
          <button type="button" class="btn" @click="fillSample">Preencher exemplo</button>
          <button type="button" class="btn" @click="showCreatePanel=false">Cancelar</button>
          <button type="submit" class="btn btn-primary">Salvar (fake)</button>
        </div>
      </form>
    </SidePanel>

  </section>
</template>

