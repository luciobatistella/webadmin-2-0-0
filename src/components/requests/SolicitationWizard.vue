<script setup lang="ts">
import { ref, watch, computed, toRaw, nextTick, onMounted } from 'vue'
import FormWizard from '@/components/ui/FormWizard.vue'
import ClientSelector from '@/components/ui/ClientSelector.vue'
import DateRangePicker from '@/components/ui/DateRangePicker.vue'
import VenueSelector from '@/components/ui/VenueSelector.vue'
// import CategorySelector from '@/components/ui/CategorySelector.vue' // REMOVIDO

import CastingBuilder from '@/components/requests/CastingBuilder.vue'
import { getAdminConfig } from '@/services/settings'


// Resumo emitido pelo DateRangePicker (Step 1)
const resumoOperacao = ref<any|null>(null)
function onResumoOperacao(r:any){ resumoOperacao.value = r }

// Types matching the required payload
export interface Turno { nome: string; inicio: string; fim: string }
export interface NewSolicitation {
  cliente_id: string
  cliente_nome: string
  evento_nome: string
  categoria: string
  segmento: string
  // Categorias principais de serviços selecionadas no planejamento (Step 2)
  servicos_principais: string[]
  venue: { id: string; nome: string; endereco: string; maps_url: string }
  datas: string[]
  janelas: { montagem_ini: string; evento_ini: string; evento_fim: string; desmontagem_fim: string }
  turnos: Turno[]
  turnos_detectados: boolean // true = turnos foram detectados pela entrada inteligente (não alterar)
  estrategia_turnos: boolean // true = minimizar custos, false = minimizar funcionários
  publico: { convidados_estimados: number; segmentos: string[] }
  acesso: {
    credenciamento: { ativo: boolean; impressao_cracha: boolean }
    estacionamento: { vagas: number; valet: boolean; vans: number }
  }
  ab: {
    servico: string
    horarios_servico: string[]
    cardapio: string
    restricoes: { veg: boolean; sem_gluten: boolean; alergicos: string }
    infra_apoio: { cozinha: boolean; agua: boolean; gelo: boolean; louca: boolean }
  }
  tecnica: {
    palco: { largura_m: number; profundidade_m: number; backdrop: string }
    av: { som: string[]; luz: string[]; video: string[]; led: boolean; traducao: boolean }
    streaming: { sim: boolean }
    eletrica: { carga_prevista_kva: number; gerador: boolean }
  }
  equipes: Array<{ funcao_key: string; setor: string; turno: string; quantidade: number; horas: number }>
  seguranca_saude: { controle_acesso: boolean; brigadistas: number; ambulancia: boolean; limpeza: { pre: number; durante: number; pos: number } }
  fornecedores: Array<{ nome: string; servico: string; contato: string; chegada: string }>
  documentos: { alvara_local: { required: boolean; status: string }; avcb: { required: boolean; status: string }; ecad: { aplicavel: boolean } }
  financeiro: { tabela_precos_ref: string; taxa_servico_pct: number; custos_fixos: number; condicoes_pagamento: string }
  observacoes: string
}

const props = defineProps<{ modelValue: NewSolicitation }>()
const emit = defineEmits<{
  (e:'update:modelValue', v: NewSolicitation): void
  (e: 'evento-nome-changed', nome: string): void
}>()

// Local draft for two-way binding
function deepClone<T>(v: T): T {
  try { return structuredClone(toRaw(v) as any) } catch (e) {
    try { return JSON.parse(JSON.stringify(v)) } catch { return v }
  }
}
// Fallback local caso /settings ainda não tenha sido configurado
const FALLBACK_SEGMENTOS = [
  { id: 'espacos_eventos', nome: 'Espaços de Eventos', icon: '🎪', descricao: 'Casas e espaços multiuso' },
  { id: 'hoteis', nome: 'Hotéis', icon: '🏨', descricao: 'Salões de eventos e banquetes' },
]

// Fallback local para categorias de serviços
const FALLBACK_CATEGORIAS = [
  { id: 'alimentacao', nome: 'Alimentação & Bebidas', icon: '🍽️', descricao: 'Serviços de gastronomia', servicos: [
    { nome: 'Coffee Break', icon: '☕', descricao: 'Café, chás, salgados', funcoes: ['Garçom', 'Copeiro', 'Barista'] },
    { nome: 'Coquetel', icon: '🍸', descricao: 'Drinks e finger food', funcoes: ['Garçom', 'Bartender', 'Copeiro'] },
    { nome: 'Almoço/Jantar', icon: '🍽️', descricao: 'Refeição completa', funcoes: ['Garçom', 'Maître', 'Copeiro', 'Cozinheiro'] },
  ]},
  { id: 'estacionamento', nome: 'Estacionamento & Valet', icon: '🅿️', descricao: 'Manobristas e operação', servicos: [
    { nome: 'Valet Completo', icon: '🚗', descricao: 'Operação com coordenador', funcoes: ['Manobrista', 'Coordenador de Estacionamento'] },
    { nome: 'Autoatendimento', icon: '🅿️', descricao: 'Sem valet, apenas ordenação', funcoes: ['Manobrista'] },
  ]},
  { id: 'traducao', nome: 'Tradução & Interpretação', icon: '🗣️', descricao: 'Intérpretes e técnica', servicos: [
    { nome: 'Interpretação Simultânea', icon: '🎧', descricao: 'Cabines e equipe', funcoes: ['Intérprete', 'Técnico de Tradução'] },
  ]},
]

// Segmentos de evento (carregados de /settings)
const segmentosEvento = ref<any[]>([])

const draft = ref<NewSolicitation>(deepClone(props.modelValue))

// Flag para suprimir emissão durante sincronizações internas
let suppressEmit = false

// Watch com immediate: false para evitar loops infinitos
watch(() => props.modelValue, v => {
  suppressEmit = true
  draft.value = deepClone(v)
  nextTick(() => { suppressEmit = false })
}, { deep: true, immediate: false })

// Emite apenas quando necessário, não em todo change
watch(draft, v => {
  if (suppressEmit) return
  // Só emite se realmente mudou (evita loops)
  const current = JSON.stringify(toRaw(v))
  const original = JSON.stringify(props.modelValue)
  if (current !== original) {
    emit('update:modelValue', deepClone(v))
  }
}, { deep: true, immediate: false })



// Watcher para recalcular turnos quando janelas mudarem (com debounce para evitar loops)
let recalculoTimeout: NodeJS.Timeout | null = null
watch(() => [draft.value.janelas.evento_ini, draft.value.janelas.evento_fim], () => {
  if (recalculoTimeout) clearTimeout(recalculoTimeout)
  recalculoTimeout = setTimeout(() => {
    if (draft.value.datas.length > 0 && draft.value.janelas.evento_ini && draft.value.janelas.evento_fim) {
      recalcularTurnos()
    }
  }, 100)
}, { deep: true })

// Computed properties reativas para os cálculos
const totalByType = computed(() => calculateTotalByType(draft.value.turnos))
const totalByTypeWithWeekends = computed(() => calculateTotalByTypeWithWeekends(draft.value.turnos, draft.value.datas))
const hasExtras = computed(() => hasExtraHours(draft.value.turnos))

// Wizard state
const currentStep = ref(0)
// Configuração de escala (horas por turno) usada nos cálculos
const escalaHoras = ref<number>(8)


// Estado do card do nome do evento
const eventoNomeCard = ref(false)
const eventoNomeInput = ref('')

// Inicializa o card se já houver nome do evento
if (draft.value.evento_nome) {
  eventoNomeCard.value = true
}

// Funções para gerenciar o card do nome do evento
function criarEventoNomeCard() {
  console.log('🎯 criarEventoNomeCard chamada - valor:', eventoNomeInput.value)
  if (eventoNomeInput.value.trim()) {
    draft.value.evento_nome = eventoNomeInput.value.trim()
    eventoNomeCard.value = true
    eventoNomeInput.value = ''
    // Emite o evento para atualizar o título
    emit('evento-nome-changed', draft.value.evento_nome)

    // Foca no próximo campo (Cliente) com delay para garantir que o DOM foi atualizado
    setTimeout(() => {
      console.log('🎯 Tentando focar no cliente após criar card')
      focusField('cliente')
    }, 200)
  }
}

// Função específica para ENTER no campo Nome do Evento
function handleEventoNomeEnter() {
  if (eventoNomeInput.value.trim()) {
    criarEventoNomeCard()
  } else {
    // Se não há texto, navega para o próximo campo
    navigateToNextField('evento-nome')
  }
}

function removerEventoNomeCard() {
  eventoNomeInput.value = draft.value.evento_nome
  eventoNomeCard.value = false
  draft.value.evento_nome = ''
}

function removerClienteCard() {
  selectedClient.value = null
  draft.value.cliente_id = ''
  draft.value.cliente_nome = ''
}

function removerLocalCard() {
  selectedVenue.value = null
  draft.value.venue = {
    id: '',
    nome: '',
    endereco: '',
    maps_url: ''
  }
}

// Função para navegação por teclado
function handleKeyNavigation(event: KeyboardEvent) {
  const currentField = (event.target as HTMLElement)?.getAttribute('data-field')

  // Navegação por ENTER (só para campos que não são o nome do evento)
  if (event.key === 'Enter' && currentField !== 'evento-nome') {
    event.preventDefault()
    navigateToNextField(currentField)
  }
  // Navegação por setas
  else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    event.preventDefault()
    navigateToNextField(currentField)
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
    event.preventDefault()
    navigateToPreviousField(currentField)
  }
}

// Função para navegar para o próximo campo
function navigateToNextField(currentField: string | null) {
  const fieldOrder = ['evento-nome', 'cliente', 'local']
  const currentIndex = fieldOrder.indexOf(currentField || '')

  if (currentIndex >= 0 && currentIndex < fieldOrder.length - 1) {
    const nextField = fieldOrder[currentIndex + 1]
    focusField(nextField)
  }
}

// Função para navegar para o campo anterior
function navigateToPreviousField(currentField: string | null) {
  const fieldOrder = ['evento-nome', 'cliente', 'local']
  const currentIndex = fieldOrder.indexOf(currentField || '')

  if (currentIndex > 0) {
    const previousField = fieldOrder[currentIndex - 1]
    focusField(previousField)
  }
}

// Função para focar em um campo específico
function focusField(fieldName: string) {
  nextTick(() => {
    console.log(`🎯 Tentando focar no campo: ${fieldName}`)

    // Estratégia 1: Busca pelo data-field
    let field = document.querySelector(`[data-field="${fieldName}"]`) as HTMLElement
    console.log(`Estratégia 1 - data-field: ${field ? 'encontrado' : 'não encontrado'}`)

    // Estratégia 2: Busca por classe específica
    if (!field) {
      if (fieldName === 'cliente') {
        field = document.querySelector('.client-selector input, .client-selector button, .client-selector [role="combobox"]') as HTMLElement
      } else if (fieldName === 'local') {
        field = document.querySelector('.venue-selector input, .venue-selector button, .venue-selector [role="combobox"]') as HTMLElement
      }
      console.log(`Estratégia 2 - classe específica: ${field ? 'encontrado' : 'não encontrado'}`)
    }

    // Estratégia 3: Busca por qualquer input/select/button na área
    if (!field) {
      const containers = document.querySelectorAll('.form-group')
      for (const container of containers) {
        const label = container.querySelector('label')
        if (label?.textContent?.toLowerCase().includes(fieldName === 'cliente' ? 'cliente' : 'local')) {
          field = container.querySelector('input, select, button, [tabindex]') as HTMLElement
          break
        }
      }
      console.log(`Estratégia 3 - busca por label: ${field ? 'encontrado' : 'não encontrado'}`)
    }

    if (field) {
      console.log(`✅ Focando no elemento:`, field)
      field.focus()

      // Para campos de seleção, simula clique para abrir
      if (fieldName === 'cliente' || fieldName === 'local') {
        setTimeout(() => {
          console.log(`🖱️ Simulando clique no campo ${fieldName}`)
          field.click()
        }, 150)
      }
    } else {
      console.log(`❌ Não foi possível encontrar o campo: ${fieldName}`)
    }
  })
}

// Wizard steps configuration
const wizardSteps = computed(() => [
  {
    id: 'basic',
    title: 'Informações Básicas',
    description: 'Nome, cliente, local e data',
    icon: '📝',
    isValid: !!(draft.value.evento_nome && draft.value.cliente_nome && draft.value.venue.nome && draft.value.datas.length > 0)
  },
  {
    id: 'planning',
    title: 'Planejamento',
    description: 'Segmento e público',
    icon: '🎯',
    isValid: !!(draft.value.segmento && draft.value.publico.convidados_estimados > 0)
  },
  {
    id: 'services',
    title: 'Serviços Necessários',
    description: 'Que tipo de serviços seu evento vai precisar?',
    icon: '🎯',
    isOptional: true,
    isValid: true
  },
  {
    id: 'team',
    title: 'Catálogo & Orçamento',
    description: 'Catálogo inteligente de equipes e orçamento',
    icon: '📚',
    isValid: true
  },
  {
    id: 'final',
    title: 'Revisão & Finalização',
    description: 'Conferir dados e observações',
    icon: '✅',
    isValid: true
  }
])

// Client selection
const selectedClient = computed({
  get: () => draft.value.cliente_nome ? { id: draft.value.cliente_id, nome: draft.value.cliente_nome } : null,
  set: (client) => {
    if (client) {
      draft.value.cliente_id = client.id
      draft.value.cliente_nome = client.nome
      // Foca no próximo campo (Local) quando cliente é selecionado
      setTimeout(() => {
        focusField('local')
      }, 200)
    } else {
      draft.value.cliente_id = ''
      draft.value.cliente_nome = ''
    }
  }
})

// Venue selection
const selectedVenue = computed({
  get: () => draft.value.venue.nome ? draft.value.venue : null,
  set: (venue) => {
    if (venue) {
      draft.value.venue = venue
    } else {
      draft.value.venue = { id: '', nome: '', endereco: '', maps_url: '' }
    }
  }
})

// Templates removidos conforme solicitado

// Categorias de serviços (carregadas de /settings)
const categoriasServicos = ref<any[]>([])

// Serviços selecionados pelo usuário
const servicosSelecionados = ref<string[]>([])

// Função para adicionar/remover serviço
function toggleServico(servicoNome: string) {
  const index = servicosSelecionados.value.indexOf(servicoNome)
  if (index > -1) {
    servicosSelecionados.value.splice(index, 1)
  } else {
    servicosSelecionados.value.push(servicoNome)
  }

}


// Categorias principais para Step 2 (apenas 3): A&B, Estacionamento, Tradução
const categoriasPrincipais = computed(() => (categoriasServicos.value || []))

// Categorias de serviços filtradas pelas escolhas do Step 2 (fallback para todas se nada selecionado)
const categoriasServicosSelecionadas = computed(() => {
  const selecionadas = draft.value.servicos_principais || []
  const cats = categoriasServicos.value || []
  return selecionadas.length > 0
    ? cats.filter((c: any) => selecionadas.includes(c.id))
    : cats
})


function isCategoriaPrincipalSelecionada(id: string){
  return (draft.value.servicos_principais || []).includes(id)
}
function toggleCategoriaPrincipal(id: string){
  if (!Array.isArray(draft.value.servicos_principais)) draft.value.servicos_principais = []
  const idx = draft.value.servicos_principais.indexOf(id)
  if (idx > -1) draft.value.servicos_principais.splice(idx, 1)
  else draft.value.servicos_principais.push(id)
}


  // Sincroniza com os dados do draft
  sincronizarServicos()

// Função para sincronizar serviços selecionados com o draft
function sincronizarServicos() {
  const cats = categoriasServicos.value || []
  const byId = (id: string) => cats.find((c: any) => c.id === id)


onMounted(async () => {
  try {
    const resp = await getAdminConfig(new URLSearchParams())
    const cfg = (resp as any)?.data || resp || {}
    const segs = Array.isArray(cfg.segmentos_evento) && cfg.segmentos_evento.length ? cfg.segmentos_evento : FALLBACK_SEGMENTOS
    const cats = Array.isArray(cfg.categorias_servicos) && cfg.categorias_servicos.length ? cfg.categorias_servicos : FALLBACK_CATEGORIAS
    segmentosEvento.value = segs
    categoriasServicos.value = cats
  } catch {
    segmentosEvento.value = FALLBACK_SEGMENTOS
    categoriasServicos.value = FALLBACK_CATEGORIAS
  }
})

  // Alimentação
  const catAlim = byId('alimentacao')
  const temAlimentacao = servicosSelecionados.value.some(s =>
    (catAlim?.servicos || []).some((serv: any) => serv.nome === s)
  )
  if (!temAlimentacao) {
    draft.value.ab.servico = ''
    draft.value.ab.cardapio = ''
  }

  // Tradução
  const catTrad = byId('traducao')
  const temTraducao = servicosSelecionados.value.some(s =>
    (catTrad?.servicos || []).some((serv: any) => serv.nome === s)
  )
  if (!temTraducao) {
    draft.value.tecnica.av.traducao = false
  }

  // Estacionamento
  const catEst = byId('estacionamento')
  const temEstacionamento = servicosSelecionados.value.some(s =>
    (catEst?.servicos || []).some((serv: any) => serv.nome === s)
  )
  if (!temEstacionamento) {
    draft.value.acesso.estacionamento.valet = false
    draft.value.acesso.estacionamento.vagas = 0
  }
}

// Helper functions
function tagsToStr(arr: string[]){ return (arr||[]).join(', ') }
function strToTags(s: string){ return (s||'').split(',').map(x=>x.trim()).filter(Boolean) }


// Flags para evitar loops nos computed
let updatingSom = false
let updatingLuz = false
let updatingVideo = false

const somStr = computed({
  get: ()=> tagsToStr(draft.value.tecnica.av.som),
  set: s=> {
    if (!updatingSom) {
      updatingSom = true
      draft.value.tecnica.av.som = strToTags(s)
      nextTick(() => updatingSom = false)
    }
  }
})

const luzStr = computed({
  get: ()=> tagsToStr(draft.value.tecnica.av.luz),
  set: s=> {
    if (!updatingLuz) {
      updatingLuz = true
      draft.value.tecnica.av.luz = strToTags(s)
      nextTick(() => updatingLuz = false)
    }
  }
})

const videoStr = computed({
  get: ()=> tagsToStr(draft.value.tecnica.av.video),
  set: s=> {
    if (!updatingVideo) {
      updatingVideo = true
      draft.value.tecnica.av.video = strToTags(s)
      nextTick(() => updatingVideo = false)
    }
  }
})



// Estado para modo de configuração de equipes
const modoEquipes = ref<'automatico' | 'manual'>('automatico')

// Seed de estilo de serviço (prato/buffet) derivado do texto do cardápio/serviço
const serviceStyleSeed = computed(() => {
  const s = (draft.value.ab?.servico || draft.value.ab?.cardapio || '').toLowerCase()
  if (s.includes('buffet')) return 'buffet'
  if (s.includes('prato')) return 'prato'
  return 'prato'
})


// Sugestões automáticas de funções (cartões compactos no Step 3)
interface SugestaoFuncao { setor: string; funcao: string; quantidade: number }


const sugestoesFuncoes = computed<SugestaoFuncao[]>(() => {
  const s: SugestaoFuncao[] = []
  const convidados = Number(draft.value.publico?.convidados_estimados || 0)
  const selecionadas = draft.value.servicos_principais || []
  const turnosCount = Math.max(1, (draft.value.turnos || []).length || 1)

  function add(setor: string, funcao: string, quantidade: number) {
    const q = Math.max(0, Math.ceil(quantidade))
    if (q > 0) s.push({ setor, funcao, quantidade: q })
  }

  if (selecionadas.includes('alimentacao')) {
    add('Alimentação & Bebidas', 'Garçom', convidados / 30)
    add('Alimentação & Bebidas', 'Copeiro', convidados / 80)
  }
  if (selecionadas.includes('estacionamento')) {
    add('Estacionamento & Valet', 'Manobrista', convidados / 50)
    add('Estacionamento & Valet', 'Coordenador de Estacionamento', convidados > 0 ? Math.max(1, convidados / 300) : 0)
  }
  if (selecionadas.includes('traducao')) {
    add('Tradução & Interpretação', 'Intérprete', Math.max(1, turnosCount))
    add('Tradução & Interpretação', 'Técnico de Tradução', turnosCount > 1 ? 1 : 0)
  }
  if (selecionadas.includes('seguranca')) {
    add('Segurança & Saúde', 'Segurança', convidados / 150)
    add('Segurança & Saúde', 'Brigadista', convidados / 500)
  }
  if (selecionadas.includes('recepcao')) {
    add('Recepção & Credenciamento', 'Recepcionista', convidados / 120)
    add('Recepção & Credenciamento', 'Operador de Credenciamento', convidados / 200)
  }
  if (selecionadas.includes('limpeza')) {
    add('Limpeza & Manutenção', 'Auxiliar de Limpeza', convidados / 200)
    add('Limpeza & Manutenção', 'Supervisor de Limpeza', convidados > 300 ? 1 : 0)
  }
  if (selecionadas.includes('logistica')) {
    add('Logística & Transporte', 'Carregador', convidados / 300)
    add('Logística & Transporte', 'Motorista', convidados / 400)
    add('Logística & Transporte', 'Coordenador de Transporte', convidados > 0 ? 1 : 0)
  }

  return s
})

function getSetorIcon(setor: string): string {
  switch (setor) {
    case 'Alimentação & Bebidas': return '🍽️'
    case 'Estacionamento & Valet': return '🚗'
    case 'Tradução & Interpretação': return '🎧'
    case 'Segurança & Saúde': return '🛡️'
    case 'Recepção & Credenciamento': return '🎫'
    case 'Limpeza & Manutenção': return '🧹'
    case 'Logística & Transporte': return '🚚'
    default: return '🧩'
  }
}



// Estado editável das funções sugeridas no Step 3
const funcoesPlanejadas = ref<SugestaoFuncao[]>([])
const showAddFunc = ref(false)
const addFilterId = ref<string>('all')
const addSearch = ref<string>('')
const showFilterMenu = ref(false)


const funcoesCatalogo = computed(() => {
  const src = categoriasServicos.value || []
  const cats = addFilterId.value === 'all' ? src : src.filter((c: any) => c.id === addFilterId.value)
  const list: Array<{ setor: string; funcao: string }> = []
  cats.forEach((c: any) => {
    const seen: Record<string, boolean> = {}
    ;(c.servicos || []).forEach((serv: any) => {
      (serv.funcoes || []).forEach((fn: string) => {
        if (!seen[fn]) {
          seen[fn] = true
          list.push({ setor: c.nome, funcao: fn })
        }
      })
    })
  })
  const q = (addSearch.value || '').toLowerCase()
  return q ? list.filter(it => it.funcao.toLowerCase().includes(q) || it.setor.toLowerCase().includes(q)) : list
})

function addFuncFromCatalog(setor: string, funcao: string) {
  const idx = funcoesPlanejadas.value.findIndex(f => f.setor === setor && f.funcao === funcao)
  if (idx >= 0) {
    funcoesPlanejadas.value[idx].quantidade = (funcoesPlanejadas.value[idx].quantidade || 0) + 1
  } else {
    funcoesPlanejadas.value.push({ setor, funcao, quantidade: 1 })
  }
}


const totalFuncoes = computed(() => funcoesPlanejadas.value.reduce((acc, f) => acc + (f.quantidade || 0), 0))

function resetSugestoes() {
  funcoesPlanejadas.value = sugestoesFuncoes.value.map(x => ({ ...x }))
}

watch(modoEquipes, v => {
  if (v === 'automatico') {
    if (funcoesPlanejadas.value.length === 0) resetSugestoes()
  } else {
    // Ao entrar no modo Manual, limpar para começar do zero
    clearFuncoes()
  }
})

// Ao entrar no Step 3 (services), garantir preenchimento ou limpeza conforme o modo
watch(currentStep, () => {
  const stepObj = wizardSteps.value[currentStep.value]
  if (!stepObj) return
  if (stepObj.id === 'services') {
    if (modoEquipes.value === 'automatico') {
      if (funcoesPlanejadas.value.length === 0) resetSugestoes()
    } else {
      clearFuncoes()
    }
  } else if (stepObj.id === 'team') {
    // Debug: ver dados que alimentam o Catálogo & Orçamento
    try {
      console.log('[Wizard] Step 4 (team) data', JSON.parse(JSON.stringify({
        datas: draft.value.datas,
        turnos: draft.value.turnos,
        servicos_principais: draft.value.servicos_principais,
        funcoesPlanejadas: funcoesPlanejadas.value,
        equipes: draft.value.equipes
      })))
    } catch (e) {
      console.log('[Wizard] Step 4 (team) data', { datas: draft.value.datas, turnos: draft.value.turnos, servicos_principais: draft.value.servicos_principais, funcoesPlanejadas: funcoesPlanejadas.value, equipes: draft.value.equipes })
    }
  }
})

function incFuncao(i: number) { funcoesPlanejadas.value[i].quantidade++ }
function decFuncao(i: number) { funcoesPlanejadas.value[i].quantidade = Math.max(0, (funcoesPlanejadas.value[i].quantidade || 0) - 1) }
function removeFuncao(i: number) { funcoesPlanejadas.value.splice(i, 1) }
function clearFuncoes() { funcoesPlanejadas.value = [] }


function onWizardComplete() {
  emit('update:modelValue', deepClone(draft.value))
}

// Funções para cálculo de horas dos turnos


// Função para verificar se uma data é fim de semana
function isFimDeSemana(dateStr: string): boolean {
  const date = new Date(dateStr + 'T12:00:00') // Meio-dia para evitar problemas de timezone
  const dayOfWeek = date.getDay() // 0 = domingo, 6 = sábado
  return dayOfWeek === 0 || dayOfWeek === 6
}

// Função para calcular totais considerando dias úteis vs fins de semana
function calculateTotalByTypeWithWeekends(turnos: Turno[], datas: string[]): {
  diasUteis: number
  finsDeSemanaDias: number
  normais: number
  noturnas: number
  normaisExtras: number
  noturnaExtras: number
  totalReais: number
  totalCalculadoUteis: number
  totalCalculadoFDS: number
  totalCalculadoGeral: number
} {
  // Separa dias úteis de fins de semana
  const diasUteis = datas.filter(data => !isFimDeSemana(data))
  const finsDeSemanaDatas = datas.filter(data => isFimDeSemana(data))

  // Calcula para dias úteis
  const totalUteis = turnos.reduce((acc, turno) => {
    const analysis = analyzeTurnoHours(turno.inicio, turno.fim, false)
    return {
      normais: acc.normais + analysis.normais,
      noturnas: acc.noturnas + analysis.noturnas,
      normaisExtras: acc.normaisExtras + analysis.normaisExtras,
      noturnaExtras: acc.noturnaExtras + analysis.noturnaExtras,
      totalReais: acc.totalReais + analysis.totalReais,
      totalCalculado: acc.totalCalculado + analysis.totalCalculado
    }
  }, { normais: 0, noturnas: 0, normaisExtras: 0, noturnaExtras: 0, totalReais: 0, totalCalculado: 0 })

  // Calcula para fins de semana
  const totalFDS = turnos.reduce((acc, turno) => {
    const analysis = analyzeTurnoHours(turno.inicio, turno.fim, true)
    return {
      totalCalculado: acc.totalCalculado + analysis.totalCalculadoFDS
    }
  }, { totalCalculado: 0 })

  return {
    diasUteis: diasUteis.length,
    finsDeSemanaDias: finsDeSemanaDatas.length,
    normais: totalUteis.normais,
    noturnas: totalUteis.noturnas,
    normaisExtras: totalUteis.normaisExtras,
    noturnaExtras: totalUteis.noturnaExtras,
    totalReais: totalUteis.totalReais,
    totalCalculadoUteis: totalUteis.totalCalculado * diasUteis.length,
    totalCalculadoFDS: totalFDS.totalCalculado * finsDeSemanaDatas.length,
    totalCalculadoGeral: (totalUteis.totalCalculado * diasUteis.length) + (totalFDS.totalCalculado * finsDeSemanaDatas.length)
  }
}

// Função legacy para compatibilidade
function calculateTotalByType(turnos: Turno[]): {
  normais: number
  noturnas: number
  normaisExtras: number
  noturnaExtras: number
  totalReais: number
  totalCalculado: number
} {
  return turnos.reduce((acc, turno) => {
    const analysis = analyzeTurnoHours(turno.inicio, turno.fim)
    return {
      normais: acc.normais + analysis.normais,
      noturnas: acc.noturnas + analysis.noturnas,
      normaisExtras: acc.normaisExtras + analysis.normaisExtras,
      noturnaExtras: acc.noturnaExtras + analysis.noturnaExtras,
      totalReais: acc.totalReais + analysis.totalReais,
      totalCalculado: acc.totalCalculado + analysis.totalCalculado
    }
  }, { normais: 0, noturnas: 0, normaisExtras: 0, noturnaExtras: 0, totalReais: 0, totalCalculado: 0 })
}

function hasExtraHours(turnos: Turno[]): boolean {
  return turnos.some(turno => {
    const analysis = analyzeTurnoHours(turno.inicio, turno.fim)
    return analysis.normaisExtras > 0 || analysis.noturnaExtras > 0
  })
}


// Função para analisar horas normais, noturnas e extras de um turno
function analyzeTurnoHours(inicio: string, fim: string, isFimDeSemana: boolean = false): {
  normais: number
  noturnas: number
  normaisExtras: number
  noturnaExtras: number
  totalReais: number
  totalCalculado: number
  totalCalculadoFDS: number
} {
  const [startH, startM] = inicio.split(':').map(Number)
  const [endH, endM] = fim.split(':').map(Number)

  let startMinutes = startH * 60 + startM
  let endMinutes = endH * 60 + endM

  // Se fim é menor que início, assume que é no dia seguinte
  if (endMinutes < startMinutes) {
    endMinutes += 24 * 60
  }

  const totalMinutes = endMinutes - startMinutes
  const totalHours = totalMinutes / 60

  // CORREÇÃO: Lógica correta do mercado de eventos
  // 1. Período noturno: 22:00-06:00 (não 05:00) com fator 1.2 (20% adicional)
  // 2. Horas extras: acima de 8h por turno, alocadas no final (tail)
  // 3. Para turnos longos (>8h), dividir automaticamente em turnos de 8h

  let normais = 0
  let noturnas = 0
  let normaisExtras = 0
  let noturnaExtras = 0

  // Se o turno é maior que 8h, precisa ser dividido
  if (totalHours > 8) {
    // Primeira parte: 8h normais
    for (let h = 0; h < 8; h++) {
      const currentHour = (startH + h) % 24
      const isNight = currentHour >= 22 || currentHour < 6

      if (isNight) {
        noturnas += 1
      } else {
        normais += 1
      }
    }

    // Segunda parte: horas extras (tail)
    for (let h = 8; h < totalHours; h++) {
      const currentHour = (startH + h) % 24
      const isNight = currentHour >= 22 || currentHour < 6

      if (isNight) {
        noturnaExtras += 1
      } else {
        normaisExtras += 1
      }
    }
  } else {
    // Turno normal (≤8h) - todas as horas são normais
    for (let h = 0; h < totalHours; h++) {
      const currentHour = (startH + h) % 24
      const isNight = currentHour >= 22 || currentHour < 6

      if (isNight) {
        noturnas += 1
      } else {
        normais += 1
      }
    }
  }

  // Fatores CLT corretos:
  // - Noturno: hora noturna = 52min30s, então 60/52.5 = 1.142857...
  // - Fim de semana: 100% adicional (dobra o valor)
  const fatorNoturno = 60 / 52.5 // 1.142857... (CLT correto)
  const fatorFDS = 2.0 // 100% adicional

  // Calcula total para pagamento (dias úteis)
  const totalCalculado = normais + (noturnas * fatorNoturno) + normaisExtras + (noturnaExtras * fatorNoturno)

  // Calcula total para fins de semana (dobra tudo)
  const totalCalculadoFDS = isFimDeSemana ? totalCalculado * fatorFDS : totalCalculado

  return {
    normais: Math.round(normais * 100) / 100,
    noturnas: Math.round(noturnas * 100) / 100,
    normaisExtras: Math.round(normaisExtras * 100) / 100,
    noturnaExtras: Math.round(noturnaExtras * 100) / 100,
    totalReais: Math.round(totalHours * 100) / 100,
    totalCalculado: Math.round(totalCalculado * 100) / 100,
    totalCalculadoFDS: Math.round(totalCalculadoFDS * 100) / 100
  }
}

// Função para converter hora em formato HH:MM (suporta sufixo "(+1d)") para minutos absolutos
function horaParaMinutos(hora: string): number {
  const plus1d = /\(\+1d\)/.test(hora)
  const core = hora.replace(/\(\+1d\)/, '').trim()
  const parts = core.split(':')
  const h = parseInt(parts[0] || '0', 10) || 0
  const m = parseInt((parts[1] || '0').replace(/[^0-9].*$/, ''), 10) || 0
  let total = h * 60 + m
  if (plus1d) total += 24 * 60
  return total
}

// Função para converter minutos absolutos para HH:MM (com sufixo "+1d" quando ultrapassa 24h)
function minutosParaHora(minutos: number): string {
  const plus = minutos >= 1440 ? ' (+1d)' : ''
  const m = ((minutos % (24*60)) + (24*60)) % (24*60)
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}${plus}`
}

// Função para gerar turnos otimizados baseado na estratégia
function gerarTurnosOtimizados(inicioStr: string, fimStr: string, estrategia: boolean, escalaHoras: number): Turno[] {
  console.log(`🔧 Gerando turnos: ${inicioStr} → ${fimStr} (${estrategia ? 'Minimizar Custos' : 'Minimizar Funcionários'}) | Escala: ${escalaHoras}h`)

  const inicioMinutos = horaParaMinutos(inicioStr)
  let fimMinutos = horaParaMinutos(fimStr)

  // Se fim < início, é do dia seguinte
  if (fimMinutos <= inicioMinutos) {
    fimMinutos += 24 * 60
  }

  const duracaoTotal = fimMinutos - inicioMinutos
  const duracaoHoras = duracaoTotal / 60

  // Para períodos ≥8h, a pausa JÁ está incluída no período informado
  const temPausaObrigatoria = duracaoHoras >= 8
  const duracaoTrabalho = temPausaObrigatoria ? duracaoTotal - 60 : duracaoTotal

  console.log(`📊 Período: ${duracaoHoras}h corridas`)
  if (temPausaObrigatoria) {
    console.log(`⏰ Pausa incluída: ${duracaoHoras}h corridas = ${duracaoTrabalho/60}h trabalho + 1h pausa`)
  }

  if (estrategia) {
    // MINIMIZAR CUSTOS (Cobertura contínua, SEM hora extra)
    const escalaMin = Math.max(4, Math.round(escalaHoras)) * 60

    // Se o TRABALHO (sem pausa) cabe inteiro na escala, usar turno único
    if (duracaoTrabalho <= escalaMin) {
      // Nome simples baseado na escala
      let nome = `Turno ${escalaHoras}h`

      if (temPausaObrigatoria) {
        nome += ' - ⏰ 1h pausa'
      }

      // Para turno único com pausa, usar o período total (incluindo pausa)
      // Para turno único sem pausa, usar apenas o trabalho
      const fimTurno = temPausaObrigatoria ? fimMinutos : inicioMinutos + duracaoTrabalho

      const unico: Turno = {
        nome,
        inicio: minutosParaHora(inicioMinutos),
        fim: minutosParaHora(fimTurno)
      }
      console.log(`💰 Turno único: ${temPausaObrigatoria ? duracaoHoras + 'h total (com pausa)' : duracaoTrabalho/60 + 'h trabalho'} -> ${unico.inicio} - ${unico.fim}`)
      return [unico]
    }

    // Gera turnos sequenciais do tamanho da escala
    const turnos: Turno[] = []
    let cur = inicioMinutos
    let idx = 1
    let trabalhoRestante = duracaoTrabalho

    while (trabalhoRestante > 0 && cur < fimMinutos) {
      // Tamanho do próximo turno: escala completa ou o que sobrou
      const turnoMinutos = Math.min(escalaMin, trabalhoRestante)
      const fimTurno = cur + turnoMinutos

      const startHour = Math.floor((cur % (24*60)) / 60)
      let nome = 'Turno'
      if (startHour >= 6 && startHour < 12) nome = 'Turno Manhã'
      else if (startHour >= 12 && startHour < 18) nome = 'Turno Tarde'
      else if (startHour >= 18 && startHour < 24) nome = 'Turno Noite'
      else nome = 'Turno Madrugada'

      // Se há múltiplos turnos, adicionar número
      const numTurnosEstimado = Math.ceil(duracaoTrabalho / escalaMin)
      if (numTurnosEstimado > 1) {
        nome = `${nome} ${idx}`
      }

      turnos.push({
        nome,
        inicio: minutosParaHora(cur),
        fim: minutosParaHora(fimTurno)
      })

      console.log(`🔧 Turno ${idx}: ${minutosParaHora(cur)}-${minutosParaHora(fimTurno)} (${turnoMinutos/60}h)`)

      cur = fimTurno
      trabalhoRestante -= turnoMinutos
      idx++

      // Adicionar pausa entre turnos se necessário (não no último)
      if (trabalhoRestante > 0 && temPausaObrigatoria && turnos.length === 1) {
        cur += 60 // adiciona 1h de pausa após o primeiro turno
        console.log(`⏰ Adicionando 1h de pausa: ${minutosParaHora(cur-60)}-${minutosParaHora(cur)}`)
      }
    }

    console.log(`💰 Minimizar Custos (ancorado 06:00): ${turnos.length} turnos gerados`)
    return turnos

  } else {
    // MINIMIZAR FUNCIONÁRIOS: Menos turnos, aceita extras
    console.log(`👥 Minimizar Funcionários: gerando menos turnos`)

    const meioMinutos = inicioMinutos + Math.round(duracaoTotal / 2)
    return [
      { nome: 'Turno 1', inicio: inicioStr, fim: minutosParaHora(meioMinutos) },
      { nome: 'Turno 2', inicio: minutosParaHora(meioMinutos), fim: fimStr }
    ]
  }
}

// Função chamada quando turnos são detectados automaticamente
function onTurnosDetected(turnos: Turno[]) {
  draft.value.turnos = turnos
  draft.value.turnos_detectados = true
  // Inicializa a estratégia padrão como "Minimizar Custos" (true)
  if (draft.value.estrategia_turnos === undefined) {
    draft.value.estrategia_turnos = true
  }
}

// Flag para evitar loops de recálculo
let isRecalculating = false

// Função para recalcular turnos baseado na estratégia
function recalcularTurnos() {
  if (isRecalculating || draft.value.datas.length === 0 || draft.value.turnos.length === 0) return

  isRecalculating = true
  suppressEmit = true

  const turnos = draft.value.turnos
  const inicioEvento = turnos[0]?.inicio || '06:00'
  const fimEvento = turnos[turnos.length - 1]?.fim || '22:00'

  const novosTurnos = gerarTurnosOtimizados(inicioEvento, fimEvento, draft.value.estrategia_turnos, escalaHoras.value)
  draft.value.turnos = novosTurnos

  setTimeout(() => {
    isRecalculating = false
    suppressEmit = false
  }, 0)
}

// Alterna estratégia e recalcula (com supressão para evitar loops)
function onToggleEstrategia() {
  if (isRecalculating) return
  suppressEmit = true
  draft.value.estrategia_turnos = !draft.value.estrategia_turnos
  recalcularTurnos()
  nextTick(() => { suppressEmit = false })
}
// Altera escala a partir do DateRangePicker/TurnosDetectados e recalcula
function onAlterarEscala(horas: number){
  escalaHoras.value = Math.max(4, horas)
  recalcularTurnos()
}

</script>

<template>
  <FormWizard
    v-model="currentStep"
    :steps="wizardSteps"
    @complete="onWizardComplete"
  >
    <template #default="{ step }">
      <!-- Step 1: Basic Information -->
      <div v-if="step.id === 'basic'" class="space-y-6">
        <!-- Basic Form Fields -->
        <div class="space-y-6">
          <!-- Informações do Evento -->
          <div class="card p-6 mb-6">
            <h3 class="text-lg font-semibold text-gray-900 mb-4">Informações do Evento</h3>
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="form-group">
              <label class="form-label form-label-required">Nome do Evento</label>
              <input
                v-if="!eventoNomeCard"
                v-model="eventoNomeInput"

                @keydown.enter.prevent="handleEventoNomeEnter"
                @keydown.tab.prevent="criarEventoNomeCard"
                @keydown="handleKeyNavigation"
                data-field="evento-nome"
                class="input"
                placeholder="Ex: Google Cloud Summit 2025"
                required
              />
              <!-- Card do Nome do Evento -->
              <div v-else class="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div class="flex-1">
                  <div class="font-medium text-blue-900">{{ draft.evento_nome }}</div>
                  <div class="text-xs text-blue-600">Nome do evento</div>
                </div>
                <button
                  type="button"
                  @click="removerEventoNomeCard"
                  class="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100"
                  title="Editar nome do evento"
                  tabindex="-1"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label form-label-required">Cliente</label>
              <ClientSelector
                v-if="!selectedClient"
                v-model="selectedClient"
                @keydown="handleKeyNavigation"
                data-field="cliente"
                class="client-selector"
                required
              />
              <!-- Card do Cliente -->
              <div v-else class="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div class="flex-1">
                  <div class="font-medium text-green-900">{{ draft.cliente_nome }}</div>
                  <div class="text-xs text-green-600">Cliente selecionado</div>
                </div>
                <button
                  type="button"
                  @click="removerClienteCard"
                  class="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-100"
                  title="Alterar cliente"
                  tabindex="-1"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label form-label-required">Local do Evento</label>
              <VenueSelector
                v-if="!selectedVenue"
                v-model="selectedVenue"
                :client-id="draft.cliente_id"
                @keydown="handleKeyNavigation"
                data-field="local"
                class="venue-selector"
                required
              />
              <!-- Card do Local -->
              <div v-else class="flex items-center gap-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <div class="flex-1">
                  <div class="font-medium text-purple-900">{{ draft.venue.nome }}</div>
                  <div class="text-xs text-purple-600">Local selecionado</div>
                </div>
                <button
                  type="button"
                  @click="removerLocalCard"
                  class="text-purple-600 hover:text-purple-800 p-1 rounded hover:bg-purple-100"
                  title="Alterar local"
                  tabindex="-1"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            </div>
          </div>

          <!-- Data do Evento com Entrada Inteligente -->
          <DateRangePicker
            v-model="draft.datas"
            :current-turnos="draft.turnos"
            :estrategia-turnos="draft.estrategia_turnos"
            @turnos-detected="onTurnosDetected"
            @recalcular-turnos="onToggleEstrategia"
            @alterar-escala="onAlterarEscala"
            @resumo-operacao="onResumoOperacao"
            @clear-all="draft.turnos = []; draft.turnos_detectados = false"
          />


        </div>
      </div>

      <!-- Step 2: Planning -->
      <div v-if="step.id === 'planning'" class="space-y-6">
        <!-- Grid de 3 colunas: 20% + 40% + 40% -->
        <div class="grid grid-cols-5 gap-6">
          <!-- Coluna 1: Número de Convidados (20% = 1/5) -->
          <div class="col-span-1">
            <div class="card p-6">
              <h3 class="text-lg font-semibold text-gray-900 mb-4">Convidados</h3>

              <!-- Display atual -->
              <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <div class="flex flex-col items-center gap-2">
                  <div class="text-2xl">👥</div>
                  <div class="text-center">
                    <div class="text-xl font-bold text-blue-900">
                      {{ draft.publico.convidados_estimados || 0 }}
                    </div>
                    <div class="text-xs text-blue-700">esperados</div>
                  </div>
                </div>
              </div>

              <!-- Input -->
              <div class="space-y-3">
                <input
                  v-model.number="draft.publico.convidados_estimados"
                  type="number"
                  min="1"
                  max="10000"
                  class="input text-center font-semibold"
                  placeholder="150"
                />

                <!-- Botões rápidos -->
                <div class="grid grid-cols-2 gap-1">
                  <button
                    v-for="size in [50, 100, 200, 500]"
                    :key="size"
                    type="button"
                    @click="draft.publico.convidados_estimados = size"
                    class="btn-secondary text-xs py-1"
                    :class="{ 'btn-primary': draft.publico.convidados_estimados === size }"
                  >
                    {{ size }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Coluna 2: Segmento do Evento (40% = 2/5) -->
          <div class="col-span-2">
            <div class="card p-6">
              <h3 class="text-lg font-semibold text-gray-900 mb-4">Segmento do Evento</h3>
              <p class="text-sm text-gray-600 mb-4">Em que tipo de operação será realizado?</p>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  v-for="segmento in segmentosEvento"
                  :key="segmento.id"
                  type="button"
                  @click="draft.segmento = segmento.id"
                  class="relative p-4 text-left border-2 rounded-lg transition-all duration-200 hover:shadow-md"
                  :class="{
                    'border-blue-500 bg-blue-50 shadow-md': draft.segmento === segmento.id,
                    'border-gray-200 hover:border-gray-300': draft.segmento !== segmento.id
                  }"
                >
                  <!-- Indicador de seleção -->
                  <div
                    v-if="draft.segmento === segmento.id"
                    class="absolute -top-2 -right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center shadow-md"
                  >
                    <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                  </div>

                  <div class="flex items-start gap-3">
                    <div class="text-2xl flex-shrink-0">{{ segmento.icon }}</div>
                    <div class="flex-1 min-w-0">
                      <div class="font-medium text-gray-900 text-sm leading-tight">{{ segmento.nome }}</div>
                      <div class="text-xs text-gray-600 mt-1 line-clamp-2">{{ segmento.descricao }}</div>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>

          <!-- Coluna 3: Serviços do Evento (40% = 2/5) -->
          <div class="col-span-2">
            <div class="card p-6">
              <h3 class="text-lg font-semibold text-gray-900 mb-4">Serviços Necessários para Planejamento</h3>
              <p class="text-gray-600 mb-4">Selecione os serviços essenciais:</p>

              <div class="space-y-3">
                <div
                  v-for="cat in categoriasPrincipais"
                  :key="cat.id"
                  class="border-2 rounded-lg p-3 cursor-pointer transition-all duration-200"
                  :class="{
                    'border-blue-500 bg-blue-50': isCategoriaPrincipalSelecionada(cat.id),
                    'border-gray-200 hover:border-gray-300': !isCategoriaPrincipalSelecionada(cat.id)
                  }"
                  @click="toggleCategoriaPrincipal(cat.id)"
                >
                  <div class="flex items-center gap-3">
                    <span class="text-xl">{{ cat.icon }}</span>
                    <div class="flex-1">
                      <h4 class="font-medium text-gray-900 text-sm">{{ cat.nome }}</h4>
                      <p class="text-xs text-gray-600">{{ cat.descricao }}</p>
                    </div>
                    <div v-if="isCategoriaPrincipalSelecionada(cat.id)" class="text-blue-500 text-lg">
                      ✓
                    </div>
                  </div>
                </div>
              </div>

              <!-- Resumo selecionado -->
              <div v-if="(draft.servicos_principais || []).length > 0" class="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div class="text-xs text-blue-800">
                  <strong>{{ (draft.servicos_principais || []).length }} selecionados</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Step venue removido - local agora está em Informações Básicas -->
      <div v-if="false" class="space-y-6">
        <!-- Venue Information -->
        <div class="card p-4">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Local do Evento</h3>
          <div class="form-group">
            <label class="form-label form-label-required">Selecionar Local</label>
            <VenueSelector v-model="selectedVenue" required />
          </div>

          <!-- Manual venue fields (if needed) -->
          <div v-if="!selectedVenue" class="mt-4 p-4 border border-dashed border-gray-300 rounded-lg">
            <h4 class="text-sm font-medium text-gray-700 mb-3">Ou preencha manualmente:</h4>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="form-group">
                <label class="form-label">Nome do Local</label>
                <input v-model="draft.venue.nome" class="input" placeholder="Ex: Centro de Convenções Anhembi" />
              </div>
              <div class="form-group">
                <label class="form-label">ID do Venue</label>
                <input v-model="draft.venue.id" class="input" placeholder="venue_001" />
              </div>
              <div class="form-group sm:col-span-2">
                <label class="form-label">Endereço Completo</label>
                <input v-model="draft.venue.endereco" class="input" placeholder="Rua, número, bairro, cidade" />
              </div>
              <div class="form-group sm:col-span-2">
                <label class="form-label">Link do Google Maps</label>
                <input v-model="draft.venue.maps_url" class="input" placeholder="https://maps.google.com/..." />
              </div>
            </div>
          </div>
        </div>



        <!-- Access Control -->

        <!-- Serviços Principais (apenas categorias principais) -->
        <div class="card p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Serviços Principais</h3>
          <div class="space-y-4">
            <p class="text-sm text-gray-600">Selecione as categorias principais de serviços necessárias para o evento.</p>

            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <button
                v-for="cat in categoriasPrincipais"
                :key="cat.id"
                type="button"
                @click="toggleCategoriaPrincipal(cat.id)"
                class="relative p-4 text-left border-2 rounded-lg transition-all duration-200 hover:shadow-md"
                :class="{
                  'border-blue-500 bg-blue-50 shadow-md': isCategoriaPrincipalSelecionada(cat.id),
                  'border-gray-200 hover:border-gray-300': !isCategoriaPrincipalSelecionada(cat.id)
                }"
              >
                <!-- Indicador de seleção -->
                <div
                  v-if="isCategoriaPrincipalSelecionada(cat.id)"
                  class="absolute -top-2 -right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center shadow-md"
                >
                  <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                </div>

                <div class="flex items-start gap-3">
                  <div class="text-2xl flex-shrink-0">{{ cat.icon }}</div>
                  <div class="flex-1 min-w-0">
                    <div class="font-medium text-gray-900 text-sm leading-tight">{{ cat.nome }}</div>
                    <div class="text-xs text-gray-600 mt-1 line-clamp-2">{{ cat.descricao }}</div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>

        <div class="card p-4">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Controle de Acesso</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-3">
              <label class="flex items-center gap-2">
                <input type="checkbox" v-model="draft.acesso.credenciamento.ativo" class="rounded" />
                <span class="text-sm">Credenciamento ativo</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" v-model="draft.acesso.credenciamento.impressao_cracha" class="rounded" />
                <span class="text-sm">Impressão de crachá</span>
              </label>
            </div>
            <div class="space-y-3">
              <div class="form-group">
                <label class="form-label">Vagas de Estacionamento</label>
                <input v-model.number="draft.acesso.estacionamento.vagas" type="number" min="0" class="input" />
              </div>
              <label class="flex items-center gap-2">
                <input type="checkbox" v-model="draft.acesso.estacionamento.valet" class="rounded" />
                <span class="text-sm">Serviço de valet</span>
              </label>

            </div>
          </div>
        </div>
      </div>

      <!-- Step 3: Services (Serviços Genéricos) -->
      <div v-if="step.id === 'services'" class="space-y-6">

        <!-- Sidebar Adicionar Função (global no Step 3) -->
        <div v-if="showAddFunc" class="fixed inset-0 z-50">
          <transition enter-active-class="transition-opacity duration-300" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition-opacity duration-200" leave-from-class="opacity-100" leave-to-class="opacity-0">
            <div class="absolute inset-0 bg-black/40" @click="showFilterMenu = false; showAddFunc = false"></div>
          </transition>
          <transition appear enter-active-class="transition-all ease-out duration-500" enter-from-class="translate-x-full opacity-0 scale-95" enter-to-class="translate-x-0 opacity-100 scale-100" leave-active-class="transition-all ease-in duration-350" leave-from-class="translate-x-0 opacity-100 scale-100" leave-to-class="translate-x-full opacity-0 scale-95">
            <div class="absolute right-0 top-0 h-full w-full sm:w-[420px] bg-white shadow-2xl rounded-l-lg transform-gpu transition-all" style="will-change: transform, opacity;">
              <div class="p-4 border-b flex items-center justify-between">
                <h4 class="font-semibold text-gray-900">Adicionar função</h4>
                <button type="button" class="text-gray-500 hover:text-gray-700 p-1 rounded hover:bg-gray-100" @click="showFilterMenu = false; showAddFunc = false" title="Fechar">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>
              <div class="p-4 space-y-4 h-[calc(100%-56px)] overflow-y-auto">
                <div class="relative">
                  <input v-model="addSearch" class="input w-full pr-10" placeholder="Buscar função ou setor..." />
                  <button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 p-1 rounded hover:bg-gray-100" @click="showFilterMenu = !showFilterMenu" title="Filtros">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h18M6 8h12M9 12h6M11 16h2"/></svg>
                  </button>

                  <div v-if="showFilterMenu" class="absolute right-0 mt-2 w-64 max-h-80 overflow-auto bg-white border border-gray-200 rounded-md shadow-lg z-10">
                    <div class="py-1">
                      <button type="button" class="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
                              :class="addFilterId === 'all' ? 'text-blue-600 font-medium' : 'text-gray-700'"
                              @click="addFilterId = 'all'; showFilterMenu = false">
                        Todos
                        <span v-if="addFilterId === 'all'">✓</span>
                      </button>
                      <div class="border-t border-gray-100 my-1"></div>
                      <button v-for="c in categoriasServicos" :key="c.id" type="button"
                              class="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
                              :class="addFilterId === c.id ? 'text-blue-600 font-medium' : 'text-gray-700'"
                              @click="addFilterId = c.id; showFilterMenu = false">
                        {{ c.nome }}
                        <span v-if="addFilterId === c.id">✓</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div class="grid grid-cols-1 gap-2">
                  <div
                    v-for="item in funcoesCatalogo"
                    :key="item.setor + '|' + item.funcao"
                    class="border rounded p-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer"
                    @click="addFuncFromCatalog(item.setor, item.funcao)"
                  >
                    <div class="flex items-center gap-3 min-w-0">
                      <div class="text-xl w-8 text-center">{{ getSetorIcon(item.setor) }}</div>
                      <div class="min-w-0">
                        <div class="text-sm font-medium text-gray-900">{{ item.funcao }}</div>
                        <div class="text-xs text-gray-500">{{ item.setor }}</div>
                      </div>
                    </div>
                    <button type="button" class="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100" @click.stop="addFuncFromCatalog(item.setor, item.funcao)" title="Adicionar">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v14M5 12h14"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </transition>
        </div>

        <div class="grid gap-3" style="grid-template-columns: 35% 65%;">
          <div>

        <!-- Setores & Funções (modo de configuração) -->
        <div class="card p-4 bg-gradient-to-r from-white-50 to-indigo-50 border-gray-200">
          <h3 class="text-lg font-semibold text-gray-900 mb-3">Setores & Funções</h3>
          <p class="text-sm text-blue-700 mb-4">Escolha como configurar as equipes de mão de obra para seu evento:</p>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <!-- Modo Automático -->
            <div
              @click="modoEquipes = 'automatico'"
              :class="[
                'bg-white p-3 rounded-lg border-2 cursor-pointer transition-colors',
                modoEquipes === 'automatico' ? 'border-green-400 bg-green-50' : 'border-green-200 hover:border-green-300'
              ]"
            >
              <div class="flex items-center gap-3 mb-2">
                <span class="text-2xl">🤖</span>
                <div>
                  <h4 class="font-semibold text-green-900">Modo Automático</h4>
                  <p class="text-xs text-green-700">Sugestões inteligentes baseadas no evento</p>
                </div>
              </div>
              <!-- <div class="text-[11px] text-green-700 space-y-0.5">
                <div>✅ Analisa convidados, serviços e horários</div>
                <div>✅ Sugere equipes otimizadas</div>
                <div>✅ Ajuste no carrinho depois</div>
              </div> -->
            </div>

            <!-- Modo Manual -->
            <div
              @click="modoEquipes = 'manual'"
              :class="[
                'bg-white p-3 rounded-lg border-2 cursor-pointer transition-colors',
                modoEquipes === 'manual' ? 'border-blue-400 bg-blue-50' : 'border-blue-200 hover:border-blue-300'
              ]"
            >
              <div class="flex items-center gap-3 mb-2">
                <span class="text-2xl">✋</span>
                <div>
                  <h4 class="font-semibold text-blue-900">Modo Manual</h4>
                  <p class="text-xs text-blue-700">Configure cada função individualmente</p>
                </div>
              </div>
              <!-- <div class="text-[11px] text-blue-700 space-y-0.5">
                <div>✅ Controle total das funções</div>
                <div>✅ Adicione funções específicas</div>
                <div>✅ Ajuste quantidades manualmente</div>
              </div> -->
        </div>
        </div>
        </div>
        </div>
        <div>

        <!-- Sugestões Automáticas (compacto) -->
        <div v-if="modoEquipes === 'automatico'" class="card p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-3">Sugestões de Funções</h3>
          <p class="text-sm text-gray-600 mb-4">Baseadas em convidados ({{ draft.publico.convidados_estimados || 0 }}), segmento e serviços selecionados.</p>

          <div class="flex items-center justify-between mb-4">
            <div class="text-sm text-gray-600" v-if="funcoesPlanejadas.length">Total de funções: {{ totalFuncoes }}</div>
            <div class="flex gap-2">
              <button type="button" class="px-3 py-1.5 text-sm rounded border border-blue-300 text-blue-700 hover:bg-blue-50" @click="showAddFunc = !showAddFunc">+ Adicionar função</button>
              <button type="button" class="px-3 py-1.5 text-sm rounded border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50" @click="clearFuncoes" :disabled="funcoesPlanejadas.length === 0">Remover todas</button>
            </div>
          </div>


          <div v-if="funcoesPlanejadas.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div
              v-for="(s, i) in funcoesPlanejadas"
              :key="s.setor + '|' + s.funcao"
              class="border rounded-lg p-4 bg-white hover:shadow-sm transition relative group"
            >
              <button
                type="button"
                class="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-100"
                title="Remover função"
                tabindex="-1"
                @click="removeFuncao(i)"
                aria-label="Remover função"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 11v6M14 11v6" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m-7 0a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1m-9 0H4m12 0h2" />
                </svg>
              </button>

              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3 flex-1 min-w-0">
                  <div class="text-2xl w-8 h-8 flex items-center justify-center">{{ getSetorIcon(s.setor) }}</div>
                  <div class="min-w-0">
                    <div class="text-sm font-semibold text-gray-900">{{ s.funcao }}</div>
                    <div class="text-xs text-gray-500">{{ s.setor }}</div>
                  </div>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <button type="button" class="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100" title="Diminuir" tabindex="-1" @click="decFuncao(i)" aria-label="Diminuir quantidade">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14"></path>
                    </svg>
                  </button>
                  <div class="text-lg font-bold text-blue-600 w-8 text-center">{{ s.quantidade }}</div>
                  <button type="button" class="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100" title="Aumentar" tabindex="-1" @click="incFuncao(i)" aria-label="Aumentar quantidade">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v14M5 12h14"></path>
                    </svg>
                  </button>
                </div>

              </div>
            </div>
          </div>
          <div v-else class="p-4 bg-yellow-50 border border-yellow-200 rounded">
            <div class="text-sm text-yellow-800">Selecione serviços no Step 2 e informe o número de convidados para ver sugestões aqui.</div>
            <div class="mt-2">
              <button type="button" class="px-3 py-1.5 text-sm rounded border border-blue-300 text-blue-700 hover:bg-blue-50" @click="resetSugestoes">Preencher com sugestões</button>
            </div>
          </div>
        </div>

        <!-- Modo Manual: mesmo layout do automático, adicionando pelo sidebar -->
        <div v-if="modoEquipes === 'manual'" class="card p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-3">Funções</h3>
          <p class="text-sm text-gray-600 mb-4">Adicione funções manualmente pelo botão ao lado e ajuste as quantidades.</p>

          <div class="flex items-center justify-between mb-4">
            <div class="text-sm text-gray-600" v-if="funcoesPlanejadas.length">Total de funções: {{ totalFuncoes }}</div>
            <div class="flex gap-2">
              <button type="button" class="px-3 py-1.5 text-sm rounded border border-blue-300 text-blue-700 hover:bg-blue-50" @click="showAddFunc = !showAddFunc">+ Adicionar função</button>
              <button type="button" class="px-3 py-1.5 text-sm rounded border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50" @click="clearFuncoes" :disabled="funcoesPlanejadas.length === 0">Remover todas</button>
            </div>
          </div>

          <div v-if="funcoesPlanejadas.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div
              v-for="(s, i) in funcoesPlanejadas"
              :key="s.setor + '|' + s.funcao"
              class="border rounded-lg p-4 bg-white hover:shadow-sm transition relative group"
            >
              <button
                type="button"
                class="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-100"
                title="Remover função"
                tabindex="-1"
                @click="removeFuncao(i)"
                aria-label="Remover função"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 11v6M14 11v6" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m-7 0a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1m-9 0H4m12 0h2" />
                </svg>
              </button>

              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3 flex-1 min-w-0">
                  <div class="text-2xl w-8 h-8 flex items-center justify-center">{{ getSetorIcon(s.setor) }}</div>
                  <div class="min-w-0">
                    <div class="text-sm font-semibold text-gray-900">{{ s.funcao }}</div>
                    <div class="text-xs text-gray-500">{{ s.setor }}</div>
                  </div>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <button type="button" class="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100" title="Diminuir" tabindex="-1" @click="decFuncao(i)" aria-label="Diminuir quantidade">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14"></path>
                    </svg>
                  </button>
                  <div class="text-lg font-bold text-blue-600 w-8 text-center">{{ s.quantidade }}</div>
                  <button type="button" class="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100" title="Aumentar" tabindex="-1" @click="incFuncao(i)" aria-label="Aumentar quantidade">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v14M5 12h14"></path>
                    </svg>
                  </button>
                </div>

              </div>
            </div>
          </div>
          <div v-else class="p-4 bg-blue-50 border border-blue-200 rounded">
            <div class="text-sm text-blue-800">Nenhuma função adicionada ainda. Use “+ Adicionar função” para incluir.</div>
          </div>
        </div>





        <!-- Seção Técnica - Melhorada -->
        <!-- Palco & Cenário -->
        <div v-if="false" class="card p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-6">Palco & Cenário</h3>

          <!-- Dimensões do Palco -->
          <div class="card grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div class="form-group">
              <label class="form-label">📏 Largura (metros)</label>
              <div class="relative">
                <input
                  v-model.number="draft.tecnica.palco.largura_m"
                  type="number"
                  min="0"
                  step="0.5"
                  class="input pr-8"
                  placeholder="8.0"
                />
                <span class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">m</span>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">📐 Profundidade (metros)</label>
              <div class="relative">
                <input
                  v-model.number="draft.tecnica.palco.profundidade_m"
                  type="number"
                  min="0"
                  step="0.5"
                  class="input pr-8"
                  placeholder="6.0"
                />
                <span class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">m</span>
              </div>
            </div>
            <div class="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div class="text-sm text-blue-800 font-medium mb-1">📊 Área Total</div>
              <div class="text-2xl font-bold text-blue-900">
                {{ ((draft.tecnica.palco.largura_m || 0) * (draft.tecnica.palco.profundidade_m || 0)).toFixed(1) }}m²
              </div>
              <div class="text-xs text-blue-600 mt-1">
                {{ draft.tecnica.palco.largura_m || 0 }}m × {{ draft.tecnica.palco.profundidade_m || 0 }}m
              </div>
            </div>
          </div>

          <!-- Backdrop/Cenário -->
          <div class="form-group">
            <label class="form-label">🎨 Backdrop/Cenário</label>
            <textarea
              v-model="draft.tecnica.palco.backdrop"
              rows="2"
              class="input"
              placeholder="Descreva o cenário, backdrop, decoração do palco..."
            />
            <div class="form-help">Ex: Painel LED 6x4m, backdrop com logo da empresa, decoração temática</div>
          </div>
        </div>

        <!-- Áudio & Visual - Melhorado -->
        <div v-if="false" class="card p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-6">Áudio & Visual</h3>

          <!-- Equipamentos por Categoria -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <!-- Som -->
            <div class="bg-gray-50 p-4 rounded-lg">
              <div class="form-group">
                <label class="form-label flex items-center gap-2">
                  🔊 <span>Equipamentos de Som</span>
                </label>
                <textarea
                  v-model="somStr"
                  rows="3"
                  class="input"
                  placeholder="Ex: Microfone sem fio, Sistema de som, DJ, Mesa de som..."
                />
                <div class="form-help">Separe por vírgula. Inclua quantidade se necessário.</div>
              </div>
            </div>

            <!-- Iluminação -->
            <div class="bg-gray-50 p-4 rounded-lg">
              <div class="form-group">
                <label class="form-label flex items-center gap-2">
                  💡 <span>Iluminação</span>
                </label>
                <textarea
                  v-model="luzStr"
                  rows="3"
                  class="input"
                  placeholder="Ex: Iluminação cênica, Spots, Follow spot, Iluminação ambiente..."
                />
                <div class="form-help">Separe por vírgula. Especifique cores ou efeitos se necessário.</div>
              </div>
            </div>
          </div>

          <!-- Vídeo -->
          <div class="form-group mb-6">
            <label class="form-label flex items-center gap-2">
              📹 <span>Equipamentos de Vídeo</span>
            </label>
            <textarea
              v-model="videoStr"
              rows="2"
              class="input"
              placeholder="Ex: Projetor 10k lumens, Telão 6x4m, Câmeras, Gravação..."
            />
            <div class="form-help">Separe por vírgula. Inclua especificações técnicas importantes.</div>
          </div>

          <!-- Recursos Especiais -->
          <div class="form-group">
            <label class="form-label mb-3">🎯 Recursos Especiais</label>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <label class="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border hover:bg-gray-100 cursor-pointer">
                <input type="checkbox" v-model="draft.tecnica.av.led" class="rounded text-blue-600" />
                <div>
                  <div class="font-medium text-sm">📺 Painel LED</div>
                  <div class="text-xs text-gray-600">Telão de LED</div>
                </div>
              </label>
              <label class="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border hover:bg-gray-100 cursor-pointer">
                <input type="checkbox" v-model="draft.tecnica.av.traducao" class="rounded text-green-600" />
                <div>
                  <div class="font-medium text-sm">🌐 Tradução Simultânea</div>
                  <div class="text-xs text-gray-600">Cabines e equipamentos</div>
                </div>
              </label>
              <label class="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border hover:bg-gray-100 cursor-pointer">
                <input type="checkbox" v-model="draft.tecnica.streaming.sim" class="rounded text-red-600" />
                <div>
                  <div class="font-medium text-sm">📡 Streaming/Transmissão</div>
                  <div class="text-xs text-gray-600">Transmissão ao vivo</div>
                </div>
              </label>
            </div>
          </div>
        </div>

        <!-- Elétrica - Melhorada -->
        <div v-if="false" class="card p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-6">Infraestrutura Elétrica</h3>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Carga Elétrica -->
            <div class="bg-gray-50 p-4 rounded-lg">
              <div class="form-group">
                <label class="form-label flex items-center gap-2">
                  🔌 <span>Carga Prevista</span>
                </label>
                <div class="relative">
                  <input
                    v-model.number="draft.tecnica.eletrica.carga_prevista_kva"
                    type="number"
                    min="0"
                    step="0.5"
                    class="input pr-12"
                    placeholder="25.0"
                  />
                  <span class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">kVA</span>
                </div>
                <div class="form-help">Potência total necessária para todos os equipamentos</div>
              </div>
            </div>

            <!-- Opções Especiais -->
            <div class="bg-gray-50 p-4 rounded-lg">
              <label class="form-label mb-3">🔧 Recursos Adicionais</label>
              <div class="space-y-3">
                <label class="flex items-center gap-3 p-3 bg-white rounded border hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" v-model="draft.tecnica.eletrica.gerador" class="rounded text-orange-600" />
                  <div>
                    <div class="font-medium text-sm">🏭 Gerador</div>
                    <div class="text-xs text-gray-600">Gerador de energia backup</div>
                  </div>
                </label>
                <label class="flex items-center gap-3 p-3 bg-white rounded border hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" class="rounded text-blue-600" />
                  <div>
                    <div class="font-medium text-sm">🔌 Quadro Elétrico</div>
                    <div class="text-xs text-gray-600">Quadro dedicado para o evento</div>
                  </div>
                </label>
                <label class="flex items-center gap-3 p-3 bg-white rounded border hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" class="rounded text-green-600" />
                  <div>
                    <div class="font-medium text-sm">🛡️ Proteção</div>
                    <div class="text-xs text-gray-600">Disjuntores e proteções</div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <!-- Calculadora de Carga (Informativa) -->
          <div v-if="draft.tecnica.eletrica.carga_prevista_kva > 0" class="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div class="text-sm text-blue-800 font-medium mb-2">💡 Estimativa de Consumo</div>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <div class="text-blue-600">Potência</div>
                <div class="font-bold">{{ draft.tecnica.eletrica.carga_prevista_kva }}kVA</div>
              </div>
              <div>
                <div class="text-blue-600">Corrente (220V)</div>
                <div class="font-bold">{{ Math.round(draft.tecnica.eletrica.carga_prevista_kva * 1000 / 220) }}A</div>
              </div>
              <div>
                <div class="text-blue-600">Tipo de Entrada</div>
                <div class="font-bold">{{ draft.tecnica.eletrica.carga_prevista_kva > 15 ? 'Trifásica' : 'Monofásica' }}</div>
              </div>
              <div>
                <div class="text-blue-600">Gerador Recomendado</div>
                <div class="font-bold">{{ Math.ceil(draft.tecnica.eletrica.carga_prevista_kva * 1.2) }}kVA</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Step técnico removido - conteúdo movido para Services -->
      <div v-if="false" class="space-y-6">
        <!-- Stage Setup -->
        <div class="card p-4">
          <h3 class="font-medium text-gray-900 mb-4">🎭 Palco & Cenário</h3>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="form-group">
              <label class="form-label">Largura (metros)</label>
              <input v-model.number="draft.tecnica.palco.largura_m" type="number" min="0" step="0.5" class="input" />
            </div>
            <div class="form-group">
              <label class="form-label">Profundidade (metros)</label>
              <input v-model.number="draft.tecnica.palco.profundidade_m" type="number" min="0" step="0.5" class="input" />
            </div>
            <div class="form-group">
              <label class="form-label">Backdrop</label>
              <input v-model="draft.tecnica.palco.backdrop" class="input" placeholder="Painel LED, backdrop..." />
            </div>
          </div>
        </div>

        <!-- Audio Visual -->
        <div class="card p-4">
          <h3 class="font-medium text-gray-900 mb-4">🎤 Áudio & Visual</h3>
          <div class="space-y-4">
            <div class="form-group">
              <label class="form-label">Equipamentos de Som</label>
              <input v-model="somStr" class="input" placeholder="Microfone sem fio, Sistema de som, DJ..." />
              <div class="form-help">Separe por vírgula</div>
            </div>
            <div class="form-group">
              <label class="form-label">Iluminação</label>
              <input v-model="luzStr" class="input" placeholder="Iluminação cênica, spots, ambiente..." />
              <div class="form-help">Separe por vírgula</div>
            </div>
            <div class="form-group">
              <label class="form-label">Equipamentos de Vídeo</label>
              <input v-model="videoStr" class="input" placeholder="Projeção, telões, câmeras..." />
              <div class="form-help">Separe por vírgula</div>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label class="flex items-center gap-2">
                <input type="checkbox" v-model="draft.tecnica.av.led" class="rounded" />
                <span class="text-sm">Painel LED</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" v-model="draft.tecnica.av.traducao" class="rounded" />
                <span class="text-sm">Tradução</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" v-model="draft.tecnica.streaming.sim" class="rounded" />
                <span class="text-sm">Streaming</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" v-model="draft.tecnica.eletrica.gerador" class="rounded" />
                <span class="text-sm">Gerador</span>
              </label>
            </div>

            <div class="form-group">
              <label class="form-label">Carga Elétrica Prevista (kVA)</label>
              <input v-model.number="draft.tecnica.eletrica.carga_prevista_kva" type="number" min="0" step="0.5" class="input" />
            </div>
          </div>
        </div>

        <!-- Segurança & Saúde -->
        <div class="card p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-6">Segurança & Saúde</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div class="space-y-4">
              <label class="flex items-center gap-3 p-3 bg-white rounded border hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" v-model="draft.seguranca_saude.controle_acesso" class="rounded text-blue-600" />
                <div>
                  <div class="text-sm font-medium">🚪 Controle de acesso</div>
                  <div class="text-xs text-gray-600">Portaria e credenciamento</div>
                </div>
              </label>
              <label class="flex items-center gap-3 p-3 bg-white rounded border hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" v-model="draft.seguranca_saude.ambulancia" class="rounded text-blue-600" />
                <div>
                  <div class="text-sm font-medium">🚑 Ambulância</div>
                  <div class="text-xs text-gray-600">Suporte médico de emergência</div>
                </div>
              </label>
            </div>
            <div class="form-group">
              <label class="form-label">👨‍🚒 Brigadistas</label>
              <div class="relative">
                <input
                  v-model.number="draft.seguranca_saude.brigadistas"
                  type="number"
                  min="0"
                  class="input pr-16"
                  placeholder="0"
                />
                <span class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">pessoas</span>

              </div>
              <div class="text-xs text-gray-600 mt-1">Profissionais treinados em primeiros socorros</div>
            </div>
          </div>
        </div>
      </div>

        </div>
        </div>

      <!-- Step 4: Team & Budget -->
      <div v-if="step.id === 'team'" class="space-y-6">

        <!-- Catálogo Automático (reintroduzido) -->
        <div class="card p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Catálogo Automático de Mão de Obra</h3>
          <p class="text-gray-600 mb-4">Sugestões baseadas no seu evento (ajuste no carrinho):</p>

          <CastingBuilder
            :initial-guests="draft.publico.convidados_estimados || 0"
            :initial-service-style="serviceStyleSeed"
            :initial-has-stage="Boolean(draft.tecnica.palco.largura_m || draft.tecnica.palco.profundidade_m)"
            :equipes="draft.equipes"
            @update:equipes="v => (draft.equipes = v)"
            :taxa-servico-pct="draft.financeiro.taxa_servico_pct"
            @update:taxa-servico-pct="v => (draft.financeiro.taxa_servico_pct = v)"
            :fixed-costs="draft.financeiro.custos_fixos"
            @update:fixed-costs="v => (draft.financeiro.custos_fixos = v)"
            :event-dates="draft.datas"
            :shifts="draft.turnos || []"
            :selected-services="draft.servicos_principais || []"
            :planned-roles="funcoesPlanejadas"
            :resumo-operacao="resumoOperacao"
            :segmento="draft.segmento"
          />
        </div>


        <!-- Fornecedores removidos conforme solicitado -->
      </div>

      <!-- Step 5: Final Review -->
      <div v-if="step.id === 'final'" class="space-y-6">
        <!-- Event Summary -->
        <div class="card p-6 bg-gradient-to-r from-green-50 to-blue-50 border-green-200">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Resumo do Evento</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <strong>Evento:</strong> {{ draft.evento_nome || 'Não informado' }}
            </div>
            <div>
              <strong>Cliente:</strong> {{ draft.cliente_nome || 'Não informado' }}
            </div>
            <!-- <div>
              <strong>Categoria:</strong> {{ draft.categoria || 'Não informado' }}
            </div> -->
            <div>
              <strong>Segmento:</strong> {{ segmentosEvento.find(s => s.id === draft.segmento)?.nome || 'Não informado' }}
            </div>
            <div>
              <strong>Convidados:</strong> {{ draft.publico.convidados_estimados || 0 }}

            </div>
            <div>
              <strong>Datas:</strong> {{ draft.datas.length }} {{ draft.datas.length === 1 ? 'dia' : 'dias' }}
            </div>
            <div>
              <strong>Local:</strong> {{ draft.venue.nome || 'Não informado' }}
            </div>
          </div>
        </div>

        <!-- Observations -->
        <div class="card p-4">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Observações Finais</h3>
          <div class="form-group">
            <textarea
              v-model="draft.observacoes"
              rows="4"
              class="input"
              placeholder="Briefing com o cliente, pontos de atenção, observações especiais..."
            />
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex justify-center">
          <button
            type="button"
            @click="onWizardComplete"
            class="btn-primary btn-success"
          >
            🚀 Criar Solicitação
          </button>
        </div>
      </div>
    </template>
  </FormWizard>
</template>



