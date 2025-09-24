<script setup lang="ts">
import { ref, watch, computed, toRaw, nextTick, onMounted, onUnmounted } from 'vue'
import FormWizard from '@/components/ui/FormWizard.vue'
import ClientSelector from '@/components/ui/ClientSelector.vue'
import DateRangePicker from '@/components/ui/DateRangePicker.vue'
import VenueSelector from '@/components/ui/VenueSelector.vue'
// import CategorySelector from '@/components/ui/CategorySelector.vue' // REMOVIDO

import CastingBuilder from '@/components/requests/CastingBuilder.vue'
import TurnosResumoOperacao from '@/components/ui/TurnosResumoOperacao.vue'
import { getAdminConfig } from '@/services/settings'
import { useAppConfig } from '@/stores/appConfig'


// Resumo emitido pelo DateRangePicker (Step 1)
const resumoOperacao = ref<any|null>(null)
function onResumoOperacao(r:any){ resumoOperacao.value = r }

// Types matching the required payload
export interface Turno { nome: string; inicio: string; fim: string; isPausa?: boolean; isBreak?: boolean; isExtraMarker?: boolean }
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
  // Preferências de escala/pausa do usuário no Step 1 (opcionais, para persistência/UI)
  pausa1h?: boolean
  tipo_escala?: 'hora' | 'diaria' | 'escala' | null
  escala_horas?: number
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
  (e:'evento-nome-changed', nome: string): void
  (e:'complete', payload: NewSolicitation): void
}>()

// Local draft for two-way binding
function deepClone<T>(v: T): T {
  try { return structuredClone(toRaw(v) as any) } catch (e) {
    try { return JSON.parse(JSON.stringify(v)) } catch { return v }
  }
}
// Config centralizada (sem fallbacks locais)
const { segmentos: configSegmentos, categorias: configCategorias, catalogRoles, multiplicadores, setorIcons, regrasTurnos, ensureLoaded, loading: configLoading, error: configError } = useAppConfig()
ensureLoaded()
const segmentosEvento = computed(() => configSegmentos.value)

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
// Detecta plataforma para exibir label correto (Ctrl / ⌘)
const isMac = computed(() => /mac|darwin/i.test(navigator.userAgent))
const primaryModKey = computed(() => isMac.value ? '⌘' : 'Ctrl')
// Mensagem de bloqueio de navegação
const navBlockMessage = ref<string>('')
let navBlockTimeout: any = null
// --- Navegação por teclado (Ctrl+Seta) ---
function isStepValid(index: number){
  const step = wizardSteps?.value?.[index]
  if (!step) return false
  // Considera válido se explicitamente true ou não for false
  return step.isValid !== false
}

function canGoToStep(targetIndex: number){
  if (targetIndex < 0) return false
  if (targetIndex > (wizardSteps.value.length - 1)) return false
  // Para avançar exige step atual válido
  if (targetIndex > currentStep.value) return isStepValid(currentStep.value)
  return true
}

function goToStep(targetIndex: number){
  if (canGoToStep(targetIndex)) {
    currentStep.value = targetIndex
  } else {
    console.log('[Wizard] Avanço bloqueado: preencha os campos obrigatórios do passo atual.')
    navBlockMessage.value = 'Complete os campos obrigatórios para avançar'
    if (navBlockTimeout) clearTimeout(navBlockTimeout)
    navBlockTimeout = setTimeout(() => { navBlockMessage.value = '' }, 3000)
  }
}

function handleGlobalKeydown(e: KeyboardEvent){
  if (!(e.ctrlKey || e.metaKey)) return
  if (e.key === 'ArrowRight') {
    e.preventDefault()
    goToStep(currentStep.value + 1)
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    goToStep(currentStep.value - 1)
  }
}
// Ref para input de convidados (Step 2)
const convidadosInputRef = ref<HTMLInputElement|null>(null)
const convidadoSugestoes = [50, 100, 200, 500]

// Persistência do passo atual do wizard
const STEP_KEY = 'solicitacoes:new:step'
onMounted(() => {
  try {
    const raw = localStorage.getItem(STEP_KEY)
    const idx = raw ? parseInt(raw) : NaN
    if (!Number.isNaN(idx) && idx >= 0) {
      currentStep.value = idx
    }
  } catch {}
  window.addEventListener('keydown', handleGlobalKeydown)
})
onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})
watch(currentStep, (v) => {
  try { localStorage.setItem(STEP_KEY, String(v)) } catch {}
})

// Configuração de escala (horas por turno) usada nos cálculos
const escalaHoras = ref<number>(8)

// Pausa 1h (Almoço) selecionada pelo usuário no Step 1
const pausa1h = ref<boolean>(true)

// Tipo de escala selecionado (hora/diaria/escala) vindo do DateRangePicker
const tipoEscala = ref<'hora' | 'diaria' | 'escala' | null>(null)
const labelTipoEscala = computed(() => {
  return tipoEscala.value === 'hora' ? 'Hora trabalhada'
    : tipoEscala.value === 'diaria' ? 'Diária'
    : tipoEscala.value === 'escala' ? 'Escala/Plantão'
    : '—'
})

// Atualiza o tipo de escala vindo do DateRangePicker (evita erro de template ao atribuir .value diretamente)
function onUpdateTipoEscala(t: 'hora'|'diaria'|'escala') {
  tipoEscala.value = t
  try { (draft.value as any).tipo_escala = t } catch {}
}

// Atualiza a pausa 1h vinda do DateRangePicker e persiste no draft (para JSON debug e restauração)
function onUpdatePausa(val: boolean){
  pausa1h.value = !!val
  try { (draft.value as any).pausa1h = !!val } catch {}
}



// KPIs de resumo para Step-5
const totalDiasEvento = computed(() => (budgetSummary.value?.eventDates?.length ?? (draft.value.datas?.length ?? 0)))
// Turnos efetivos (exclui pausas e marcações que não representam trabalho real)
const turnosEfetivos = computed(() => (draft.value.turnos || []).filter(t => !t?.isPausa && !t?.isBreak && !t?.isExtraMarker))
const totalTurnosEvento = computed(() => turnosEfetivos.value.length)
const totalPeriodos = computed(() => (budgetSummary.value?.totals?.totalPeriods ?? 0))
const modoEquipesLabel = computed(() => (modoEquipes.value === 'automatico' ? 'Automático' : 'Manual'))


// Estado do card do nome do evento
const eventoNomeCard = ref(false)
const eventoNomeInput = ref('')
// Flag indica se o usuário já confirmou o nome (Enter/Tab)
const eventoNomeCommitted = ref(false)


// Garante que o texto digitado no campo seja refletido no draft (e persista)
watch(eventoNomeInput, (v) => {
  try {
    draft.value.evento_nome = (v || '').toString()
  } catch {}
})


// Sincroniza com restauração do draft somente se já estava confirmado anteriormente
watch(() => draft.value.evento_nome, (v) => {
  const val = (v ?? '').toString()
  if (eventoNomeCommitted.value && val) {
    eventoNomeInput.value = val
    eventoNomeCard.value = true
  } else if (!val) {
    eventoNomeInput.value = ''
    eventoNomeCard.value = false
  } else if (!eventoNomeCommitted.value) {
    // Usuário está digitando: manter input aberto
    // Não alterar eventoNomeCard aqui
  }
}, { immediate: true })


// Funções para gerenciar o card do nome do evento
function criarEventoNomeCard() {
  console.log('🎯 criarEventoNomeCard chamada - valor:', eventoNomeInput.value)
  if (eventoNomeInput.value.trim()) {
    draft.value.evento_nome = eventoNomeInput.value.trim()
    eventoNomeCommitted.value = true
    eventoNomeCard.value = true
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
  // Volta para modo edição mantendo o valor atual no input para ajuste
  eventoNomeInput.value = draft.value.evento_nome
  eventoNomeCard.value = false
  eventoNomeCommitted.value = false
  // Não limpamos draft.evento_nome imediatamente: usuário pode apenas querer editar
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
      // Se o elemento encontrado não é um input foco, procura um input interno
      let target = field as HTMLElement
      const tag = (field.tagName || '').toLowerCase()
      if (!['input', 'select', 'textarea'].includes(tag) && !field.hasAttribute('contenteditable')) {
        const inner = field.querySelector('input, textarea, select, [role="combobox"], button, [tabindex]:not([tabindex="-1"])') as HTMLElement | null
        if (inner) target = inner
      }

      console.log(`✅ Focando no elemento:`, target)
      target.focus()

      // Para campos de seleção, simula clique no elemento focável (não no ícone)
      if (fieldName === 'cliente' || fieldName === 'local') {
        setTimeout(() => {
          console.log(`🖱️ Simulando clique no campo ${fieldName}`)
          target.click()
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
    icon: 'document',
    isValid: !!(draft.value.evento_nome && draft.value.cliente_nome && draft.value.venue.nome && draft.value.datas.length > 0)
  },
  {
    id: 'planning',
    title: 'Planejamento',
    description: 'Segmento e público',
    icon: 'list',
    isValid: !!(draft.value.segmento && draft.value.publico.convidados_estimados > 0)
  },
  {
    id: 'services',
    title: 'Serviços Necessários',
    description: 'Que tipo de serviços seu evento vai precisar?',
    icon: 'config',
    isValid: true
  },
  {
    id: 'team',
    title: 'Catálogo & Orçamento',
    description: 'Catálogo inteligente de equipes e orçamento',
    icon: 'user',
    isValid: true
  },
  {
    id: 'final',
    title: 'Revisão & Finalização',
    description: 'Conferir dados e observações',
    icon: 'check',
    isValid: true
  }
])

// JSON Debug (agrega dados de todos os steps)
const jsonDebug = computed(() => {
  try {
    return deepClone({
      resumoOperacao: resumoOperacao.value,
      servicosSelecionados: servicosSelecionados.value,
      funcoesPlanejadas: funcoesPlanejadas.value,
      // Estado visual do Step 1 importante para recomposi e7 e3o ao voltar
      tipoEscala: tipoEscala.value,
      escalaHoras: escalaHoras.value,
      pausa1h: pausa1h.value,
      draft: draft.value,
      budgetSummary: budgetSummary.value,
      // Novos campos de métricas de turnos
      total_turnos_diario: turnosEfetivos.value.length,
      total_turnos_periodo: (draft.value.datas?.length || 0) * turnosEfetivos.value.length,
    })
  } catch {
    return { erro: 'Falha ao montar JSON de debug' }
  }
})

const jsonDebugPretty = computed(() => {
  try { return JSON.stringify(jsonDebug.value, null, 2) } catch { return '' }
})

async function copyJsonDebug() {
  try {
    await navigator.clipboard.writeText(jsonDebugPretty.value)
    console.log('JSON Debug copiado para a área de transferência')
  } catch (e) {
    console.warn('Falha ao copiar JSON Debug', e)
  }
}

// Ref para o CastingBuilder (Step 4) e resumo de orçamento
const castingRef = ref<any>(null)
const budgetSummary = ref<any>(null)
function refreshBudgetSummary(){
  try { budgetSummary.value = castingRef.value?.getBudgetSummary?.() || null } catch {}
}

function money(n: number){
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n||0)) } catch { return `${n}` }
}

function itemSubtotalFromSummary(line: any){
  try { return (line?.assignments||[]).reduce((acc:number,a:any)=> acc + (Number(a?.qty)||0)*(Number(a?.price)||0), 0) } catch { return 0 }
}
function itemQtyFromSummary(line: any){
  try { return (line?.assignments||[]).filter((a:any)=>!a?.isExtra).reduce((acc:number,a:any)=> acc + (Number(a?.qty)||0), 0) } catch { return 0 }
}



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

// Categorias de serviços vindas do store (mantém ref local para compatibilidade com restante do código)
const categoriasServicos = ref<any[]>([])
// Serviços selecionados pelo usuário (precisa existir antes do watch que chama sincronizarServicos)
const servicosSelecionados = ref<string[]>([])
watch(configCategorias, (val) => {
  categoriasServicos.value = Array.isArray(val) ? val : []
  sincronizarServicos()
}, { immediate: true })

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
// (chamada inicial removida; já é coberta pelo watch com immediate:true)

// Função para sincronizar serviços selecionados com o draft
function sincronizarServicos() {
  const cats = categoriasServicos.value || []
  const byId = (id: string) => cats.find((c: any) => c.id === id)


// onMounted anterior removido (carregamento agora centralizado via useAppConfig)

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

  const mult = multiplicadores.value || {}
  function multVal(catId: string, funcao: string, fallback: number){
    const entry = mult[catId]
    if (!entry) return fallback
    const raw = entry[funcao]
    return raw ? Number(raw) || fallback : fallback
  }
  if (selecionadas.includes('alimentacao')) {
    add('Alimentação & Bebidas', 'Garçom', convidados / multVal('alimentacao','Garçom',30))
    add('Alimentação & Bebidas', 'Copeiro', convidados / multVal('alimentacao','Copeiro',80))
  }
  if (selecionadas.includes('estacionamento')) {
    add('Estacionamento & Valet', 'Manobrista', convidados / multVal('estacionamento','Manobrista',50))
    add('Estacionamento & Valet', 'Coordenador de Estacionamento', convidados > 0 ? Math.max(1, convidados / multVal('estacionamento','Coordenador de Estacionamento',300)) : 0)
  }
  if (selecionadas.includes('traducao')) {
    add('Tradução & Interpretação', 'Intérprete', Math.max(1, turnosCount))
    add('Tradução & Interpretação', 'Técnico de Tradução', turnosCount > 1 ? 1 : 0)
  }
  if (selecionadas.includes('seguranca')) {
    add('Segurança & Saúde', 'Segurança', convidados / multVal('seguranca','Segurança',150))
    add('Segurança & Saúde', 'Brigadista', convidados / multVal('seguranca','Brigadista',500))
  }
  if (selecionadas.includes('recepcao')) {
    add('Recepção & Credenciamento', 'Recepcionista', convidados / multVal('recepcao','Recepcionista',120))
    add('Recepção & Credenciamento', 'Operador de Credenciamento', convidados / multVal('recepcao','Operador de Credenciamento',200))
  }
  if (selecionadas.includes('limpeza')) {
    add('Limpeza & Manutenção', 'Auxiliar de Limpeza', convidados / multVal('limpeza','Auxiliar de Limpeza',200))
    add('Limpeza & Manutenção', 'Supervisor de Limpeza', convidados > 300 ? 1 : 0)
  }
  if (selecionadas.includes('logistica')) {
    add('Logística & Transporte', 'Carregador', convidados / multVal('logistica','Carregador',300))
    add('Logística & Transporte', 'Motorista', convidados / multVal('logistica','Motorista',400))
    add('Logística & Transporte', 'Coordenador de Transporte', convidados > 0 ? 1 : 0)
  }

  return s
})

function getSetorIcon(setor: string): string {
  const map = setorIcons.value || {}
  return map[setor] || '🧩'
}



// Estado editável das funções sugeridas no Step 3
const funcoesPlanejadas = ref<SugestaoFuncao[]>([])
// Controle de hash e modificações manuais
let lastAutoHash = ''
let userModificouFuncoes = false
function buildAutoHash(): string {
  const base = {
    convidados: Number(draft.value.publico?.convidados_estimados || 0),
    servicos: [...(draft.value.servicos_principais || [])].sort(),
    turnos: (draft.value.turnos || []).length,
    modo: modoEquipes.value,
  }
  try { return btoa(unescape(encodeURIComponent(JSON.stringify(base)))) } catch { return JSON.stringify(base) }
}
const showAddFunc = ref(false)
const addFilterId = ref<string>('all')
const addSearch = ref<string>('')
const showFilterMenu = ref(false)



// Persistência de estado do Wizard (modo, escala, tipo, pausa, funções)
const WIZARD_STATE_KEY = 'solicitacoes:new:wizard:v1'
function persistWizardStateDebounced(){
  try {
    clearTimeout((persistWizardStateDebounced as any)._t)
  } catch {}
  ;(persistWizardStateDebounced as any)._t = setTimeout(() => {
    try {
      const payload = {
        modoEquipes: modoEquipes.value,
        tipoEscala: tipoEscala.value,
        escalaHoras: escalaHoras.value,
        pausa1h: pausa1h.value,
        estrategiaTurnos: draft.value.estrategia_turnos,
        turnos: Array.isArray(draft.value.turnos) ? draft.value.turnos : [],
        resumoOperacao: resumoOperacao.value,
        funcoesPlanejadas: funcoesPlanejadas.value,
        eventoNome: draft.value.evento_nome || '',
        eventoNomeCommitted: eventoNomeCommitted.value,
        cliente: draft.value.cliente_id ? { id: draft.value.cliente_id, nome: draft.value.cliente_nome } : null,
        venue: draft.value.venue && draft.value.venue.id ? draft.value.venue : null,
        datas: Array.isArray(draft.value.datas) ? draft.value.datas : [],
        segmento: draft.value.segmento || '',
        servicosPrincipais: Array.isArray(draft.value.servicos_principais) ? draft.value.servicos_principais : [],
        convidados: Number(draft.value.publico?.convidados_estimados || 0),
      }
      localStorage.setItem(WIZARD_STATE_KEY, JSON.stringify(payload))
    } catch {}
  }, 200)
}

onMounted(() => {
  try {
    const raw = localStorage.getItem(WIZARD_STATE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        if (parsed.modoEquipes === 'automatico' || parsed.modoEquipes === 'manual') {
          modoEquipes.value = parsed.modoEquipes
        }
        if (parsed.tipoEscala === 'hora' || parsed.tipoEscala === 'diaria' || parsed.tipoEscala === 'escala' || parsed.tipoEscala === null) {
          tipoEscala.value = parsed.tipoEscala
        }
        if (typeof parsed.escalaHoras === 'number' && parsed.escalaHoras >= 4) {
          escalaHoras.value = parsed.escalaHoras
        }
        if (typeof parsed.pausa1h === 'boolean') {
          pausa1h.value = parsed.pausa1h
        }
        if (typeof parsed.estrategiaTurnos === 'boolean') {
          draft.value.estrategia_turnos = parsed.estrategiaTurnos
        }
        if (Array.isArray(parsed.turnos)) {
          draft.value.turnos = parsed.turnos.filter((t:any) => t && typeof t.inicio === 'string' && typeof t.fim === 'string')
        }
        if (parsed.resumoOperacao && typeof parsed.resumoOperacao === 'object') {
          resumoOperacao.value = parsed.resumoOperacao
        }
        if (Array.isArray(parsed.funcoesPlanejadas)) {
          funcoesPlanejadas.value = parsed.funcoesPlanejadas
        }
        if (typeof parsed.eventoNome === 'string' && parsed.eventoNome.trim()) {
          draft.value.evento_nome = parsed.eventoNome
          eventoNomeInput.value = parsed.eventoNome
          if (parsed.eventoNomeCommitted) {
            eventoNomeCommitted.value = true
            eventoNomeCard.value = true
            try { emit('evento-nome-changed', draft.value.evento_nome) } catch {}
          }
        }
        if (parsed.cliente && typeof parsed.cliente === 'object' && parsed.cliente.id) {
          draft.value.cliente_id = parsed.cliente.id
          draft.value.cliente_nome = parsed.cliente.nome
        }
        if (parsed.venue && typeof parsed.venue === 'object' && parsed.venue.id) {
          draft.value.venue = {
            id: parsed.venue.id || '',
            nome: parsed.venue.nome || '',
            endereco: parsed.venue.endereco || '',
            maps_url: parsed.venue.maps_url || ''
          }
        }
        if (Array.isArray(parsed.datas) && parsed.datas.length) {
          draft.value.datas = parsed.datas.filter((d: any) => typeof d === 'string')
        }
        if (typeof parsed.segmento === 'string' && parsed.segmento) {
          draft.value.segmento = parsed.segmento
        }
        if (Array.isArray(parsed.servicosPrincipais)) {
          draft.value.servicos_principais = parsed.servicosPrincipais.filter((s: any) => typeof s === 'string')
        }
        if (typeof parsed.convidados === 'number' && parsed.convidados >= 0) {
          draft.value.publico.convidados_estimados = parsed.convidados
        }

        // Após restaurar dados base, se modo automático e nenhuma função carregada, gerar sugestões iniciais
        nextTick(() => {
          if (modoEquipes.value === 'automatico' && funcoesPlanejadas.value.length === 0) {
            const autoHash = buildAutoHash()
            resetSugestoes()
            lastAutoHash = autoHash
          }
        })
      }
    }
  } catch {}
})

watch([
  modoEquipes,
  tipoEscala,
  escalaHoras,
  pausa1h,
  () => draft.value.turnos,
  () => draft.value.estrategia_turnos,
  resumoOperacao,
  funcoesPlanejadas,
  () => draft.value.evento_nome,
  eventoNomeCommitted,
  () => draft.value.cliente_id,
  () => draft.value.cliente_nome,
  () => draft.value.venue?.id,
  () => draft.value.venue?.nome,
  () => draft.value.datas,
  () => draft.value.segmento,
  () => draft.value.servicos_principais,
  () => draft.value.publico.convidados_estimados,
], persistWizardStateDebounced, { deep: true })

const funcoesCatalogo = computed(() => {
  const src = categoriasServicos.value || []
  let list: Array<{ setor: string; funcao: string }> = []
  if (src.length > 0) {
    const cats = addFilterId.value === 'all' ? src : src.filter((c: any) => c.id === addFilterId.value)
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
  } else {
    // Fallback: derivar de catalog_roles (setor/label)
    const roles = catalogRoles.value || []
    list = roles.map((r: any) => ({ setor: r.sector || r.setor || '—', funcao: r.label || r.nome || r.key }))
  }
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
  userModificouFuncoes = true
}

function toggleFuncFromCatalog(setor: string, funcao: string) {
  const idx = funcoesPlanejadas.value.findIndex(f => f.setor === setor && f.funcao === funcao)
  if (idx >= 0) {
    // Remover função inteira
    funcoesPlanejadas.value.splice(idx, 1)
  } else {
    funcoesPlanejadas.value.push({ setor, funcao, quantidade: 1 })
  }
  userModificouFuncoes = true
}


const totalFuncoes = computed(() => funcoesPlanejadas.value.reduce((acc, f) => acc + (f.quantidade || 0), 0))

function resetSugestoes() {
  funcoesPlanejadas.value = sugestoesFuncoes.value.map(x => ({ ...x }))
  userModificouFuncoes = false
}

watch(modoEquipes, v => {
  if (v === 'automatico') {
    if (funcoesPlanejadas.value.length === 0) resetSugestoes()
  } else {
    // Ao entrar no modo Manual, limpar para começar do zero
    clearFuncoes()
    userModificouFuncoes = true
  }
})

// Ao entrar no Step 3 (services), garantir preenchimento ou limpeza conforme o modo
watch(currentStep, () => {
  const stepObj = wizardSteps.value[currentStep.value]
  if (!stepObj) return
  if (stepObj.id === 'planning') {
    // Focar automaticamente no input de convidados ao entrar no Step 2
    nextTick(() => { try { convidadosInputRef.value?.focus() } catch {} })
  }
  if (stepObj.id === 'services') {
    if (modoEquipes.value === 'automatico') {
      const newHash = buildAutoHash()
      const baseMudou = lastAutoHash && lastAutoHash !== newHash
      if (funcoesPlanejadas.value.length === 0) {
        resetSugestoes(); lastAutoHash = newHash
      } else if (baseMudou && !userModificouFuncoes) {
        // Dados base mudaram (convidados/serviços/turnos) e usuário não alterou manualmente -> regenerar
        resetSugestoes(); lastAutoHash = newHash
      } else if (!lastAutoHash) {
        // Primeira entrada
        lastAutoHash = newHash
      }
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
    refreshBudgetSummary()
  } else if (stepObj.id === 'final') {
    refreshBudgetSummary()
  }
})

function incFuncao(i: number) { funcoesPlanejadas.value[i].quantidade++; userModificouFuncoes = true }
function decFuncao(i: number) { funcoesPlanejadas.value[i].quantidade = Math.max(0, (funcoesPlanejadas.value[i].quantidade || 0) - 1); userModificouFuncoes = true }
function removeFuncao(i: number) { funcoesPlanejadas.value.splice(i, 1); userModificouFuncoes = true }
function clearFuncoes() { funcoesPlanejadas.value = []; userModificouFuncoes = true }


function onWizardComplete() {
  const payload = deepClone(draft.value)
  emit('update:modelValue', payload)
  emit('complete', payload)
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

  // (duplicated buildAutoHash removido aqui - versão oficial definida anteriormente)

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

  // Pausa de 1h só se o usuário selecionou "1 Hora de Almoço"
  // Mesmo que o período seja ≥8h, se "Hora Extra" estiver selecionado, não aplica pausa.
  const temPausaObrigatoria = (duracaoHoras >= 8) && (pausa1h.value === true)
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
      // Usa faixas configuráveis do appConfig (regras_turnos.faixas) se disponíveis
      let nome = 'Turno'
      try {
        const cfg = useAppConfig()
        const faixas = (cfg as any)?.regras_turnos?.faixas
        if (Array.isArray(faixas) && faixas.length) {
          const faixaEncontrada = faixas.find((f: any) => typeof f?.inicio === 'number' && typeof f?.fim === 'number' && startHour >= f.inicio && startHour < f.fim)
          if (faixaEncontrada?.nome) nome = faixaEncontrada.nome
        } else {
          // fallback legacy
          if (startHour >= 6 && startHour < 12) nome = 'Turno Manhã'
          else if (startHour >= 12 && startHour < 18) nome = 'Turno Tarde'
          else if (startHour >= 18 && startHour < 24) nome = 'Turno Noite'
          else nome = 'Turno Madrugada'
        }
      } catch {
        if (startHour >= 6 && startHour < 12) nome = 'Turno Manhã'
        else if (startHour >= 12 && startHour < 18) nome = 'Turno Tarde'
        else if (startHour >= 18 && startHour < 24) nome = 'Turno Noite'
        else nome = 'Turno Madrugada'
      }

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
  // Persistir imediatamente após detectar
  try { persistWizardStateDebounced() } catch {}
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
  try { (draft.value as any).escala_horas = escalaHoras.value } catch {}
  recalcularTurnos()
}

</script>

<template>
  <div v-if="configLoading" class="p-6 border rounded-lg bg-white mb-4 text-sm text-slate-600">Carregando configurações...</div>
  <div v-else-if="configError" class="p-6 border rounded-lg bg-red-50 mb-4 text-sm text-red-700">Falha ao carregar configurações. Recarregue a página.</div>
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
          <div class="card p-6 mb-6 border border-gray-200">
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
                  <div class="font-medium text-blue-900">{{ eventoNomeInput }}</div>
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
              <div v-else class="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div class="flex-1">
                  <div class="font-medium text-blue-900">{{ draft.cliente_nome }}</div>
                  <div class="text-xs text-blue-600">Cliente selecionado</div>
                </div>
                <button
                  type="button"
                  @click="removerClienteCard"
                  class="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100"
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
                :client-id="draft.cliente_id ? String(draft.cliente_id) : null"
                @keydown="handleKeyNavigation"
                data-field="local"
                class="venue-selector"
                required
              />
              <!-- Card do Local -->
              <div v-else class="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div class="flex-1">
                  <div class="font-medium text-blue-900">{{ draft.venue.nome }}</div>
                  <div class="text-xs text-blue-600">Local selecionado</div>
                </div>
                <button
                  type="button"
                  @click="removerLocalCard"
                  class="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100"
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
            :escala="(escalaHoras as any)"
            :tipo-escala="(tipoEscala ?? undefined)"
            :pausa1h="pausa1h"
            @turnos-detected="onTurnosDetected"
            @recalcular-turnos="onToggleEstrategia"
            @alterar-escala="onAlterarEscala"
            @update:tipoEscala="onUpdateTipoEscala"
            @update:pausa1h="onUpdatePausa"
            @resumo-operacao="onResumoOperacao"
            @clear-all="draft.turnos = []; draft.turnos_detectados = false"
          />


        </div>
      </div>

      <!-- Step 2: Planning -->
      <div v-if="step.id === 'planning'" class="space-y-6">
        <!-- Grid de 3 colunas: 20% + 40% + 40% -->
        <div class="grid grid-cols-5 gap-6 ">
          <!-- Coluna 1: Número de Convidados (20% = 1/5) -->
          <div class="col-span-1">
            <div class="card p-5">
              <h3 class="text-lg font-semibold text-gray-900 mb-3">Convidados</h3>
              <div class="bg-blue-50/70 border border-blue-200 rounded-xl px-4 py-5 flex flex-col items-center gap-3 relative overflow-hidden">
                <div class="absolute inset-0 pointer-events-none rounded-xl" style="background: radial-gradient(circle at 70% 30%, rgba(59,130,246,0.15), transparent 70%);"></div>
                <div class="text-3xl leading-none">👥</div>
                <div class="w-full text-center">
                  <input
                    ref="convidadosInputRef"
                    v-model.number="draft.publico.convidados_estimados"
                    type="number"
                    min="1"
                    max="10000"
                    placeholder="0"
                    class="w-full bg-transparent text-center text-3xl font-extrabold tracking-tight text-blue-900 focus:outline-none focus:ring-0 border-0 p-0 m-0 appearance-none [field-sizing:content]"
                  />
                  <div class="mt-1 text-[11px] uppercase tracking-wide font-medium text-blue-700">aprox.</div>
                </div>
                <div class="w-full grid grid-cols-2 gap-2 mt-2">
                  <button
                    v-for="size in convidadoSugestoes"
                    :key="'sug-'+size"
                    type="button"
                    @click="draft.publico.convidados_estimados = size"
                    class="group relative p-2.5 border-2 rounded-lg bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center gap-1 transition-all text-[11px] font-medium"
                    :class="draft.publico.convidados_estimados === size ? 'border-blue-400 bg-blue-50 shadow-sm' : 'border-blue-100 hover:border-blue-300 hover:bg-white'"
                  >
                    <span class="text-base leading-none">👥</span>
                    <span>{{ size }}</span>
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
                  <div v-if="configLoading" class="text-xs text-slate-500 py-4">Carregando catálogo...</div>
                  <template v-else>
                    <div
                      v-for="item in funcoesCatalogo"
                      :key="item.setor + '|' + item.funcao"
                      class="border rounded p-3 flex items-center justify-between cursor-pointer transition-colors"
                      :class="funcoesPlanejadas.some(f => f.setor===item.setor && f.funcao===item.funcao) ? 'bg-blue-50 border-blue-400 hover:bg-blue-100' : 'hover:bg-gray-50'"
                      @click="toggleFuncFromCatalog(item.setor, item.funcao)"
                    >
                      <div class="flex items-center gap-3 min-w-0">
                        <div class="text-xl w-8 text-center">{{ getSetorIcon(item.setor) }}</div>
                        <div class="min-w-0">
                          <div class="text-sm font-medium text-gray-900">{{ item.funcao }}</div>
                          <div class="text-xs text-gray-500">{{ item.setor }}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        class="p-1 rounded transition-colors"
                        :class="funcoesPlanejadas.some(f => f.setor===item.setor && f.funcao===item.funcao) ? 'text-red-600 hover:text-red-800 hover:bg-red-100' : 'text-blue-600 hover:text-blue-800 hover:bg-blue-100'"
                        @click.stop="toggleFuncFromCatalog(item.setor, item.funcao)"
                        :title="funcoesPlanejadas.some(f => f.setor===item.setor && f.funcao===item.funcao) ? 'Remover' : 'Adicionar'"
                      >
                        <svg v-if="!funcoesPlanejadas.some(f => f.setor===item.setor && f.funcao===item.funcao)" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v14M5 12h14"/></svg>
                        <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14"/></svg>
                      </button>
                    </div>
                    <div v-if="!configLoading && funcoesCatalogo.length === 0" class="p-3 border rounded bg-amber-50 text-amber-800 text-xs space-y-2">
                      <div><strong>Catálogo vazio.</strong> Configure categorias/serviços em Configurações e salve.</div>
                      <div class="flex gap-2">
                        <button type="button" class="px-2 py-1 rounded border border-amber-300 bg-white text-amber-700 hover:bg-amber-100" @click="ensureLoaded(true)">Recarregar</button>
                      </div>
                    </div>
                  </template>
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
              <button type="button" class="btn btn-sm btn-primary" @click="showAddFunc = !showAddFunc">
                <Icon name="squares-2x2" class="w-4 h-4" />
                <span>Adicionar função</span>
              </button>
              <button type="button" class="btn btn-sm btn-secondary text-red-600 border-red-300 hover:bg-red-50" @click="clearFuncoes" :disabled="funcoesPlanejadas.length === 0">
                <Icon name="shield-check" class="w-4 h-4" />
                <span>Remover todas</span>
              </button>
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
              <button type="button" class="btn btn-sm btn-primary" @click="showAddFunc = !showAddFunc">
                <Icon name="squares-2x2" class="w-4 h-4" />
                <span>Adicionar função</span>
              </button>
              <button type="button" class="btn btn-sm btn-secondary text-red-600 border-red-300 hover:bg-red-50" @click="clearFuncoes" :disabled="funcoesPlanejadas.length === 0">
                <Icon name="shield-check" class="w-4 h-4" />
                <span>Remover todas</span>
              </button>
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
        <div class="p-6 space-y-6">
          <TurnosResumoOperacao
            v-if="resumoOperacao"
            :resumo="resumoOperacao"
            :datas="draft.datas"
            :total-by-type="{ horasTrabalho: resumoOperacao.horasPorDia, noturnas: resumoOperacao.horasNoturnasPorDia, temPausa: resumoOperacao.temPausa1h }"
            :horas-por-turno-diario="{ manha:0, tarde:0, noite:0, madrugada:0 }"
            :daily-extra-minutes="0"
            :total-turnos-periodo="(draft.datas?.length || 0) * (resumoOperacao?.quantidadeTurnos || 0)"
          />

          <CastingBuilder
            ref="castingRef"
            :initial-guests="draft.publico.convidados_estimados || 0"
            :initial-service-style="serviceStyleSeed"
            :initial-has-stage="Boolean(draft.tecnica.palco.largura_m || draft.tecnica.palco.profundidade_m)"
            :equipes="draft.equipes"
            @update:equipes="v => { draft.equipes = v; refreshBudgetSummary() }"
            :taxa-servico-pct="draft.financeiro.taxa_servico_pct"
            @update:taxa-servico-pct="v => { draft.financeiro.taxa_servico_pct = v; refreshBudgetSummary() }"
            :fixed-costs="draft.financeiro.custos_fixos"
            @update:fixed-costs="v => { draft.financeiro.custos_fixos = v; refreshBudgetSummary() }"
            :event-dates="draft.datas"
            :shifts="turnosEfetivos || []"
            :selected-services="draft.servicos_principais || []"
            :planned-roles="funcoesPlanejadas"
            :resumo-operacao="resumoOperacao"
            :segmento="draft.segmento"
            :evento-nome="draft.evento_nome"
            :cliente-nome="draft.cliente_nome"
            :local-nome="draft.venue?.nome"
            :tipo-escala="tipoEscala"
            :modo-equipes="modoEquipes"
          />
        </div>


        <!-- Fornecedores removidos conforme solicitado -->
      </div>

      <!-- Step 5: Final Review -->
      <div v-if="step.id === 'final'" class="space-y-6">
        <!-- Event Summary -->

        <!-- Resumo Geral (visual) -->
        <div class="card p-6 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900">Resumo Geral</h3>
            <div class="text-xs text-slate-500" v-if="budgetSummary">Atualizado</div>
          </div>

          <!-- Indicadores principais -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div class="rounded-lg border p-3 bg-white/70">
              <div class="text-[11px] text-slate-600">Subtotal</div>
              <div class="text-base font-bold">{{ money(budgetSummary?.totals?.subtotal || 0) }}</div>
            </div>
            <div class="rounded-lg border p-3 bg-white/70">
              <div class="text-[11px] text-slate-600">Taxa de Serviço ({{ budgetSummary?.feePct || 0 }}%)</div>
              <div class="text-base font-bold">{{ money(budgetSummary?.totals?.serviceFee || 0) }}</div>
            </div>
            <div class="rounded-lg border p-3 bg-white/70">
              <div class="text-[11px] text-slate-600">Custos Fixos</div>
              <div class="text-base font-bold">{{ money(budgetSummary?.fixed || 0) }}</div>
            </div>
            <div class="rounded-lg border p-3 bg-emerald-50 border-emerald-200">
              <div class="text-[11px] text-emerald-700">Total</div>
              <div class="text-base font-bold text-emerald-900">{{ money(budgetSummary?.totals?.total || 0) }}</div>
            </div>
          </div>

          <!-- Etapas: Infos, Datas/Turnos, Serviços, Público -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-3">
              <div class="rounded-lg border p-3">
                <div class="text-[11px] text-slate-600 mb-1">Info Básica</div>
                <div class="text-sm">
                  <div><span class="text-slate-500">Evento:</span> <strong>{{ draft.evento_nome || '—' }}</strong></div>
                  <div><span class="text-slate-500">Cliente:</span> <strong>{{ draft.cliente_nome || '—' }}</strong></div>
                  <div><span class="text-slate-500">Local:</span> <strong>{{ draft.venue?.nome || '—' }}</strong></div>
                  <div><span class="text-slate-500">Segmento:</span> <strong>{{ segmentosEvento.find(s => s.id === draft.segmento)?.nome || draft.segmento || '—' }}</strong></div>
                  <div><span class="text-slate-500">Convidados:</span> <strong>{{ draft.publico?.convidados_estimados || 0 }}</strong></div>
                </div>
              </div>

              <div class="rounded-lg border p-3">
                <div class="text-[11px] text-slate-600 mb-1">Datas & Turnos</div>
                <div class="flex flex-wrap gap-2 text-xs">
                  <span v-for="d in (budgetSummary?.eventDates || draft.datas || [])" :key="d" class="px-2 py-1 rounded-full bg-slate-100 border">{{ d }}</span>
                </div>
                <div class="mt-2 text-xs text-slate-600">
                  Horas por Dia: <strong>{{ (resumoOperacao?.horasPorDia || 0) }}</strong>h
                  <span v-if="resumoOperacao?.temHoraExtra" class="ml-2 px-2 py-0.5 rounded-full bg-fuchsia-100 text-fuchsia-800">Hora extra</span>
                  <span v-if="resumoOperacao?.temPausa1h" class="ml-2 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Pausa 1h</span>
                  <div class="mt-1">
                    Total de Horas no Período: <strong>{{ (resumoOperacao?.horasTotalPeriodo || 0) }}</strong>h
                    <span class="text-slate-400">( {{ draft.datas?.length || 0 }} dia(s) )</span>
                  </div>
                </div>
              </div>

              <div class="rounded-lg border p-3">
                <div class="text-[11px] text-slate-600 mb-1">Serviços Selecionados</div>
                <div class="flex flex-wrap gap-2 text-xs">
                  <span v-for="s in (draft.servicos_principais || [])" :key="s" class="px-2 py-1 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200">{{ s }}</span>
                  <span v-if="!(draft.servicos_principais || []).length" class="text-slate-500">Nenhum serviço selecionado</span>
                </div>
              </div>
            </div>

            <!-- Equipes & Totais -->
            <div class="space-y-3">
              <div class="rounded-lg border p-3">
                <div class="text-[11px] text-slate-600 mb-2">Totais de Equipes</div>
                <div class="grid grid-cols-3 gap-2 text-xs">
                  <div class="bg-white rounded border p-2">
                    <div class="text-[10px] text-slate-500">Profissionais</div>
                    <div class="font-semibold">{{ budgetSummary?.totals?.totalProfessionals || 0 }}</div>
                  </div>
                  <div class="bg-white rounded border p-2">
                    <div class="text-[10px] text-slate-500">Períodos</div>
                    <div class="font-semibold">{{ budgetSummary?.totals?.totalPeriods || 0 }}</div>
                  </div>
                  <div class="bg-white rounded border p-2">
                    <div class="text-[10px] text-slate-500">Funções</div>
                    <div class="font-semibold">{{ budgetSummary?.totals?.uniqueRoles || 0 }}</div>
                  </div>
                </div>
              </div>

              <div class="rounded-lg border p-3">
                <div class="text-[11px] text-slate-600 mb-2">Equipes Selecionadas</div>
                <div v-if="!(budgetSummary?.cart || []).length" class="text-xs text-slate-500">Nenhuma função adicionada</div>
                <div v-else class="space-y-2">
                  <div v-for="line in (budgetSummary?.cart || [])" :key="line.key" class="border rounded p-2">
                    <div class="flex items-center justify-between">
                      <div class="text-sm font-medium truncate">{{ line.key }} <span class="text-slate-400">• {{ line.sector }}</span></div>
                      <div class="text-sm font-semibold">{{ itemQtyFromSummary(line) }} prof • {{ money(itemSubtotalFromSummary(line)) }}</div>
                    </div>
                    <div class="mt-1 flex flex-wrap gap-1 text-[11px]">
                      <span v-for="a in (line.assignments || [])" :key="a.date+'|'+a.period" class="px-2 py-0.5 rounded border"
                        :class="a.isExtra ? 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-800' : 'bg-slate-50 border-slate-200 text-slate-700'">
                        {{ a.date }} • {{ a.isExtra ? 'extra' : a.period }} • {{ a.qty }}x {{ money(a.price) }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- JSON Debug -->
        <div class="card p-6">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-semibold text-gray-900">JSON Debug</h3>
            <button type="button"
              @click="copyJsonDebug"
              class="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-50">
              Copiar JSON
            </button>
          </div>
          <pre class="text-xs bg-slate-900 text-slate-100 rounded-lg p-3 overflow-auto max-h-96">
<code>{{ jsonDebugPretty }}</code>
          </pre>
        </div>

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
  <!-- Footer Atalhos + Mensagem Bloqueio -->
  <div class="mt-4 text-xs text-gray-500 flex flex-col gap-2 select-none">
    <transition name="fade">
      <div v-if="navBlockMessage" class="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded shadow-sm max-w-sm ml-auto">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
        <span>{{ navBlockMessage }}</span>
      </div>
    </transition>
    <div class="flex items-center gap-4 justify-end">
      <div class="flex items-center gap-1">
        <span class="inline-flex items-center justify-center px-1.5 py-0.5 border border-gray-300 rounded bg-gray-50 font-mono text-[10px] leading-none shadow-sm">{{ primaryModKey }}</span>
        <span class="inline-flex items-center justify-center px-1 py-0.5 border border-gray-300 rounded bg-gray-50 font-mono text-[10px] leading-none shadow-sm">←</span>
        <span class="text-gray-600">Voltar passo</span>
      </div>
      <div class="flex items-center gap-1">
        <span class="inline-flex items-center justify-center px-1.5 py-0.5 border border-gray-300 rounded bg-gray-50 font-mono text-[10px] leading-none shadow-sm">{{ primaryModKey }}</span>
        <span class="inline-flex items-center justify-center px-1 py-0.5 border border-gray-300 rounded bg-gray-50 font-mono text-[10px] leading-none shadow-sm">→</span>
        <span class="text-gray-600">Avançar passo</span>
      </div>
      <!-- <div class="text-gray-400">(Atalhos ativos)</div> -->
    </div>
  </div>
</template>



