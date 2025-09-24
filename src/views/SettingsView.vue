<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getAdminConfig, updateAdminConfig } from '@/services/settings'

// Seeds iniciais (cópia do código atual) — usados para popular /settings na primeira vez
const SEED_catalog_roles = [
  // A&B
  { key: 'garcom', sector: 'A&B', label: 'Garçom', basePrice: 28 },
  { key: 'steward', sector: 'A&B', label: 'Copeiro', basePrice: 24 },
  { key: 'barista', sector: 'A&B', label: 'Barista', basePrice: 30 },
  { key: 'barman', sector: 'A&B', label: 'Bartender', basePrice: 32 },
  { key: 'maitreHotel', sector: 'A&B', label: 'Maître', basePrice: 50 },
  { key: 'coordenadorAeB', sector: 'A&B', label: 'Coordenador A&B', basePrice: 55 },
  { key: 'cozinheiro', sector: 'Cozinha', label: 'Cozinheiro', basePrice: 45 },
  { key: 'ajudanteCozinha', sector: 'Cozinha', label: 'Ajudante de Cozinha', basePrice: 28 },
  // Estacionamento & Valet
  { key: 'manobrista', sector: 'Estacionamento & Valet', label: 'Manobrista', basePrice: 30 },
  { key: 'coordenadorEstacionamento', sector: 'Estacionamento & Valet', label: 'Coordenador de Estacionamento', basePrice: 48 },
  // Tradução & Interpretação
  { key: 'interprete', sector: 'Tradução & Interpretação', label: 'Intérprete', basePrice: 120 },
  { key: 'tecnicoTraducao', sector: 'Tradução & Interpretação', label: 'Técnico de Tradução', basePrice: 70 },
  // Recepção & Atendimento
  { key: 'recepcionista', sector: 'Recepção', label: 'Recepcionista', basePrice: 28 },
  { key: 'hostess', sector: 'Recepção', label: 'Hostess', basePrice: 30 },
  // Técnica & AV
  { key: 'tecnicoSom', sector: 'Técnica', label: 'Técnico de Som', basePrice: 65 },
  { key: 'tecnicoLuz', sector: 'Técnica', label: 'Técnico de Iluminação', basePrice: 60 },
  { key: 'operadorProjecao', sector: 'Técnica', label: 'Operador de Projeção', basePrice: 55 },
  { key: 'suporteTI', sector: 'Técnica', label: 'Suporte TI', basePrice: 50 },
  { key: 'tecnicoEletricista', sector: 'Técnica', label: 'Eletricista', basePrice: 58 },
  // Segurança & Emergência
  { key: 'seguranca', sector: 'Segurança', label: 'Segurança', basePrice: 35 },
  { key: 'brigadista', sector: 'Emergência', label: 'Brigadista', basePrice: 42 },
  { key: 'medicoPlantao', sector: 'Emergência', label: 'Médico Plantonista', basePrice: 120 },
  { key: 'enfermeiro', sector: 'Emergência', label: 'Enfermeiro', basePrice: 65 },
  // Logística & Montagem
  { key: 'carregador', sector: 'Logística', label: 'Carregador/Montador', basePrice: 28 },
  { key: 'coordenadorLogistica', sector: 'Logística', label: 'Coordenador de Logística', basePrice: 48 },
  { key: 'motorista', sector: 'Logística', label: 'Motorista', basePrice: 35 },
  // Limpeza & Manutenção
  { key: 'auxiliarLimpeza', sector: 'Limpeza', label: 'Auxiliar de Limpeza', basePrice: 25 },
  { key: 'coordenadorLimpeza', sector: 'Limpeza', label: 'Coordenador de Limpeza', basePrice: 38 },
  // Produção & Coordenação
  { key: 'produtorEvento', sector: 'Produção', label: 'Produtor de Evento', basePrice: 80 },
  { key: 'assistenteProdução', sector: 'Produção', label: 'Assistente de Produção', basePrice: 45 },
  { key: 'coordenadorGeral', sector: 'Produção', label: 'Coordenador Geral', basePrice: 90 }
]


const SEED_price_multipliers = {
  period: { madrugada: 1.2, manha: 1.0, tarde: 1.1, noite: 1.3 },
  dayType: { weekday: 1.0, weekend: 1.4, holiday: 1.6 },
  extra: { on: 1.5, off: 1.0 },
  pause: { hasPausa1h: 1.0, none: 1.0 },
  // multiplicador adicional quando houver hora extra em período madrugada (configurável)
  madrugadaExtra: 1.25
}


const SEED_service_to_sectors = {
  alimentacao: ['A&B', 'Cozinha'],
  recepcao: ['Recepção', 'Produção'],
  tecnica: ['Técnica'],
  seguranca: ['Segurança', 'Emergência', 'Segurança & Saúde'],
  logistica: ['Logística'],
  limpeza: ['Limpeza'],
  traducao: ['Tradução & Interpretação'],
  estacionamento: ['Estacionamento & Valet']
}

const SEED_role_aliases = {
  'garcom': 'garcom', 'garcon': 'garcom',
  'copeiro': 'steward', 'copa': 'steward', 'steward': 'steward',
  'barista': 'barista', 'bartender': 'barman', 'barman': 'barman',
  'maitre': 'maitreHotel',
  'manobrista': 'manobrista', 'coordenador de estacionamento': 'coordenadorEstacionamento', 'coordenador estacionamento': 'coordenadorEstacionamento',
  'interprete': 'interprete', 'tecnico de traducao': 'tecnicoTraducao', 'tecnico traducao': 'tecnicoTraducao',
  'seguranca': 'seguranca', 'brigadista': 'brigadista'
}

// Seeds do Wizard (Step 2)
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
  { id: 'refeitórios_empresariais', nome: 'Refeitórios Empresariais', icon: '🍱', descricao: 'Operação diária, picos, auditorias e eventos internos' }
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

// Novos seeds para catálogo expandido
const SEED_multiplicadores_equipes = {
  alimentacao: { 'Garçom': 30, 'Copeiro': 80 },
  estacionamento: { 'Manobrista': 50, 'Coordenador de Estacionamento': 300 },
  traducao: { 'Intérprete': 1, 'Técnico de Tradução': 2 },
  seguranca: { 'Segurança': 150, 'Brigadista': 500 },
  recepcao: { 'Recepcionista': 120, 'Operador de Credenciamento': 200 },
  limpeza: { 'Auxiliar de Limpeza': 200, 'Supervisor de Limpeza': 300 },
  logistica: { 'Carregador': 300, 'Motorista': 400 }
}

const SEED_setor_icons = {
  'Alimentação & Bebidas': 'fork-knife',
  'Estacionamento & Valet': 'car',
  'Tradução & Interpretação': 'language',
  'Segurança & Saúde': 'shield-check',
  'Recepção & Credenciamento': 'identification',
  'Limpeza & Manutenção': 'sparkles',
  'Logística & Transporte': 'truck'
}

const SEED_regras_turnos = {
  horas_base_turno: 8,
  horas_pausa_obrigatoria: 8,
  faixas: [
    { nome: 'Turno Madrugada', inicio: 0, fim: 5 },
    { nome: 'Turno Manhã', inicio: 5, fim: 12 },
    { nome: 'Turno Tarde', inicio: 12, fim: 18 },
    { nome: 'Turno Noite', inicio: 18, fim: 24 }
  ]
}

// Seed híbrido (C) para role_rates: gera automaticamente todas as combinações
// Estrutura: { [roleKey]: { [dayType]: { [period]: valor } } }
// dayType: weekday | saturday | sunday | holiday
// period: manha | tarde | noite | extra
function buildSeedRoleRates(catalog: any[]) {
  const seed: Record<string, any> = {}
  const dayTypes: Array<'weekday' | 'saturday' | 'sunday' | 'holiday'> = ['weekday', 'saturday', 'sunday', 'holiday']
  const periods: Array<'madrugada' | 'manha' | 'tarde' | 'noite' | 'extra'> = ['madrugada','manha','tarde','noite','extra']
  catalog.forEach(role => {
    const base = Number(role.basePrice) || 0
    seed[role.key] = {}
    dayTypes.forEach(dt => {
      seed[role.key][dt] = {}
      periods.forEach(p => {
        // Regras de geração inicial:
        // weekday: base
        // madrugada +20%, tarde +5%, noite +15%, extra +50%
        // saturday: +30% sobre valor já ajustado do período; sunday: +50%; holiday: +70%
        let v = base
        if (p === 'madrugada') v = base * 1.20
        if (p === 'tarde') v = base * 1.05
        else if (p === 'noite') v = base * 1.15
        else if (p === 'extra') v = base * 1.5
        // Ajuste por tipo de dia (aplicado depois do período)
        let multDay = 1
        if (dt === 'saturday') multDay = 1.30
        else if (dt === 'sunday') multDay = 1.50
        else if (dt === 'holiday') multDay = 1.70
        seed[role.key][dt][p] = Math.round(v * multDay)
      })
    })
  })
  return seed
}

let SEED_role_rates = buildSeedRoleRates(SEED_catalog_roles)


const form = ref<Record<string, any>>({ defaults: { taxa_servico_pct: 0, fixed_costs: 0 } })
const loading = ref(false)

const catalog_roles_json = ref('')
const price_multipliers_json = ref('')
const role_aliases_json = ref('')
const service_to_sectors_json = ref('')
const segmentos_evento_json = ref('')
const categorias_servicos_json = ref('')
const multiplicadores_equipes_json = ref('')
const setor_icons_json = ref('')
const regras_turnos_json = ref('')
const role_rates_json = ref('')

function pretty(v: any){ try { return JSON.stringify(v, null, 2) } catch { return '' } }
function parseJsonSafe(s: string, fallback: any){ try { return JSON.parse(s) } catch { return fallback } }

async function load(){
  loading.value = true
  try {
    const data = await getAdminConfig(new URLSearchParams())
    form.value = (data as any)?.data || data || {}

    // Garante chaves com seeds quando ausentes
    if (!Array.isArray(form.value.catalog_roles)) form.value.catalog_roles = SEED_catalog_roles
    if (!form.value.price_multipliers) form.value.price_multipliers = SEED_price_multipliers
    if (!form.value.role_aliases) form.value.role_aliases = SEED_role_aliases
    if (!form.value.service_to_sectors) form.value.service_to_sectors = SEED_service_to_sectors
    if (!Array.isArray(form.value.segmentos_evento)) form.value.segmentos_evento = SEED_segmentos_evento
    if (!Array.isArray(form.value.categorias_servicos)) form.value.categorias_servicos = SEED_categorias_servicos
  if (!form.value.multiplicadores_equipes) form.value.multiplicadores_equipes = SEED_multiplicadores_equipes
  if (!form.value.setor_icons) form.value.setor_icons = SEED_setor_icons
  if (!form.value.regras_turnos) form.value.regras_turnos = SEED_regras_turnos
  if (!form.value.role_rates) form.value.role_rates = SEED_role_rates
    if (!form.value.defaults) form.value.defaults = {}
    if (typeof form.value.defaults.taxa_servico_pct !== 'number') form.value.defaults.taxa_servico_pct = 0
    if (typeof form.value.defaults.fixed_costs !== 'number') form.value.defaults.fixed_costs = 0

    // Popula textareas
    catalog_roles_json.value = pretty(form.value.catalog_roles)
    price_multipliers_json.value = pretty(form.value.price_multipliers)
    role_aliases_json.value = pretty(form.value.role_aliases)
    service_to_sectors_json.value = pretty(form.value.service_to_sectors)
    segmentos_evento_json.value = pretty(form.value.segmentos_evento)
    categorias_servicos_json.value = pretty(form.value.categorias_servicos)
  multiplicadores_equipes_json.value = pretty(form.value.multiplicadores_equipes)
  setor_icons_json.value = pretty(form.value.setor_icons)
  regras_turnos_json.value = pretty(form.value.regras_turnos)
  role_rates_json.value = pretty(form.value.role_rates)
  } finally { loading.value = false }
}

async function save(){
  loading.value = true
  try {
    // Aplica JSONs ao form
    form.value.catalog_roles = parseJsonSafe(catalog_roles_json.value, [])
    form.value.price_multipliers = parseJsonSafe(price_multipliers_json.value, {})
    form.value.role_aliases = parseJsonSafe(role_aliases_json.value, {})
    form.value.service_to_sectors = parseJsonSafe(service_to_sectors_json.value, {})
    form.value.segmentos_evento = parseJsonSafe(segmentos_evento_json.value, [])
    form.value.categorias_servicos = parseJsonSafe(categorias_servicos_json.value, [])
  form.value.multiplicadores_equipes = parseJsonSafe(multiplicadores_equipes_json.value, {})
  form.value.setor_icons = parseJsonSafe(setor_icons_json.value, {})
  form.value.regras_turnos = parseJsonSafe(regras_turnos_json.value, {})
  form.value.role_rates = parseJsonSafe(role_rates_json.value, {})

    await updateAdminConfig(form.value, new URLSearchParams())
    alert('Configurações salvas')
  } finally { loading.value = false }
}

function seedDefaults(){
  catalog_roles_json.value = pretty(SEED_catalog_roles)
  price_multipliers_json.value = pretty(SEED_price_multipliers)
  role_aliases_json.value = pretty(SEED_role_aliases)
  service_to_sectors_json.value = pretty(SEED_service_to_sectors)
  segmentos_evento_json.value = pretty(SEED_segmentos_evento)
  categorias_servicos_json.value = pretty(SEED_categorias_servicos)
  multiplicadores_equipes_json.value = pretty(SEED_multiplicadores_equipes)
  setor_icons_json.value = pretty(SEED_setor_icons)
  regras_turnos_json.value = pretty(SEED_regras_turnos)
  // Regenerar role_rates sempre que recarregar padrões baseado no catálogo atual
  SEED_role_rates = buildSeedRoleRates(parseJsonSafe(catalog_roles_json.value, SEED_catalog_roles))
  role_rates_json.value = pretty(SEED_role_rates)
}


onMounted(load)
</script>

<template>
  <section class="space-y-4 p-4">
    <header class="flex items-center gap-3">
      <h1 class="text-lg font-semibold">Configurações</h1>
      <div class="ml-auto flex items-center gap-2">
        <button class="btn-secondary" @click="seedDefaults" :disabled="loading">Carregar padrões</button>
        <button class="btn-primary" @click="save" :disabled="loading">Salvar</button>
      </div>
    </header>

    <div class="card p-4 space-y-3">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label class="text-xs text-zinc-500">Nome do sistema</label>
          <input v-model="form.app_name" class="w-full rounded border px-2 py-1" />
        </div>
        <div>
          <label class="text-xs text-zinc-500">Logo URL</label>
          <input v-model="form.logo_url" class="w-full rounded border px-2 py-1" />
        </div>
      </div>
    </div>

    <!-- Configurações por módulo -->
    <div class="card p-4 space-y-4">
      <h2 class="text-base font-semibold">Catálogo & Orçamento</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="space-y-1">
          <label class="text-xs text-zinc-500">Catálogo de Funções (catalog_roles)</label>
          <textarea v-model="catalog_roles_json" class="w-full h-48 font-mono text-xs rounded border p-2"></textarea>
        </div>
        <div class="space-y-1">
          <label class="text-xs text-zinc-500">Multiplicadores de Preço (price_multipliers)</label>
          <textarea v-model="price_multipliers_json" class="w-full h-48 font-mono text-xs rounded border p-2"></textarea>
        </div>
        <div class="space-y-1">
          <label class="text-xs text-zinc-500">Matriz de Tarifas por Função (role_rates)</label>
          <textarea v-model="role_rates_json" class="w-full h-56 font-mono text-[11px] leading-tight rounded border p-2"></textarea>
          <p class="text-[10px] text-zinc-500 leading-snug">Estrutura: role_rates[roleKey][dayType][period]. dayType: weekday|saturday|sunday|holiday. period: manha|tarde|noite|extra.</p>
        </div>
        <div class="space-y-1">
          <label class="text-xs text-zinc-500">Aliases de Função (role_aliases)</label>
          <textarea v-model="role_aliases_json" class="w-full h-40 font-mono text-xs rounded border p-2"></textarea>
        </div>
        <div class="space-y-1">
          <label class="text-xs text-zinc-500">Mapeamento Serviço → Setores (service_to_sectors)</label>
          <textarea v-model="service_to_sectors_json" class="w-full h-40 font-mono text-xs rounded border p-2"></textarea>
        </div>
      </div>

      <h2 class="text-base font-semibold">Wizard (Step 2)</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="space-y-1">
          <label class="text-xs text-zinc-500">Segmentos de Evento (segmentos_evento)</label>
          <textarea v-model="segmentos_evento_json" class="w-full h-48 font-mono text-xs rounded border p-2"></textarea>
        </div>
        <div class="space-y-1">
          <label class="text-xs text-zinc-500">Categorias de Serviços (categorias_servicos)</label>
          <textarea v-model="categorias_servicos_json" class="w-full h-48 font-mono text-xs rounded border p-2"></textarea>
        </div>
      </div>

      <h2 class="text-base font-semibold">Regras Operacionais</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="space-y-1 md:col-span-1">
          <label class="text-xs text-zinc-500">Multiplicadores de Equipes (multiplicadores_equipes)</label>
          <textarea v-model="multiplicadores_equipes_json" class="w-full h-60 font-mono text-xs rounded border p-2"></textarea>
          <p class="text-[10px] text-zinc-500 leading-snug">Mapa categoria → { Função: divisor_convidados }. Usado para sugestões automáticas.</p>
        </div>
        <div class="space-y-1 md:col-span-1">
          <label class="text-xs text-zinc-500">Ícones de Setor (setor_icons)</label>
          <textarea v-model="setor_icons_json" class="w-full h-60 font-mono text-xs rounded border p-2"></textarea>
          <p class="text-[10px] text-zinc-500 leading-snug">Mapeia nome do setor → identificador de ícone (ex: heroicon outline).</p>
        </div>
        <div class="space-y-1 md:col-span-1">
          <label class="text-xs text-zinc-500">Regras de Turnos (regras_turnos)</label>
          <textarea v-model="regras_turnos_json" class="w-full h-60 font-mono text-xs rounded border p-2"></textarea>
          <p class="text-[10px] text-zinc-500 leading-snug">Definição de horas base, pausa obrigatória e faixas nomeadas.</p>
        </div>
      </div>

      <h2 class="text-base font-semibold">Financeiro (padrões)</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="text-xs text-zinc-500">Taxa de serviço (%)</label>
          <input type="number" step="0.01" v-model.number="form.defaults.taxa_servico_pct" class="w-full rounded border px-2 py-1" />
        </div>
        <div>
          <label class="text-xs text-zinc-500">Custos fixos (R$)</label>
          <input type="number" step="0.01" v-model.number="form.defaults.fixed_costs" class="w-full rounded border px-2 py-1" />
        </div>
      </div>
    </div>

  </section>
</template>

