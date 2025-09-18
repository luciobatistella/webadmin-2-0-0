<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import DateRangePicker from './DateRangePicker.vue'

export interface Turno {
  nome: string
  inicio: string
  fim: string
}

const props = withDefaults(defineProps<{
  modelValue?: string[]
  allowMultiple?: boolean
  required?: boolean
  disabled?: boolean
  autoFocus?: boolean
}>(), {
  modelValue: () => [],
  allowMultiple: true,
  required: true,
  disabled: false,
  autoFocus: false
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string[]): void
  (e: 'turnos-detected', turnos: Turno[]): void
  (e: 'dates-selected', dates: string[]): void
  (e: 'card-created', dates: string[]): void
  (e: 'card-removed'): void
  (e: 'navigate-next'): void
  (e: 'navigate-previous'): void
  (e: 'keydown', event: KeyboardEvent): void
}>()

const isCardMode = ref(false)
const selectedDates = ref<string[]>(props.modelValue || [])
const detectedTurnos = ref<Turno[]>([])

// Inicializa o estado baseado no modelValue
if (props.modelValue && props.modelValue.length > 0) {
  isCardMode.value = true
}

// Watch para sincronizar com props
watch(() => props.modelValue, (newValue) => {
  selectedDates.value = newValue || []
  if (newValue && newValue.length > 0 && !isCardMode.value) {
    isCardMode.value = true
  } else if ((!newValue || newValue.length === 0) && isCardMode.value) {
    isCardMode.value = false
  }
})

// Watch para mudanças nas datas selecionadas
watch(selectedDates, (newDates) => {
  emit('update:modelValue', newDates)
  if (newDates && newDates.length > 0) {
    emit('dates-selected', newDates)
    emit('card-created', newDates)
    isCardMode.value = true
    
    // Navega para o próximo campo
    setTimeout(() => {
      emit('navigate-next')
    }, 200)
  }
}, { deep: true })

// Função para lidar com turnos detectados
function handleTurnosDetected(turnos: Turno[]) {
  detectedTurnos.value = turnos
  emit('turnos-detected', turnos)
}

// Função para remover o card
function removeCard() {
  selectedDates.value = []
  detectedTurnos.value = []
  emit('update:modelValue', [])
  emit('card-removed')
  isCardMode.value = false
}

// Função para formatar range de datas
function formatDateRange(dates: string[]): string {
  if (dates.length === 0) return ''
  if (dates.length === 1) {
    const date = new Date(dates[0] + 'T00:00:00')
    return date.toLocaleDateString('pt-BR')
  }
  
  const sorted = [...dates].sort()
  const first = new Date(sorted[0] + 'T00:00:00').toLocaleDateString('pt-BR')
  const last = new Date(sorted[sorted.length - 1] + 'T00:00:00').toLocaleDateString('pt-BR')
  
  return `${first} a ${last}`
}

// Função para lidar com eventos de teclado
function handleKeydown(event: KeyboardEvent) {
  const key = event.key
  
  // Se não está em modo card, permite navegação
  if (!isCardMode.value) {
    // Navegação entre campos
    if (key === 'ArrowUp' || key === 'ArrowLeft') {
      event.preventDefault()
      emit('navigate-previous')
    } else if (key === 'ArrowDown' || key === 'ArrowRight') {
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
      Data do Evento
    </label>
    
    <!-- DateRangePicker Mode -->
    <div v-if="!isCardMode">
      <DateRangePicker
        v-model="selectedDates"
        :allow-multiple="allowMultiple"
        @turnos-detected="handleTurnosDetected"
        @keydown="handleKeydown"
        :disabled="disabled"
        data-field="datas"
      />
    </div>
    
    <!-- Card Mode -->
    <div v-else class="flex items-center gap-2 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
      <div class="flex-1">
        <div class="font-medium text-indigo-900">
          {{ formatDateRange(selectedDates) }}
        </div>
        <div class="text-xs text-indigo-600">
          {{ selectedDates.length }} {{ selectedDates.length === 1 ? 'dia' : 'dias' }} selecionado{{ selectedDates.length === 1 ? '' : 's' }}
        </div>
        <div v-if="detectedTurnos.length > 0" class="text-xs text-indigo-500 mt-1">
          {{ detectedTurnos.length }} {{ detectedTurnos.length === 1 ? 'turno detectado' : 'turnos detectados' }}
        </div>
      </div>
      <button
        type="button"
        @click="removeCard"
        class="text-indigo-600 hover:text-indigo-800 p-1 rounded hover:bg-indigo-100"
        title="Alterar datas"
        tabindex="-1"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>
</template>
