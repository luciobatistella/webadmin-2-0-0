<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: number
  categoria?: string
  venueCapacity?: number
}>(), {
  modelValue: 0
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void
}>()

const audienceSize = ref(props.modelValue)
const useSlider = ref(true)

// Audience size suggestions based on event category
const categorySuggestions = computed(() => {
  const suggestions: Record<string, { min: number; max: number; typical: number; description: string }> = {
    'Lançamento': { min: 50, max: 500, typical: 150, description: 'Eventos de lançamento costumam ter público selecionado' },
    'Congresso': { min: 100, max: 2000, typical: 300, description: 'Congressos variam muito dependendo do tema' },
    'Corporativo': { min: 20, max: 1000, typical: 100, description: 'Eventos corporativos dependem do tamanho da empresa' },
    'Social': { min: 50, max: 800, typical: 200, description: 'Eventos sociais têm público mais variado' },
    'Treinamento': { min: 10, max: 200, typical: 50, description: 'Treinamentos são mais focados e menores' },
    'Feira': { min: 200, max: 10000, typical: 1000, description: 'Feiras podem ter grande público' },
    'Esportivo': { min: 100, max: 5000, typical: 500, description: 'Eventos esportivos atraem multidões' },
    'Cultural': { min: 50, max: 2000, typical: 300, description: 'Eventos culturais variam por popularidade' }
  }
  
  return suggestions[props.categoria || ''] || { min: 50, max: 1000, typical: 200, description: 'Estimativa geral para eventos' }
})

const sliderMax = computed(() => {
  if (props.venueCapacity) {
    return Math.min(props.venueCapacity, categorySuggestions.value.max)
  }
  return categorySuggestions.value.max
})

const audienceCategories = [
  { label: 'Íntimo', range: '10-50', icon: '👥', color: 'bg-blue-100 text-blue-800' },
  { label: 'Pequeno', range: '50-150', icon: '👨‍👩‍👧‍👦', color: 'bg-green-100 text-green-800' },
  { label: 'Médio', range: '150-500', icon: '🏢', color: 'bg-yellow-100 text-yellow-800' },
  { label: 'Grande', range: '500-1500', icon: '🏟️', color: 'bg-orange-100 text-orange-800' },
  { label: 'Massivo', range: '1500+', icon: '🎪', color: 'bg-red-100 text-red-800' }
]

const currentCategory = computed(() => {
  const size = audienceSize.value
  if (size <= 50) return audienceCategories[0]
  if (size <= 150) return audienceCategories[1]
  if (size <= 500) return audienceCategories[2]
  if (size <= 1500) return audienceCategories[3]
  return audienceCategories[4]
})

const quickSizes = computed(() => [
  { label: 'Mínimo', value: categorySuggestions.value.min },
  { label: 'Típico', value: categorySuggestions.value.typical },
  { label: 'Máximo', value: categorySuggestions.value.max }
])

watch(audienceSize, (newValue) => {
  emit('update:modelValue', newValue)
})

watch(() => props.modelValue, (newValue) => {
  audienceSize.value = newValue
})

function setQuickSize(size: number) {
  audienceSize.value = size
}

function suggestTypicalSize() {
  audienceSize.value = categorySuggestions.value.typical
}
</script>

<template>
  <div class="space-y-4">
    <!-- Current Selection Display -->
    <div class="card p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="text-3xl">{{ currentCategory.icon }}</div>
          <div>
            <div class="font-semibold text-blue-900">{{ audienceSize || 0 }} pessoas</div>
            <div class="text-sm text-blue-700">
              Evento {{ currentCategory.label.toLowerCase() }} ({{ currentCategory.range }})
            </div>
          </div>
        </div>
        <div :class="currentCategory.color" class="px-3 py-1 rounded-full text-sm font-medium">
          {{ currentCategory.label }}
        </div>
      </div>
    </div>

    <!-- Category-based Suggestion -->
    <div v-if="categoria" class="card p-4 border-amber-200 bg-amber-50">
      <div class="flex items-start gap-3">
        <div class="text-2xl">💡</div>
        <div class="flex-1">
          <h3 class="font-medium text-amber-900 mb-1">Sugestão para {{ categoria }}</h3>
          <p class="text-sm text-amber-800 mb-3">{{ categorySuggestions.description }}</p>
          <div class="flex gap-2">
            <button
              v-for="size in quickSizes"
              :key="size.label"
              type="button"
              @click="setQuickSize(size.value)"
              class="btn btn-sm"
              :class="audienceSize === size.value ? 'btn-primary' : 'btn-ghost'"
            >
              {{ size.label }} ({{ size.value }})
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Input Methods Toggle -->
    <div class="flex items-center justify-between">
      <label class="form-label">Número de Convidados</label>
      <div class="flex items-center gap-2">
        <button
          type="button"
          @click="useSlider = true"
          class="btn btn-sm"
          :class="useSlider ? 'btn-primary' : 'btn-ghost'"
        >
          🎚️ Slider
        </button>
        <button
          type="button"
          @click="useSlider = false"
          class="btn btn-sm"
          :class="!useSlider ? 'btn-primary' : 'btn-ghost'"
        >
          ⌨️ Digite
        </button>
      </div>
    </div>

    <!-- Slider Input -->
    <div v-if="useSlider" class="space-y-3">
      <div class="relative">
        <input
          v-model.number="audienceSize"
          type="range"
          :min="1"
          :max="sliderMax"
          :step="sliderMax > 1000 ? 50 : sliderMax > 100 ? 10 : 5"
          class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
        />
        <div class="flex justify-between text-xs text-gray-500 mt-1">
          <span>1</span>
          <span>{{ Math.floor(sliderMax / 2) }}</span>
          <span>{{ sliderMax }}</span>
        </div>
      </div>
      
      <!-- Venue Capacity Warning -->
      <div v-if="venueCapacity && audienceSize > venueCapacity" class="p-3 bg-red-50 border border-red-200 rounded-md">
        <div class="flex items-center gap-2 text-sm text-red-800">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span>
            Atenção: O local selecionado comporta apenas {{ venueCapacity }} pessoas.
            Considere escolher um venue maior ou reduzir o público.
          </span>
        </div>
      </div>
    </div>

    <!-- Manual Input -->
    <div v-else class="space-y-3">
      <div class="flex gap-2">
        <input
          v-model.number="audienceSize"
          type="number"
          min="1"
          :max="venueCapacity || undefined"
          class="input flex-1"
          placeholder="Digite o número de convidados"
        />
        <button
          v-if="categoria"
          type="button"
          @click="suggestTypicalSize"
          class="btn btn-ghost"
          title="Usar sugestão típica"
        >
          💡
        </button>
      </div>
    </div>

    <!-- Quick Size Buttons -->
    <div class="grid grid-cols-5 gap-2">
      <button
        v-for="category in audienceCategories"
        :key="category.label"
        type="button"
        @click="setQuickSize(parseInt(category.range.split('-')[0]))"
        class="p-3 text-center border rounded-lg transition-all hover:shadow-sm"
        :class="{
          'border-brand-500 bg-brand-50': currentCategory.label === category.label,
          'border-gray-200 hover:border-gray-300': currentCategory.label !== category.label
        }"
      >
        <div class="text-lg mb-1">{{ category.icon }}</div>
        <div class="text-xs font-medium">{{ category.label }}</div>
        <div class="text-xs text-gray-500">{{ category.range }}</div>
      </button>
    </div>

    <!-- Additional Info -->
    <div class="text-xs text-gray-500 space-y-1">
      <div>💡 <strong>Dica:</strong> Considere adicionar 10-15% a mais para convidados de última hora</div>
      <div v-if="venueCapacity">🏢 <strong>Capacidade do local:</strong> {{ venueCapacity }} pessoas</div>
    </div>
  </div>
</template>

<style scoped>
.slider::-webkit-slider-thumb {
  appearance: none;
  height: 20px;
  width: 20px;
  border-radius: 50%;
  background: #3b82f6;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.slider::-moz-range-thumb {
  height: 20px;
  width: 20px;
  border-radius: 50%;
  background: #3b82f6;
  cursor: pointer;
  border: none;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}
</style>
