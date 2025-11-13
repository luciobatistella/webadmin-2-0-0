<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { listAtividades } from '../../services/clients'
import { uploadDocument } from '../../services/storage'
import { loadPublicConfig } from '../../services/http'

type FormData = Record<string, any>

const props = defineProps<{
  initialData?: FormData
  mode: 'create' | 'edit'
  loading?: boolean
  hideActions?: boolean
}>()

const emit = defineEmits<{
  save: [data: FormData]
  cancel: []
}>()

// Refs para inputs
const cepInput = ref<HTMLInputElement | null>(null)
const numeroInput = ref<HTMLInputElement | null>(null)

// Controle de cards (campos preenchidos exibem como card com botão X)
const fieldCards = ref<Record<string, boolean>>({
  nome: false,
  cpf: false,
  rg: false,
  dataExp: false,
  dataNasc: false,
  nomeMae: false,
  nomePai: false,
  cep: false,
  email: false,
  telefone1: false,
  telefone2: false,
  numero: false,
  complemento: false,
  chavePix: false,
  banco: false,
  agencia: false,
  conta: false,
})

// Card de endereço (agrupa todos os campos bloqueados do CEP)
const enderecoCard = ref(false)

// Estado de verificação de telefone via SMS
const phoneVerify = ref({
  code: '' as string,
  expiresAt: 0 as number, // epoch ms
  lastSentAt: 0 as number,
  verified: false as boolean,
  error: '' as string,
  national: '' as string,
  sending: false as boolean,
})

// Estado de verificação de email
const emailVerify = ref({
  code: '' as string,
  expiresAt: 0 as number,
  lastSentAt: 0 as number,
  verified: false as boolean,
  error: '' as string,
  sending: false as boolean,
})

// Funções (atividades) - máximo 6 selecionadas
const funcoesSearch = ref('')
const funcoesSelecionadas = ref<Array<{ value: string | number; text: string }>>([])
const showFuncoesDropdown = ref(false)
const atividadesOptions = ref<Array<{ value: string | number; text: string }>>([])
const activeAtividadeIndex = ref(-1)
// Mostrar Telefone 2 quando solicitado
const showTelefone2 = ref(false)

// Lista de bancos
const bancosOptions = ref<Array<{ codigo: string; nome: string }>>([])
const bancoSearch = ref('')
const showBancoDropdown = ref(false)
const activeBancoIndex = ref(-1)

// Documentos - Sistema de Upload com Status
type DocumentStatus = 'pending' | 'approved' | 'rejected'
type DocumentType = 'rgFrente' | 'rgVerso' | 'foto3x4' | 'fotoUniforme' | 'comprovanteResidencia' | 'antecedentesCriminais' | 'atestadoMedico'

interface Document {
  file: File | null
  fileName: string
  status: DocumentStatus
  rejectionReason?: string
  uploadedAt?: string
}

const documentos = ref<Record<DocumentType, Document>>({
  rgFrente: { file: null, fileName: '', status: 'pending' },
  rgVerso: { file: null, fileName: '', status: 'pending' },
  foto3x4: { file: null, fileName: '', status: 'pending' },
  fotoUniforme: { file: null, fileName: '', status: 'pending' },
  comprovanteResidencia: { file: null, fileName: '', status: 'pending' },
  antecedentesCriminais: { file: null, fileName: '', status: 'pending' },
  atestadoMedico: { file: null, fileName: '', status: 'pending' },
})

// Motivos de rejeição (virão da API)
const rejectionReasons = [
  'A foto não está nítida',
  'O documento está danificado',
  'O documento está fora de validade',
  'Os dados do cooperado no documento não condizem com as credenciais do sistema'
]

// Busca atividades da API
async function ensureAtividades() {
  if (atividadesOptions.value.length) return
  try {
    const rows = await listAtividades(new URLSearchParams())
    atividadesOptions.value = rows
  } catch (e) {
    console.warn('[ensureAtividades]', e)
    atividadesOptions.value = []
  }
}

// Busca lista de bancos do JSON público
async function ensureBancos() {
  if (bancosOptions.value.length) return
  try {
    const resp = await fetch('/bancos.json', { cache: 'no-store' })
    const data = await resp.json()
    bancosOptions.value = Array.isArray(data) ? data : []
  } catch (e) {
    console.warn('[ensureBancos]', e)
    bancosOptions.value = []
  }
}

// Filtra atividades baseado na busca
const filteredAtividades = computed(() => {
  const q = funcoesSearch.value.toLowerCase().trim()
  if (!q) return atividadesOptions.value
  return atividadesOptions.value.filter(o => (o.text || '').toLowerCase().includes(q))
})

// Filtra bancos baseado na busca
const filteredBancos = computed(() => {
  const q = bancoSearch.value.toLowerCase().trim()
  if (!q) return bancosOptions.value.slice(0, 20) // mostra apenas os primeiros 20 quando vazio
  return bancosOptions.value.filter(b => 
    b.nome.toLowerCase().includes(q) || 
    b.codigo.includes(q)
  ).slice(0, 20) // limita a 20 resultados
})

// Navegação por teclado no dropdown
function handleFuncoesKeydown(event: KeyboardEvent) {
  if (!showFuncoesDropdown.value || filteredAtividades.value.length === 0) return
  
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      activeAtividadeIndex.value = Math.min(
        activeAtividadeIndex.value + 1,
        filteredAtividades.value.length - 1
      )
      scrollToActiveItem()
      break
    case 'ArrowUp':
      event.preventDefault()
      activeAtividadeIndex.value = Math.max(activeAtividadeIndex.value - 1, 0)
      scrollToActiveItem()
      break
    case 'Enter':
      event.preventDefault()
      if (activeAtividadeIndex.value >= 0 && activeAtividadeIndex.value < filteredAtividades.value.length) {
        adicionarFuncao(filteredAtividades.value[activeAtividadeIndex.value])
      }
      break
    case 'Escape':
      event.preventDefault()
      showFuncoesDropdown.value = false
      activeAtividadeIndex.value = -1
      break
  }
}

// Scroll para o item ativo no dropdown
function scrollToActiveItem() {
  setTimeout(() => {
    const activeElement = document.querySelector('.funcao-dropdown-item-active')
    if (activeElement) {
      activeElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, 0)
}

// Adiciona função selecionada
function adicionarFuncao(atividade: { value: string | number; text: string }) {
  if (funcoesSelecionadas.value.length >= 6) {
    alert('Máximo de 6 funções permitido')
    return
  }
  
  // Verifica se já foi adicionada
  if (funcoesSelecionadas.value.some(f => f.value === atividade.value)) {
    return
  }
  
  funcoesSelecionadas.value.push(atividade)
  funcoesSearch.value = ''
  // Mantém o dropdown aberto após adicionar
  showFuncoesDropdown.value = true
  activeAtividadeIndex.value = 0
  
  // Refoca o input para continuar selecionando
  nextTick(() => {
    const input = document.querySelector('input[placeholder="Buscar funções..."]') as HTMLInputElement
    if (input) {
      input.focus()
    }
  })
}

// Remove função
function removerFuncao(index: number) {
  funcoesSelecionadas.value.splice(index, 1)
}

// Handler para fechar dropdown com delay
function handleFuncoesBlur() {
  setTimeout(() => {
    showFuncoesDropdown.value = false
    activeAtividadeIndex.value = -1
  }, 200)
}

// Reseta índice ativo quando a busca muda
watch(funcoesSearch, () => {
  activeAtividadeIndex.value = -1
})

watch(bancoSearch, () => {
  activeBancoIndex.value = -1
})

// Navegação por teclado no dropdown de bancos
function handleBancoKeydown(event: KeyboardEvent) {
  if (!showBancoDropdown.value || filteredBancos.value.length === 0) return
  
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      activeBancoIndex.value = Math.min(
        activeBancoIndex.value + 1,
        filteredBancos.value.length - 1
      )
      scrollToActiveBancoItem()
      break
    case 'ArrowUp':
      event.preventDefault()
      activeBancoIndex.value = Math.max(activeBancoIndex.value - 1, 0)
      scrollToActiveBancoItem()
      break
    case 'Enter':
      event.preventDefault()
      if (activeBancoIndex.value >= 0 && activeBancoIndex.value < filteredBancos.value.length) {
        selecionarBanco(filteredBancos.value[activeBancoIndex.value])
      }
      break
    case 'Escape':
      event.preventDefault()
      showBancoDropdown.value = false
      activeBancoIndex.value = -1
      break
  }
}

// Scroll para o item ativo no dropdown de bancos
function scrollToActiveBancoItem() {
  setTimeout(() => {
    const activeElement = document.querySelector('.banco-dropdown-item-active')
    if (activeElement) {
      activeElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, 0)
}

// Seleciona um banco
function selecionarBanco(banco: { codigo: string; nome: string }) {
  form.value.banco = `${banco.codigo} - ${banco.nome}`
  bancoSearch.value = ''
  showBancoDropdown.value = false
  activeBancoIndex.value = -1
  fieldCards.value.banco = true
}

// Handler para fechar dropdown de banco com delay
function handleBancoBlur() {
  // Delay para permitir o clique no item
  setTimeout(() => {
    showBancoDropdown.value = false
    activeBancoIndex.value = -1
  }, 150)
}

// === Funções de Manipulação de Documentos ===

// Selecionar arquivo para upload
async function handleFileSelect(docType: DocumentType, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  
  if (file) {
    documentos.value[docType] = {
      file,
      fileName: file.name,
      status: 'pending',
      uploadedAt: new Date().toISOString()
    }
    // Upload para Firebase Storage (se configurado)
    try {
      const res = await uploadDocument(docType, file)
      // marca como aprovado após upload bem-sucedido
      documentos.value[docType].status = 'approved'
      ;(window as any).$toast?.success?.('Arquivo enviado com sucesso')
      // opcional: anexar URL no form/payload futuro
      ;(documentos.value as any)[docType].downloadURL = res.downloadURL
      ;(documentos.value as any)[docType].storagePath = res.fullPath
    } catch (e) {
      console.warn('[uploadDocument] falha', e)
      documentos.value[docType].status = 'rejected'
      ;(window as any).$toast?.error?.('Falha ao enviar arquivo. Verifique a configuração do Firebase.')
    }
  }
}

// (Removido) Leitura automática de RG (OCR/PDF)

// Remover documento
function removeDocument(docType: DocumentType) {
  documentos.value[docType] = {
    file: null,
    fileName: '',
    status: 'pending'
  }
}

// Abrir seletor de arquivo
function triggerFileInput(docType: DocumentType) {
  const input = document.getElementById(`file-${docType}`) as HTMLInputElement
  if (input) {
    input.click()
  }
}

// Obter classe de status do documento
function getDocumentStatusClass(status: DocumentStatus) {
  switch (status) {
    case 'approved':
      return 'border-green-400 bg-green-50'
    case 'rejected':
      return 'border-red-400 bg-red-50'
    default:
      return 'border-yellow-400 bg-yellow-50'
  }
}

// Obter ícone de status
function getStatusIcon(status: DocumentStatus) {
  switch (status) {
    case 'approved':
      return 'check-circle'
    case 'rejected':
      return 'x-circle'
    default:
      return 'clock'
  }
}

// Form state
const form = ref<FormData>({
  nome: '',
  cpf: '',
  rg: '',
  dataExp: '',
  dataNasc: '',
  sexo: '',
  nomeMae: '',
  nomePai: '',
  email: '',
  telefone1: '',
  telefone2: '',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  regiao: '',
  status: 'Novo',
  situacaoCooperativa: 4, // Pré-Cadastro por padrão
  cooperativa: '',
  tipoPagto: '',
  chavePix: '',
  banco: '',
  agencia: '',
  conta: '',
  digConta: '',
  observacoes: '',
  ...props.initialData
})

// Rascunho (autosave) no localStorage para não perder dados entre tentativas
const DRAFT_FORM_KEY = 'draft:cooperado-form'
const DRAFT_FUNCOES_KEY = 'draft:cooperado-funcoes'

onMounted(() => {
  try {
    if (!props.initialData) {
      const raw = localStorage.getItem(DRAFT_FORM_KEY)
      if (raw) {
        const saved = JSON.parse(raw)
        Object.assign(form.value, saved || {})
      }
      const rawFun = localStorage.getItem(DRAFT_FUNCOES_KEY)
      if (rawFun) {
        const savedFun = JSON.parse(rawFun)
        if (Array.isArray(savedFun)) funcoesSelecionadas.value = savedFun
      }
      // Restaurar estado de verificação do telefone se existir
      // Restaurar verificação apenas em edição; em criação começamos limpo
      if (props.mode === 'edit') {
        try {
          const pv = localStorage.getItem('draft:telefone1-verify')
          if (pv) Object.assign(phoneVerify.value, JSON.parse(pv))
        } catch {}
      } else {
        // Mode create: zera verificação
        phoneVerify.value = { code: '', expiresAt: 0, lastSentAt: 0, verified: false, error: '', national: '', sending: false }
        try { localStorage.removeItem('draft:telefone1-verify') } catch {}
      }
    }
  } catch {}
})

watch(form, (v) => {
  try { localStorage.setItem(DRAFT_FORM_KEY, JSON.stringify(v || {})) } catch {}
}, { deep: true })

watch(funcoesSelecionadas, (v) => {
  try { localStorage.setItem(DRAFT_FUNCOES_KEY, JSON.stringify(v || [])) } catch {}
}, { deep: true })

watch(phoneVerify, (v) => {
  try { localStorage.setItem('draft:telefone1-verify', JSON.stringify(v || {})) } catch {}
}, { deep: true })

// Opções de Situação Cooperativa
const situacaoCooperativaOptions = [
  { text: 'Pré-Cadastro', value: 4 },
  { text: 'Cooperado', value: 3 },
]

// Validação básica
const errors = ref<Record<string, string>>({})

const requiredFields = computed(() => ({
  nome: 'Nome completo é obrigatório',
  cpf: 'CPF é obrigatório',
  dataNasc: 'Data de nascimento é obrigatória',
  sexo: 'Sexo é obrigatório',
  telefone1: 'Pelo menos um telefone é obrigatório',
  cep: 'CEP é obrigatório',
  cidade: 'Cidade é obrigatória',
  uf: 'UF é obrigatória',
  numero: 'Número é obrigatório'
}))

// Utilitários de validação
function isAllSameDigits(s: string) {
  return /^([0-9])\1+$/.test(s)
}

function validateCPF(cpfInput: string): boolean {
  const cpf = String(cpfInput).replace(/\D/g, '')
  if (cpf.length !== 11) return false
  if (isAllSameDigits(cpf)) return false
  const calcDV = (base: string, factor: number) => {
    let sum = 0
    for (let i = 0; i < base.length; i++) sum += Number(base[i]) * (factor - i)
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }
  const dv1 = calcDV(cpf.slice(0, 9), 10)
  const dv2 = calcDV(cpf.slice(0, 10), 11)
  return dv1 === Number(cpf[9]) && dv2 === Number(cpf[10])
}

// RG: aceita dígitos e X para DV, tamanho 5-14; tenta validar DV de SP (9 dígitos + DV)
function validateRG(rgInput: string): { ok: boolean; reason?: string } {
  const raw = String(rgInput).toUpperCase().replace(/[^0-9X]/g, '')
  if (!raw) return { ok: true }
  if (raw.length < 5 || raw.length > 14) return { ok: false, reason: 'RG em formato inválido' }
  // Se padrão SP (8 dígitos + DV), tentar DV
  const body = raw.slice(0, -1)
  const dv = raw.slice(-1)
  if (/^[0-9]{8}[0-9X]$/.test(raw)) {
    const weights = [2,3,4,5,6,7,8,9]
    let sum = 0
    for (let i = 0; i < 8; i++) sum += Number(body[7 - i]) * weights[i]
    const mod = sum % 11
    const calc = 11 - mod
    const expected = calc === 10 ? 'X' : calc === 11 ? '0' : String(calc)
    if (expected !== dv) return { ok: false, reason: 'RG inválido (DV não confere)' }
  }
  return { ok: true }
}

function normalizeBRPhoneToE164(phoneInput: string): { e164: string | null; national: string } {
  const digits = String(phoneInput || '').replace(/\D/g, '')
  let national = digits
  // Remover zeros prefixos comuns
  if (national.startsWith('0')) national = national.replace(/^0+/, '')
  if (national.length === 10 || national.length === 11) {
    return { e164: `55${national}`, national }
  }
  // já com DDI
  if (national.startsWith('55') && (national.length === 12 || national.length === 13)) {
    return { e164: national, national: national.slice(2) }
  }
  return { e164: null, national }
}

function formatBRPhone(national: string): string {
  const d = national.replace(/\D/g, '')
  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '')
  }
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '')
}

function canResendCode(): boolean {
  const now = Date.now()
  return now - (phoneVerify.value.lastSentAt || 0) > 60_000 // 60s cooldown
}

async function startSMSVerification() {
  errors.value.telefone1 = ''
  phoneVerify.value.error = ''
  
  const { e164, national } = normalizeBRPhoneToE164(form.value.telefone1)
  if (!e164) {
    errors.value.telefone1 = 'Telefone inválido. Informe DDD + número (10-11 dígitos).'
    return
  }
  if (!canResendCode()) {
    phoneVerify.value.error = 'Aguarde 60s para reenviar o código.'
    return
  }
  
  // Gerar código 6 dígitos e expirar em 5 min
  const code = Math.floor(100000 + Math.random() * 900000).toString()
  phoneVerify.value.code = code
  phoneVerify.value.expiresAt = Date.now() + 5 * 60_000
  phoneVerify.value.lastSentAt = Date.now()
  phoneVerify.value.verified = false
  phoneVerify.value.national = national
  phoneVerify.value.sending = true
  
  try { localStorage.setItem('draft:telefone1-verify', JSON.stringify(phoneVerify.value)) } catch {}
  
  // Importar serviço SMS dinamicamente para evitar erro se não configurado
  try {
    const { sendVerificationSMS } = await import('@/services/sms')
    const result = await sendVerificationSMS({ phone: e164, code })
    
    if (result.success) {
      ;(window as any).$toast?.success?.('Código enviado por SMS! Verifique seu celular.')
    } else {
      phoneVerify.value.error = result.error || 'Erro ao enviar SMS. Tente novamente.'
      ;(window as any).$toast?.error?.(phoneVerify.value.error)
    }
  } catch (error: any) {
    console.error('[SMS] Erro ao enviar código:', error)
    phoneVerify.value.error = error?.message || 'Erro ao enviar SMS. Verifique sua conexão.'
    ;(window as any).$toast?.error?.(phoneVerify.value.error)
  } finally {
    phoneVerify.value.sending = false
  }
}

function confirmSMSCode(inputCode: string) {
  const code = String(inputCode || '').trim()
  if (!code) { phoneVerify.value.error = 'Informe o código recebido por SMS.'; return }
  if (!phoneVerify.value.code) { phoneVerify.value.error = 'Nenhum código foi gerado ainda.'; return }
  if (Date.now() > phoneVerify.value.expiresAt) {
    phoneVerify.value.error = 'Código expirado. Solicite um novo código.'
    return
  }
  if (code !== phoneVerify.value.code) {
    phoneVerify.value.error = 'Código incorreto.'
    return
  }
  phoneVerify.value.verified = true
  phoneVerify.value.error = ''
  fieldCards.value.telefone1 = true
  ;(window as any).$toast?.success?.('Telefone verificado com sucesso!')
}

function canResendEmailCode(): boolean {
  const now = Date.now()
  return now - (emailVerify.value.lastSentAt || 0) > 60_000 // 60s cooldown
}

async function startEmailVerification() {
  errors.value.email = ''
  emailVerify.value.error = ''
  
  const email = String(form.value.email || '').trim()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.value.email = 'E-mail inválido.'
    return
  }
  if (!canResendEmailCode()) {
    emailVerify.value.error = 'Aguarde 60s para reenviar o código.'
    return
  }
  
  // Gerar código 6 dígitos e expirar em 5 min
  const code = Math.floor(100000 + Math.random() * 900000).toString()
  emailVerify.value.code = code
  emailVerify.value.expiresAt = Date.now() + 5 * 60_000
  emailVerify.value.lastSentAt = Date.now()
  emailVerify.value.verified = false
  emailVerify.value.sending = true
  
  try { localStorage.setItem('draft:email-verify', JSON.stringify(emailVerify.value)) } catch {}
  
  // Importar serviço de email dinamicamente
  try {
    const { sendVerificationEmail } = await import('@/services/email')
    const result = await sendVerificationEmail({ email, code })
    
    if (result.success) {
      ;(window as any).$toast?.success?.('Código enviado por e-mail! Verifique sua caixa de entrada.')
    } else {
      emailVerify.value.error = result.error || 'Erro ao enviar e-mail. Tente novamente.'
      ;(window as any).$toast?.error?.(emailVerify.value.error)
    }
  } catch (error: any) {
    console.error('[Email] Erro ao enviar código:', error)
    emailVerify.value.error = error?.message || 'Erro ao enviar e-mail. Verifique sua conexão.'
    ;(window as any).$toast?.error?.(emailVerify.value.error)
  } finally {
    emailVerify.value.sending = false
  }
}

function confirmEmailCode(inputCode: string) {
  const code = String(inputCode || '').trim()
  if (!code) { emailVerify.value.error = 'Informe o código recebido por e-mail.'; return }
  if (!emailVerify.value.code) { emailVerify.value.error = 'Nenhum código foi gerado ainda.'; return }
  if (Date.now() > emailVerify.value.expiresAt) {
    emailVerify.value.error = 'Código expirado. Solicite um novo código.'
    return
  }
  if (code !== emailVerify.value.code) {
    emailVerify.value.error = 'Código incorreto.'
    return
  }
  emailVerify.value.verified = true
  emailVerify.value.error = ''
  fieldCards.value.email = true
  ;(window as any).$toast?.success?.('E-mail verificado com sucesso!')
}

function validateField(field: string) {
  const value = form.value[field]
  if (requiredFields.value[field as keyof typeof requiredFields.value]) {
    if (!value || String(value).trim() === '') {
      errors.value[field] = requiredFields.value[field as keyof typeof requiredFields.value]
      return false
    }
  }
  
  // Validações específicas
  if (field === 'cpf' && value) {
    if (!validateCPF(String(value))) {
      errors.value[field] = 'CPF inválido'
      return false
    }
  }
  if (field === 'rg' && value) {
    const vrg = validateRG(String(value))
    if (!vrg.ok) {
      errors.value[field] = vrg.reason || 'RG inválido'
      return false
    }
  }
  if (field === 'telefone1' && value) {
    const norm = normalizeBRPhoneToE164(String(value))
    if (!norm.e164) {
      errors.value[field] = 'Telefone inválido. Use DDD + número.'
      return false
    }
  }
  
  if (field === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
    errors.value[field] = 'E-mail inválido'
    return false
  }
  
  delete errors.value[field]
  return true
}

function validateForm(): boolean {
  errors.value = {}
  let isValid = true
  
  for (const field of Object.keys(requiredFields.value)) {
    if (!validateField(field)) {
      isValid = false
    }
  }
  // Validações complementares
  if (form.value.rg && !validateRG(String(form.value.rg)).ok) {
    isValid = false
    errors.value.rg = validateRG(String(form.value.rg)).reason || 'RG inválido'
  }
  if (form.value.cpf && !validateCPF(String(form.value.cpf))) {
    isValid = false
    errors.value.cpf = 'CPF inválido'
  }
  // Exigir verificação do telefone 1
  if (!phoneVerify.value.verified) {
    isValid = false
    errors.value.telefone1 = 'Telefone precisa ser verificado'
  }
  // Exigir verificação do email
  if (!emailVerify.value.verified) {
    isValid = false
    errors.value.email = 'E-mail precisa ser verificado'
  }
  
  return isValid
}

function handleSave() {
  console.log('[handleSave]');
  if (!validateForm()) {
    const firstError = Object.keys(errors.value)[0]
    const errorEl = document.querySelector(`[name="${firstError}"]`) as HTMLElement
    errorEl?.focus()
    return
  }
  // Monta campos derivados e compatibilidade com variações de backend
  const payload: Record<string, any> = { ...form.value }
  // endereço composto (campo comum em alguns backends)
  const enderecoParts = [form.value.logradouro, form.value.numero, form.value.complemento]
    .map(v => String(v || '').trim())
    .filter(Boolean)
  if (enderecoParts.length) payload.endereco = enderecoParts.join(', ')
  // duplicar UF como estado (alguns backends usam 'estado')
  if (form.value.uf && !payload.estado) payload.estado = form.value.uf
  // mapear funções selecionadas para campos funcao/funcao1..funcao6
  if (Array.isArray(funcoesSelecionadas.value) && funcoesSelecionadas.value.length > 0) {
    const funcs = funcoesSelecionadas.value.map(f => String((f as any).text || (f as any).name || '').trim()).filter(Boolean).slice(0, 6)
    if (funcs[0]) payload.funcao = funcs[0]
    funcs.forEach((fn, idx) => {
      payload[`funcao${idx + 1}`] = fn
    })
    // também envia array 'funcoes' para backends mais novos
    payload.funcoes = funcs
  }
  // anexar metadados dos documentos enviados ao payload (URLs e paths do Firebase)
  try {
    const docs = documentos.value
    const docsPayload: Record<string, any> = {}
    const flatUrls: Record<string, string> = {}
    const flatPaths: Record<string, string> = {}
    for (const [k, d] of Object.entries(docs)) {
      const downloadURL = (d as any).downloadURL || ''
      const storagePath = (d as any).storagePath || ''
      docsPayload[k] = {
        fileName: d.fileName,
        status: d.status,
        uploadedAt: d.uploadedAt,
        downloadURL,
        storagePath,
      }
      if (downloadURL) flatUrls[k] = downloadURL
      if (storagePath) flatPaths[k] = storagePath
    }
    payload.documentos = docsPayload
    // mapas planos auxiliares, úteis para integrações simples
    if (Object.keys(flatUrls).length) payload.documentUrls = flatUrls
    if (Object.keys(flatPaths).length) payload.documentPaths = flatPaths
    // também cria aliases planos por tipo, ex.: rgFrenteUrl, rgVersoUrl, ...
    for (const [k, url] of Object.entries(flatUrls)) payload[`${k}Url`] = url
    for (const [k, p] of Object.entries(flatPaths)) payload[`${k}Path`] = p
    // compat: mapear URLs para urlImg1..4 conforme sistema antigo
    // 1: foto perfil (aqui usamos foto3x4), 2: atestado, 3: uniforme, 4: antecedentes
    if (flatUrls.foto3x4) payload.urlImg1 = flatUrls.foto3x4
    if (flatUrls.atestadoMedico) payload.urlImg2 = flatUrls.atestadoMedico
    if (flatUrls.fotoUniforme) payload.urlImg3 = flatUrls.fotoUniforme
    if (flatUrls.antecedentesCriminais) payload.urlImg4 = flatUrls.antecedentesCriminais
  } catch {}
  // padronizar “situação na cooperativa” para múltiplos backends
  const situacaoCode = Number(form.value.situacaoCooperativa ?? 4) || 4
  // Preferência: alguns backends exigem objeto aninhado { id }
  payload.situacao_na_cooperativa = { id: situacaoCode }
  payload.situacaoNaCooperativa = { id: situacaoCode }
  payload.situacaoCooperativa = { id: situacaoCode }
  // IDs diretos (fallbacks comuns)
  payload.situacao_na_cooperativa_id = situacaoCode
  payload.situacaoNaCooperativaId = situacaoCode
  payload.situacao_cooperativa = situacaoCode
  payload.situacao_cooperativa_id = situacaoCode
  payload.situacaoCooperativaId = situacaoCode
  payload.statusCadastro = situacaoCode
  // Também garantir campos genéricos numéricos
  payload.situacao = situacaoCode
  payload.situacao_id = situacaoCode
  payload.situacao_codigo = situacaoCode
  // Evitar sobrecarga do campo "cooperativa" (geralmente é o ID da cooperativa, não a situação)
  // payload.cooperativa NÃO será definido aqui para não conflitar com backends que esperam o ID da cooperativa
  // Versões em string, para backends estritos (não conflitam com os numéricos)
  payload.situacaoCooperativaStr = String(situacaoCode)
  payload.situacao_na_cooperativa_str = String(situacaoCode)
  // Descrições textuais auxiliares (não conflitam com campo numérico)
  const situacaoTexto = situacaoCode === 3 ? 'Cooperado' : 'Pré-Cadastro'
  payload.situacaoDescricao = situacaoTexto
  payload.situacao_descricao = situacaoTexto
  payload.situacaoNaCooperativaDescricao = situacaoTexto
  payload.situacao_na_cooperativa_descricao = situacaoTexto
  // status textual exigido por alguns backends: "Novo" | "Ativo" | "Inativo" | "Bloqueado" | "Pendente"
  // Regra: no modo create, default "Novo"; se já houver preenchido no form, respeita.
  // Caso não haja, mapeia por código: 3 => "Ativo", 4 => "Novo", senão "Pendente".
  {
    const current = String(payload.status || '').trim()
    let statusText = current
    if (!statusText) {
      if (props.mode === 'create') statusText = 'Novo'
      else if (situacaoCode === 3) statusText = 'Ativo'
      else if (situacaoCode === 4) statusText = 'Novo'
      else statusText = 'Pendente'
      payload.status = statusText
    }
  }
  // aliases adicionais comuns (mantidos acima)
  // variações adicionais usadas por alguns backends
  payload.situacaoCadastro = situacaoCode
  payload.situacaoCadastroId = situacaoCode
  payload.situacaoCooperado = situacaoCode
  payload.situacaoCooperadoId = situacaoCode
  // já enviamos versões string acima

  // normalizações para backend (somente no payload)
  const onlyDigits = (v: unknown) => String(v || '').replace(/\D+/g, '')
  if (payload.cpf) {
    const cpfDigits = onlyDigits(payload.cpf)
    if (cpfDigits.length === 11) payload.cpf = cpfDigits
    // alguns backends usam 'documento'
    payload.documento = cpfDigits
  }
  if (payload.telefone1) payload.telefone1 = onlyDigits(payload.telefone1)
  if (payload.telefone2) payload.telefone2 = onlyDigits(payload.telefone2)
  if (payload.cep) payload.cep = onlyDigits(payload.cep)
  // Incluir flag de verificação do telefone principal
  payload.telefone1Verificado = !!phoneVerify.value.verified
  if (payload.dataNasc) payload.dataNasc = normalizeDateFormatToServer(payload.dataNasc);
  if (payload.dataExp) payload.dataExp = normalizeDateFormatToServer(payload.dataExp);
  if (payload.dataEmissao) payload.dataEmissao = normalizeDateFormatToServer(payload.dataEmissao);
  if (payload.validade) payload.validade = normalizeDateFormatToServer(payload.validade);
  if (payload.validadeUnif) payload.validadeUnif = normalizeDateFormatToServer(payload.validadeUnif);
  if (payload.validadeCri) payload.validadeCri = normalizeDateFormatToServer(payload.validadeCri);

  emit('save', payload)
}

// normaliza data de DD/MM/AAAA para MM/DD/AAAA
function normalizeDateFormatToServer(dt: string): string {
  if (dt.indexOf('/') >= 0) {
    const [d, m, y] = dt.split('/');
    return `${m}/${d}/${y}`;
  }
  const [y, m, d] = dt.split('-');
  return `${m}/${d}/${y}`;

}

function handleCancel() {
  emit('cancel')
}

// Auto-formatação de campos
watch(() => form.value.cpf, (newVal) => {
  if (newVal) {
    const cleaned = String(newVal).replace(/\D/g, '').slice(0, 11)
    form.value.cpf = cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }
})

watch(() => form.value.telefone1, (nv) => {
  const digits = String(nv || '').replace(/\D/g, '').slice(0, 11)
  form.value.telefone1 = formatBRPhone(digits)
  // sempre que o número mudar, invalidar verificação
  if (!digits) {
    phoneVerify.value.verified = false
  } else if (digits !== phoneVerify.value.national) {
    phoneVerify.value.verified = false
  }
})

watch(() => form.value.telefone2, (nv) => {
  const digits = String(nv || '').replace(/\D/g, '').slice(0, 11)
  form.value.telefone2 = formatBRPhone(digits)
})

watch(() => form.value.cep, (newVal) => {
  if (newVal) {
    const cleaned = String(newVal).replace(/\D/g, '').slice(0, 8)
    form.value.cep = cleaned.replace(/(\d{5})(\d{3})/, '$1-$2')
  }
})

// Busca CEP (ViaCEP)
async function buscarCep() {
  const cep = String(form.value.cep || '').replace(/\D/g, '')
  if (cep.length !== 8) return
  
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
    const data = await res.json()
    
    if (!data.erro) {
      form.value.logradouro = data.logradouro || ''
      form.value.bairro = data.bairro || ''
      form.value.cidade = data.localidade || ''
      form.value.uf = data.uf || ''
      // Complemento não deve ser preenchido automaticamente
      
      // Auto-preencher região/zona para São Paulo baseado no CEP
      assignRegiaoFromCep()
      
      // Criar card de endereço automaticamente após buscar CEP
      enderecoCard.value = true
    }
  } catch (e) {
    console.error('Erro ao buscar CEP', e)
  }
}

// Mapeia CEP para zona de São Paulo
function assignRegiaoFromCep() {
  const cep = String(form.value.cep || '').replace(/[^0-9]/g, '')
  const city = String(form.value.cidade || '').toLowerCase()
  const uf = String(form.value.uf || '').toUpperCase()
  
  if (cep.length >= 5 && uf === 'SP' && (city.includes('sao paulo') || city.includes('são paulo'))) {
    const p2 = cep.slice(0, 2)
    let regiao = ''
    
    if (p2 === '01') regiao = 'Centro'
    else if (p2 === '02') regiao = 'Zona Norte'
    else if (p2 === '03') regiao = 'Zona Leste'
    else if (p2 === '04') regiao = 'Zona Sul'
    else if (p2 === '05') regiao = 'Zona Oeste'
    
    if (regiao) {
      form.value.regiao = regiao
    }
  }
}

// Funções para gerenciar cards de campos
function criarCard(field: string) {
  const value = form.value[field]
  if (value && String(value).trim()) {
    fieldCards.value[field] = true
    
    // Se for CEP, buscar endereço automaticamente
    if (field === 'cep') {
      buscarCep()
    }
  }
}

function removerCard(field: string) {
  fieldCards.value[field] = false
  // Foca no campo após remover o card
  setTimeout(() => {
    const input = document.querySelector(`[name="${field}"]`) as HTMLInputElement
    if (input) input.focus()
  }, 50)
}

// Função para remover o card de endereço e voltar para o CEP
function removerEnderecoCard() {
  enderecoCard.value = false
  // Limpa os campos de endereço
  form.value.logradouro = ''
  form.value.bairro = ''
  form.value.cidade = ''
  form.value.uf = ''
  form.value.regiao = ''
  // Foca no campo CEP
  setTimeout(() => {
    cepInput.value?.focus()
  }, 50)
}

// Função para tratar Enter/Tab em campos
function handleFieldEnter(field: string) {
  if (form.value[field] && String(form.value[field]).trim()) {
    validateField(field)
    criarCard(field)
  }
}

function handleFieldTab(field: string) {
  if (form.value[field] && String(form.value[field]).trim()) {
    validateField(field)
    criarCard(field)
  }
}

// Função auxiliar para obter label amigável do campo
function getFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    nome: 'Nome completo',
    cpf: 'CPF',
    rg: 'RG',
    dataExp: 'Data de expedição',
    dataNasc: 'Data de nascimento',
    nomeMae: 'Nome da mãe',
    nomePai: 'Nome do pai',
    email: 'E-mail',
    telefone1: 'Telefone principal',
    telefone2: 'Telefone secundário',
    numero: 'Número',
    complemento: 'Complemento',
  }
  return labels[field] || field
}

// Expor método de submit programático para o botão externo
const rootForm = ref<HTMLFormElement | null>(null)
function requestSubmit() {
  console.log('[requestSubmit]');
  try { 
    rootForm.value?.requestSubmit();
  } catch(err) { /* noop */ 
    console.log('[requestSubmit][error]', err);
  }
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_FORM_KEY); localStorage.removeItem(DRAFT_FUNCOES_KEY); localStorage.removeItem('draft:telefone1-verify') } catch {}
}

defineExpose({ form, validateForm, requestSubmit, clearDraft })
</script>

<template>
  <form ref="rootForm" @submit.prevent="handleSave" class="space-y-6" autocomplete="off">
    <!-- Linha 1: Informações Pessoais + Situação Cooperativa -->
    <div class="grid grid-cols-1 lg:grid-cols-[60%_40%] gap-6">
      <!-- Informações Pessoais -->
      <section class="card p-4">
        <h3 class="text-[11px] uppercase text-zinc-500 mb-2 ">Informações Pessoais</h3>
        
        <div class="grid grid-cols-1 gap-4">
          <!-- Nome e Data de Nascimento -->
          <div class="grid grid-cols-1 lg:grid-cols-[2.5fr_1fr] gap-4">
            <!-- Nome -->
            <div>
              <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Nome Completo <span class="text-red-500">*</span>
              </label>
              <input
                v-if="!fieldCards.nome"
                v-model="form.nome"
                name="nome"
                type="text"
                autocomplete="off"
                class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-700"
                :class="{ 'border-red-500': errors.nome }"
                @blur="validateField('nome')"
                @keydown.enter.prevent="handleFieldEnter('nome')"
                @keydown.tab="handleFieldTab('nome')"
              />
              <!-- Card do Nome -->
              <div v-else class="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-blue-900 truncate">{{ form.nome }}</div>
                </div>
                <button
                  type="button"
                  @click="removerCard('nome')"
                  class="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100 flex-shrink-0"
                  title="Editar nome"
                  tabindex="-1"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p v-if="errors.nome" class="mt-1 text-xs text-red-500">{{ errors.nome }}</p>
            </div>

            <!-- Data de Nascimento -->
            <div>
              <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Data de Nascimento <span class="text-red-500">*</span>
              </label>
              <input
                v-if="!fieldCards.dataNasc"
                v-model="form.dataNasc"
                name="dataNasc"
                type="date"
                class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-700"
                :class="{ 'border-red-500': errors.dataNasc }"
                @blur="validateField('dataNasc')"
                @keydown.enter.prevent="handleFieldEnter('dataNasc')"
                @keydown.tab="handleFieldTab('dataNasc')"
              />
              <!-- Card da Data de Nascimento -->
              <div v-else class="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-blue-900">{{ new Date(form.dataNasc).toLocaleDateString('pt-BR') }}</div>
                </div>
                <button
                  type="button"
                  @click="removerCard('dataNasc')"
                  class="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100 flex-shrink-0"
                  title="Editar data de nascimento"
                  tabindex="-1"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p v-if="errors.dataNasc" class="mt-1 text-xs text-red-500">{{ errors.dataNasc }}</p>
            </div>
          </div>

          <!-- Nome da Mãe e Nome do Pai na mesma linha -->
          <div class="grid grid-cols-2 gap-4">
            <!-- Nome da Mãe -->
            <div>
              <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Nome da Mãe</label>
              <input
                v-if="!fieldCards.nomeMae"
                v-model="form.nomeMae"
                name="nomeMae"
                type="text"
                class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-700"
                @keydown.enter.prevent="handleFieldEnter('nomeMae')"
                @keydown.tab="handleFieldTab('nomeMae')"
              />
              <!-- Card do Nome da Mãe -->
              <div v-else class="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-blue-900 truncate">{{ form.nomeMae }}</div>
                </div>
                <button
                  type="button"
                  @click="removerCard('nomeMae')"
                  class="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100 flex-shrink-0"
                  title="Editar nome da mãe"
                  tabindex="-1"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- Nome do Pai -->
            <div>
              <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Nome do Pai</label>
              <input
                v-if="!fieldCards.nomePai"
                v-model="form.nomePai"
                name="nomePai"
                type="text"
                class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-700"
                @keydown.enter.prevent="handleFieldEnter('nomePai')"
                @keydown.tab="handleFieldTab('nomePai')"
              />
              <!-- Card do Nome do Pai -->
              <div v-else class="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-blue-900 truncate">{{ form.nomePai }}</div>
                </div>
                <button
                  type="button"
                  @click="removerCard('nomePai')"
                  class="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100 flex-shrink-0"
                  title="Editar nome do pai"
                  tabindex="-1"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <!-- CPF, RG e Data Expedição na mesma linha -->
          <div class="grid grid-cols-3 gap-4">
            <!-- CPF -->
            <div>
              <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                CPF <span class="text-red-500">*</span>
              </label>
              <input
                v-if="!fieldCards.cpf"
                v-model="form.cpf"
                name="cpf"
                type="text"
                maxlength="14"
                placeholder="000.000.000-00"
                class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-700"
                :class="{ 'border-red-500': errors.cpf }"
                @blur="validateField('cpf')"
                @keydown.enter.prevent="handleFieldEnter('cpf')"
                @keydown.tab="handleFieldTab('cpf')"
              />
              <!-- Card do CPF -->
              <div v-else class="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-blue-900">{{ form.cpf }}</div>
                </div>
                <button
                  type="button"
                  @click="removerCard('cpf')"
                  class="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100 flex-shrink-0"
                  title="Editar CPF"
                  tabindex="-1"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p v-if="errors.cpf" class="mt-1 text-xs text-red-500">{{ errors.cpf }}</p>
            </div>

            <!-- RG -->
            <div>
              <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">RG</label>
              <input
                v-if="!fieldCards.rg"
                v-model="form.rg"
                name="rg"
                type="text"
                class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-700"
                :class="{ 'border-red-500': errors.rg }"
                @blur="validateField('rg')"
                @keydown.enter.prevent="handleFieldEnter('rg')"
                @keydown.tab="handleFieldTab('rg')"
              />
              <!-- Card do RG -->
              <div v-else class="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-blue-900">{{ form.rg }}</div>
                </div>
                <button
                  type="button"
                  @click="removerCard('rg')"
                  class="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100 flex-shrink-0"
                  title="Editar RG"
                  tabindex="-1"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p v-if="errors.rg" class="mt-1 text-xs text-red-500">{{ errors.rg }}</p>
            </div>

            <!-- Data Expedição RG -->
            <div>
              <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Data Expedição RG</label>
              <input
                v-if="!fieldCards.dataExp"
                v-model="form.dataExp"
                name="dataExp"
                type="date"
                class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-700"
                @keydown.enter.prevent="handleFieldEnter('dataExp')"
                @keydown.tab="handleFieldTab('dataExp')"
              />
              <!-- Card da Data Expedição -->
              <div v-else class="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-blue-900">{{ new Date(form.dataExp).toLocaleDateString('pt-BR') }}</div>
                </div>
                <button
                  type="button"
                  @click="removerCard('dataExp')"
                  class="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100 flex-shrink-0"
                  title="Editar data de expedição"
                  tabindex="-1"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <!-- Sexo -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Sexo <span class="text-red-500">*</span>
              </label>
              <!-- Quando não selecionado, mostra as duas opções -->
              <div v-if="!form.sexo" class="grid grid-cols-2 gap-2 mt-2">
                <button
                  type="button"
                  @click="form.sexo = 'M'; validateField('sexo')"
                  class="flex items-center justify-center gap-2 p-3 border rounded-lg transition-colors"
                  :class="'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 dark:bg-zinc-800 dark:border-zinc-700'"
                >
                  Masculino
                </button>
                <button
                  type="button"
                  @click="form.sexo = 'F'; validateField('sexo')"
                  class="flex items-center justify-center gap-2 p-3 border rounded-lg transition-colors"
                  :class="'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 dark:bg-zinc-800 dark:border-zinc-700'"
                >
                  Feminino
                </button>
              </div>
              <!-- Selecionado: vira um "chip" com botão de fechar para trocar -->
              <div v-else class="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-800 rounded-full text-sm font-medium dark:bg-blue-900 dark:text-blue-200">
                <span>{{ form.sexo === 'M' ? 'Masculino' : 'Feminino' }}</span>
                <button
                  type="button"
                  @click="form.sexo = ''; validateField('sexo')"
                  class="hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full p-0.5"
                  title="Trocar sexo"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p v-if="errors.sexo" class="mt-1 text-xs text-red-500">{{ errors.sexo }}</p>
            </div>

            <!-- Separador -->
            <div class="col-span-full border-t border-zinc-200 dark:border-zinc-700 my-2"></div>
            
            <!-- E-mail com verificação -->
            <div class="col-span-1">
              <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">E-mail</label>
              
              <!-- Card do Email quando verificado -->
              <div v-if="emailVerify.verified && fieldCards.email" class="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <svg class="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-green-900 truncate">{{ form.email }}</div>
                  <div class="text-xs text-green-600">Verificado</div>
                </div>
              </div>
              
              <!-- Input quando não verificado - TUDO EM UMA LINHA -->
              <div v-else class="flex items-center gap-2">
                <input
                  v-model="form.email"
                  name="email"
                  type="email"
                  placeholder="email@exemplo.com"
                  class="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-700"
                  :class="{ 'border-red-500': errors.email }"
                  @blur="validateField('email')"
                  @keydown.enter.prevent="handleFieldEnter('email')"
                  @keydown.tab="handleFieldTab('email')"
                />
                
                <!-- Botão verificar -->
                <button 
                  v-if="!emailVerify.code || (emailVerify.code && Date.now() > emailVerify.expiresAt)"
                  type="button" 
                  @click="startEmailVerification" 
                  class="rounded-full bg-[#0B61F3] px-3 h-7 text-sm font-semibold text-white shadow-sm hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap" 
                  :disabled="!form.email || emailVerify.sending"
                >
                  <svg v-if="emailVerify.sending" class="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>{{ emailVerify.sending ? 'Enviando...' : 'Verificar' }}</span>
                </button>
                
                <!-- Input de código (verifica ao digitar 6 números ou ao dar blur/enter/tab) -->
                <input 
                  v-if="emailVerify.code && !emailVerify.verified && Date.now() <= emailVerify.expiresAt"
                  v-model="(emailVerify as any).inputCode" 
                  type="text" 
                  inputmode="numeric" 
                  maxlength="6" 
                  placeholder="000000" 
                  class="w-28 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-700 text-center tracking-wider font-mono" 
                  @input="(e: any) => { if (e.target.value.length === 6) confirmEmailCode(e.target.value) }"
                  @keydown.enter.prevent="confirmEmailCode((emailVerify as any).inputCode || '')"
                  @blur="() => { if ((emailVerify as any).inputCode?.length === 6) confirmEmailCode((emailVerify as any).inputCode) }"
                />
                
                <!-- Timer -->
                <span v-if="emailVerify.code && !emailVerify.verified && Date.now() <= emailVerify.expiresAt" class="text-sm text-zinc-500 whitespace-nowrap">
                  {{ Math.max(0, Math.ceil((emailVerify.expiresAt - Date.now())/1000)) }}s
                </span>
              </div>
              
              <p v-if="emailVerify.error" class="mt-1 text-xs text-red-500">{{ emailVerify.error }}</p>
              <p v-if="errors.email" class="mt-1 text-xs text-red-500">{{ errors.email }}</p>
            </div>

            <!-- Telefone 1 com verificação -->
            <div class="col-span-1">
              <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Telefone 1 <span class="text-red-500">*</span>
                <button 
                  v-if="!showTelefone2"
                  type="button" 
                  class="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors" 
                  @click="showTelefone2 = true" 
                  title="Adicionar telefone 2"
                >
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v12m6-6H6"/>
                  </svg>
                </button>
              </label>
              
              <!-- Card do Telefone quando verificado -->
              <div v-if="phoneVerify.verified && fieldCards.telefone1" class="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <svg class="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-green-900">{{ form.telefone1 }}</div>
                  <div class="text-xs text-green-600">Verificado</div>
                </div>
              </div>
              
              <!-- Input quando não verificado -->
              <div v-else class="flex items-center gap-2">
                <input
                  v-model="form.telefone1"
                  name="telefone1"
                  type="tel"
                  placeholder="(11) 98888-8888"
                  class="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-700"
                  :class="{ 'border-red-500': errors.telefone1 }"
                  @blur="validateField('telefone1')"
                  @keydown.enter.prevent="handleFieldEnter('telefone1')"
                  @keydown.tab="handleFieldTab('telefone1')"
                />
                
                <!-- Botão verificar -->
                <button 
                  v-if="!phoneVerify.code || (phoneVerify.code && Date.now() > phoneVerify.expiresAt)"
                  type="button" 
                  @click="startSMSVerification" 
                  class="rounded-full bg-[#0B61F3] px-3 h-7 text-sm font-semibold text-white shadow-sm hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap" 
                  :disabled="!form.telefone1 || phoneVerify.sending"
                >
                  <svg v-if="phoneVerify.sending" class="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>{{ phoneVerify.sending ? 'Enviando...' : 'Verificar' }}</span>
                </button>
                
                <!-- Input de código (verifica ao digitar 6 números ou ao dar blur/enter/tab) -->
                <input 
                  v-if="phoneVerify.code && !phoneVerify.verified && Date.now() <= phoneVerify.expiresAt"
                  v-model="(phoneVerify as any).inputCode" 
                  type="text" 
                  inputmode="numeric" 
                  maxlength="6" 
                  placeholder="000000" 
                  class="w-28 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-700 text-center tracking-wider font-mono" 
                  @input="(e: any) => { if (e.target.value.length === 6) confirmSMSCode(e.target.value) }"
                  @keydown.enter.prevent="confirmSMSCode((phoneVerify as any).inputCode || '')"
                  @blur="() => { if ((phoneVerify as any).inputCode?.length === 6) confirmSMSCode((phoneVerify as any).inputCode) }"
                />
                
                <!-- Timer -->
                <span v-if="phoneVerify.code && !phoneVerify.verified && Date.now() <= phoneVerify.expiresAt" class="text-sm text-zinc-500 whitespace-nowrap">
                  {{ Math.max(0, Math.ceil((phoneVerify.expiresAt - Date.now())/1000)) }}s
                </span>
              </div>
              
              <p v-if="phoneVerify.error" class="mt-1 text-xs text-red-500">{{ phoneVerify.error }}</p>
              <p v-if="errors.telefone1" class="mt-1 text-xs text-red-500">{{ errors.telefone1 }}</p>
            </div>

            <!-- Telefone 2 (opcional) -->
            <div v-if="showTelefone2">
              <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Telefone 2 (opcional)</label>
              <input
                v-if="!fieldCards.telefone2"
                v-model="form.telefone2"
                name="telefone2"
                type="tel"
                placeholder="(11) 3333-3333"
                class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-700"
                @keydown.enter.prevent="handleFieldEnter('telefone2')"
                @keydown.tab="handleFieldTab('telefone2')"
              />
              <!-- Card do Telefone 2 -->
              <div v-else class="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-blue-900">{{ form.telefone2 }}</div>
                </div>
                <button
                  type="button"
                  @click="removerCard('telefone2')"
                  class="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100 flex-shrink-0"
                  title="Editar telefone 2"
                  tabindex="-1"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div class="mt-1">
                <button type="button" class="text-xs text-zinc-600 hover:text-zinc-800 hover:underline" @click="showTelefone2 = false">
                  <svg class="w-3 h-3 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Remover telefone 2
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Coluna 2: Funções e Endereço -->
      <div class="grid grid-rows-2 gap-6 h-full">
        <!-- Funções -->
        <section class="card p-4 flex flex-col">
          <h3 class="text-[11px] uppercase text-zinc-500 mb-2">Funções (máx. 6)</h3>
          
          <div class="space-y-3 flex-1">
            <!-- Busca de Funções -->
            <div class="relative">
              <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Buscar Função
              </label>
              
              <!-- Dropdown de Autocomplete - ACIMA do input quando há chips -->
              <ul 
                v-if="showFuncoesDropdown && filteredAtividades.length && funcoesSelecionadas.length < 6 && funcoesSelecionadas.length > 0" 
                class="absolute z-10 bottom-full mb-1 max-h-48 w-full overflow-auto rounded-lg border bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
              >
                <li 
                  v-for="(opt, index) in filteredAtividades" 
                  :key="'atv'+opt.value" 
                  class="cursor-pointer px-3 py-2 text-sm transition-colors"
                  :class="[
                    index === activeAtividadeIndex ? 'bg-blue-100 dark:bg-blue-900 funcao-dropdown-item-active' : 'hover:bg-blue-50 dark:hover:bg-zinc-800'
                  ]"
                  @mousedown.prevent="adicionarFuncao(opt)"
                  @mouseenter="activeAtividadeIndex = index"
                >
                  {{ opt.text }}
                </li>
              </ul>
              
              <input
                v-model="funcoesSearch"
                @focus="showFuncoesDropdown = true; ensureAtividades()"
                @input="showFuncoesDropdown = true"
                @blur="handleFuncoesBlur"
                @keydown="handleFuncoesKeydown"
                placeholder="Digite para buscar..."
                class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-700"
                :disabled="funcoesSelecionadas.length >= 6"
              />
              
              <!-- Dropdown de Autocomplete - ABAIXO do input quando NÃO há chips -->
              <ul 
                v-if="showFuncoesDropdown && filteredAtividades.length && funcoesSelecionadas.length === 0" 
                class="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
              >
                <li 
                  v-for="(opt, index) in filteredAtividades" 
                  :key="'atv'+opt.value" 
                  class="cursor-pointer px-3 py-2 text-sm transition-colors"
                  :class="[
                    index === activeAtividadeIndex ? 'bg-blue-100 dark:bg-blue-900 funcao-dropdown-item-active' : 'hover:bg-blue-50 dark:hover:bg-zinc-800'
                  ]"
                  @mousedown.prevent="adicionarFuncao(opt)"
                  @mouseenter="activeAtividadeIndex = index"
                >
                  {{ opt.text }}
                </li>
              </ul>
            </div>

            <!-- Chips de Funções Selecionadas -->
            <div v-if="funcoesSelecionadas.length > 0" class="flex flex-wrap gap-2">
              <div
                v-for="(funcao, index) in funcoesSelecionadas"
                :key="'chip-' + funcao.value"
                class="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-800 rounded-full text-sm font-medium dark:bg-blue-900 dark:text-blue-200"
              >
                <span>{{ funcao.text }}</span>
                <button
                  type="button"
                  @click="removerFuncao(index)"
                  class="hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full p-0.5"
                  title="Remover função"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- Mensagem quando vazio -->
            <p v-if="funcoesSelecionadas.length === 0" class="text-sm text-zinc-500">
              Nenhuma função selecionada
            </p>

            <!-- Contador -->
            <p class="text-xs text-zinc-500">
              {{ funcoesSelecionadas.length }} de 6 funções selecionadas
            </p>
          </div>
        </section>

        <!-- Endereço -->
        <section class="card p-4 flex flex-col">
          <h3 class="text-[11px] uppercase text-zinc-500 mb-2">Endereço</h3>
        
          <div class="grid grid-cols-1 gap-4 flex-1">
          <!-- CEP -->
          <div>
            <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">CEP <span class="text-red-500">*</span></label>
            <div v-if="!fieldCards.cep" class="relative max-w-[200px]">
              <input
                ref="cepInput"
                v-model="form.cep"
                name="cep"
                type="text"
                maxlength="9"
                placeholder="00000-000"
                class="w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-700"
                :class="{ 'border-red-500': errors.cep }"
                @blur="buscarCep"
                @keydown.enter.prevent="handleFieldEnter('cep')"
                @keydown.tab="handleFieldTab('cep')"
              />
              <button
                type="button"
                @click="buscarCep"
                class="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-zinc-100 rounded-md transition-colors"
              >
                <svg class="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
              </button>
            </div>
            <!-- Card do CEP -->
            <div v-else class="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg max-w-[200px]">
              <div class="flex-1 min-w-0">
                <div class="font-medium text-blue-900">{{ form.cep }}</div>
              </div>
              <button
                type="button"
                @click="removerCard('cep')"
                class="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100 flex-shrink-0"
                title="Editar CEP"
                tabindex="-1"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p v-if="errors.cep" class="mt-1 text-xs text-red-500">{{ errors.cep }}</p>
          </div>

          <!-- Card consolidado do endereço (após buscar CEP) -->
          <div v-if="enderecoCard">
            <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Endereço Completo <span class="text-red-500">*</span></label>
            <div class="flex items-start gap-2 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div class="flex-1 min-w-0">
                <div class="font-medium text-blue-900 flex flex-wrap items-center gap-2">
                  <span>{{ form.logradouro }}, {{ form.bairro }}, {{ form.cidade }} - {{ form.uf }}</span>
                  <span v-if="form.regiao" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-200 text-blue-800">
                    {{ form.regiao }}
                  </span>
                </div>
              </div>
              <button
                type="button"
                @click="removerEnderecoCard"
                class="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100 flex-shrink-0"
                title="Editar endereço"
                tabindex="-1"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Número e Complemento na mesma linha -->
          <div class="grid grid-cols-[1fr_2fr] gap-4">
            <!-- Número -->
            <div>
              <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Número <span class="text-red-500">*</span></label>
              <input
                v-if="!fieldCards.numero"
                ref="numeroInput"
                v-model="form.numero"
                name="numero"
                type="text"
                class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-700"
                :class="{ 'border-red-500': errors.numero }"
                @keydown.enter.prevent="handleFieldEnter('numero')"
                @keydown.tab="handleFieldTab('numero')"
              />
              <!-- Card do Número -->
              <div v-else class="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-blue-900">{{ form.numero }}</div>
                </div>
                <button
                  type="button"
                  @click="removerCard('numero')"
                  class="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100 flex-shrink-0"
                  title="Editar número"
                  tabindex="-1"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p v-if="errors.cep" class="mt-1 text-xs text-red-500">{{ errors.numero }}</p>
            </div>

            <!-- Complemento -->
            <div>
              <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Complemento</label>
              <input
                v-if="!fieldCards.complemento"
                v-model="form.complemento"
                name="complemento"
                type="text"
                class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-700"
                @keydown.enter.prevent="handleFieldEnter('complemento')"
                @keydown.tab="handleFieldTab('complemento')"
              />
              <!-- Card do Complemento -->
              <div v-else class="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-blue-900 truncate">{{ form.complemento }}</div>
                </div>
                <button
                  type="button"
                  @click="removerCard('complemento')"
                  class="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100 flex-shrink-0"
                  title="Editar complemento"
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
      </section>
      </div>
    </div>

    <!-- Linha 2: Documentos + Dados Bancários -->
    <div class="grid grid-cols-1 lg:grid-cols-[60%_40%] gap-6">
      <!-- Documentos -->
      <section class="card p-4">
        <h3 class="text-[11px] uppercase text-zinc-500 mb-2">Documentos</h3>
        
        <div class="grid grid-cols-3 gap-3">
          <!-- Card 1: RG (Frente e Verso) - Ocupa 1 slot do grid -->
          <div class="grid grid-cols-2 gap-2">
            <!-- RG Frente -->
            <div 
              @click="documentos.rgFrente.file ? null : triggerFileInput('rgFrente')"
              :class="[
                'border-2 border-dashed rounded-lg p-3 transition-colors cursor-pointer group relative',
                documentos.rgFrente.file 
                  ? documentos.rgFrente.status === 'approved' 
                    ? 'border-green-400 bg-green-50' 
                    : documentos.rgFrente.status === 'rejected' 
                      ? 'border-red-400 bg-red-50' 
                      : 'border-yellow-400 bg-yellow-50'
                  : 'border-zinc-300 dark:border-zinc-700 hover:border-blue-400'
              ]"
            >
              <input 
                type="file" 
                :id="'file-rgFrente'" 
                @change="handleFileSelect('rgFrente', $event)" 
                accept="image/*,.pdf"
                class="hidden"
              />
              
              <div v-if="!documentos.rgFrente.file" class="flex flex-col items-center gap-1.5">
                <!-- Ícone de Cartão de Identidade -->
                <svg class="w-6 h-6 text-zinc-400 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                </svg>
                <span class="text-[10px] font-medium text-zinc-600 dark:text-zinc-400 text-center leading-tight">RG<br/>Frente</span>
              </div>
              
              <div v-else class="flex flex-col items-center gap-1">
                <!-- Ícone de Status -->
                <svg v-if="documentos.rgFrente.status === 'approved'" class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <svg v-else-if="documentos.rgFrente.status === 'rejected'" class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <svg v-else class="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span class="text-[9px] font-medium text-center leading-tight truncate w-full">{{ documentos.rgFrente.fileName }}</span>
                
                <!-- Botão Remover -->
                <button 
                  @click.stop="removeDocument('rgFrente')" 
                  class="absolute top-1 right-1 bg-white dark:bg-zinc-800 rounded-full p-0.5 hover:bg-red-100 transition-colors"
                  title="Remover"
                >
                  <svg class="w-3 h-3 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <!-- RG Verso -->
            <div 
              @click="documentos.rgVerso.file ? null : triggerFileInput('rgVerso')"
              :class="[
                'border-2 border-dashed rounded-lg p-3 transition-colors cursor-pointer group relative',
                documentos.rgVerso.file 
                  ? documentos.rgVerso.status === 'approved' 
                    ? 'border-green-400 bg-green-50' 
                    : documentos.rgVerso.status === 'rejected' 
                      ? 'border-red-400 bg-red-50' 
                      : 'border-yellow-400 bg-yellow-50'
                  : 'border-zinc-300 dark:border-zinc-700 hover:border-blue-400'
              ]"
            >
              <input 
                type="file" 
                :id="'file-rgVerso'" 
                @change="handleFileSelect('rgVerso', $event)" 
                accept="image/*,.pdf"
                class="hidden"
              />
              
              <div v-if="!documentos.rgVerso.file" class="flex flex-col items-center gap-1.5">
                <!-- Ícone de Cartão de Identidade (verso) -->
                <svg class="w-6 h-6 text-zinc-400 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span class="text-[10px] font-medium text-zinc-600 dark:text-zinc-400 text-center leading-tight">RG<br/>Verso</span>
              </div>
              
              <div v-else class="flex flex-col items-center gap-1">
                <!-- Ícone de Status -->
                <svg v-if="documentos.rgVerso.status === 'approved'" class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <svg v-else-if="documentos.rgVerso.status === 'rejected'" class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <svg v-else class="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span class="text-[9px] font-medium text-center leading-tight truncate w-full">{{ documentos.rgVerso.fileName }}</span>
                
                <!-- Botão Remover -->
                <button 
                  @click.stop="removeDocument('rgVerso')" 
                  class="absolute top-1 right-1 bg-white dark:bg-zinc-800 rounded-full p-0.5 hover:bg-red-100 transition-colors"
                  title="Remover"
                >
                  <svg class="w-3 h-3 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          
          <!-- (Removido) Card de CNH com leitura automática -->

          <!-- Card 2: Foto 3x4 -->
          <div 
            @click="documentos.foto3x4.file ? null : triggerFileInput('foto3x4')"
            :class="[
              'border-2 border-dashed rounded-lg p-4 transition-colors cursor-pointer group relative',
              documentos.foto3x4.file 
                ? documentos.foto3x4.status === 'approved' 
                  ? 'border-green-400 bg-green-50' 
                  : documentos.foto3x4.status === 'rejected' 
                    ? 'border-red-400 bg-red-50' 
                    : 'border-yellow-400 bg-yellow-50'
                : 'border-zinc-300 dark:border-zinc-700 hover:border-blue-400'
            ]"
          >
            <input 
              type="file" 
              :id="'file-foto3x4'" 
              @change="handleFileSelect('foto3x4', $event)" 
              accept="image/*"
              class="hidden"
            />
            
            <div v-if="!documentos.foto3x4.file" class="flex flex-col items-center gap-2">
              <!-- Ícone de Câmera/Foto -->
              <svg class="w-8 h-8 text-zinc-400 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span class="text-xs font-medium text-zinc-600 dark:text-zinc-400 text-center">Foto 3x4</span>
            </div>
            
            <div v-else class="flex flex-col items-center gap-2">
              <!-- Ícone de Status -->
              <svg v-if="documentos.foto3x4.status === 'approved'" class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <svg v-else-if="documentos.foto3x4.status === 'rejected'" class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <svg v-else class="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span class="text-xs font-medium text-center truncate w-full px-2">{{ documentos.foto3x4.fileName }}</span>
              
              <!-- Botão Remover -->
              <button 
                @click.stop="removeDocument('foto3x4')" 
                class="absolute top-2 right-2 bg-white dark:bg-zinc-800 rounded-full p-1 hover:bg-red-100 transition-colors"
                title="Remover"
              >
                <svg class="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Card 3: Foto com Uniforme -->
          <div 
            @click="documentos.fotoUniforme.file ? null : triggerFileInput('fotoUniforme')"
            :class="[
              'border-2 border-dashed rounded-lg p-4 transition-colors cursor-pointer group relative',
              documentos.fotoUniforme.file 
                ? documentos.fotoUniforme.status === 'approved' 
                  ? 'border-green-400 bg-green-50' 
                  : documentos.fotoUniforme.status === 'rejected' 
                    ? 'border-red-400 bg-red-50' 
                    : 'border-yellow-400 bg-yellow-50'
                : 'border-zinc-300 dark:border-zinc-700 hover:border-blue-400'
            ]"
          >
            <input 
              type="file" 
              :id="'file-fotoUniforme'" 
              @change="handleFileSelect('fotoUniforme', $event)" 
              accept="image/*"
              class="hidden"
            />
            
            <div v-if="!documentos.fotoUniforme.file" class="flex flex-col items-center gap-2">
              <!-- Ícone de Pessoa com Uniforme -->
              <svg class="w-8 h-8 text-zinc-400 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span class="text-xs font-medium text-zinc-600 dark:text-zinc-400 text-center">Foto Uniforme</span>
            </div>
            
            <div v-else class="flex flex-col items-center gap-2">
              <!-- Ícone de Status -->
              <svg v-if="documentos.fotoUniforme.status === 'approved'" class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <svg v-else-if="documentos.fotoUniforme.status === 'rejected'" class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <svg v-else class="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span class="text-xs font-medium text-center truncate w-full px-2">{{ documentos.fotoUniforme.fileName }}</span>
              
              <!-- Botão Remover -->
              <button 
                @click.stop="removeDocument('fotoUniforme')" 
                class="absolute top-2 right-2 bg-white dark:bg-zinc-800 rounded-full p-1 hover:bg-red-100 transition-colors"
                title="Remover"
              >
                <svg class="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Card 4: Comprovante Residência -->
          <div 
            @click="documentos.comprovanteResidencia.file ? null : triggerFileInput('comprovanteResidencia')"
            :class="[
              'border-2 border-dashed rounded-lg p-4 transition-colors cursor-pointer group relative',
              documentos.comprovanteResidencia.file 
                ? documentos.comprovanteResidencia.status === 'approved' 
                  ? 'border-green-400 bg-green-50' 
                  : documentos.comprovanteResidencia.status === 'rejected' 
                    ? 'border-red-400 bg-red-50' 
                    : 'border-yellow-400 bg-yellow-50'
                : 'border-zinc-300 dark:border-zinc-700 hover:border-blue-400'
            ]"
          >
            <input 
              type="file" 
              :id="'file-comprovanteResidencia'" 
              @change="handleFileSelect('comprovanteResidencia', $event)" 
              accept="image/*,.pdf"
              class="hidden"
            />
            
            <div v-if="!documentos.comprovanteResidencia.file" class="flex flex-col items-center gap-2">
              <!-- Ícone de Casa/Residência -->
              <svg class="w-8 h-8 text-zinc-400 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span class="text-xs font-medium text-zinc-600 dark:text-zinc-400 text-center">Comp. Residência</span>
            </div>
            
            <div v-else class="flex flex-col items-center gap-2">
              <!-- Ícone de Status -->
              <svg v-if="documentos.comprovanteResidencia.status === 'approved'" class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <svg v-else-if="documentos.comprovanteResidencia.status === 'rejected'" class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <svg v-else class="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span class="text-xs font-medium text-center truncate w-full px-2">{{ documentos.comprovanteResidencia.fileName }}</span>
              
              <!-- Botão Remover -->
              <button 
                @click.stop="removeDocument('comprovanteResidencia')" 
                class="absolute top-2 right-2 bg-white dark:bg-zinc-800 rounded-full p-1 hover:bg-red-100 transition-colors"
                title="Remover"
              >
                <svg class="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Card 5: Antecedentes Criminais -->
          <div 
            @click="documentos.antecedentesCriminais.file ? null : triggerFileInput('antecedentesCriminais')"
            :class="[
              'border-2 border-dashed rounded-lg p-4 transition-colors cursor-pointer group relative',
              documentos.antecedentesCriminais.file 
                ? documentos.antecedentesCriminais.status === 'approved' 
                  ? 'border-green-400 bg-green-50' 
                  : documentos.antecedentesCriminais.status === 'rejected' 
                    ? 'border-red-400 bg-red-50' 
                    : 'border-yellow-400 bg-yellow-50'
                : 'border-zinc-300 dark:border-zinc-700 hover:border-blue-400'
            ]"
          >
            <input 
              type="file" 
              :id="'file-antecedentesCriminais'" 
              @change="handleFileSelect('antecedentesCriminais', $event)" 
              accept="image/*,.pdf"
              class="hidden"
            />
            
            <div v-if="!documentos.antecedentesCriminais.file" class="flex flex-col items-center gap-2">
              <!-- Ícone de Escudo/Segurança -->
              <svg class="w-8 h-8 text-zinc-400 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span class="text-xs font-medium text-zinc-600 dark:text-zinc-400 text-center">Antec. Criminais</span>
            </div>
            
            <div v-else class="flex flex-col items-center gap-2">
              <!-- Ícone de Status -->
              <svg v-if="documentos.antecedentesCriminais.status === 'approved'" class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <svg v-else-if="documentos.antecedentesCriminais.status === 'rejected'" class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <svg v-else class="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span class="text-xs font-medium text-center truncate w-full px-2">{{ documentos.antecedentesCriminais.fileName }}</span>
              
              <!-- Botão Remover -->
              <button 
                @click.stop="removeDocument('antecedentesCriminais')" 
                class="absolute top-2 right-2 bg-white dark:bg-zinc-800 rounded-full p-1 hover:bg-red-100 transition-colors"
                title="Remover"
              >
                <svg class="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Card 6: Atestado Médico -->
          <div 
            @click="documentos.atestadoMedico.file ? null : triggerFileInput('atestadoMedico')"
            :class="[
              'border-2 border-dashed rounded-lg p-4 transition-colors cursor-pointer group relative',
              documentos.atestadoMedico.file 
                ? documentos.atestadoMedico.status === 'approved' 
                  ? 'border-green-400 bg-green-50' 
                  : documentos.atestadoMedico.status === 'rejected' 
                    ? 'border-red-400 bg-red-50' 
                    : 'border-yellow-400 bg-yellow-50'
                : 'border-zinc-300 dark:border-zinc-700 hover:border-blue-400'
            ]"
          >
            <input 
              type="file" 
              :id="'file-atestadoMedico'" 
              @change="handleFileSelect('atestadoMedico', $event)" 
              accept="image/*,.pdf"
              class="hidden"
            />
            
            <div v-if="!documentos.atestadoMedico.file" class="flex flex-col items-center gap-2">
              <!-- Ícone de Documento Médico -->
              <svg class="w-8 h-8 text-zinc-400 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 3v6a1 1 0 001 1h6" />
              </svg>
              <span class="text-xs font-medium text-zinc-600 dark:text-zinc-400 text-center">Atestado Médico</span>
            </div>
            
            <div v-else class="flex flex-col items-center gap-2">
              <!-- Ícone de Status -->
              <svg v-if="documentos.atestadoMedico.status === 'approved'" class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <svg v-else-if="documentos.atestadoMedico.status === 'rejected'" class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <svg v-else class="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span class="text-xs font-medium text-center truncate w-full px-2">{{ documentos.atestadoMedico.fileName }}</span>
              
              <!-- Botão Remover -->
              <button 
                @click.stop="removeDocument('atestadoMedico')" 
                class="absolute top-2 right-2 bg-white dark:bg-zinc-800 rounded-full p-1 hover:bg-red-100 transition-colors"
                title="Remover"
              >
                <svg class="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Dados Bancários -->
      <section class="card p-4">
        <h3 class="text-[11px] uppercase text-zinc-500 mb-2">Dados Bancários</h3>
        
        <div class="grid grid-cols-1 gap-4">
          <!-- Tipo de Pagamento -->
          <div>
            <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Tipo de Pagamento
            </label>
            
            <!-- Quando não selecionado, mostra as opções -->
            <div v-if="!form.tipoPagto" class="grid grid-cols-2 gap-2 mt-2">
              <button
                type="button"
                @click="form.tipoPagto = 'PIX'"
                class="flex items-center justify-center gap-1.5 px-2 py-2 border rounded-lg transition-colors border-zinc-300 bg-white text-zinc-700 hover:border-blue-400 hover:bg-blue-50 dark:bg-zinc-800 dark:border-zinc-700 dark:hover:border-blue-500 dark:hover:bg-blue-900/20"
              >
                <svg class="w-4 h-4" viewBox="0 0 48 48" fill="currentColor">
                  <path fill="#4db6ac" d="M11.9,12h-0.68l8.04-8.04c2.62-2.61,6.86-2.61,9.48,0L36.78,12H36.1c-1.6,0-3.11,0.62-4.24,1.76l-6.8,6.77c-0.59,0.59-1.53,0.59-2.12,0l-6.8-6.77C15.01,12.62,13.5,12,11.9,12z"/>
                  <path fill="#4db6ac" d="M36.1,36h0.68l-8.04,8.04c-2.62,2.61-6.86,2.61-9.48,0L11.22,36h0.68c1.6,0,3.11-0.62,4.24-1.76l6.8-6.77c0.59-0.59,1.53-0.59,2.12,0l6.8,6.77C32.99,35.38,34.5,36,36.1,36z"/>
                  <path fill="#4db6ac" d="M44.04,28.74L38.78,34H36.1c-1.07,0-2.07-0.42-2.83-1.17l-6.8-6.78c-1.36-1.36-3.58-1.36-4.94,0l-6.8,6.78C13.97,33.58,12.97,34,11.9,34H9.22l-5.26-5.26c-2.61-2.62-2.61-6.86,0-9.48L9.22,14h2.68c1.07,0,2.07,0.42,2.83,1.17l6.8,6.78c0.68,0.68,1.58,1.02,2.47,1.02s1.79-0.34,2.47-1.02l6.8-6.78C34.03,14.42,35.03,14,36.1,14h2.68l5.26,5.26C46.65,21.88,46.65,26.12,44.04,28.74z"/>
                </svg>
                <span class="text-sm font-medium">PIX</span>
              </button>
              <button
                type="button"
                @click="form.tipoPagto = 'TED'"
                class="flex items-center justify-center gap-1.5 px-2 py-2 border rounded-lg transition-colors border-zinc-300 bg-white text-zinc-700 hover:border-blue-400 hover:bg-blue-50 dark:bg-zinc-800 dark:border-zinc-700 dark:hover:border-blue-500 dark:hover:bg-blue-900/20"
              >
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11 8c0 2.21-1.79 4-4 4s-4-1.79-4-4 1.79-4 4-4 4 1.79 4 4zm0 6.72V20H0v-2c0-2.21 3.13-4 7-4 1.5 0 2.87.27 4 .72zM24 20H13V3h11v17zM16 8.43c0 .52-.43.95-.95.95h-4.1c-.52 0-.95-.43-.95-.95v-4.1c0-.52.43-.95.95-.95h4.1c.52 0 .95.43.95.95v4.1z"/>
                </svg>
                <span class="text-sm font-medium">TED</span>
              </button>
            </div>
            
            <!-- Selecionado: vira um "chip" com botão de fechar para trocar -->
            <div v-else class="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-800 rounded-full text-sm font-medium dark:bg-blue-900 dark:text-blue-200">
              <svg v-if="form.tipoPagto === 'PIX'" class="w-4 h-4" viewBox="0 0 48 48" fill="currentColor">
                <path fill="#4db6ac" d="M11.9,12h-0.68l8.04-8.04c2.62-2.61,6.86-2.61,9.48,0L36.78,12H36.1c-1.6,0-3.11,0.62-4.24,1.76l-6.8,6.77c-0.59,0.59-1.53,0.59-2.12,0l-6.8-6.77C15.01,12.62,13.5,12,11.9,12z"/>
                <path fill="#4db6ac" d="M36.1,36h0.68l-8.04,8.04c-2.62,2.61-6.86,2.61-9.48,0L11.22,36h0.68c1.6,0,3.11-0.62,4.24-1.76l6.8-6.77c0.59-0.59,1.53-0.59,2.12,0l6.8,6.77C32.99,35.38,34.5,36,36.1,36z"/>
                <path fill="#4db6ac" d="M44.04,28.74L38.78,34H36.1c-1.07,0-2.07-0.42-2.83-1.17l-6.8-6.78c-1.36-1.36-3.58-1.36-4.94,0l-6.8,6.78C13.97,33.58,12.97,34,11.9,34H9.22l-5.26-5.26c-2.61-2.62-2.61-6.86,0-9.48L9.22,14h2.68c1.07,0,2.07,0.42,2.83,1.17l6.8,6.78c0.68,0.68,1.58,1.02,2.47,1.02s1.79-0.34,2.47-1.02l6.8-6.78C34.03,14.42,35.03,14,36.1,14h2.68l5.26,5.26C46.65,21.88,46.65,26.12,44.04,28.74z"/>
              </svg>
              <svg v-else class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M11 8c0 2.21-1.79 4-4 4s-4-1.79-4-4 1.79-4 4-4 4 1.79 4 4zm0 6.72V20H0v-2c0-2.21 3.13-4 7-4 1.5 0 2.87.27 4 .72zM24 20H13V3h11v17zM16 8.43c0 .52-.43.95-.95.95h-4.1c-.52 0-.95-.43-.95-.95v-4.1c0-.52.43-.95.95-.95h4.1c.52 0 .95.43.95.95v4.1z"/>
              </svg>
              <span>{{ form.tipoPagto }}</span>
              <button
                type="button"
                @click="form.tipoPagto = ''"
                class="hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full p-0.5"
                title="Trocar tipo de pagamento"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Chave PIX (apenas quando PIX selecionado) -->
          <div v-if="form.tipoPagto === 'PIX'">
            <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Chave PIX</label>
            <input
              v-if="!fieldCards.chavePix"
              v-model="form.chavePix"
              name="chavePix"
              type="text"
              placeholder="Digite a chave PIX..."
              class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-700"
              @keydown.enter.prevent="handleFieldEnter('chavePix')"
              @keydown.tab="handleFieldTab('chavePix')"
            />
            <!-- Card da Chave PIX -->
            <div v-else class="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div class="flex-1 min-w-0">
                <div class="font-medium text-blue-900 truncate">{{ form.chavePix }}</div>
              </div>
              <button
                type="button"
                @click="removerCard('chavePix')"
                class="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100 flex-shrink-0"
                title="Editar chave PIX"
                tabindex="-1"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Banco (apenas quando TED selecionado) -->
          <div v-if="form.tipoPagto === 'TED'">
            <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Banco</label>
            
            <div v-if="!fieldCards.banco" class="relative">
              <!-- Dropdown de Autocomplete -->
              <ul 
                v-if="showBancoDropdown && filteredBancos.length" 
                class="absolute z-10 bottom-full mb-1 max-h-60 w-full overflow-auto rounded-lg border bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
              >
                <li 
                  v-for="(banco, index) in filteredBancos" 
                  :key="banco.codigo" 
                  class="cursor-pointer px-3 py-2 text-sm transition-colors"
                  :class="[
                    index === activeBancoIndex ? 'bg-blue-100 dark:bg-blue-900 banco-dropdown-item-active' : 'hover:bg-blue-50 dark:hover:bg-zinc-800'
                  ]"
                  @click.prevent="selecionarBanco(banco)"
                  @mouseenter="activeBancoIndex = index"
                >
                  <span class="font-medium">{{ banco.codigo }}</span> - {{ banco.nome }}
                </li>
              </ul>
              
              <input
                v-model="bancoSearch"
                @focus="showBancoDropdown = true; ensureBancos()"
                @input="showBancoDropdown = true; activeBancoIndex = 0"
                @blur="handleBancoBlur"
                @keydown="handleBancoKeydown"
                name="banco"
                type="text"
                placeholder="Digite o nome ou código do banco..."
                class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-700"
              />
            </div>
            
            <!-- Card do Banco -->
            <div v-else class="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div class="flex-1 min-w-0">
                <div class="font-medium text-blue-900 truncate">{{ form.banco }}</div>
              </div>
              <button
                type="button"
                @click="removerCard('banco'); bancoSearch = ''"
                class="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100 flex-shrink-0"
                title="Editar banco"
                tabindex="-1"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Agência e Conta (apenas quando TED selecionado) -->
          <div v-if="form.tipoPagto === 'TED'" class="grid grid-cols-3 gap-4">
            <!-- Agência -->
            <div>
              <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Agência</label>
              <input
                v-if="!fieldCards.agencia"
                v-model="form.agencia"
                name="agencia"
                type="text"
                placeholder="0000"
                class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-700"
                @keydown.enter.prevent="handleFieldEnter('agencia')"
                @keydown.tab="handleFieldTab('agencia')"
              />
              <!-- Card da Agência -->
              <div v-else class="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-blue-900">{{ form.agencia }}</div>
                </div>
                <button
                  type="button"
                  @click="removerCard('agencia')"
                  class="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100 flex-shrink-0"
                  title="Editar agência"
                  tabindex="-1"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- Conta -->
            <div>
              <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Conta</label>
              <input
                v-if="!fieldCards.conta"
                v-model="form.conta"
                name="conta"
                type="text"
                placeholder="00000-0"
                class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-700"
                @keydown.enter.prevent="handleFieldEnter('conta')"
                @keydown.tab="handleFieldTab('conta')"
              />
              <!-- Card da Conta -->
              <div v-else class="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-blue-900">{{ form.conta }}</div>
                </div>
                <button
                  type="button"
                  @click="removerCard('conta')"
                  class="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100 flex-shrink-0"
                  title="Editar conta"
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
      </section>
    </div>

    <!-- Observações -->
    <section class="card p-4">
      <h3 class="text-[11px] uppercase text-zinc-500 mb-2">Observações</h3>
      
      <textarea
        v-model="form.observacoes"
        rows="4"
        class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-700"
        placeholder="Informações adicionais sobre o cooperado..."
      ></textarea>
    </section>

    <!-- Botões de Ação -->
    <div v-if="!hideActions" class="flex items-center justify-end gap-3 pt-4">
      <button
        type="button"
        @click="handleCancel"
        class="px-6 py-2.5 border border-zinc-300 dark:border-zinc-600 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
        :disabled="loading"
      >
        Cancelar
      </button>
      <button
        type="submit"
        class="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center gap-2"
        :disabled="loading"
      >
        <svg v-if="loading" class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>{{ mode === 'create' ? 'Cadastrar Cooperado' : 'Salvar Alterações' }}</span>
      </button>
    </div>
  </form>
</template>
