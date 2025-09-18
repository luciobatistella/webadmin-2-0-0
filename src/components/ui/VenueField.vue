<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import VenueSelector from './VenueSelector.vue'

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
  required?: boolean
  disabled?: boolean
  autoFocus?: boolean
}>(), {
  modelValue: null,
  clientId: null,
  required: true,
  disabled: false,
  autoFocus: false
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: Venue | null): void
  (e: 'venue-selected', venue: Venue): void
  (e: 'card-created', venue: Venue): void
  (e: 'card-removed'): void
  (e: 'navigate-next'): void
  (e: 'navigate-previous'): void
  (e: 'keydown', event: KeyboardEvent): void
}>()

const isCardMode = ref(false)
const selectedVenue = ref<Venue | null>(props.modelValue)

// Inicializa o estado baseado no modelValue
if (props.modelValue) {
  isCardMode.value = true
}

// Watch para sincronizar com props
watch(() => props.modelValue, (newValue) => {
  selectedVenue.value = newValue
  if (newValue && !isCardMode.value) {
    isCardMode.value = true
  } else if (!newValue && isCardMode.value) {
    isCardMode.value = false
  }
})

// Watch para mudanças no local selecionado
watch(selectedVenue, (newVenue) => {
  emit('update:modelValue', newVenue)
  if (newVenue) {
    emit('venue-selected', newVenue)
    emit('card-created', newVenue)
    isCardMode.value = true
    
    // Navega para o próximo campo
    setTimeout(() => {
      emit('navigate-next')
    }, 200)
  }
})

// Função para remover o card
function removeCard() {
  selectedVenue.value = null
  emit('update:modelValue', null)
  emit('card-removed')
  isCardMode.value = false
}

// Função para lidar com eventos de teclado
function handleKeydown(event: KeyboardEvent) {
  const key = event.key
  
  // Se não está em modo card, passa o evento para o VenueSelector
  if (!isCardMode.value) {
    // Navegação entre campos
    if (key === 'ArrowUp' || key === 'ArrowLeft') {
      event.preventDefault()
      emit('navigate-previous')
    } else if (key === 'ArrowDown' || key === 'ArrowRight') {
      event.preventDefault()
      emit('navigate-next')
    } else if (key === 'Enter') {
      event.preventDefault()
      emit('navigate-next')
    }
  }
  
  emit('keydown', event)
}
</script>

<template>
  <div class="form-group">
    <label class="form-label" :class="{ 'form-label-required': required }">
      Local do Evento
    </label>
    
    <!-- Selector Mode -->
    <VenueSelector
      v-if="!isCardMode"
      v-model="selectedVenue"
      :client-id="clientId"
      @keydown="handleKeydown"
      :required="required"
      :disabled="disabled"
      data-field="local"
      class="venue-selector"
    />
    
    <!-- Card Mode -->
    <div v-else class="flex items-center gap-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
      <div class="flex-1">
        <div class="font-medium text-purple-900">{{ selectedVenue?.nome }}</div>
        <div class="text-xs text-purple-600">Local selecionado</div>
        <div v-if="selectedVenue?.endereco" class="text-xs text-purple-500 mt-1">
          {{ selectedVenue.endereco }}
        </div>
        <div v-if="selectedVenue?.categoria || selectedVenue?.capacidade" class="flex items-center gap-2 mt-1">
          <span v-if="selectedVenue?.categoria" class="badge badge-purple text-xs">
            {{ selectedVenue.categoria }}
          </span>
          <span v-if="selectedVenue?.capacidade" class="text-xs text-purple-500">
            até {{ selectedVenue.capacidade }} pessoas
          </span>
        </div>
      </div>
      <button
        type="button"
        @click="removeCard"
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
</template>

<style scoped>
.badge-purple {
  @apply bg-purple-100 text-purple-800 border-purple-200;
}
</style>
