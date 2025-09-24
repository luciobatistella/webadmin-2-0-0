import { reactive, computed, ref } from 'vue'
import { getAdminConfig } from '@/services/settings'

// Seeds de fallback (mantidos em sincronia com SettingsView)
const SEED_segmentos_evento = [
  { id: 'hotelaria', nome: 'Hotelaria', icon: '🏨', descricao: 'Operação de eventos, banquetes e A&B em hotéis' },
  { id: 'hotelaria_hospitalar', nome: 'Hotelaria Hospitalar', icon: '🏥', descricao: 'Apoio a refeitórios, room service e eventos internos em hospitais' },
  { id: 'centros_convencoes', nome: 'Centros de Convenções', icon: '🏢', descricao: 'Congressos, feiras e convenções de grande porte' },
  { id: 'espacos_eventos', nome: 'Espaços de Eventos', icon: '🎪', descricao: 'Casas de eventos, galpões, sítios, chácaras e espaços multiuso' },
  { id: 'catering', nome: 'Catering', icon: '🚚', descricao: 'Serviço de alimentação e bebidas on-site ou off-site para eventos' },
  { id: 'buffets', nome: 'Buffets', icon: '🎂', descricao: 'Produção completa de festas sociais e corporativas' },
  { id: 'restaurantes', nome: 'Restaurantes', icon: '🍴', descricao: 'Reforço de equipe para datas de pico, reservas e eventos fechados' },
  { id: 'clubes', nome: 'Clubes', icon: '⛳', descricao: 'Sociais, esportivos e de campo, com calendários sazonais' },
  { id: 'casas_show', nome: 'Casas de Show', icon: '🎵', descricao: 'Operações de casa cheia, pista, camarotes e backstage' },
  { id: 'festivais', nome: 'Festivais', icon: '🎭', descricao: 'Grandes operações multiárea (front, backstage, camarim, A&B)' },
  { id: 'estadios', nome: 'Estádios', icon: '🏟️', descricao: 'Jogos e shows, hospitalidade, lounges e operações de massa' },
  { id: 'refeitorios_empresariais', nome: 'Refeitórios Empresariais', icon: '🍱', descricao: 'Operação diária, picos, auditorias e eventos internos' }
]

const SEED_categorias_servicos = [
  { id: 'alimentacao', nome: 'Alimentação & Bebidas', icon: '🍽️', descricao: 'Serviços de gastronomia', servicos: [
    { nome: 'Coffee Break', icon: '☕', descricao: 'Café, chás, salgados', funcoes: ['Garçom', 'Copeiro', 'Barista'] },
    { nome: 'Coquetel', icon: '🍸', descricao: 'Drinks e finger food', funcoes: ['Garçom', 'Bartender', 'Copeiro'] },
    { nome: 'Almoço/Jantar', icon: '🍽️', descricao: 'Refeição completa', funcoes: ['Garçom', 'Maître', 'Copeiro', 'Cozinheiro'] },
    { nome: 'Buffet', icon: '🍴', descricao: 'Buffet livre variado', funcoes: ['Garçom', 'Repositor', 'Copeiro'] },
    { nome: 'Prato Servido', icon: '🎩', descricao: 'Serviço à francesa', funcoes: ['Garçom', 'Maître', 'Copeiro'] },
    { nome: 'Finger Food', icon: '🥪', descricao: 'Petiscos e canapés', funcoes: ['Garçom', 'Copeiro'] }
  ]},
  { id: 'estacionamento', nome: 'Estacionamento & Valet', icon: '🚗', descricao: 'Serviços de estacionamento', servicos: [
    { nome: 'Valet Parking', icon: '🔑', descricao: 'Serviço de manobrista', funcoes: ['Manobrista', 'Supervisor de Valet'] },
    { nome: 'Controle de Acesso', icon: '🚧', descricao: 'Controle de entrada/saída', funcoes: ['Controlador de Acesso'] },
    { nome: 'Orientação', icon: '👋', descricao: 'Orientação de estacionamento', funcoes: ['Orientador de Trânsito'] }
  ]},
  { id: 'traducao', nome: 'Tradução & Interpretação', icon: '🌐', descricao: 'Serviços linguísticos', servicos: [
    { nome: 'Tradução Simultânea', icon: '🎧', descricao: 'Tradução em tempo real', funcoes: ['Tradutor Simultâneo', 'Técnico de Tradução'] },
    { nome: 'Tradução Consecutiva', icon: '🗣️', descricao: 'Tradução sequencial', funcoes: ['Tradutor Consecutivo'] },
    { nome: 'Intérprete de Libras', icon: '👐', descricao: 'Linguagem de sinais', funcoes: ['Intérprete de Libras'] }
  ]},
  { id: 'seguranca', nome: 'Segurança & Saúde', icon: '🛡️', descricao: 'Serviços de segurança e emergência', servicos: [
    { nome: 'Segurança Patrimonial', icon: '👮', descricao: 'Segurança do evento', funcoes: ['Segurança', 'Supervisor de Segurança'] },
    { nome: 'Brigada de Incêndio', icon: '🚒', descricao: 'Prevenção e combate', funcoes: ['Brigadista'] },
    { nome: 'Equipe Médica', icon: '🏥', descricao: 'Atendimento médico', funcoes: ['Enfermeiro', 'Médico', 'Socorrista'] },
    { nome: 'Ambulância', icon: '🚑', descricao: 'Transporte médico', funcoes: ['Motorista de Ambulância', 'Paramédico'] }
  ]},
  { id: 'recepcao', nome: 'Recepção & Credenciamento', icon: '🎫', descricao: 'Serviços de recepção', servicos: [
    { nome: 'Credenciamento', icon: '📋', descricao: 'Check-in de convidados', funcoes: ['Recepcionista', 'Operador de Credenciamento'] },
    { nome: 'Recepção VIP', icon: '⭐', descricao: 'Atendimento especial', funcoes: ['Recepcionista VIP', 'Hostess'] },
    { nome: 'Informações', icon: 'ℹ️', descricao: 'Balcão de informações', funcoes: ['Atendente de Informações'] }
  ]},
  { id: 'tecnica', nome: 'Técnica & Audiovisual', icon: '🎬', descricao: 'Serviços técnicos', servicos: [
    { nome: 'Som e Luz', icon: '🎵', descricao: 'Equipamentos audiovisuais', funcoes: ['Técnico de Som', 'Técnico de Luz', 'Operador de Mesa'] },
    { nome: 'Filmagem/Foto', icon: '📹', descricao: 'Registro audiovisual', funcoes: ['Cinegrafista', 'Fotógrafo', 'Editor'] },
    { nome: 'Streaming', icon: '📡', descricao: 'Transmissão online', funcoes: ['Técnico de Streaming', 'Operador de Câmera'] },
    { nome: 'Projeção', icon: '📽️', descricao: 'Projetores e telões', funcoes: ['Técnico de Projeção'] }
  ]},
  { id: 'limpeza', nome: 'Limpeza & Manutenção', icon: '🧹', descricao: 'Serviços de limpeza', servicos: [
    { nome: 'Limpeza Geral', icon: '🧽', descricao: 'Limpeza do ambiente', funcoes: ['Auxiliar de Limpeza', 'Supervisor de Limpeza'] },
    { nome: 'Manutenção', icon: '🔧', descricao: 'Reparos e ajustes', funcoes: ['Técnico de Manutenção', 'Eletricista'] },
    { nome: 'Jardinagem', icon: '🌱', descricao: 'Cuidados com plantas', funcoes: ['Jardineiro'] }
  ]},
  { id: 'logistica', nome: 'Logística & Transporte', icon: '🚛', descricao: 'Serviços de logística', servicos: [
    { nome: 'Transporte de Convidados', icon: '🚌', descricao: 'Transfer e ônibus', funcoes: ['Motorista', 'Coordenador de Transporte'] },
    { nome: 'Carga e Descarga', icon: '📦', descricao: 'Movimentação de materiais', funcoes: ['Carregador', 'Operador de Empilhadeira'] },
    { nome: 'Montagem/Desmontagem', icon: '🔨', descricao: 'Montagem de estruturas', funcoes: ['Montador', 'Supervisor de Montagem'] }
  ]}
]

interface MultiplicadoresEquipesMap {
  [categoriaId: string]: { [funcao: string]: number }
}
interface RegrasTurnosConfig {
  horas_base_turno: number
  horas_pausa_obrigatoria: number
  faixas: Array<{ nome: string; inicio: number; fim: number }>
}
interface SetorIconsMap { [setor: string]: string }

export interface AppConfigState {
  loading: boolean
  loaded: boolean
  error: string | null
  segmentos_evento: any[]
  categorias_servicos: any[]
  catalog_roles: any[]
  role_rates: any
  multiplicadores_equipes: MultiplicadoresEquipesMap
  regras_turnos: RegrasTurnosConfig | null
  setor_icons: SetorIconsMap
}

const state = reactive<AppConfigState>({
  loading: false,
  loaded: false,
  error: null,
  segmentos_evento: [],
  categorias_servicos: [],
  catalog_roles: [],
  role_rates: {},
  multiplicadores_equipes: {},
  regras_turnos: null,
  setor_icons: {},
})

// Fallback de funções (mesmo conjunto usado no CastingBuilder para evitar basePrice = 0)
const SEED_catalog_roles = [
  { key: 'garcom', sector: 'A&B', label: 'Garçom', basePrice: 28 },
  { key: 'steward', sector: 'A&B', label: 'Copeiro', basePrice: 24 },
  { key: 'barista', sector: 'A&B', label: 'Barista', basePrice: 30 },
  { key: 'barman', sector: 'A&B', label: 'Bartender', basePrice: 32 },
  { key: 'maitreHotel', sector: 'A&B', label: 'Maître', basePrice: 50 },
  { key: 'cozinheiro', sector: 'Cozinha', label: 'Cozinheiro', basePrice: 45 },
  { key: 'ajudanteCozinha', sector: 'Cozinha', label: 'Ajudante de Cozinha', basePrice: 32 },
  { key: 'manobrista', sector: 'Estacionamento & Valet', label: 'Manobrista', basePrice: 30 },
  { key: 'coordenadorEstacionamento', sector: 'Estacionamento & Valet', label: 'Coordenador de Estacionamento', basePrice: 48 },
  { key: 'recepcionista', sector: 'Recepção & Credenciamento', label: 'Recepcionista', basePrice: 35 },
  { key: 'tecnicoSom', sector: 'Técnica & AV', label: 'Técnico de Som', basePrice: 60 },
  { key: 'tecnicoLuz', sector: 'Técnica & AV', label: 'Técnico de Luz', basePrice: 60 },
  { key: 'operadorProjecao', sector: 'Técnica & AV', label: 'Operador de Projeção', basePrice: 55 },
  { key: 'suporteTI', sector: 'Técnica & AV', label: 'Suporte TI', basePrice: 50 },
  { key: 'seguranca', sector: 'Segurança & Saúde', label: 'Segurança', basePrice: 40 },
  { key: 'brigadista', sector: 'Segurança & Saúde', label: 'Brigadista', basePrice: 42 },
  { key: 'carregador', sector: 'Logística & Transporte', label: 'Carregador', basePrice: 32 },
  { key: 'coordenadorAeB', sector: 'A&B', label: 'Coordenador A&B', basePrice: 55 },
  { key: 'interprete', sector: 'Tradução & Interpretação', label: 'Intérprete', basePrice: 120 },
  { key: 'tecnicoTraducao', sector: 'Tradução & Interpretação', label: 'Técnico de Tradução', basePrice: 70 }
]

// Mantém última configuração administrativa completa (para pricing multipliers, etc.)
const adminConfigRef = ref<any>({})

export function useAppConfig() {
  const loading = computed(() => state.loading)
  const error = computed(() => state.error)
  const segmentos = computed(() => state.segmentos_evento)
  const categorias = computed(() => state.categorias_servicos)
  const catalogRoles = computed(() => state.catalog_roles)
  const roleRates = computed(() => state.role_rates)
  const multiplicadores = computed(() => state.multiplicadores_equipes)
  const regrasTurnos = computed(() => state.regras_turnos)
  const setorIcons = computed(() => state.setor_icons)
  const isReady = computed(() => state.loaded && !state.loading && !state.error)

  async function ensureLoaded(force = false) {
    if (state.loaded && !force) return
    state.loading = true
    state.error = null
    try {
      const resp = await getAdminConfig(new URLSearchParams())
  const cfg = (resp as any)?.data || resp || {}
  state.segmentos_evento = Array.isArray(cfg.segmentos_evento) && cfg.segmentos_evento.length ? cfg.segmentos_evento : SEED_segmentos_evento
  state.categorias_servicos = Array.isArray(cfg.categorias_servicos) && cfg.categorias_servicos.length ? cfg.categorias_servicos : SEED_categorias_servicos
  state.catalog_roles = Array.isArray(cfg.catalog_roles) && cfg.catalog_roles.length ? cfg.catalog_roles : SEED_catalog_roles
    state.role_rates = cfg.role_rates || {}
      state.multiplicadores_equipes = cfg.multiplicadores_equipes || {}
      state.regras_turnos = cfg.regras_turnos || null
      state.setor_icons = cfg.setor_icons || {}
  adminConfigRef.value = cfg
  state.loaded = true
    } catch (e: any) {
      state.error = 'Falha ao carregar configurações'
  state.segmentos_evento = SEED_segmentos_evento
  state.categorias_servicos = SEED_categorias_servicos
  state.catalog_roles = SEED_catalog_roles
  state.loaded = true
    } finally {
      state.loading = false
    }
  }

  return { loading, error, segmentos, categorias, catalogRoles, roleRates, multiplicadores, regrasTurnos, setorIcons, isReady, ensureLoaded, adminConfig: adminConfigRef }
}

// Helper para testes: permite injetar dados diretamente na store sem chamadas HTTP
export function __testingPatchConfig(patch: Partial<AppConfigState & { adminConfig?: any }>) {
  if (patch.catalog_roles) state.catalog_roles = patch.catalog_roles as any
  if (patch.role_rates) state.role_rates = patch.role_rates as any
  if (patch.segmentos_evento) state.segmentos_evento = patch.segmentos_evento as any
  if (patch.categorias_servicos) state.categorias_servicos = patch.categorias_servicos as any
  if (patch.regras_turnos) state.regras_turnos = patch.regras_turnos as any
  if (patch.multiplicadores_equipes) state.multiplicadores_equipes = patch.multiplicadores_equipes as any
  if ((patch as any).adminConfig) adminConfigRef.value = (patch as any).adminConfig
}
