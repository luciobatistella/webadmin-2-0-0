<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { listClients } from '@/services/clients'

export interface Client {
  id: string
  nome: string
  email?: string
  telefone?: string
  categoria?: string
  logo?: string
}

const props = withDefaults(defineProps<{
  modelValue?: Client | null
  placeholder?: string
  required?: boolean
  disabled?: boolean
}>(), {
  placeholder: 'Buscar cliente...',
  required: false,
  disabled: false
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: Client | null): void
  (e: 'client-selected', client: Client): void
}>()

const searchQuery = ref('')
const isOpen = ref(false)
const isLoading = ref(false)
const clients = ref<Client[]>([])
const selectedClient = ref<Client | null>(props.modelValue)
const highlightedIndex = ref(-1)

// Carrega clientes da API
async function loadClients() {
  try {
    isLoading.value = true
    const apiClients = await listClients()

    // Normaliza os dados da API para o formato esperado
    clients.value = apiClients.map((client: any) => ({
      id: client.id || client.cliente_id,
      nome: client.nome_comercial || client.nome || client.razao_social || client.name || 'Cliente sem nome',
      email: client.email || client.email_principal,
      telefone: client.telefone1 || client.telefone,
      categoria: client.categoria || 'Geral'
    }))
  } catch (error) {
    console.error('Erro ao carregar clientes (API):', error)
    // Sem fallback: depender apenas da API
    clients.value = []
  } finally {
    isLoading.value = false
  }
}

const filteredClients = computed(() => {
  if (!searchQuery.value) return clients.value.slice(0, 8)

  const query = searchQuery.value.toLowerCase()
  return clients.value.filter(client =>
    client.nome.toLowerCase().includes(query) ||
    client.email?.toLowerCase().includes(query) ||
    client.categoria?.toLowerCase().includes(query)
  ).slice(0, 8)
})

const displayValue = computed(() => {
  if (selectedClient.value) {
    return selectedClient.value.nome
  }
  return searchQuery.value
})

watch(() => props.modelValue, (newValue) => {
  selectedClient.value = newValue
  if (newValue) {
    searchQuery.value = newValue.nome
  }
})

watch(selectedClient, (newClient) => {
  emit('update:modelValue', newClient)
  if (newClient) {
    emit('client-selected', newClient)
    searchQuery.value = newClient.nome
    isOpen.value = false
  }
})

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement
  searchQuery.value = target.value

  if (target.value && !isOpen.value) {
    isOpen.value = true
  }

  // Clear selection if user is typing
  if (selectedClient.value && target.value !== selectedClient.value.nome) {
    selectedClient.value = null
  }

  // Reset highlighted index when typing
  highlightedIndex.value = -1
}

function selectClient(client: Client) {
  selectedClient.value = client
}

// Navegação por teclado
function handleKeydown(event: KeyboardEvent) {
  if (!isOpen.value) return

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      if (highlightedIndex.value < filteredClients.value.length - 1) {
        highlightedIndex.value++
      }
      break

    case 'ArrowUp':
      event.preventDefault()
      if (highlightedIndex.value > 0) {
        highlightedIndex.value--
      }
      break

    case 'Enter':
      event.preventDefault()
      if (highlightedIndex.value >= 0 && highlightedIndex.value < filteredClients.value.length) {
        selectClient(filteredClients.value[highlightedIndex.value])
      }
      break

    case 'Escape':
      event.preventDefault()
      isOpen.value = false
      highlightedIndex.value = -1
      break
  }
}

async function handleFocus() {
  isOpen.value = true
  highlightedIndex.value = -1

  // Se ainda não carregou os clientes, carrega agora
  if (clients.value.length === 0 && !isLoading.value) {
    await loadClients()
  }
}

function handleBlur() {
  // Delay to allow click on dropdown items
  setTimeout(() => {
    isOpen.value = false
  }, 200)
}

function createNewClient() {
  // Em produção, abriria um modal ou navegaria para criação de cliente
  console.log('Criar novo cliente:', searchQuery.value)
  isOpen.value = false
}

onMounted(async () => {
  // Carrega os clientes da API
  await loadClients()

  if (props.modelValue) {
    searchQuery.value = props.modelValue.nome
  }
})
</script>

<template>
  <div class="relative">
    <div class="relative">
      <input
        :value="displayValue"
        @input="handleInput"
        @keydown="handleKeydown"
        @focus="handleFocus"
        @blur="handleBlur"
        :placeholder="placeholder"
        :disabled="disabled"
        :required="required"
        class="input pr-10"
        :class="{
          'input-error': required && !selectedClient,
          'cursor-not-allowed': disabled
        }"
        autocomplete="off"
      />
      
      <!-- Search Icon -->
      <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
        <svg v-if="!isLoading" class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <svg v-else class="w-4 h-4 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    </div>

    <!-- Dropdown -->
    <div 
      v-if="isOpen && !disabled"
      class="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto"
    >
      <!-- Loading State -->
      <div v-if="isLoading" class="px-4 py-3 text-sm text-gray-500">
        Carregando clientes...
      </div>

      <!-- No Results -->
      <div v-else-if="filteredClients.length === 0" class="px-4 py-3">
        <div class="text-sm text-gray-500 mb-2">Nenhum cliente encontrado</div>
        <button
          type="button"
          @click="createNewClient"
          class="w-full text-left px-3 py-2 text-sm text-brand-600 hover:bg-brand-50 rounded-md border border-dashed border-brand-300"
        >
          <svg class="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Criar novo cliente "{{ searchQuery }}"
        </button>
      </div>

      <!-- Client List -->
      <div v-else>
        <button
          v-for="(client, index) in filteredClients"
          :key="client.id"
          type="button"
          @click="selectClient(client)"
          class="w-full px-4 py-3 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none border-b border-gray-100 last:border-b-0"
          :class="{
            'bg-blue-50 border-blue-200': index === highlightedIndex
          }"
        >
          <div class="flex items-center justify-between">
            <div class="flex-1 min-w-0">
              <div class="font-medium text-gray-900 truncate">{{ client.nome }}</div>
              <div class="text-sm text-gray-500 truncate">{{ client.email }}</div>
            </div>
            <div v-if="client.categoria" class="ml-2">
              <span class="badge badge-primary">{{ client.categoria }}</span>
            </div>
          </div>
        </button>

        <!-- Create New Option -->
        <button
          v-if="searchQuery && !filteredClients.some(c => c.nome.toLowerCase() === searchQuery.toLowerCase())"
          type="button"
          @click="createNewClient"
          class="w-full px-4 py-3 text-left text-brand-600 hover:bg-brand-50 border-t border-gray-200"
        >
          <svg class="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Criar novo cliente "{{ searchQuery }}"
        </button>
      </div>
    </div>

    <!-- Selected Client Info -->
    <div v-if="selectedClient && !isOpen" class="mt-2 p-3 bg-green-50 border border-green-200 rounded-md">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
            <svg class="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
            </svg>
          </div>
          <div>
            <div class="font-medium text-green-900">{{ selectedClient.nome }}</div>
            <div class="text-sm text-green-700">{{ selectedClient.email }}</div>
          </div>
        </div>
        <button
          type="button"
          @click="selectedClient = null"
          class="text-green-600 hover:text-green-800"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
