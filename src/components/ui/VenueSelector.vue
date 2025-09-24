<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { findClientUnitLocation } from '@/services/clients'

export interface Venue {
  id: string
  nome: string
  endereco: string
  maps_url?: string
  categoria?: string
  capacidade?: number
  foto?: string
}

const props = withDefaults(defineProps<{
  modelValue?: Venue | null
  clientId?: string | null
  placeholder?: string
  required?: boolean
  disabled?: boolean
}>(), {
  clientId: null,
  placeholder: 'Buscar local...',
  required: false,
  disabled: false
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: Venue | null): void
  (e: 'venue-selected', venue: Venue): void
}>()

const searchQuery = ref('')
const isOpen = ref(false)
const isLoading = ref(false)
const venues = ref<Venue[]>([])
const selectedVenue = ref<Venue | null>(props.modelValue)
const highlightedIndex = ref(-1)

// Carrega locais do cliente da API
async function loadClientVenues(clientId: string) {
  try {
    isLoading.value = true
    const apiVenues = await findClientUnitLocation(clientId)

    // Normaliza os dados da API para o formato esperado
    venues.value = (Array.isArray(apiVenues) ? apiVenues : []).map((venue: any) => ({
      id: venue.id || venue.local_id || venue.unidade_id,
      nome: venue.nome || venue.name || venue.unidade_nome || 'Local sem nome',
      endereco: [
        venue.endereco || venue.logradouro,
        venue.numero,
        venue.bairro,
        venue.cidade,
        venue.uf
      ].filter(Boolean).join(', ') || venue.endereco_completo || 'Endereço não informado',
      maps_url: venue.maps_url,
      categoria: venue.categoria || venue.tipo || 'Local do Cliente',
      capacidade: venue.capacidade
    }))
  } catch (error) {
    console.error('Erro ao carregar locais do cliente:', error)
    venues.value = []
  } finally {
    isLoading.value = false
  }
}

const filteredVenues = computed(() => {
  // Depender apenas da API: somente exibir locais carregados para o cliente selecionado
  if (!props.clientId) return []
  const availableVenues = venues.value

  if (!searchQuery.value) return availableVenues.slice(0, 6)

  const query = searchQuery.value.toLowerCase()
  return availableVenues.filter(venue =>
    venue.nome.toLowerCase().includes(query) ||
    venue.endereco.toLowerCase().includes(query) ||
    venue.categoria?.toLowerCase().includes(query)
  ).slice(0, 6)
})

const displayValue = computed(() => {
  if (selectedVenue.value) {
    return selectedVenue.value.nome
  }
  return searchQuery.value
})

watch(() => props.modelValue, (newValue) => {
  selectedVenue.value = newValue
  if (newValue) {
    searchQuery.value = newValue.nome
  }
})

watch(selectedVenue, (newVenue) => {
  emit('update:modelValue', newVenue)
  if (newVenue) {
    emit('venue-selected', newVenue)
    searchQuery.value = newVenue.nome
    isOpen.value = false
  }
})

// Watcher para carregar locais quando cliente mudar
watch(() => props.clientId, async (newClientId, oldClientId) => {
  if (newClientId && newClientId !== oldClientId) {
    // Limpa seleção atual se mudou de cliente
    selectedVenue.value = null
    searchQuery.value = ''

    // Carrega locais do novo cliente
    await loadClientVenues(newClientId)
  } else if (!newClientId) {
    // Se não há cliente, limpa os locais
    venues.value = []
    selectedVenue.value = null
    searchQuery.value = ''
  }
}, { immediate: true })

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement
  searchQuery.value = target.value

  if (target.value && !isOpen.value) {
    isOpen.value = true
  }

  // Clear selection if user is typing
  if (selectedVenue.value && target.value !== selectedVenue.value.nome) {
    selectedVenue.value = null
  }

  // Reset highlighted index when typing
  highlightedIndex.value = -1
}

function selectVenue(venue: Venue) {
  selectedVenue.value = venue
}

// Navegação por teclado
function handleKeydown(event: KeyboardEvent) {
  if (!isOpen.value) return

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      if (highlightedIndex.value < filteredVenues.value.length - 1) {
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
      if (highlightedIndex.value >= 0 && highlightedIndex.value < filteredVenues.value.length) {
        selectVenue(filteredVenues.value[highlightedIndex.value])
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

  // Se há cliente mas não carregou os locais ainda, carrega agora
  if (props.clientId && venues.value.length === 0 && !isLoading.value) {
    await loadClientVenues(props.clientId)
  }
}

function handleBlur() {
  // Delay to allow click on dropdown items
  setTimeout(() => {
    isOpen.value = false
  }, 200)
}

function createNewVenue() {
  // Em produção, abriria um modal ou navegaria para criação de venue
  console.log('Criar novo local:', searchQuery.value)
  isOpen.value = false
}

onMounted(() => {
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
          'input-error': required && !selectedVenue,
          'cursor-not-allowed': disabled
        }"
        autocomplete="off"
      />
      
      <!-- Search Icon -->
      <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
        <svg v-if="!isLoading" class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 12.414a1 1 0 00-.707-.293H11.5a6.5 6.5 0 10-1.414 1.414v1.207a1 1 0 00.293.707l4.243 4.243a1 1 0 001.414-1.414z" />
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
      class="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-80 overflow-auto"
    >
      <!-- Loading State -->
      <div v-if="isLoading" class="px-4 py-3 text-sm text-gray-500">
        Carregando locais...
      </div>

      <!-- No Client Selected -->
      <div v-else-if="!clientId" class="px-4 py-3">
        <div class="text-sm text-gray-500 mb-2">
          <svg class="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Selecione um cliente primeiro para ver seus locais
        </div>
      </div>

      <!-- No Results -->
      <div v-else-if="filteredVenues.length === 0" class="px-4 py-3">
        <div class="text-sm text-gray-500 mb-2">
          {{ clientId ? 'Este cliente não possui locais cadastrados' : 'Nenhum local encontrado' }}
        </div>
        <button
          type="button"
          @click="createNewVenue"
          class="w-full text-left px-3 py-2 text-sm text-brand-600 hover:bg-brand-50 rounded-md border border-dashed border-brand-300"
        >
          <svg class="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Cadastrar novo local "{{ searchQuery }}"
        </button>
      </div>

      <!-- Venue List -->
      <div v-else>
        <button
          v-for="(venue, index) in filteredVenues"
          :key="venue.id"
          type="button"
          @click="selectVenue(venue)"
          class="w-full px-4 py-3 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none border-b border-gray-100 last:border-b-0"
          :class="{
            'bg-blue-50 border-blue-200': index === highlightedIndex
          }"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <div class="font-medium text-gray-900 truncate">{{ venue.nome }}</div>
                <!-- Ícone para locais do cliente -->
                <span v-if="clientId && venue.categoria === 'Local do Cliente'" class="text-blue-500" title="Local do cliente">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </span>
              </div>
              <div class="text-sm text-gray-500 truncate mt-1">{{ venue.endereco }}</div>
              <div class="flex items-center gap-3 mt-2">
                <span v-if="venue.categoria" class="badge" :class="venue.categoria === 'Local do Cliente' ? 'badge-success' : 'badge-primary'">
                  {{ venue.categoria }}
                </span>
                <span v-if="venue.capacidade" class="text-xs text-gray-500">
                  <svg class="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  até {{ venue.capacidade }} pessoas
                </span>
              </div>
            </div>
          </div>
        </button>

        <!-- Create New Option -->
        <button
          v-if="searchQuery && !filteredVenues.some(v => v.nome.toLowerCase() === searchQuery.toLowerCase())"
          type="button"
          @click="createNewVenue"
          class="w-full px-4 py-3 text-left text-brand-600 hover:bg-brand-50 border-t border-gray-200"
        >
          <svg class="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Cadastrar novo local "{{ searchQuery }}"
        </button>
      </div>
    </div>

    <!-- Selected Venue Info -->
    <div v-if="selectedVenue && !isOpen" class="mt-2 p-3 bg-green-50 border border-green-200 rounded-md">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
            <svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 12.414a1 1 0 00-.707-.293H11.5a6.5 6.5 0 10-1.414 1.414v1.207a1 1 0 00.293.707l4.243 4.243a1 1 0 001.414-1.414z" />
            </svg>
          </div>
          <div>
            <div class="font-medium text-green-900">{{ selectedVenue.nome }}</div>
            <div class="text-sm text-green-700">{{ selectedVenue.endereco }}</div>
            <div class="flex items-center gap-2 mt-1">
              <span v-if="selectedVenue.categoria" class="badge badge-success">{{ selectedVenue.categoria }}</span>
              <span v-if="selectedVenue.capacidade" class="text-xs text-green-600">
                até {{ selectedVenue.capacidade }} pessoas
              </span>
            </div>
          </div>
        </div>
        <button
          type="button"
          @click="selectedVenue = null"
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
