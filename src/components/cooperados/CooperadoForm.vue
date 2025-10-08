<script setup lang="ts">
import { ref, computed, watch } from 'vue'

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
  banco: false,
  agencia: false,
  conta: false,
})

// Card de endereço (agrupa todos os campos bloqueados do CEP)
const enderecoCard = ref(false)

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
  status: 'Pendente',
  situacaoCooperativa: 4, // Pré-Cadastro por padrão
  cooperativa: '',
  tipoPagto: '',
  banco: '',
  agencia: '',
  conta: '',
  digConta: '',
  observacoes: '',
  ...props.initialData
})

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
  cidade: 'Cidade é obrigatória',
  uf: 'UF é obrigatória',
}))

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
    const cleaned = String(value).replace(/\D/g, '')
    if (cleaned.length !== 11) {
      errors.value[field] = 'CPF deve ter 11 dígitos'
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
  
  return isValid
}

function handleSave() {
  if (!validateForm()) {
    const firstError = Object.keys(errors.value)[0]
    const errorEl = document.querySelector(`[name="${firstError}"]`) as HTMLElement
    errorEl?.focus()
    return
  }
  
  emit('save', { ...form.value })
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

defineExpose({ form, validateForm })
</script>

<template>
  <form @submit.prevent="handleSave" class="space-y-6">
    <!-- Linha 1: Informações Pessoais + Situação Cooperativa -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
              <div class="grid grid-cols-2 gap-2 mt-2">
                <button
                  type="button"
                  @click="form.sexo = 'M'; validateField('sexo')"
                  class="py-2 px-3 rounded-lg border-2 transition-all text-sm font-medium"
                  :class="form.sexo === 'M' 
                    ? 'border-blue-500 bg-blue-50 text-blue-700' 
                    : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400'"
                >
                  Masculino
                </button>
                <button
                  type="button"
                  @click="form.sexo = 'F'; validateField('sexo')"
                  class="py-2 px-3 rounded-lg border-2 transition-all text-sm font-medium"
                  :class="form.sexo === 'F' 
                    ? 'border-blue-500 bg-blue-50 text-blue-700' 
                    : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400'"
                >
                  Feminino
                </button>
              </div>
              <p v-if="errors.sexo" class="mt-1 text-xs text-red-500">{{ errors.sexo }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Coluna 2: Endereço -->
      <div class="space-y-6">
        <!-- Situação Cooperativa: valor padrão definido no form.situacaoCooperativa = 4 (Pré-Cadastro) -->

        <!-- Endereço -->
        <section class="card p-4">
          <h3 class="text-[11px] uppercase text-zinc-500 mb-2">Endereço</h3>
        
        <div class="grid grid-cols-1 gap-4">
          <!-- CEP com ícone de busca -->
          <div class="grid grid-cols-[200px_1fr] gap-4">
            <div>
              <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">CEP</label>
              <div v-if="!fieldCards.cep" class="relative">
                <input
                  ref="cepInput"
                  v-model="form.cep"
                  name="cep"
                  type="text"
                  maxlength="9"
                  placeholder="00000-000"
                  class="w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-700"
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
              <div v-else class="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
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
            </div>
            <div></div>
          </div>

          <!-- Card consolidado do endereço (após buscar CEP) -->
          <div v-if="enderecoCard">
            <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Endereço Completo</label>
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
              <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Número</label>
              <input
                v-if="!fieldCards.numero"
                ref="numeroInput"
                v-model="form.numero"
                name="numero"
                type="text"
                class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-700"
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

    <!-- Linha 2: Funções + Documentos -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Funções -->
      <section class="card p-4">
        <h3 class="text-[11px] uppercase text-zinc-500 mb-2">Funções</h3>
        <div class="text-sm text-zinc-500">
          <p>Cadastro de funções será implementado em breve.</p>
        </div>
      </section>

      <!-- Documentos -->
      <section class="card p-4">
        <h3 class="text-[11px] uppercase text-zinc-500 mb-2">Documentos</h3>
        <div class="text-sm text-zinc-500">
          <p>Upload de documentos será implementado em breve.</p>
        </div>
      </section>
    </div>

    <!-- Linha 3: Informações de Contato + Dados Bancários -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Informações de Contato -->
      <section class="card p-4">
        <h3 class="text-[11px] uppercase text-zinc-500 mb-2">Informações de Contato</h3>
        
        <div class="grid grid-cols-1 gap-4">
          <!-- E-mail -->
          <div>
            <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">E-mail</label>
            <input
              v-if="!fieldCards.email"
              v-model="form.email"
              name="email"
              type="email"
              class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-700"
              :class="{ 'border-red-500': errors.email }"
              @blur="validateField('email')"
              @keydown.enter.prevent="handleFieldEnter('email')"
              @keydown.tab="handleFieldTab('email')"
            />
            <!-- Card do Email -->
            <div v-else class="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div class="flex-1 min-w-0">
                <div class="font-medium text-blue-900 truncate">{{ form.email }}</div>
              </div>
              <button
                type="button"
                @click="removerCard('email')"
                class="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100 flex-shrink-0"
                title="Editar e-mail"
                tabindex="-1"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p v-if="errors.email" class="mt-1 text-xs text-red-500">{{ errors.email }}</p>
          </div>

          <!-- Telefone 1 -->
          <div>
            <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Telefone 1 <span class="text-red-500">*</span>
            </label>
            <input
              v-if="!fieldCards.telefone1"
              v-model="form.telefone1"
              name="telefone1"
              type="tel"
              placeholder="(11) 98888-8888"
              class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-700"
              :class="{ 'border-red-500': errors.telefone1 }"
              @blur="validateField('telefone1')"
              @keydown.enter.prevent="handleFieldEnter('telefone1')"
              @keydown.tab="handleFieldTab('telefone1')"
            />
            <!-- Card do Telefone 1 -->
            <div v-else class="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div class="flex-1 min-w-0">
                <div class="font-medium text-blue-900">{{ form.telefone1 }}</div>
              </div>
              <button
                type="button"
                @click="removerCard('telefone1')"
                class="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100 flex-shrink-0"
                title="Editar telefone"
                tabindex="-1"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p v-if="errors.telefone1" class="mt-1 text-xs text-red-500">{{ errors.telefone1 }}</p>
          </div>

          <!-- Telefone 2 -->
          <div>
            <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Telefone 2</label>
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
          </div>
        </div>
      </section>

      <!-- Dados Bancários -->
      <section class="card p-4">
        <h3 class="text-[11px] uppercase text-zinc-500 mb-2">Dados Bancários</h3>
        
        <div class="grid grid-cols-1 gap-4">
          <!-- Tipo de Pagamento -->
          <div>
            <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Tipo de Pagamento</label>
            <select
              v-model="form.tipoPagto"
              class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-700"
            >
              <option value="">Selecione...</option>
              <option value="PIX">PIX</option>
              <option value="TED">TED</option>
              <option value="Dinheiro">Dinheiro</option>
            </select>
          </div>

          <!-- Banco -->
          <div>
            <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Banco</label>
            <input
              v-if="!fieldCards.banco"
              v-model="form.banco"
              name="banco"
              type="text"
              placeholder="Nome do banco"
              class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-700"
              @keydown.enter.prevent="handleFieldEnter('banco')"
              @keydown.tab="handleFieldTab('banco')"
            />
            <!-- Card do Banco -->
            <div v-else class="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div class="flex-1 min-w-0">
                <div class="font-medium text-blue-900 truncate">{{ form.banco }}</div>
              </div>
              <button
                type="button"
                @click="removerCard('banco')"
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

          <div class="grid grid-cols-2 gap-4">
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
              <div v-if="!fieldCards.conta" class="flex gap-2">
                <input
                  v-model="form.conta"
                  name="conta"
                  type="text"
                  placeholder="00000"
                  class="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-700"
                  @keydown.enter.prevent="handleFieldEnter('conta')"
                  @keydown.tab="handleFieldTab('conta')"
                />
                <input
                  v-model="form.digConta"
                  type="text"
                  maxlength="1"
                  placeholder="0"
                  class="w-16 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-700"
                />
              </div>
              <!-- Card da Conta -->
              <div v-else class="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-blue-900">{{ form.conta }}<span v-if="form.digConta">-{{ form.digConta }}</span></div>
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
