<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AppConstants from '@/constants/AppConstants'
import Breadcrumbs from '@/components/Breadcrumbs.vue'
import { getDashboardSummary, getDashboardTimeseries, getDashboardTop, getDashboardStatusBreakdown, getDashboardStatusMonthly, getDashboardHeatmap, getDashboardMobilitySummary, getDashboardMobilityRanking, getDashboardMobilityFlows, getDashboardCoopCompliance, getDashboardComplianceClients, getDashboardComplianceEvents, getDashboardComplianceFinance, getDashboardComplianceSlas, getDashboardAvailability } from '@/services/dashboard'
import CountUp from '@/components/CountUp.vue'
import Icon from '@/components/Icon.vue'
import ClientActions from '@/components/ClientActions.vue'

// Filtros globais
const period = ref<'hoje'|'7d'|'30d'|'mensal'|'custom'>('30d')
const dateStart = ref<string>('')
const dateEnd = ref<string>('')
const clienteId = ref<string>('')
const unidadeId = ref<string>('')
const setorId = ref<string>('')

const uf = ref<string>('')

const router = useRouter()
const showLocation = ref(false)
const estadoFilter = ref<string>('SP')
const cidadeFilter = ref<string>('')
const regiaoFilter = ref<string>('')

const showDateFilter = ref(false)


function navigateToRequests(extra: Record<string,string|number|undefined> = {}){
  const q: Record<string,string> = {}
  if (dateStart.value) q.date_start = dateStart.value
  if (dateEnd.value) q.date_end = dateEnd.value
  if (estadoFilter.value) q.uf = String(estadoFilter.value)
  if (cidadeFilter.value) q.cidade = String(cidadeFilter.value)
  if (regiaoFilter.value) q.regiao = String(regiaoFilter.value)
  Object.entries(extra).forEach(([k,v])=>{ if(v!=null) q[k] = String(v) })
  router.push({ path: AppConstants.NAVIGATION_PAGE_ADM_REQUESTS, query: q })
}

function navigateToCooperados(extra: Record<string,string|number|undefined> = {}){
  const q: Record<string,string> = {}
  if (estadoFilter.value) q.uf = String(estadoFilter.value)
  if (cidadeFilter.value) q.cidade = String(cidadeFilter.value)
  if (regiaoFilter.value) q.regiao = String(regiaoFilter.value)
  Object.entries(extra).forEach(([k,v])=>{ if(v!=null) q[k] = String(v) })
  router.push({ path: '/admin/cooperados', query: q })
}


const statusMonthlyCats = ref<string[]>([])
const statusMonthlySeries = ref<{name:string,data:number[]}[]>([])
const heatmapSeries = ref<{name:string,data:{x:string,y:number}[]}[]>([])

const q = ref('')
const showActions = ref(false)




const loading = ref(false)
const summary = ref<any>(null)

const summaryPrev = ref<any>(null)
const tsSolic = ref<{x:string,y:number}[]>([])
const statusBreak = ref<{status:string,count:number}[]>([])
const topClients = ref<{label:string,value:number}[]>([])
const tsFatur = ref<{x:string,y:number}[]>([])
const tsPrev = ref<{x:string,y:number}[]>([])

// Mobilidade
const mobilitySummary = ref<{avg_distance_km:number, avg_travel_min:number, total_km:number, estimated_cost_brl:number} | null>(null)
const mobilityRanking = ref<{cooperadoId:number, nome:string, distancia_km:number}[]>([])
const mobFlows = ref<{origens:string[], destinos:string[], matrix:number[][]} | null>(null)

// Compliance
const coopCompliance = ref<{ total_cooperados:number, missing_photo:number, missing_background_check:number, missing_medical_certificate:number, missing_functions:number } | null>(null)
const compClients = ref<{ expired_contracts:number, expiring_30d:number, missing_cnds:number, missing_registration:number } | null>(null)
const compEvents = ref<{ checklist_incomplete:number, escala_incomplete:number, docs_missing:number } | null>(null)
const compFinance = ref<{ nf_pending:number, divergencias:number, tax_inconsistencies:number } | null>(null)
const compSlas = ref<{ aceite_below_target:number, fillrate_below_target:number, leadtime_above_target:number } | null>(null)

// Disponibilidade de profissionais
const availability = ref<{ occupied:number, freeing_1d:number, freeing_7d:number, available_now:number } | null>(null)



// Compliance: abas
const compActiveTab = ref<'clientes'|'eventos'|'financeiro'|'slas'>('clientes')
const compTab = computed(() => {
  const w = widgets.value
  const key = compActiveTab.value
  if (key==='clientes'   && w.w_comp_clients && compClients.value) return 'clientes'
  if (key==='eventos'    && w.w_comp_events  && compEvents.value)  return 'eventos'
  if (key==='financeiro' && w.w_comp_finance && compFinance.value) return 'financeiro'
  if (key==='slas'       && w.w_comp_slas    && compSlas.value)    return 'slas'
  if (w.w_comp_clients && compClients.value)   return 'clientes'
  if (w.w_comp_events  && compEvents.value)    return 'eventos'
  if (w.w_comp_finance && compFinance.value)   return 'financeiro'
  if (w.w_comp_slas    && compSlas.value)      return 'slas'
  return key
})


// Widgets (ligar/desligar)
const showWidgetsConfig = ref(false)
const widgets = ref<Record<string, boolean>>({
  w_kpi_oper_lead_exec: true,
  w_kpi_conv_extra: true,
  w_kpi_pessoas: true,
  w_kpi_fin_extra: true,
  w_kpi_qualidade: true,
  w_chart_series_solic: true,
  w_chart_status_pizza: true,
  w_chart_top_clientes: true,
  w_chart_fin_previsto: true,
  w_chart_status_monthly: true,
  w_chart_heatmap_checkins: true,
  w_kpi_mobility: true,
  w_chart_mob_ranking: true,
  w_chart_mob_flows: true,
  w_kpi_coop_compliance: true,
  w_comp_clients: true,
  w_comp_events: true,
  w_comp_finance: true,
  w_comp_slas: true,
})

const WIDGETS_STORAGE_KEY = 'dashboard_widgets_v1'
function loadWidgets(){
  try { const raw = localStorage.getItem(WIDGETS_STORAGE_KEY); if (raw) Object.assign(widgets.value, JSON.parse(raw)) } catch {}
}
function saveWidgets(){
  try { localStorage.setItem(WIDGETS_STORAGE_KEY, JSON.stringify(widgets.value)) } catch {}
}

function periodLengthDays(){
  if (!dateStart.value || !dateEnd.value) return 30
  const s = new Date(dateStart.value+'T00:00:00')
  const e = new Date(dateEnd.value+'T00:00:00')
  const diff = Math.round((+e - +s) / 86400000) + 1
  return Math.max(1, diff)
}

function buildPrevParams(){
  const len = periodLengthDays()
  const end = new Date(dateStart.value+'T00:00:00')
  end.setDate(end.getDate()-1)
  const start = new Date(end)
  start.setDate(end.getDate()-len+1)
  const p = new URLSearchParams(buildParams())
  p.set('date_start', start.toISOString().slice(0,10))
  p.set('date_end', end.toISOString().slice(0,10))
  return p
}

function pctChange(curr?: number, prev?: number){
  if (typeof curr !== 'number' || typeof prev !== 'number' || prev === 0) return null
  return ((curr - prev) / prev) * 100
}

const varSolic = computed(()=> pctChange(summary.value?.operacional?.solicitacoes, summaryPrev.value?.operacional?.solicitacoes))

async function loadPrevAndCharts(){
  try { summaryPrev.value = await getDashboardSummary(buildPrevParams()) } catch { summaryPrev.value = null }
  try {
    const ts = await getDashboardTimeseries(new URLSearchParams([...buildParams(), ['metric','solicitacoes'], ['groupBy','day']]))
    tsSolic.value = Array.isArray(ts?.series) ? ts.series : []
  } catch { tsSolic.value = [] }
  try {
    const br = await getDashboardStatusBreakdown(buildParams())
    statusBreak.value = Array.isArray(br?.status) ? br.status : []
  } catch { statusBreak.value = [] }
  try {
    const top = await getDashboardTop(new URLSearchParams([...buildParams(), ['dimension','clientes'], ['metric','faturamento'], ['limit','10']]))
    topClients.value = Array.isArray(top?.items) ? top.items : []
  } catch { topClients.value = [] }
  try {
    const tf = await getDashboardTimeseries(new URLSearchParams([...buildParams(), ['metric','faturamento'], ['groupBy','month']]))
    const tp = await getDashboardTimeseries(new URLSearchParams([...buildParams(), ['metric','previsto'], ['groupBy','month']]))
    tsFatur.value = Array.isArray(tf?.series) ? tf.series : []
    tsPrev.value = Array.isArray(tp?.series) ? tp.series : []
  } catch { tsFatur.value = []; tsPrev.value = [] }
  try {
    const sm = await getDashboardStatusMonthly(new URLSearchParams([...buildParams(), ['groupBy','month']]))
    statusMonthlyCats.value = Array.isArray(sm?.categories) ? sm.categories : []
    statusMonthlySeries.value = Array.isArray(sm?.series) ? sm.series : []
  } catch { statusMonthlyCats.value = []; statusMonthlySeries.value = [] }
  try {
    const hm = await getDashboardHeatmap(buildParams())
    heatmapSeries.value = Array.isArray(hm?.series) ? hm.series : []
  } catch { heatmapSeries.value = [] }
  try {
    const ms = await getDashboardMobilitySummary(buildParams())
    mobilitySummary.value = ms || null
  } catch { mobilitySummary.value = null }
  try {
    const rk = await getDashboardMobilityRanking(new URLSearchParams([...buildParams(), ['limit','10']]))
    mobilityRanking.value = Array.isArray(rk?.items) ? rk.items : []
  } catch { mobilityRanking.value = [] }
  try {
    const fl = await getDashboardMobilityFlows(buildParams())
    mobFlows.value = fl || null
  } catch { mobFlows.value = null }
  try { const cc = await getDashboardCoopCompliance(buildParams()); coopCompliance.value = cc || null } catch { coopCompliance.value = null }
  try { const c1 = await getDashboardComplianceClients(buildParams()); compClients.value = c1 || null } catch { compClients.value = null }
  try { const c2 = await getDashboardComplianceEvents(buildParams()); compEvents.value = c2 || null } catch { compEvents.value = null }
  try { const c3 = await getDashboardComplianceFinance(buildParams()); compFinance.value = c3 || null } catch { compFinance.value = null }
  try { const c4 = await getDashboardComplianceSlas(buildParams()); compSlas.value = c4 || null } catch { compSlas.value = null }
  try { const av = await getDashboardAvailability(buildParams()); availability.value = av || null } catch { availability.value = null }


}

function toYMD(d: Date){ const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}` }

function applyQuickPeriod(p: typeof period.value){
  period.value = p
  const now = new Date()
  if (p === 'hoje') {
    dateStart.value = toYMD(now)
    dateEnd.value = toYMD(now)
  } else if (p === '7d') {
    const d = new Date(now); d.setDate(now.getDate()-6)
    dateStart.value = toYMD(d)
    dateEnd.value = toYMD(now)
  } else if (p === '30d') {
    const d = new Date(now); d.setDate(now.getDate()-29)
    dateStart.value = toYMD(d)
    dateEnd.value = toYMD(now)
  } else if (p === 'mensal') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    const last = new Date(now.getFullYear(), now.getMonth()+1, 0)
    dateStart.value = toYMD(first)
    dateEnd.value = toYMD(last)
  }
}

function buildParams(){
  const p = new URLSearchParams()
  if (dateStart.value) p.append('date_start', dateStart.value)
  if (dateEnd.value) p.append('date_end', dateEnd.value)
  if (estadoFilter.value) p.append('uf', estadoFilter.value)
  if (cidadeFilter.value) p.append('cidade', cidadeFilter.value)
  if (regiaoFilter.value) p.append('regiao', regiaoFilter.value)
  if (q.value) p.append('q', q.value)
  return p
}

async function load(){
  loading.value = true
  try {
    const data = await getDashboardSummary(buildParams())
    summary.value = data || null
    await loadPrevAndCharts()
  } catch (e){
    console.warn('[dashboard-home] summary failed', e)
    summary.value = null
  } finally { loading.value = false }
}


// ApexCharts options/series (tema preto/cinza/dourado)
const C = { gold: '#d4af37', gray: '#9ca3af', dark: '#111111', black: '#0b0b0b', grayDark: '#6b7280' }
const statusColorMap: Record<string,string> = {
  SOLICITADO: '#6b7280',
  CONFIRMADO: C.gold,
  EM_EXECUCAO: '#9ca3af',
  CONCLUIDO: C.gold,
  CANCELADO: '#4b5563',
  NO_SHOW: '#374151'
}

const tsSeries = computed(() => [{ name: 'Solicitações', data: tsSolic.value.map(p => p.y) }])
const tsOptions = computed(() => ({
  chart: {
    type: 'line',
    toolbar: { show: false },
    foreColor: C.gray,
    events: {
      dataPointSelection: (_: any, __: any, config: any) => {
        const idx = config?.dataPointIndex
        const day = tsSolic.value[idx]?.x
        if (day) navigateToRequests({ date_start: day, date_end: day })
      }
    }
  },
  colors: [C.gold],
  stroke: { curve: 'smooth' },
  xaxis: { categories: tsSolic.value.map(p => p.x) },
  yaxis: { labels: { formatter: (v: number) => String(Math.round(v)) } }
}))

const stSeries = computed(() => statusBreak.value.map(s => s.count))
const stOptions = computed(() => ({
  labels: statusBreak.value.map(s => s.status),
  legend: { position: 'bottom' },
  chart: {
    type: 'donut',
    foreColor: C.gray,
    toolbar: { show: false },
    events: {
      dataPointSelection: (_: any, __: any, config: any) => {
        const idx = config?.dataPointIndex
        const lbl = statusBreak.value[idx]?.status
        if (lbl) navigateToRequests({ status: lbl })
      }
    }
  },
  colors: statusBreak.value.map(s => statusColorMap[s.status] || C.gray)
}))

const topSeries = computed(() => [{ name: 'Faturamento', data: topClients.value.map(it => Math.round(it.value)) }])
const topOptions = computed(() => ({
  chart: {
    type: 'bar', toolbar: { show: false }, foreColor: C.gray,
    events: {
      dataPointSelection: (_: any, _w: any, config: any) => {
        const idx = config?.dataPointIndex
        const cat = topClients.value[idx]?.label
        if (cat) navigateToRequests({ cliente: cat })
      }
    }
  },
  colors: [C.gold],
  plotOptions: { bar: { horizontal: true } },
  dataLabels: { enabled: false },
  xaxis: { categories: topClients.value.map(it => it.label) }
}))

const stackSeries = computed(() => [
  { name: 'Faturado', data: tsFatur.value.map(p => p.y) },
  { name: 'Previsto', data: tsPrev.value.map(p => p.y) },
])
const stackOptions = computed(() => ({
  chart: {
    type: 'bar', stacked: true, toolbar: { show: false }, foreColor: C.gray,
    events: {
      dataPointSelection: (_: any, __: any, config: any) => {
        const idx = config?.dataPointIndex
        const ym = tsFatur.value[idx]?.x // YYYY-MM
        if (ym) {
          const y = Number(ym.slice(0,4)); const m = Number(ym.slice(5,7)) - 1
          const first = new Date(y, m, 1).toISOString().slice(0,10)
          const last = new Date(y, m+1, 0).toISOString().slice(0,10)
          navigateToRequests({ date_start: first, date_end: last })
        }
      }
    }
  },
  colors: [C.gold, C.grayDark],
  dataLabels: { enabled: false },
  xaxis: { categories: tsFatur.value.map(p => p.x) }
}))

const statusMonthlyApexSeries = computed(() => statusMonthlySeries.value)
const statusMonthlyOptions = computed(() => ({
  chart: {
    type: 'bar', stacked: true, toolbar: { show: false }, foreColor: C.gray,
    events: {
      dataPointSelection: (_: any, _w: any, config: any) => {
        const monthIdx = config?.dataPointIndex
        const serieIdx = config?.seriesIndex
        const ym = statusMonthlyCats.value[monthIdx]
        const statusName = statusMonthlySeries.value[serieIdx]?.name
        if (ym && statusName) {
          const y = Number(ym.slice(0,4)); const m = Number(ym.slice(5,7)) - 1
          const first = new Date(y, m, 1).toISOString().slice(0,10)
          const last = new Date(y, m+1, 0).toISOString().slice(0,10)
          navigateToRequests({ date_start: first, date_end: last, status: statusName })
        }
      }
    }
  },
  legend: { position: 'bottom' },
  colors: statusMonthlySeries.value.map(s => statusColorMap[s.name] || C.gray),
  dataLabels: { enabled: false },
  xaxis: { categories: statusMonthlyCats.value }
}))

// Mobilidade - charts
const mobRankMax = computed(() => Math.max(1, ...mobilityRanking.value.map(it => it.distancia_km || 0)))
function initials(name: string){
  return (name||'').split(/\s+/).map(p=>p[0]).filter(Boolean).slice(0,2).join('').toUpperCase()
}
function pct100(v?: number){ const n = typeof v === 'number' ? v : NaN; return Number.isFinite(n) ? n*100 : 0 }

// Compliance - donuts (series/options)
const compClientsSeries = computed(() => (compClients.value ? [
  compClients.value.expired_contracts,
  compClients.value.expiring_30d,
  compClients.value.missing_cnds,
  compClients.value.missing_registration,
] : []))
const compClientsOptions = computed(() => ({ chart:{ type:'donut', foreColor: C.gray, animations:{ enabled:true } },
  labels: ['Contratos vencidos','Vencem 30d','CNDs pendentes','Cadastro incompleto'], legend:{ position:'bottom' }, dataLabels:{ enabled:false }, colors:[C.gold,'#9ca3af','#6b7280','#4b5563']
}))

const compEventsSeries = computed(() => (compEvents.value ? [
  compEvents.value.checklist_incomplete,
  compEvents.value.escala_incomplete,
  compEvents.value.docs_missing,
] : []))
const compEventsOptions = computed(() => ({ chart:{ type:'donut', foreColor: C.gray, animations:{ enabled:true } },
  labels: ['Checklist incompleto','Escala incompleta','Docs pendentes'], legend:{ position:'bottom' }, dataLabels:{ enabled:false }, colors:[C.gold,'#9ca3af','#6b7280']
}))

const compFinanceSeries = computed(() => (compFinance.value ? [
  compFinance.value.nf_pending,
  compFinance.value.divergencias,
  compFinance.value.tax_inconsistencies,
] : []))
const compFinanceOptions = computed(() => ({ chart:{ type:'donut', foreColor: C.gray, animations:{ enabled:true } },
  labels: ['NF pendentes','Divergências','Tributos inconsistentes'], legend:{ position:'bottom' }, dataLabels:{ enabled:false }, colors:[C.gold,'#9ca3af','#6b7280']
}))

const compSlasSeries = computed(() => (compSlas.value ? [
  compSlas.value.aceite_below_target,
  compSlas.value.fillrate_below_target,
  compSlas.value.leadtime_above_target,
] : []))
const compSlasOptions = computed(() => ({ chart:{ type:'donut', foreColor: C.gray, animations:{ enabled:true } },
  labels: ['Aceite abaixo da meta','Fill Rate abaixo','Lead time acima'], legend:{ position:'bottom' }, dataLabels:{ enabled:false }, colors:[C.gold,'#9ca3af','#6b7280']
}))

// Compliance geral (totais e donut)
const compClientsTotal = computed(()=> compClients.value ? (compClients.value.expired_contracts + compClients.value.expiring_30d + compClients.value.missing_cnds + compClients.value.missing_registration) : 0)
const compEventsTotal = computed(()=> compEvents.value ? (compEvents.value.checklist_incomplete + compEvents.value.escala_incomplete + compEvents.value.docs_missing) : 0)
const compFinanceTotal = computed(()=> compFinance.value ? (compFinance.value.nf_pending + compFinance.value.divergencias + compFinance.value.tax_inconsistencies) : 0)
const compSlasTotal = computed(()=> compSlas.value ? (compSlas.value.aceite_below_target + compSlas.value.fillrate_below_target + compSlas.value.leadtime_above_target) : 0)
const compCoopTotal = computed(()=> coopCompliance.value ? (coopCompliance.value.missing_photo + coopCompliance.value.missing_background_check + coopCompliance.value.missing_medical_certificate + coopCompliance.value.missing_functions) : 0)
const compOverallTotal = computed(()=> compClientsTotal.value + compEventsTotal.value + compFinanceTotal.value + compSlasTotal.value + compCoopTotal.value)
const compOverallSeries = computed(()=> [compClientsTotal.value, compEventsTotal.value, compFinanceTotal.value, compSlasTotal.value, compCoopTotal.value])
const compOverallOptions = computed(()=> ({ chart:{ type:'donut', foreColor: C.gray, animations:{ enabled:true } }, labels:['Clientes','Eventos','Financeiro','SLAs','Cooperados'], legend:{ position:'bottom' }, dataLabels:{ enabled:false }, colors:[C.gold,'#9ca3af','#6b7280','#4b5563','#d1d5db'] }))


const mobFlowsApexSeries = computed(() => (mobFlows.value ? mobFlows.value.origens.map((o, oi) => ({
  name: o,
  data: mobFlows.value!.destinos.map((d, di) => ({ x: d, y: mobFlows.value!.matrix[oi][di] }))
})) : []))
const mobFlowsOptions = computed(() => ({
  chart: { type: 'heatmap', toolbar: { show: false }, foreColor: C.gray,
    animations: { enabled: true, easing: 'easeinout', speed: 500, dynamicAnimation: { enabled: true, speed: 300 } },
    events: { dataPointSelection: (_: any, __: any, cfg: any) => {
      const oi = cfg?.seriesIndex; const di = cfg?.dataPointIndex
      const o = mobFlows.value?.origens[oi]; const d = mobFlows.value?.destinos[di]
      if (o && d) navigateToRequests({ origem: o, destino: d })
    }}
  },
  dataLabels: { enabled: false },
  plotOptions: { heatmap: { shadeIntensity: 0.5, colorScale: { ranges: [
    { from: 0, to: 5, color: '#1f2937' }, { from: 6, to: 40, color: '#6b7280' }, { from: 41, to: 200, color: C.gold }
  ] } } }
}))

const heatmapApexSeries = computed(() => heatmapSeries.value)
const heatmapOptions = computed(() => ({
  chart: { type: 'heatmap', toolbar: { show: false }, foreColor: C.gray,
    events: {
      dataPointSelection: (_: any, __: any, config: any) => {
        const di = config?.seriesIndex
        const hi = config?.dataPointIndex
        const day = heatmapSeries.value[di]?.name
        const hour = heatmapSeries.value[di]?.data?.[hi]?.x
        if (day && hour) navigateToRequests({ dia: day, hora: hour })
      }
    }
  },
  dataLabels: { enabled: false },
  plotOptions: { heatmap: { shadeIntensity: 0.5, colorScale: { ranges: [
    { from: 0, to: 10, color: '#1f2937' },
    { from: 11, to: 40, color: '#6b7280' },
    { from: 41, to: 200, color: C.gold }
  ] } } }
}))

const op = computed(()=> summary.value?.operacional || {})
const conv = computed(()=> summary.value?.convites || {})
const ev = computed(()=> summary.value?.eventos || {})
const fin = computed(()=> summary.value?.financeiro || {})

function formatPct(v?: number){ if(typeof v!=='number') return '—'; return (v*100).toFixed(1)+'%' }
function formatNum(v?: number){ if(v==null) return '—'; return Intl.NumberFormat('pt-BR').format(v) }
function formatBRL(v?: number){ if(typeof v!=='number') return '—'; return v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) }

onMounted(() => { applyQuickPeriod('30d'); loadWidgets(); load() })


</script>

<template>
  <section>
    <Breadcrumbs />
    <header class="mb-6 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <h1 class="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Dashboard</h1>
      </div>
      <ClientActions /> 
    </header>


    <!-- Filtros globais -->
    <div class="card p-4 sticky top-0 z-10">
      <div class="flex flex-wrap items-center gap-2">
        <div class="relative flex-1 min-w-[260px]">
          <Icon name="magnifying-glass" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input v-model="q" @keyup.enter="load"
                 class="w-full pl-9 pr-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-600 dark:text-zinc-100"
                 placeholder="Buscar..." />
        </div>

        <div class="relative">
          <button @click="showDateFilter = !showDateFilter"
                  class="flex items-center gap-2 px-3 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
                  :class="{ 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/20 dark:border-blue-600 dark:text-blue-300': showDateFilter || dateStart || dateEnd }">
            <Icon name="calendar" class="w-4 h-4" />
            <span class="font-medium">por data</span>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
          </button>

          <div v-if="showDateFilter" class="absolute z-20 mt-2 w-[18rem] max-w-[90vw] bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 p-4">
            <div class="space-y-3">
              <div class="flex gap-1">
                <button @click="applyQuickPeriod('hoje'); load(); showDateFilter=false" class="px-2 py-1 text-xs rounded border transition-colors"
                        :class="period==='hoje' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Hoje</button>
                <button @click="applyQuickPeriod('7d'); load(); showDateFilter=false" class="px-2 py-1 text-xs rounded border transition-colors"
                        :class="period==='7d' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">7d</button>
                <button @click="applyQuickPeriod('30d'); load(); showDateFilter=false" class="px-2 py-1 text-xs rounded border transition-colors"
                        :class="period==='30d' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">30d</button>
                <button @click="applyQuickPeriod('mensal'); load(); showDateFilter=false" class="px-2 py-1 text-xs rounded border transition-colors"
                        :class="period==='mensal' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Mensal</button>
              </div>
              <div>
                <label class="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Data inicial</label>
                <input v-model="dateStart" type="date" class="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-100" @change="load" />
              </div>
              <div>
                <label class="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Data final</label>
                <input v-model="dateEnd" type="date" class="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-100" @change="load" />
              </div>
            </div>
          </div>
        </div>





        <div class="relative">

          <button @click="showLocation = !showLocation"
                  class="flex items-center gap-2 px-3 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800">
            <Icon name="map-pin" class="w-4 h-4" />
            <span>Localização</span>
          </button>
          <div v-if="showLocation" class="absolute z-20 mt-2 w-[16rem] max-w-[90vw] bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 p-4">
            <div class="grid grid-cols-1 gap-2">
              <div>
                <label class="text-[10px] block mb-1 text-zinc-500">Estado (UF)</label>
                <div class="flex gap-1 mb-1">
                  <button @click="estadoFilter = 'SP'" class="px-2 py-1 text-[11px] rounded border transition-colors"
                          :class="estadoFilter === 'SP' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">SP</button>
                  <button @click="estadoFilter = 'RJ'" class="px-2 py-1 text-[11px] rounded border transition-colors"
                          :class="estadoFilter === 'RJ' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">RJ</button>
                  <button @click="estadoFilter = 'MG'" class="px-2 py-1 text-[11px] rounded border transition-colors"
                          :class="estadoFilter === 'MG' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">MG</button>
                  <select v-model="estadoFilter" class="form-input px-2 py-1 text-[11px] rounded border border-zinc-300 dark:border-zinc-600 w-full">
                    <option value="">Todos</option>
                    <option v-for="uf in ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']" :key="uf" :value="uf">{{ uf }}</option>
                  </select>
                </div>
              </div>
              <div>
                <label class="text-[10px] block mb-1 text-zinc-500">Cidade</label>
                <input v-model="cidadeFilter" class="form-input px-2 py-1 text-[11px] rounded border border-zinc-300 dark:border-zinc-600 w-full" placeholder="Digite a cidade" />
              </div>
              <div>
                <label class="text-[10px] block mb-1 text-zinc-500">Região</label>
                <div class="flex flex-wrap gap-1">
                  <template v-if="String(estadoFilter).toUpperCase() === 'SP'">
                    <button @click="regiaoFilter = ''" class="px-2 py-1 text-[11px] rounded border transition-colors"
                            :class="regiaoFilter === '' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Todas</button>
                    <button v-for="r in ['Zona Norte','Zona Sul','Zona Leste','Zona Oeste','Centro']" :key="r" @click="regiaoFilter = r" class="px-2 py-1 text-[11px] rounded border transition-colors"
                            :class="regiaoFilter === r ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">{{ r }}</button>
                  </template>
                  <template v-else>
                    <button @click="regiaoFilter = ''" class="px-2 py-1 text-[11px] rounded border transition-colors"
                            :class="regiaoFilter === '' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Todas</button>
                    <button @click="regiaoFilter = 'N'" class="px-2 py-1 text-[11px] rounded border transition-colors"
                            :class="regiaoFilter === 'N' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Norte</button>
                    <button @click="regiaoFilter = 'NE'" class="px-2 py-1 text-[11px] rounded border transition-colors"
                            :class="regiaoFilter === 'NE' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Nordeste</button>
                    <button @click="regiaoFilter = 'CO'" class="px-2 py-1 text-[11px] rounded border transition-colors"
                            :class="regiaoFilter === 'CO' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Centro-Oeste</button>
                    <button @click="regiaoFilter = 'SE'" class="px-2 py-1 text-[11px] rounded border transition-colors"
                            :class="regiaoFilter === 'SE' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Sudeste</button>
                    <button @click="regiaoFilter = 'S'" class="px-2 py-1 text-[11px] rounded border transition-colors"
                            :class="regiaoFilter === 'S' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'">Sul</button>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>


      </div>
    </div>

    <header class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-lg font-semibold">Dashboard</h2>
      <span class="text-sm text-zinc-500" v-if="loading">Atualizando…</span>
    </header>

    <!-- Operacional (core) -->
    <div class="card p-4">
      <div class="mb-2 text-sm font-semibold text-zinc-600">Operacional</div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="card p-4 border-l-4 border-yellow-600 cursor-pointer hover:ring-1 ring-yellow-600" @click="navigateToRequests()">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1 text-xs text-zinc-500"><Icon name="document-text" class="w-4 h-4 text-yellow-600" /><span>Solicitações</span></div>
            <span v-if="varSolic!==null" class="text-xs" :class="(varSolic as number) >= 0 ? 'text-green-600' : 'text-red-600'">{{ (varSolic as number).toFixed(1) }}%</span>
          </div>
          <div class="text-2xl font-semibold"><CountUp :value="op.solicitacoes" /></div>
        </div>
        <div class="card p-4 border-l-4 border-yellow-600">
          <div class="flex items-center gap-1 text-xs text-zinc-500"><Icon name="users" class="w-4 h-4 text-yellow-600" /><span>Profissionais Solicitados</span></div>
          <div class="text-2xl font-semibold"><CountUp :value="op.profissionaisSolicitados" /></div>
        </div>
        <div class="card p-4 border-l-4 border-yellow-600">
          <div class="flex items-center gap-1 text-xs text-zinc-500"><Icon name="identification" class="w-4 h-4 text-yellow-600" /><span>Profissionais Alocados</span></div>
          <div class="text-2xl font-semibold"><CountUp :value="op.profissionaisAlocados" /></div>
        </div>
        <div class="card p-4 border-l-4 border-yellow-600">
          <div class="flex items-center gap-1 text-xs text-zinc-500"><Icon name="shield-check" class="w-4 h-4 text-yellow-600" /><span>Fill Rate</span></div>
          <div class="text-2xl font-semibold"><CountUp :value="pct100(op.fillRate as number)" :formatter="v => v.toFixed(1) + '%'" /></div>
        </div>
      </div>
    </div>



    <!-- Operacional — Resumo (consolidado) -->
    <div class="card p-4">
      <div class="mb-2 text-sm font-semibold text-zinc-600">Operacional — Resumo</div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div class="card p-4 border-l-4 border-yellow-600">
          <div class="text-xs text-zinc-500">Eventos (total)</div>
          <div class="text-2xl font-semibold"><CountUp :value="ev.total as any" /></div>
        </div>
        <div class="card p-4 border-l-4 border-yellow-600">
          <div class="text-xs text-zinc-500">Cooperados Solicitados</div>
          <div class="text-2xl font-semibold"><CountUp :value="op.profissionaisSolicitados as any" /></div>
        </div>
        <div class="card p-4 border-l-4 border-yellow-600">
          <div class="text-xs text-zinc-500">Convites Enviados</div>
          <div class="text-2xl font-semibold"><CountUp :value="conv.enviados as any" /></div>
        </div>
        <div class="card p-4 border-l-4 border-yellow-600">
          <div class="text-xs text-zinc-500">Convites Aceitos</div>
          <div class="text-2xl font-semibold"><CountUp :value="conv.aceitos as any" /></div>
        </div>
        <div class="card p-4 border-l-4 border-yellow-600">
          <div class="text-xs text-zinc-500">Desistências</div>
          <div class="text-2xl font-semibold"><CountUp :value="summary?.convites?.desistencias as any" /></div>
        </div>
        <div class="card p-4 border-l-4 border-yellow-600">
          <div class="text-xs text-zinc-500">Reposições</div>
          <div class="text-2xl font-semibold"><CountUp :value="(summary?.convites?.reposicoes ?? 0) as any" /></div>
        </div>
      </div>
    </div>

    <!-- Disponibilidade de Profissionais -->
    <div v-if="availability" class="card p-4">
      <div class="mb-2 text-sm font-semibold text-zinc-600">Disponibilidade de Profissionais</div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="card p-4 border-l-4 border-yellow-600">
          <div class="text-xs text-zinc-500">Ocupados agora</div>
          <div class="text-2xl font-semibold"><CountUp :value="availability!.occupied as any" /></div>
        </div>
        <div class="card p-4 border-l-4 border-yellow-600">
          <div class="text-xs text-zinc-500">Liberam em 1 dia</div>
          <div class="text-2xl font-semibold"><CountUp :value="availability!.freeing_1d as any" /></div>
        </div>
        <div class="card p-4 border-l-4 border-yellow-600">
          <div class="text-xs text-zinc-500">Liberam em 7 dias</div>
          <div class="text-2xl font-semibold"><CountUp :value="availability!.freeing_7d as any" /></div>
        </div>
        <div class="card p-4 border-l-4 border-yellow-600">
          <div class="text-xs text-zinc-500">Disponíveis agora</div>
          <div class="text-2xl font-semibold"><CountUp :value="availability!.available_now as any" /></div>
        </div>
      </div>
    </div>


    <!-- Eventos & Execução -->
    <div class="card p-4">
      <div class="mb-2 text-sm font-semibold text-zinc-600">Eventos & Execução</div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="card p-4 border-l-4 border-yellow-600 cursor-pointer hover:ring-1 ring-yellow-600" @click="navigateToRequests()">
          <div class="flex items-center gap-1 text-xs text-zinc-500"><Icon name="squares-2x2" class="w-4 h-4 text-yellow-600" /><span>Eventos</span></div>
          <div class="text-2xl font-semibold"><CountUp :value="ev.total" /></div>
        </div>
        <div class="card p-4 border-l-4 border-yellow-600">
          <div class="flex items-center gap-1 text-xs text-zinc-500"><Icon name="map-pin" class="w-4 h-4 text-yellow-600" /><span>Check-ins</span></div>
          <div class="text-2xl font-semibold"><CountUp :value="ev.checkin" /></div>
        </div>
        <div class="card p-4 border-l-4 border-yellow-600">
          <div class="flex items-center gap-1 text-xs text-zinc-500"><Icon name="map-pin" class="w-4 h-4 text-yellow-600" /><span>Check-outs</span></div>
          <div class="text-2xl font-semibold"><CountUp :value="ev.checkout" /></div>
        </div>
        <div class="card p-4 border-l-4 border-yellow-600">
          <div class="flex items-center gap-1 text-xs text-zinc-500"><Icon name="shield-check" class="w-4 h-4 text-yellow-600" /><span>Taxa de Conclusão</span></div>
          <div class="text-2xl font-semibold"><CountUp :value="pct100(ev.taxaConclusao as number)" :formatter="v => v.toFixed(1) + '%'" /></div>
        </div>
      </div>
    </div>

    <!-- Operacional extras -->
    <div v-if="widgets.w_kpi_oper_lead_exec" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <div class="card p-4">
        <div class="text-xs text-zinc-500">Lead Time Médio (h)</div>
        <div class="text-2xl font-semibold">{{ formatNum(summary?.operacional?.leadTimeMedioHoras) }}</div>
      </div>
      <div class="card p-4">
        <div class="text-xs text-zinc-500">Tempo Médio de Execução (h)</div>
        <div class="text-2xl font-semibold">{{ formatNum(summary?.operacional?.tempoExecucaoMedioHoras) }}</div>
      </div>
    </div>

    <!-- Convites & Engajamento -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <div class="card p-4">
        <div class="text-xs text-zinc-500">Convites Enviados</div>
        <div class="text-2xl font-semibold"><CountUp :value="conv.enviados as any" /></div>
      </div>
      <div class="card p-4">
        <div class="text-xs text-zinc-500">Convites Aceitos</div>
        <div class="text-2xl font-semibold"><CountUp :value="conv.aceitos as any" /></div>
      </div>
      <div class="card p-4">
        <div class="text-xs text-zinc-500">Taxa de Aceite</div>
        <div class="text-2xl font-semibold"><CountUp :value="pct100(conv.taxaAceite as number)" :formatter="v => v.toFixed(1) + '%'" /></div>
      </div>
      <div class="card p-4">
        <div class="text-xs text-zinc-500">No-show</div>
        <div class="text-2xl font-semibold"><CountUp :value="conv.noShow as any" /></div>
      </div>
    </div>

    <!-- Convites extras -->
    <div v-if="widgets.w_kpi_conv_extra" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <div class="card p-4">
        <div class="text-xs text-zinc-500">Desistências</div>
        <div class="text-2xl font-semibold">{{ formatNum(summary?.convites?.desistencias) }}</div>
      </div>
      <div class="card p-4">
        <div class="text-xs text-zinc-500">Taxa de Desistência</div>
        <div class="text-2xl font-semibold">{{ formatPct(summary?.convites?.taxaDesistencia) }}</div>
      </div>
      <div class="card p-4">
        <div class="text-xs text-zinc-500">Taxa de No-show</div>
        <div class="text-2xl font-semibold">{{ formatPct(summary?.convites?.taxaNoShow) }}</div>
      </div>
    </div>

    <!-- Pessoas -->
    <div v-if="widgets.w_kpi_pessoas" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <div class="card p-4">
        <div class="text-xs text-zinc-500">Cooperados (total)</div>
        <div class="text-2xl font-semibold"><CountUp :value="summary?.pessoas?.cooperadosTotal as any" /></div>
      </div>
      <div class="card p-4">
        <div class="text-xs text-zinc-500">Cooperados Ativos</div>
        <div class="text-2xl font-semibold"><CountUp :value="summary?.pessoas?.cooperadosAtivos as any" /></div>
      </div>
      <div class="card p-4">
        <div class="text-xs text-zinc-500">Engajados (30d)</div>
        <div class="text-2xl font-semibold"><CountUp :value="summary?.pessoas?.engajados30d as any" /></div>
      </div>
    </div>

    <!-- Financeiro extras -->
    <div v-if="widgets.w_kpi_fin_extra" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <div class="card p-4">
        <div class="text-xs text-zinc-500">Ticket Médio</div>
        <div class="text-2xl font-semibold">{{ formatBRL(summary?.financeiro?.ticketMedio) }}</div>
      </div>
      <div class="card p-4">
        <div class="text-xs text-zinc-500">Inadimplência</div>
        <div class="text-2xl font-semibold">{{ formatPct(summary?.financeiro?.inadimplencia) }}</div>
      </div>
    </div>

    <!-- Mobilidade: KPIs -->

    <!-- Mobilidade: Quem viajou mais (esquerda) + KPIs (direita) -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3" v-if="(widgets.w_chart_mob_ranking && mobilityRanking.length) || (widgets.w_kpi_mobility && mobilitySummary)">

      <!-- Esquerda: Pódio + lista -->
      <div v-if="widgets.w_chart_mob_ranking" class="card p-4">
        <div class="text-sm font-medium mb-2">Quem mais viajou</div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div v-for="(it,i) in mobilityRanking.slice(0,3)" :key="it.cooperadoId" class="p-3 rounded border border-zinc-200 relative cursor-pointer" @click="navigateToRequests({ cooperadoId: it.cooperadoId })">
            <div class="absolute -top-2 -left-2 text-2xl" :class="i===0 ? '' : 'opacity-80'">{{ i===0 ? '🥇' : (i===1 ? '🥈' : '🥉') }}</div>
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-full bg-zinc-800 text-zinc-100 flex items-center justify-center ring-2"
                   :class="i===0 ? 'ring-yellow-600' : (i===1 ? 'ring-zinc-400' : 'ring-amber-700')">
                {{ initials(it.nome) }}
              </div>
              <div>




                <div class="text-sm font-medium">{{ it.nome }}</div>
                <div class="text-xs text-zinc-500">
                  <CountUp :value="it.distancia_km" :formatter="v => formatNum(Math.round(v)) + ' km'" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="mt-4 space-y-2">
          <div v-for="it in mobilityRanking.slice(3)" :key="it.cooperadoId" class="cursor-pointer" @click="navigateToRequests({ cooperadoId: it.cooperadoId })">
            <div class="flex items-center justify-between text-xs">
              <div class="flex items-center gap-2">
                <div class="w-6 h-6 rounded-full bg-zinc-800 text-zinc-100 flex items-center justify-center text-[10px]">{{ initials(it.nome) }}</div>
                <span class="text-zinc-600">{{ it.nome }}</span>
              </div>
              <span class="text-zinc-500">{{ formatNum(it.distancia_km) }} km</span>
            </div>
            <div class="h-2 bg-zinc-800/40 rounded">
              <div class="h-2 bg-yellow-600 rounded" :style="{ width: Math.max(4, Math.round((it.distancia_km / mobRankMax) * 100)) + '%' }"></div>
            </div>
    </div>

          </div>
        </div>

      <!-- Direita: KPIs de mobilidade (um abaixo do outro) -->
      <div v-if="widgets.w_kpi_mobility && mobilitySummary" class="card p-4">
        <div class="text-sm font-medium mb-2">Resumo de Mobilidade</div>
        <div class="space-y-2">
          <div class="card p-2 border-l-2 border-yellow-600">
            <div class="text-[11px] text-zinc-500">Distância média por cooperado</div>
            <div class="text-[20px] font-semibold"><CountUp :value="mobilitySummary!.avg_distance_km" :formatter="v => formatNum(Math.round(v)) + ' km'" /></div>
          </div>
          <div class="card p-2 border-l-2 border-yellow-600">
            <div class="text-[11px] text-zinc-500">Tempo médio de deslocamento</div>
            <div class="text-[20px] font-semibold"><CountUp :value="mobilitySummary!.avg_travel_min" :formatter="v => formatNum(Math.round(v)) + ' min'" /></div>
          </div>
          <div class="card p-2 border-l-2 border-yellow-600">
            <div class="text-[11px] text-zinc-500">Total de km (período)</div>
            <div class="text-[20px] font-semibold"><CountUp :value="mobilitySummary!.total_km" :formatter="v => formatNum(Math.round(v)) + ' km'" /></div>
          </div>
    <!-- Cooperados: Compliance -->
    <div v-if="widgets.w_kpi_coop_compliance && coopCompliance" class="card p-4">
      <div class="text-sm font-medium mb-2">Cooperados: Compliance</div>
      <div class="space-y-2">
        <div class="card p-2 border-l-2 border-yellow-600 cursor-pointer" @click="navigateToCooperados({ missing: 'photo' })">
          <div class="text-[11px] text-zinc-500">Perfis sem foto</div>
          <div class="text-[20px] font-semibold"><CountUp :value="coopCompliance!.missing_photo" :formatter="v => formatNum(Math.round(v))" /></div>
        </div>
        <div class="card p-2 border-l-2 border-yellow-600 cursor-pointer" @click="navigateToCooperados({ missing: 'background_check' })">
          <div class="text-[11px] text-zinc-500">Sem atestado de antecedentes criminais</div>
          <div class="text-[20px] font-semibold"><CountUp :value="coopCompliance!.missing_background_check" :formatter="v => formatNum(Math.round(v))" /></div>
        </div>
        <div class="card p-2 border-l-2 border-yellow-600 cursor-pointer" @click="navigateToCooperados({ missing: 'medical' })">
          <div class="text-[11px] text-zinc-500">Sem atestado médico</div>
          <div class="text-[20px] font-semibold"><CountUp :value="coopCompliance!.missing_medical_certificate" :formatter="v => formatNum(Math.round(v))" /></div>
        </div>
        <div class="card p-2 border-l-2 border-yellow-600 cursor-pointer" @click="navigateToCooperados({ missing: 'functions' })">
          <div class="text-[11px] text-zinc-500">Sem funções preenchidas</div>
          <div class="text-[20px] font-semibold"><CountUp :value="coopCompliance!.missing_functions" :formatter="v => formatNum(Math.round(v))" /></div>
        </div>
      </div>
    </div>

          <div class="card p-2 border-l-2 border-yellow-600">
            <div class="text-[11px] text-zinc-500">Custo estimado de transporte</div>
            <div class="text-[20px] font-semibold"><CountUp :value="mobilitySummary!.estimated_cost_brl" :formatter="v => formatBRL(v as any)" /></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Mobilidade: Fluxos origem x destino (heatmap) -->
    <div v-if="widgets.w_chart_mob_flows" class="card p-4">
      <div class="text-sm font-medium mb-2">Fluxos: origem → destino</div>
      <apexchart type="heatmap" height="300" :options="mobFlowsOptions" :series="mobFlowsApexSeries" />
    </div>


    <!-- Qualidade/Compliance -->
    <div v-if="widgets.w_kpi_qualidade" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <div class="card p-4">
        <div class="text-xs text-zinc-500">Documentos Vencidos</div>
        <div class="text-2xl font-semibold">{{ formatNum(summary?.qualidade?.documentosVencidos) }}</div>
      </div>
      <div class="card p-4">
        <div class="text-xs text-zinc-500">Treinamentos Pendentes</div>
        <div class="text-2xl font-semibold">{{ formatNum(summary?.qualidade?.treinamentosPendentes) }}</div>
      </div>
      <div class="card p-4">
        <div class="text-xs text-zinc-500">Satisfação Média</div>
        <div class="text-2xl font-semibold">{{ formatNum(summary?.qualidade?.satisfacaoMedia) }}</div>
      </div>
    </div>
    <!-- Compliance: Geral -->
    <div class="card p-4">
      <div class="text-sm font-medium mb-2">Compliance geral</div>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-3 items-center">
        <div>
          <div class="text-[11px] text-zinc-500">Pendências totais</div>
          <div class="text-[24px] font-semibold"><CountUp :value="compOverallTotal" /></div>
          <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div class="card p-2 border-l-2 border-yellow-600 flex items-center justify-between"><span>Clientes</span><strong><CountUp :value="compClientsTotal" /></strong></div>
            <div class="card p-2 border-l-2 border-yellow-600 flex items-center justify-between"><span>Eventos</span><strong><CountUp :value="compEventsTotal" /></strong></div>
            <div class="card p-2 border-l-2 border-yellow-600 flex items-center justify-between"><span>Financeiro</span><strong><CountUp :value="compFinanceTotal" /></strong></div>
            <div class="card p-2 border-l-2 border-yellow-600 flex items-center justify-between"><span>SLAs</span><strong><CountUp :value="compSlasTotal" /></strong></div>
            <div class="card p-2 border-l-2 border-yellow-600 flex items-center justify-between col-span-2"><span>Cooperados</span><strong><CountUp :value="compCoopTotal" /></strong></div>
          </div>
        </div>
        <div class="lg:col-span-2">
          <apexchart type="donut" height="240" :options="compOverallOptions" :series="compOverallSeries" />
        </div>
      </div>
    </div>

    <!-- Gráficos (ApexCharts) -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3" v-if="widgets.w_chart_series_solic || widgets.w_chart_status_pizza">
      <div v-if="widgets.w_chart_series_solic" class="card p-4">
        <div class="text-sm font-medium mb-2">Evolução de Solicitações</div>
        <apexchart type="line" height="260" :options="tsOptions" :series="tsSeries" />
      </div>
      <div v-if="widgets.w_chart_status_pizza" class="card p-4">
        <div class="text-sm font-medium mb-2">Status dos Eventos</div>
        <apexchart type="donut" height="260" :options="stOptions" :series="stSeries" />
      </div>
    </div>

    <!-- Clientes x Financeiro (lado a lado) -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3" v-if="widgets.w_chart_top_clientes || widgets.w_chart_fin_previsto">
      <div v-if="widgets.w_chart_top_clientes" class="card p-4">
        <div class="text-sm font-medium mb-2">Top 10 Clientes (Faturamento)</div>
        <apexchart type="bar" height="320" :options="topOptions" :series="topSeries" />
      </div>
      <div v-if="widgets.w_chart_fin_previsto" class="card p-4">
        <div class="mb-2 text-sm font-semibold text-zinc-600">Financeiro</div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <div class="card p-2 border-l-2 border-yellow-600">
            <div class="text-[11px] text-zinc-500">Faturamento Atual (mês)</div>
            <div class="text-[20px] font-semibold"><CountUp :value="fin.faturamentoAtual" :formatter="v => formatBRL(v as any)" /></div>
          </div>
          <div class="card p-2 border-l-2 border-yellow-600">
            <div class="text-[11px] text-zinc-500">Receita Líquida (mês)</div>
            <div class="text-[20px] font-semibold"><CountUp :value="fin.receitaLiquidaAtual" :formatter="v => formatBRL(v as any)" /></div>
          </div>
          <div class="card p-2 border-l-2 border-yellow-600">
            <div class="text-[11px] text-zinc-500">Previsão (mês)</div>
            <div class="text-[20px] font-semibold"><CountUp :value="fin.previsaoMes" :formatter="v => formatBRL(v as any)" /></div>
          </div>
        </div>
        <apexchart type="bar" height="240" :options="stackOptions" :series="stackSeries" />
      </div>
    </div>


    <!-- Compliance (abas) -->
    <div class="card p-4">
      <div class="flex items-center justify-between mb-3">
        <div class="text-sm font-medium">Compliance</div>
        <div class="flex flex-wrap gap-2">
          <button v-if="widgets.w_comp_clients && compClients" @click="compActiveTab='clientes'" class="px-2 pb-1 text-xs border-b-2" :class="compTab==='clientes' ? 'border-yellow-600 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-700'">Clientes</button>
          <button v-if="widgets.w_comp_events && compEvents" @click="compActiveTab='eventos'" class="px-2 pb-1 text-xs border-b-2" :class="compTab==='eventos' ? 'border-yellow-600 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-700'">Eventos</button>
          <button v-if="widgets.w_comp_finance && compFinance" @click="compActiveTab='financeiro'" class="px-2 pb-1 text-xs border-b-2" :class="compTab==='financeiro' ? 'border-yellow-600 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-700'">Financeiro</button>
          <button v-if="widgets.w_comp_slas && compSlas" @click="compActiveTab='slas'" class="px-2 pb-1 text-xs border-b-2" :class="compTab==='slas' ? 'border-yellow-600 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-700'">SLAs</button>
        </div>
      </div>

      <template v-if="compTab==='clientes'">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
          <div class="card p-2 border-l-2 border-yellow-600"><div class="text-[11px] text-zinc-500">Contratos vencidos</div><div class="text-[20px] font-semibold"><CountUp :value="compClients?.expired_contracts ?? 0" /></div></div>
          <div class="card p-2 border-l-2 border-yellow-600"><div class="text-[11px] text-zinc-500">Vencem em 30d</div><div class="text-[20px] font-semibold"><CountUp :value="compClients?.expiring_30d ?? 0" /></div></div>
          <div class="card p-2 border-l-2 border-yellow-600"><div class="text-[11px] text-zinc-500">CNDs pendentes</div><div class="text-[20px] font-semibold"><CountUp :value="compClients?.missing_cnds ?? 0" /></div></div>
          <div class="card p-2 border-l-2 border-yellow-600"><div class="text-[11px] text-zinc-500">Cadastro incompleto</div><div class="text-[20px] font-semibold"><CountUp :value="compClients?.missing_registration ?? 0" /></div></div>
        </div>
        <apexchart type="donut" height="220" :options="compClientsOptions" :series="compClientsSeries" />
      </template>

      <template v-else-if="compTab==='eventos'">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
          <div class="card p-2 border-l-2 border-yellow-600"><div class="text-[11px] text-zinc-500">Checklist incompleto</div><div class="text-[20px] font-semibold"><CountUp :value="compEvents?.checklist_incomplete ?? 0" /></div></div>
          <div class="card p-2 border-l-2 border-yellow-600"><div class="text-[11px] text-zinc-500">Escala incompleta</div><div class="text-[20px] font-semibold"><CountUp :value="compEvents?.escala_incomplete ?? 0" /></div></div>
          <div class="card p-2 border-l-2 border-yellow-600"><div class="text-[11px] text-zinc-500">Documentos pendentes</div><div class="text-[20px] font-semibold"><CountUp :value="compEvents?.docs_missing ?? 0" /></div></div>
        </div>
        <apexchart type="donut" height="220" :options="compEventsOptions" :series="compEventsSeries" />
      </template>

      <template v-else-if="compTab==='financeiro'">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
          <div class="card p-2 border-l-2 border-yellow-600"><div class="text-[11px] text-zinc-500">Notas fiscais pendentes</div><div class="text-[20px] font-semibold"><CountUp :value="compFinance?.nf_pending ?? 0" /></div></div>
          <div class="card p-2 border-l-2 border-yellow-600"><div class="text-[11px] text-zinc-500">Divergências</div><div class="text-[20px] font-semibold"><CountUp :value="compFinance?.divergencias ?? 0" /></div></div>
          <div class="card p-2 border-l-2 border-yellow-600"><div class="text-[11px] text-zinc-500">Tributos inconsistentes</div><div class="text-[20px] font-semibold"><CountUp :value="compFinance?.tax_inconsistencies ?? 0" /></div></div>
        </div>
        <apexchart type="donut" height="220" :options="compFinanceOptions" :series="compFinanceSeries" />
      </template>

      <template v-else>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
          <div class="card p-2 border-l-2 border-yellow-600"><div class="text-[11px] text-zinc-500">Aceite abaixo da meta</div><div class="text-[20px] font-semibold"><CountUp :value="compSlas?.aceite_below_target ?? 0" /></div></div>
          <div class="card p-2 border-l-2 border-yellow-600"><div class="text-[11px] text-zinc-500">Fill Rate abaixo</div><div class="text-[20px] font-semibold"><CountUp :value="compSlas?.fillrate_below_target ?? 0" /></div></div>
          <div class="card p-2 border-l-2 border-yellow-600"><div class="text-[11px] text-zinc-500">Lead time acima</div><div class="text-[20px] font-semibold"><CountUp :value="compSlas?.leadtime_above_target ?? 0" /></div></div>
        </div>
        <apexchart type="donut" height="220" :options="compSlasOptions" :series="compSlasSeries" />
      </template>
    </div>

    <div v-if="widgets.w_chart_status_monthly" class="card p-4">
      <div class="text-sm font-medium mb-2">Status por mês</div>
      <apexchart type="bar" height="300" :options="statusMonthlyOptions" :series="statusMonthlyApexSeries" />
    </div>

    <div v-if="widgets.w_chart_heatmap_checkins" class="card p-4">
      <div class="text-sm font-medium mb-2">Check-ins (hora x dia)</div>
      <apexchart type="heatmap" height="300" :options="heatmapOptions" :series="heatmapApexSeries" />
    </div>


  </section>
</template>
