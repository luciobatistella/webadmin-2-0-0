import { createApi } from './api'
import { loadPublicConfig } from './http'
import AppConstants from '@/constants/AppConstants'
import { listRequests } from './requests'


async function api() {
  const cfg = await loadPublicConfig()
  return createApi(cfg.api_url as string)
}

export async function findEventsRequests(params?: URLSearchParams): Promise<any[]> {
  const http = await api()
  const candidates = [
    AppConstants.API_DASHBOARD_EVENTS_REQUESTS,
    AppConstants.API_DASHBOARD_EVENTS_REQUESTS.replace('webadmin/', 'api/'),
  ]
  for (const url of candidates) {
    try {
      const { data } = await http.get(url, { params })
      return data
    } catch (e) { /* try next */ }
  }
  // Fallback: agrega a partir da lista bruta de solicitações
  return aggregateRequestsFromRaw(params)
}

export async function findEventDetails(params?: URLSearchParams): Promise<any> {
  const http = await api()
  const candidates = [
    AppConstants.API_DASHBOARD_EVENT_DETAILS,
    AppConstants.API_DASHBOARD_EVENT_DETAILS.replace('webadmin/', 'api/'),
  ]
  for (const url of candidates) {
    try {
      const { data } = await http.get(url, { params })
      return data
    } catch (e) { /* try next */ }
  }
  // Fallback: retorna um resumo mínimo a partir da lista bruta
  return buildEventDetailsFromRaw(params)
}


function mapDashboardToRaw(params?: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams()
  if (!params) return p
  params.forEach((v, k) => {
    if (k === 'data_evento') { p.set('data_ini', v); p.set('data_fim', v) }
    else { p.set(k, v) }
  })
  if (!p.has('data_ini') && !p.has('data_fim') && params?.get('data_evento')) {
    const v = params.get('data_evento')!
    p.set('data_ini', v); p.set('data_fim', v)
  }
  return p
}

async function aggregateRequestsFromRaw(params?: URLSearchParams): Promise<any[]> {
  const p = mapDashboardToRaw(params)
  const rows = await listRequests(p)
  const map = new Map<string, any>()
  for (const r of rows as any[]) {
    const client = (r as any).id_cliente ?? (r as any).idCliente ?? (r as any).cliente_id ?? (r as any).idclient
    const unit = (r as any).id_unidade ?? (r as any).idUnidade ?? (r as any).unidade_id
    const sector = (r as any).id_setor ?? (r as any).idSetor ?? (r as any).setor_id
    const date = (r as any).data_evento ?? (r as any).data ?? (r as any).date
    const key = `${client ?? ''}-${unit ?? ''}-${sector ?? ''}-${date ?? ''}`
    const curr = map.get(key) || {
      id: key,
      id_cliente: client, id_unidade: unit, id_setor: sector, data_evento: date,
      nome_comercial: (r as any).nomeEvento ?? (r as any).nome_evento ?? (r as any).evento ?? (r as any).title ?? (r as any).name ?? '-',
      requested: 0,
      accepted: 0,
    }
    const qtdRaw = (r as any).qtdCliente ?? (r as any).qtd ?? 0
    const qtd = Number(qtdRaw)
    curr.requested += Number.isFinite(qtd) ? qtd : 0
    map.set(key, curr)
  }
  return Array.from(map.values())
}

async function buildEventDetailsFromRaw(params?: URLSearchParams): Promise<any> {
  const p = mapDashboardToRaw(params)
  const rows = await listRequests(p)
  let requested = 0
  for (const r of rows as any[]) {
    const qtdRaw = (r as any).qtdCliente ?? (r as any).qtd ?? 0
    requested += Number(qtdRaw) || 0
  }
  return {
    requested_professional: requested,
    invitations_sent: 0,
    invitations_accepted: 0,
    checkin: 0,
    checkout: 0,
    courtesy: 0,
    managers: [],
    data: [],
  }
}

export async function getDropdownClients(params?: URLSearchParams): Promise<any[]> {
  const http = await api()
  const { data } = await http.get(AppConstants.API_DASHBOARD_DROPDOWN_CLIENTS, { params })
  return data
}

export async function getDropdownUnits(params?: URLSearchParams): Promise<any[]> {
  const http = await api()
  const { data } = await http.get(AppConstants.API_DASHBOARD_DROPDOWN_UNITS, { params })
  return data
}

export async function getDropdownSectors(params?: URLSearchParams): Promise<any[]> {
  const http = await api()
  const { data } = await http.get(AppConstants.API_DASHBOARD_DROPDOWN_SECTORS, { params })
  return data
}



export async function getDashboardSummary(params?: URLSearchParams): Promise<any> {
  try {
    const http = await api()
    const { data } = await http.get(AppConstants.API_DASHBOARD_SUMMARY, { params })
    return data
  } catch (e) {
    return getDashboardSummaryFake(params)
  }
}

export async function getDashboardTimeseries(params?: URLSearchParams): Promise<any> {
  try {
    const http = await api()
    const { data } = await http.get(AppConstants.API_DASHBOARD_TIMESERIES, { params })
    return data
  } catch (e) {
    return getDashboardTimeseriesFake(params)
  }
}

export async function getDashboardTop(params?: URLSearchParams): Promise<any> {
  try {
    const http = await api()
    const { data } = await http.get(AppConstants.API_DASHBOARD_TOP, { params })
    return data
  } catch (e) {
    return getDashboardTopFake(params)
  }
}

export async function getDashboardStatusBreakdown(params?: URLSearchParams): Promise<any> {
  try {
    const http = await api()
    const { data } = await http.get(AppConstants.API_DASHBOARD_STATUS_BREAKDOWN, { params })
    return data
  } catch (e) {
    return getDashboardStatusBreakdownFake(params)
  }
}

export async function getDashboardStatusMonthly(params?: URLSearchParams): Promise<any> {
  try {
    const http = await api()
    const { data } = await http.get(AppConstants.API_DASHBOARD_STATUS_MONTHLY, { params })
    return data
  } catch (e) {
    return getDashboardStatusMonthlyFake(params)
  }
}

export async function getDashboardHeatmap(params?: URLSearchParams): Promise<any> {
  try {
    const http = await api()
    const { data } = await http.get(AppConstants.API_DASHBOARD_HEATMAP, { params })
    return data
  } catch (e) {
    return getDashboardHeatmapFake(params)
  }
}

export async function getDashboardMobilitySummary(params?: URLSearchParams): Promise<any> {
  try {
    const http = await api()
    const { data } = await http.get(AppConstants.API_DASHBOARD_MOBILITY_SUMMARY, { params })
    return data
  } catch (e) { return getDashboardMobilitySummaryFake(params) }
}

export async function getDashboardMobilityRanking(params?: URLSearchParams): Promise<any> {
  try {
    const http = await api()
    const { data } = await http.get(AppConstants.API_DASHBOARD_MOBILITY_RANKING, { params })
    return data
  } catch (e) { return getDashboardMobilityRankingFake(params) }
}

export async function getDashboardMobilityFlows(params?: URLSearchParams): Promise<any> {
  try {
    const http = await api()
    const { data } = await http.get(AppConstants.API_DASHBOARD_MOBILITY_FLOWS, { params })
    return data
  } catch (e) { return getDashboardMobilityFlowsFake(params) }
}

export async function getDashboardCoopCompliance(params?: URLSearchParams): Promise<any> {
  try {
    const http = await api()
    const { data } = await http.get(AppConstants.API_DASHBOARD_COOP_COMPLIANCE, { params })
    return data
  } catch (e) { return getDashboardCoopComplianceFake(params) }
}

export async function getDashboardComplianceClients(params?: URLSearchParams): Promise<any> {
  try { const http = await api(); const { data } = await http.get(AppConstants.API_DASHBOARD_COMPLIANCE_CLIENTS, { params }); return data } catch { return getDashboardComplianceClientsFake(params) }
}
export async function getDashboardComplianceEvents(params?: URLSearchParams): Promise<any> {
  try { const http = await api(); const { data } = await http.get(AppConstants.API_DASHBOARD_COMPLIANCE_EVENTS, { params }); return data } catch { return getDashboardComplianceEventsFake(params) }
}
export async function getDashboardComplianceFinance(params?: URLSearchParams): Promise<any> {
  try { const http = await api(); const { data } = await http.get(AppConstants.API_DASHBOARD_COMPLIANCE_FINANCE, { params }); return data } catch { return getDashboardComplianceFinanceFake(params) }
}
export async function getDashboardComplianceSlas(params?: URLSearchParams): Promise<any> {
  try { const http = await api(); const { data } = await http.get(AppConstants.API_DASHBOARD_COMPLIANCE_SLAS, { params }); return data } catch { return getDashboardComplianceSlasFake(params) }
}

export async function getDashboardAvailability(params?: URLSearchParams): Promise<any> {
  try { const http = await api(); const { data } = await http.get(AppConstants.API_DASHBOARD_AVAILABILITY, { params }); return data }
  catch (e) { return getDashboardAvailabilityFake(params) }
}







// ------------------- FAKE DATA FALLBACKS -------------------
function randInt(min: number, max: number){ return Math.floor(Math.random()*(max-min+1))+min }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random()*arr.length)] }

function parseParams(p?: URLSearchParams){
  const o: Record<string,string> = {}
  if (!p) return o
  p.forEach((v,k)=> o[k]=v)
  return o
}

export async function getDashboardSummaryFake(params?: URLSearchParams){
  const q = parseParams(params)
  const base = Math.max(50, randInt(80, 300))
  const solicitacoes = base * randInt(8, 12)
  const profSolic = Math.round(solicitacoes * pick([1.6,1.8,2.0,2.2]))
  const profAloc = Math.round(profSolic * pick([0.82,0.86,0.9,0.94]))
  const fill = +(profAloc / Math.max(1, profSolic)).toFixed(2)
  const leadH = +(pick([8.5, 10.2, 12.8, 15.3, 18.1]).toFixed(1))
  const execH = +(pick([4.0, 5.5, 6.2, 7.0]).toFixed(1))

  const convEnviados = randInt(3000, 6000)
  const convAceitos = Math.round(convEnviados * pick([0.55, 0.62, 0.68, 0.72]))
  const desist = randInt(50, 200)
  const taxaDesist = +(desist / Math.max(1, convAceitos)).toFixed(3)
  const noShow = randInt(40, 120)
  const taxaNoShow = +(noShow / Math.max(1, Math.round(profAloc*0.9))).toFixed(3)

  const eventos = randInt(400, 900)
  const checkin = Math.round(eventos * pick([0.82,0.88,0.92]))
  const checkout = Math.round(checkin * pick([0.92,0.95,0.98]))
  const taxaConc = +(checkout / Math.max(1, checkin)).toFixed(3)

  const fatur = +(randInt(120000, 260000) + Math.random()).toFixed(2)
  const liq = +(fatur * pick([0.78,0.82,0.86])).toFixed(2)
  const prev = +(fatur * pick([1.05,1.1,1.2])).toFixed(2)
  const ticket = +((fatur)/Math.max(1, eventos)).toFixed(2)
  const inadPct = +pick([0.0, 0.01, 0.02, 0.03, 0.05]).toFixed(2)

  const cooperadosTotal = randInt(3000, 9000)
  const cooperadosAtivos = Math.round(cooperadosTotal * pick([0.55,0.68,0.72]))
  const eng30d = randInt(900, 2500)

  const documentosVencidos = randInt(20, 120)
  const treinPend = randInt(40, 180)
  const satisf = +pick([3.9, 4.2, 4.5, 4.7]).toFixed(1)

  return {
    operacional: {
      solicitacoes,
      profissionaisSolicitados: profSolic,
      profissionaisAlocados: profAloc,
      fillRate: fill,
      leadTimeMedioHoras: leadH,
      tempoExecucaoMedioHoras: execH
    },
    convites: {
      enviados: convEnviados,
      aceitos: convAceitos,
      taxaAceite: +(convAceitos/Math.max(1,convEnviados)).toFixed(2),
      desistencias: desist,
      taxaDesistencia: taxaDesist,
      noShow,
      taxaNoShow
    },
    pessoas: {
      cooperadosTotal,
      cooperadosAtivos,
      engajados30d: eng30d
    },
    eventos: {
      total: eventos,
      checkin,
      checkout,
      taxaConclusao: taxaConc
    },
    financeiro: {
      faturamentoAtual: fatur,
      receitaLiquidaAtual: liq,
      ticketMedio: ticket,
      previsaoMes: prev,
      inadimplencia: inadPct
    },
    qualidade: {
      documentosVencidos,
      treinamentosPendentes: treinPend,
      satisfacaoMedia: satisf
    }
  }
}

export async function getDashboardTimeseriesFake(params?: URLSearchParams){
  const group = parseParams(params).groupBy || 'day'
  const len = group==='month' ? 12 : group==='week' ? 12 : 30
  const start = new Date(); start.setDate(start.getDate()-len+1)
  const series = Array.from({length: len}).map((_,i)=>{
    const d = new Date(start); d.setDate(start.getDate()+i)
    const x = d.toISOString().slice(0,10)
    const y = randInt(10, 120)
    return { x, y }
  })
  return { series }
}

export async function getDashboardStatusMonthlyFake(params?: URLSearchParams){
  const now = new Date()
  const months = Array.from({length: 12}).map((_,i)=>{
    const d = new Date(now.getFullYear(), now.getMonth()-11+i, 1)
    return d.toISOString().slice(0,7) // YYYY-MM
  })
  const statuses = ['SOLICITADO','CONFIRMADO','EM_EXECUCAO','CONCLUIDO','CANCELADO','NO_SHOW']
  const series = statuses.map(name => ({
    name,
    data: months.map(()=> randInt(20, 300))
  }))
  return { categories: months, series }
}

export async function getDashboardHeatmapFake(params?: URLSearchParams){
  const days = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
  const hours = Array.from({length:24}).map((_,h)=> String(h).padStart(2,'0')+':00')
  const series = days.map((name, di)=>({
    name,
    data: hours.map((x, h)=>{
      const base = (di>=1 && di<=5 && h>=8 && h<=18) ? randInt(20, 90) : randInt(0, 40)
      return { x, y: base }
    })
  }))
  return { series }
}

export async function getDashboardMobilitySummaryFake(params?: URLSearchParams){
  const q = parseParams(params)
  const rate = Number(q.km_rate || AppConstants.KM_RATE_BRL)
  const avg_distance_km = +(randInt(8, 42) + Math.random()).toFixed(1)
  const avg_travel_min = Math.round(avg_distance_km / pick([28, 35, 42, 50]) * 60)
  const total_km = randInt(15000, 90000)
  const estimated_cost_brl = +(total_km * rate).toFixed(2)
  return { avg_distance_km, avg_travel_min, total_km, estimated_cost_brl }
}

export async function getDashboardMobilityRankingFake(params?: URLSearchParams){
  const names = ['Ana','Bruno','Carla','Diego','Elisa','Fábio','Gabi','Heitor','Íris','João','Karen','Lucas','Marta','Nilo','Olívia']
  const items = names.slice(0, 10).map((n, i) => ({ cooperadoId: i+1, nome: n, distancia_km: randInt(200, 3200) }))
  items.sort((a,b)=> b.distancia_km - a.distancia_km)
  return { items }
}

export async function getDashboardMobilityFlowsFake(params?: URLSearchParams){
  const origens = ['SP','RJ','BH','POA','CUR','FLN']
  const destinos = ['Campinas','Santos','Sorocaba','Niteroi','Contagem','Joinville']
  const matrix = origens.map(()=> destinos.map(()=> randInt(0, 120)))
  return { origens, destinos, matrix }
}

export async function getDashboardTopFake(params?: URLSearchParams){
  const dim = parseParams(params).dimension || 'clientes'
  const names = dim==='clientes' ? ['ACME','Empresa X','Alpha','Beta','Delta','Omega','Zara','Key','Turing','Ada'] :
                dim==='unidades' ? ['Unid A','Unid B','Unid C','Unid D','Unid E','Unid F','Unid G','Unid H','Unid I','Unid J'] :
                ['Setor 1','Setor 2','Setor 3','Setor 4','Setor 5','Setor 6','Setor 7','Setor 8','Setor 9','Setor 10']
  const items = names.map(label => ({ label, value: +(randInt(1000, 50000) + Math.random()).toFixed(2) }))
  return { items }
}

export async function getDashboardComplianceClientsFake(params?: URLSearchParams){
  return {
    expired_contracts: randInt(2, 18),
    expiring_30d: randInt(5, 30),
    missing_cnds: randInt(3, 20),
    missing_registration: randInt(8, 45),
  }
}
export async function getDashboardComplianceEventsFake(params?: URLSearchParams){
  return {
    checklist_incomplete: randInt(5, 25),
    escala_incomplete: randInt(4, 20),
    docs_missing: randInt(3, 18),
  }
}
export async function getDashboardComplianceFinanceFake(params?: URLSearchParams){
  return {
    nf_pending: randInt(4, 22),
    divergencias: randInt(2, 14),
    tax_inconsistencies: randInt(1, 10),
  }
}
export async function getDashboardComplianceSlasFake(params?: URLSearchParams){
  return {
    aceite_below_target: randInt(3, 15),
    fillrate_below_target: randInt(1, 8),
    leadtime_above_target: randInt(2, 12),
  }
}

export async function getDashboardAvailabilityFake(params?: URLSearchParams){
  const occupied = randInt(800, 4500)
  const freeing_1d = randInt(50, 600)
  const freeing_7d = randInt(400, 2500)
  const available_now = randInt(500, 4000)
  return { occupied, freeing_1d, freeing_7d, available_now }
}


export async function getDashboardCoopComplianceFake(params?: URLSearchParams){
  // Valores sintéticos coerentes
  const total = randInt(500, 3500)
  const missing_photo = randInt(Math.floor(total*0.05), Math.floor(total*0.18))
  const missing_background_check = randInt(Math.floor(total*0.03), Math.floor(total*0.12))
  const missing_medical_certificate = randInt(Math.floor(total*0.04), Math.floor(total*0.14))
  const missing_functions = randInt(Math.floor(total*0.06), Math.floor(total*0.2))
  return { total_cooperados: total, missing_photo, missing_background_check, missing_medical_certificate, missing_functions }
}


export async function getDashboardStatusBreakdownFake(params?: URLSearchParams){
  const statuses = ['SOLICITADO','CONFIRMADO','EM_EXECUCAO','CONCLUIDO','CANCELADO','NO_SHOW']
  const counts = statuses.map(s => ({ status: s, count: randInt(20, 300) }))
  return { status: counts }
}
