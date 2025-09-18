<script setup lang="ts">
import { ref, computed } from 'vue'

const props = withDefaults(defineProps<{
  title: string
  subtitle?: string
  icon?: string
  collapsible?: boolean
  collapsed?: boolean
  required?: boolean
  completed?: boolean
  error?: boolean
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error'
}>(), {
  subtitle: '',
  icon: '',
  collapsible: false,
  collapsed: false,
  required: false,
  completed: false,
  error: false,
  variant: 'default'
})

const emit = defineEmits<{
  (e: 'toggle-collapsed'): void
}>()

const isCollapsed = ref(props.collapsed)

const sectionClasses = computed(() => {
  const base = 'card p-6 mb-6 transition-all duration-200'
  const variants = {
    default: 'border-gray-200',
    primary: 'border-blue-200 bg-blue-50',
    success: 'border-green-200 bg-green-50',
    warning: 'border-yellow-200 bg-yellow-50',
    error: 'border-red-200 bg-red-50'
  }
  
  let classes = `${base} ${variants[props.variant]}`
  
  if (props.error) {
    classes += ' border-red-300 bg-red-50'
  } else if (props.completed) {
    classes += ' border-green-300 bg-green-50'
  }
  
  return classes
})

const headerClasses = computed(() => {
  const base = 'flex items-center justify-between'
  if (props.collapsible) {
    return `${base} cursor-pointer hover:opacity-80`
  }
  return base
})

const titleClasses = computed(() => {
  let classes = 'text-lg font-semibold'
  
  if (props.error) {
    classes += ' text-red-900'
  } else if (props.completed) {
    classes += ' text-green-900'
  } else {
    const variants = {
      default: 'text-gray-900',
      primary: 'text-blue-900',
      success: 'text-green-900',
      warning: 'text-yellow-900',
      error: 'text-red-900'
    }
    classes += ` ${variants[props.variant]}`
  }
  
  return classes
})

const subtitleClasses = computed(() => {
  let classes = 'text-sm mt-1'
  
  if (props.error) {
    classes += ' text-red-700'
  } else if (props.completed) {
    classes += ' text-green-700'
  } else {
    const variants = {
      default: 'text-gray-600',
      primary: 'text-blue-700',
      success: 'text-green-700',
      warning: 'text-yellow-700',
      error: 'text-red-700'
    }
    classes += ` ${variants[props.variant]}`
  }
  
  return classes
})

function toggleCollapsed() {
  if (props.collapsible) {
    isCollapsed.value = !isCollapsed.value
    emit('toggle-collapsed')
  }
}
</script>

<template>
  <div :class="sectionClasses">
    <!-- Header -->
    <div :class="headerClasses" @click="toggleCollapsed">
      <div class="flex items-center gap-3">
        <!-- Icon -->
        <div v-if="icon || completed || error" class="flex items-center">
          <!-- Status Icons -->
          <div v-if="completed" class="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
            <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div v-else-if="error" class="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
            <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <!-- Custom Icon -->
          <span v-else-if="icon" class="text-xl">{{ icon }}</span>
        </div>
        
        <!-- Title and Subtitle -->
        <div>
          <h3 :class="titleClasses">
            {{ title }}
            <span v-if="required" class="text-red-500 ml-1">*</span>
          </h3>
          <p v-if="subtitle" :class="subtitleClasses">
            {{ subtitle }}
          </p>
        </div>
      </div>
      
      <!-- Collapse Toggle -->
      <div v-if="collapsible" class="flex items-center gap-2">
        <svg 
          class="w-5 h-5 transition-transform duration-200"
          :class="{ 'rotate-180': isCollapsed }"
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
    
    <!-- Content -->
    <div 
      v-if="!isCollapsed"
      class="mt-4"
    >
      <slot />
    </div>
  </div>
</template>
