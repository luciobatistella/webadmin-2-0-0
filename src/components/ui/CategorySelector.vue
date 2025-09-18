<script setup lang="ts">
import { ref, computed } from 'vue'

export interface EventCategory {
  id: string
  name: string
  icon: string
  description: string
  color: string
  examples: string[]
}

const props = withDefaults(defineProps<{
  modelValue?: string
  required?: boolean
}>(), {
  required: false
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'category-selected', category: EventCategory): void
}>()

const selectedCategory = ref(props.modelValue || '')

const categories: EventCategory[] = [
  {
    id: 'lancamento',
    name: 'Lançamento',
    icon: '🚀',
    description: 'Lançamento de produtos, serviços ou campanhas',
    color: 'from-blue-500 to-purple-600',
    examples: ['Lançamento de produto', 'Apresentação de campanha', 'Coletiva de imprensa']
  },
  {
    id: 'congresso',
    name: 'Congresso',
    icon: '🎓',
    description: 'Eventos educacionais e de conhecimento',
    color: 'from-green-500 to-teal-600',
    examples: ['Congresso médico', 'Conferência técnica', 'Seminário']
  },
  {
    id: 'corporativo',
    name: 'Corporativo',
    icon: '🏢',
    description: 'Eventos internos da empresa',
    color: 'from-gray-500 to-slate-600',
    examples: ['Reunião anual', 'Kick-off', 'Integração']
  },
  {
    id: 'social',
    name: 'Social',
    icon: '🎉',
    description: 'Celebrações e eventos sociais',
    color: 'from-pink-500 to-rose-600',
    examples: ['Festa de fim de ano', 'Aniversário', 'Comemoração']
  },
  {
    id: 'treinamento',
    name: 'Treinamento',
    icon: '📚',
    description: 'Capacitação e desenvolvimento',
    color: 'from-orange-500 to-amber-600',
    examples: ['Workshop', 'Curso', 'Capacitação']
  },
  {
    id: 'feira',
    name: 'Feira',
    icon: '🏪',
    description: 'Exposições e feiras comerciais',
    color: 'from-indigo-500 to-blue-600',
    examples: ['Feira de negócios', 'Exposição', 'Mostra']
  },
  {
    id: 'esportivo',
    name: 'Esportivo',
    icon: '⚽',
    description: 'Eventos esportivos e competições',
    color: 'from-emerald-500 to-green-600',
    examples: ['Torneio', 'Competição', 'Olimpíada corporativa']
  },
  {
    id: 'cultural',
    name: 'Cultural',
    icon: '🎭',
    description: 'Eventos artísticos e culturais',
    color: 'from-purple-500 to-violet-600',
    examples: ['Show', 'Peça teatral', 'Exposição artística']
  }
]

const selectedCategoryData = computed(() => {
  return categories.find(cat => cat.id === selectedCategory.value)
})

function selectCategory(category: EventCategory) {
  selectedCategory.value = category.id
  emit('update:modelValue', category.name)
  emit('category-selected', category)
}

function clearSelection() {
  selectedCategory.value = ''
  emit('update:modelValue', '')
}
</script>

<template>

    <!-- Category Grid -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      <button
        v-for="category in categories"
        :key="category.id"
        type="button"
        @click="selectCategory(category)"
        class="relative p-4 rounded-xl border-2 transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-1"
        :class="{
          'border-brand-500 bg-brand-50 shadow-md': selectedCategory === category.id,
          'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm': selectedCategory !== category.id
        }"
      >
        <!-- Category Icon & Gradient -->
        <div 
          class="w-12 h-12 rounded-lg bg-gradient-to-br flex items-center justify-center text-white text-2xl mb-3 mx-auto"
          :class="category.color"
        >
          {{ category.icon }}
        </div>

        <!-- Category Name -->
        <div class="font-medium text-gray-900 text-sm mb-1">{{ category.name }}</div>
        
        <!-- Category Description -->
        <div class="text-xs text-gray-500 leading-tight">{{ category.description }}</div>

        <!-- Selected Indicator -->
        <div 
          v-if="selectedCategory === category.id"
          class="absolute -top-1 -right-1 w-6 h-6 bg-brand-500 rounded-full flex items-center justify-center"
        >
          <svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
          </svg>
        </div>
      </button>
    </div>
  

   

    <!-- Seção de categoria personalizada removida conforme solicitado -->

    <!-- Required Field Indicator -->
    <div v-if="required && !selectedCategory" class="text-sm text-red-600 flex items-center gap-1">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
      Selecione uma categoria para continuar
    </div>
</template>
