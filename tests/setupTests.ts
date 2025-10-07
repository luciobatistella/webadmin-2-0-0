import { config } from '@vue/test-utils'
import { vi } from 'vitest'

// Mock básico de vue-router (provide/inject)
vi.mock('vue-router', () => {
  const currentRoute = { name: 'test-route', params: {}, query: {} }
  return {
    useRoute: () => currentRoute,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), currentRoute }),
    createRouter: () => ({}),
    createWebHistory: () => ({}),
    RouterLink: { name: 'RouterLink', props: ['to'], template: '<a :href="to"><slot /></a>' },
    RouterView: { name: 'RouterView', template: '<div><slot /></div>' },
  }
})

// Mock de fetch para config.json e quaisquer chamadas sem backend real
const originalFetch = globalThis.fetch
globalThis.fetch = (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : (input?.url || '')
  if (/config\.json$/.test(url)) {
    return Promise.resolve(new Response(JSON.stringify({ api_url: 'http://fake-api.local' }), { status: 200 }))
  }
  // Resposta neutra para outras URLs
  return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
}

// Mock de createApi (axios) para evitar chamadas reais
vi.mock('@/services/api', () => ({
  createApi: (base: string) => ({
    get: vi.fn().mockResolvedValue({ data: { data: {}, items: [] } }),
    post: vi.fn().mockResolvedValue({ data: { data: {} } }),
    put: vi.fn().mockResolvedValue({ data: { data: {} } }),
  })
}))

// Mock de loadPublicConfig para retornar diretamente config
vi.mock('@/services/http', () => ({
  loadPublicConfig: vi.fn().mockResolvedValue({ api_url: 'http://fake-api.local' })
}))

// Mock dos serviços de dashboard para retornar estruturas mínimas coerentes
vi.mock('@/services/dashboard', () => ({
  findEventsRequests: vi.fn().mockResolvedValue([
    { id: 'evt-1', requested: 10, accepted: 6, nome_comercial: 'Evento Alpha', id_cliente: 1, id_unidade: 1, id_setor: 1, data_evento: '2025-01-01' },
    { id: 'evt-2', requested: 5, accepted: 3, nome_comercial: 'Evento Beta', id_cliente: 2, id_unidade: 1, id_setor: 2, data_evento: '2025-01-01' },
  ]),
  findEventDetails: vi.fn().mockResolvedValue({
    requested_professional: 15,
    invitations_accepted: 9,
    data: [],
    managers: []
  }),
  getDashboardSummary: vi.fn().mockResolvedValue({
    operacional: {
      solicitacoes: 100,
      profissionaisSolicitados: 150,
      profissionaisAlocados: 120,
      fillRate: 0.8,
      leadTimeMedioHoras: 12,
      tempoExecucaoMedioHoras: 6
    },
    convites: {
      enviados: 3000,
      aceitos: 1800,
      taxaAceite: 0.6,
      desistencias: 120,
      taxaDesistencia: 0.04,
      noShow: 80
    },
    pessoas: {
      cooperadosTotal: 5000,
      cooperadosAtivos: 3200,
      engajados30d: 1200
    },
    eventos: {
      total: 400,
      checkin: 350,
      checkout: 340,
      taxaConclusao: 0.97
    },
    financeiro: {
      faturamentoAtual: 150000,
      receitaLiquidaAtual: 120000,
      ticketMedio: 500,
      previsaoMes: 180000,
      inadimplencia: 0.02
    },
    qualidade: {
      documentosVencidos: 40,
      treinamentosPendentes: 60,
      satisfacaoMedia: 4.3
    }
  }),
  getDashboardTimeseries: vi.fn().mockResolvedValue({ series: [ { x: '2025-01-01', y: 10 }, { x: '2025-01-02', y: 20 } ] }),
  getDashboardTop: vi.fn().mockResolvedValue({ items: [ { label: 'ACME', value: 10000 }, { label: 'Empresa X', value: 8000 } ] }),
  getDashboardStatusBreakdown: vi.fn().mockResolvedValue({ status: [ { status: 'SOLICITADO', count: 50 }, { status: 'CONFIRMADO', count: 30 } ] }),
  getDashboardStatusMonthly: vi.fn().mockResolvedValue({ categories: ['2025-01','2025-02'], series: [ { name: 'SOLICITADO', data: [10,15] }, { name: 'CONFIRMADO', data: [8,12] } ] }),
  getDashboardHeatmap: vi.fn().mockResolvedValue({ series: [ { name: 'Seg', data: [ { x: '08:00', y: 5 }, { x: '09:00', y: 7 } ] } ] }),
  getDashboardMobilitySummary: vi.fn().mockResolvedValue({ avg_distance_km: 25, avg_travel_min: 45, total_km: 5000, estimated_cost_brl: 12000 }),
  getDashboardMobilityRanking: vi.fn().mockResolvedValue({ items: [ { cooperadoId: 1, nome: 'Ana Silva', distancia_km: 300 }, { cooperadoId: 2, nome: 'Bruno Lima', distancia_km: 250 }, { cooperadoId: 3, nome: 'Carla Souza', distancia_km: 200 } ] }),
  getDashboardMobilityFlows: vi.fn().mockResolvedValue({ origens: ['SP','RJ'], destinos: ['Campinas','Santos'], matrix: [ [10,5], [3,7] ] }),
  getDashboardCoopCompliance: vi.fn().mockResolvedValue({ total_cooperados: 5000, missing_photo: 200, missing_background_check: 150, missing_medical_certificate: 180, missing_functions: 300 }),
  getDashboardComplianceClients: vi.fn().mockResolvedValue({ expired_contracts: 5, expiring_30d: 10, missing_cnds: 8, missing_registration: 12 }),
  getDashboardComplianceEvents: vi.fn().mockResolvedValue({ checklist_incomplete: 4, escala_incomplete: 6, docs_missing: 3 }),
  getDashboardComplianceFinance: vi.fn().mockResolvedValue({ nf_pending: 5, divergencias: 2, tax_inconsistencies: 1 }),
  getDashboardComplianceSlas: vi.fn().mockResolvedValue({ aceite_below_target: 2, fillrate_below_target: 1, leadtime_above_target: 3 }),
  getDashboardAvailability: vi.fn().mockResolvedValue({ occupied: 1000, freeing_1d: 150, freeing_7d: 800, available_now: 1200 }),
}))

// Mock global componentes usados amplamente (ex: apexchart)
config.global.stubs = {
  ...(config.global.stubs || {}),
  apexchart: { template: '<div class="apexchart-stub" />' },
  // Stub global para o componente Icon usado em diversos lugares (ex.: DateRangePicker)
  Icon: { template: '<i class="icon-stub"><slot /></i>' },
}

// Mock de matchMedia (usado por libs UI às vezes)
if (typeof window !== 'undefined' && !window.matchMedia) {
  // @ts-ignore
  window.matchMedia = () => ({ matches: false, addListener: () => {}, removeListener: () => {} })
}

// Mock localStorage simples para isolar testes
class LocalStorageMock {
  private store: Record<string,string> = {}
  getItem(key: string){ return this.store[key] ?? null }
  setItem(key: string, value: string){ this.store[key] = String(value) }
  removeItem(key: string){ delete this.store[key] }
  clear(){ this.store = {} }
}
if (typeof window !== 'undefined' && !window.localStorage) {
  // @ts-ignore
  window.localStorage = new LocalStorageMock()
}

// Silenciar warning de Intl em alguns ambientes
try { Intl.NumberFormat('pt-BR') } catch {}
