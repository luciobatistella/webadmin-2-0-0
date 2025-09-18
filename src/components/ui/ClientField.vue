<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import ClientSelector from './ClientSelector.vue'

export interface Client {
  id: string
  nome: string
  email?: string
  telefone?: string
  empresa?: string
}

const props = withDefaults(defineProps<{
  modelValue?: Client | null
  required?: boolean
  disabled?: boolean
  autoFocus?: boolean
}>(), {
  modelValue: null,
  required: true,
  disabled: false,
  autoFocus: false
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: Client | null): void
  (e: 'client-selected', client: Client): void
  (e: 'card-created', client: Client): void
  (e: 'card-removed'): void
  (e: 'navigate-next'): void
  (e: 'navigate-previous'): void
  (e: 'keydown', event: KeyboardEvent): void
}>()

const isCardMode = ref(false)
const selectedClient = ref<Client | null>(props.modelValue)

// Inicializa o estado baseado no modelValue
if (props.modelValue) {
  isCardMode.value = true
}

// Watch para sincronizar com props
watch(() => props.modelValue, (newValue) => {
  selectedClient.value = newValue
  if (newValue && !isCardMode.value) {
    isCardMode.value = true
  } else if (!newValue && isCardMode.value) {
    isCardMode.value = false
  }
})

// Watch para mudanças no cliente selecionado
watch(selectedClient, (newClient) => {
  emit('update:modelValue', newClient)
  if (newClient) {
    emit('client-selected', newClient)
    emit('card-created', newClient)
    isCardMode.value = true
    
    // Navega para o próximo campo
    setTimeout(() => {
      emit('navigate-next')
    }, 200)
  }
})

// Função para remover o card
function removeCard() {
  selectedClient.value = null
  emit('update:modelValue', null)
  emit('card-removed')
  isCardMode.value = false
}

// Função para lidar com eventos de teclado
function handleKeydown(event: KeyboardEvent) {
  const key = event.key
  
  // Se não está em modo card, passa o evento para o ClientSelector
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
      Cliente
    </label>
    
    <!-- Selector Mode -->
    <ClientSelector
      v-if="!isCardMode"
      v-model="selectedClient"
      @keydown="handleKeydown"
      :required="required"
      :disabled="disabled"
      data-field="cliente"
      class="client-selector"
    />
    
    <!-- Card Mode -->
    <div v-else class="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
      <div class="flex-1">
        <div class="font-medium text-green-900">{{ selectedClient?.nome }}</div>
        <div class="text-xs text-green-600">Cliente selecionado</div>
        <div v-if="selectedClient?.empresa" class="text-xs text-green-500 mt-1">
          {{ selectedClient.empresa }}
        </div>
      </div>
      <button
        type="button"
        @click="removeCard"
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
</template>
