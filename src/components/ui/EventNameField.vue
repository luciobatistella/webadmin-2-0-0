<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

const props = withDefaults(defineProps<{
  modelValue?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  autoFocus?: boolean
}>(), {
  modelValue: '',
  placeholder: 'Ex: Google Cloud Summit 2025',
  required: true,
  disabled: false,
  autoFocus: false
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'card-created', value: string): void
  (e: 'card-removed'): void
  (e: 'navigate-next'): void
  (e: 'keydown', event: KeyboardEvent): void
}>()

const isCardMode = ref(false)
const inputValue = ref('')
const inputRef = ref<HTMLInputElement>()

// Inicializa o estado baseado no modelValue
if (props.modelValue) {
  isCardMode.value = true
}

// Watch para sincronizar com props
watch(() => props.modelValue, (newValue) => {
  if (newValue && !isCardMode.value) {
    isCardMode.value = true
  } else if (!newValue && isCardMode.value) {
    isCardMode.value = false
  }
})

// Função para criar o card
function createCard() {
  if (inputValue.value.trim()) {
    const value = inputValue.value.trim()
    emit('update:modelValue', value)
    emit('card-created', value)
    isCardMode.value = true
    inputValue.value = ''
    
    // Navega para o próximo campo
    setTimeout(() => {
      emit('navigate-next')
    }, 200)
  }
}

// Função para remover o card
function removeCard() {
  emit('update:modelValue', '')
  emit('card-removed')
  isCardMode.value = false
  
  // Foca no input após remover o card
  nextTick(() => {
    inputRef.value?.focus()
  })
}

// Função para lidar com ENTER
function handleEnter() {
  if (inputValue.value.trim()) {
    createCard()
  } else {
    // Se não há texto, navega para o próximo campo
    emit('navigate-next')
  }
}

// Função para lidar com TAB
function handleTab() {
  createCard()
}

// Função para lidar com outros eventos de teclado
function handleKeydown(event: KeyboardEvent) {
  emit('keydown', event)
}

// Auto focus se solicitado
watch(() => props.autoFocus, (shouldFocus) => {
  if (shouldFocus && !isCardMode.value) {
    nextTick(() => {
      inputRef.value?.focus()
    })
  }
}, { immediate: true })
</script>

<template>
  <div class="form-group">
    <label class="form-label" :class="{ 'form-label-required': required }">
      Nome do Evento
    </label>
    
    <!-- Input Mode -->
    <input
      v-if="!isCardMode"
      ref="inputRef"
      v-model="inputValue"
      @keydown.enter.prevent="handleEnter"
      @keydown.tab.prevent="handleTab"
      @keydown="handleKeydown"
      :placeholder="placeholder"
      :required="required"
      :disabled="disabled"
      class="input"
      data-field="evento-nome"
    />
    
    <!-- Card Mode -->
    <div v-else class="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
      <div class="flex-1">
        <div class="font-medium text-blue-900">{{ modelValue }}</div>
        <div class="text-xs text-blue-600">Nome do evento</div>
      </div>
      <button
        type="button"
        @click="removeCard"
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
</template>
