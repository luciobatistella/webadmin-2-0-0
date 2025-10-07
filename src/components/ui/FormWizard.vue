<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  UserIcon,
  CalendarIcon,
  BuildingOfficeIcon,
  DocumentTextIcon,
  Cog6ToothIcon,
  ClipboardDocumentListIcon
} from '@heroicons/vue/24/outline'

export interface WizardStep {
  id: string
  title: string
  description?: string
  icon?: keyof typeof heroIcons | string // string para retrocompatibilidade
  isValid?: boolean
  isOptional?: boolean
}

// Mapa de ícones disponíveis para os steps
const heroIcons = {
  check: CheckCircleIcon,
  error: ExclamationCircleIcon,
  user: UserIcon,
  calendar: CalendarIcon,
  company: BuildingOfficeIcon,
  document: DocumentTextIcon,
  config: Cog6ToothIcon,
  list: ClipboardDocumentListIcon
}

const props = withDefaults(defineProps<{
  steps: WizardStep[]
  modelValue: number
  allowSkip?: boolean
  showProgress?: boolean
}>(), {
  allowSkip: false,
  showProgress: true
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void
  (e: 'step-change', step: WizardStep, index: number): void
  (e: 'complete'): void
}>()

const currentStep = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// Controle da direção da transição
const transitionDirection = ref<'forward' | 'backward'>('forward')

const currentStepData = computed(() => props.steps[currentStep.value])
const isFirstStep = computed(() => currentStep.value === 0)
const isLastStep = computed(() => currentStep.value === props.steps.length - 1)

watch(currentStep, (newStep) => {
  if (props.steps[newStep]) {
    emit('step-change', props.steps[newStep], newStep)
  }
})

function goToStep(index: number) {
  if (index >= 0 && index < props.steps.length) {
    transitionDirection.value = index > currentStep.value ? 'forward' : 'backward'
    currentStep.value = index
  }
}

function nextStep() {
  transitionDirection.value = 'forward'
  if (!isLastStep.value) {
    currentStep.value++
  } else {
    emit('complete')
  }
}

function prevStep() {
  transitionDirection.value = 'backward'
  if (!isFirstStep.value) {
    currentStep.value--
  }
}

function canGoToStep(index: number): boolean {
  if (props.allowSkip) return true
  
  // Can only go to current step or previous completed steps
  for (let i = 0; i < index; i++) {
    if (props.steps[i]?.isValid === false && !props.steps[i]?.isOptional) {
      return false
    }
  }
  return true
}

function getStepStatus(index: number): 'completed' | 'current' | 'pending' | 'invalid' {
  if (index < currentStep.value) {
    return props.steps[index]?.isValid === false ? 'invalid' : 'completed'
  }
  if (index === currentStep.value) {
    return 'current'
  }
  return 'pending'
}

// Helper para retornar componente de ícone válido (opcional)
function getHeroIcon(name?: string) {
  if (!name) return null
  return (heroIcons as any)[name] || null
}

// Funções para callbacks de transição
function onEnter() {
  // Callback quando elemento entra na transição
  console.log('✨ Entrando na etapa:', currentStep.value + 1)
}

function onLeave() {
  // Callback quando elemento sai da transição
  console.log('🔄 Saindo da etapa:', currentStep.value + 1)
}

// Detecção de plataforma para tooltips de atalho
const isMac = computed(() => typeof navigator !== 'undefined' && /mac|darwin/i.test(navigator.userAgent))
const modKeyLabel = computed(() => isMac.value ? '⌘' : 'Ctrl')
function prevTitle(){ return `${modKeyLabel.value} + ←` }
function nextTitle(){ return `${modKeyLabel.value} + →` }
function skipTitle(){ return `Pular (${modKeyLabel.value} + →)` }
</script>

<template>
  <div>

    <!-- Step Navigation -->
    <nav class="mb-8">
      <ol class="flex items-center justify-between">
        <li 
          v-for="(step, index) in steps" 
          :key="step.id"
          class="flex items-center"
          :class="{ 'flex-1': index < steps.length - 1 }"
        >
          <button
            type="button"
            @click="canGoToStep(index) && goToStep(index)"
            :disabled="!canGoToStep(index)"
            class="flex items-center gap-3 p-2 rounded-full transition-all duration-300 transform hover:scale-105"
            :class="{
              'text-brand-600 bg-brand-50': getStepStatus(index) === 'current',
              'text-green-600 bg-green-50 hover:bg-green-100': getStepStatus(index) === 'completed',
              'text-gray-400 cursor-not-allowed': !canGoToStep(index),
              'text-gray-600 hover:bg-gray-50': canGoToStep(index) && getStepStatus(index) === 'pending',
              'text-red-600 bg-red-50': getStepStatus(index) === 'invalid'
            }"
          >
            <!-- Step Icon/Number -->
            <div
              class="flex items-center justify-center w-8 h-8 rounded-full border-2 text-sm font-medium transition-all duration-300 transform shrink-0"
              :class="{
                'border-brand-600 bg-brand-600 text-white scale-110': getStepStatus(index) === 'current',
                'border-green-600 bg-green-600 text-white scale-105': getStepStatus(index) === 'completed',
                'border-gray-300 bg-white text-gray-400': !canGoToStep(index),
                'border-gray-300 bg-white text-gray-600': canGoToStep(index) && getStepStatus(index) === 'pending',
                'border-red-600 bg-red-600 text-white animate-pulse': getStepStatus(index) === 'invalid'
              }"
            >
              <!-- Ícone do step -->
              <component
                v-if="step.icon && getStepStatus(index) !== 'completed' && heroIcons[step.icon as keyof typeof heroIcons]"
                :is="heroIcons[step.icon as keyof typeof heroIcons]"
                class="w-4 h-4"
              />
              <!-- Ícone concluído -->
              <CheckCircleIcon v-else-if="getStepStatus(index) === 'completed'" class="w-4 h-4" />
              <!-- Fallback: número -->
              <span v-else>{{ index + 1 }}</span>
            </div>

            <!-- Step Info -->
            <div class="text-left hidden sm:block">
              <div class="font-medium">{{ step.title }}</div>
              <div v-if="step.description" class="text-xs opacity-75">{{ step.description }}</div>
            </div>
          </button>

          <!-- Connector Line -->
          <div 
            v-if="index < steps.length - 1"
            class="flex-1 h-0.5 mx-4"
            :class="{
              'bg-green-300': getStepStatus(index) === 'completed',
              'bg-gray-200': getStepStatus(index) !== 'completed'
            }"
          ></div>
        </li>
      </ol>
    </nav>

    <!-- Step Content -->
    <div class="step-content mb-8">
      <Transition
        :name="transitionDirection === 'forward' ? 'step-forward' : 'step-backward'"
        mode="out-in"
        @enter="onEnter"
        @leave="onLeave"
      >
        <div :key="currentStep" class="step-wrapper">
          <slot :step="currentStepData" :stepIndex="currentStep" />
        </div>
      </Transition>
    </div>

    <!-- Espaço para o rodapé fixo -->
    <div class="h-16"></div>
  </div>

  <!-- Rodapé de Navegação Fixo (igual ao rodapé de paginação) -->
  <div class="fixed w-[calc(100%-15rem)] left-60 bottom-0 z-30 bg-white dark:bg-zinc-900/90 border-t border-zinc-200 dark:border-zinc-700 p-3">
    <div class="container max-w-[1400px] mx-auto flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
        <!-- Informações da etapa (lado esquerdo) -->
        <div class="flex items-center gap-4">
          <span class="text-blue-600 text-xs font-medium px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 dark:text-blue-300">
            Etapa {{ currentStep + 1 }} de {{ steps.length }}
          </span>
          <span class="text-sm text-gray-600 dark:text-gray-400">
            {{ currentStepData?.title }}
          </span>
        </div>

      <!-- Botões de navegação (lado direito) -->
      <div class="inline-flex items-center gap-2">
        <Transition name="button-slide" mode="out-in">
          <button
            v-if="!isFirstStep"
            type="button"
            @click="prevStep"
            class="btn-secondary"
            :title="prevTitle()"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
            <span>Anterior</span>
          </button>
        </Transition>

        <button
          v-if="currentStepData?.isOptional && !isLastStep"
          type="button"
          @click="nextStep"
          class="btn-secondary"
          :title="skipTitle()"
        >
          <span>Pular</span>
        </button>

        <Transition name="button-morph" mode="out-in">
          <button
            :key="isLastStep ? 'finish' : 'next'"
            type="button"
            @click="nextStep"
            class="btn-primary"
            :class="isLastStep ? 'btn-success' : ''"
            :disabled="currentStepData?.isValid === false"
            :title="isLastStep ? '' : nextTitle()"
          >
            <template v-if="isLastStep">
              <span>Finalizar</span>
            </template>
            <template v-else>
              <span class="flex items-center gap-2">
                <span>Próximo</span>                
              </span>
            </template>
            <svg v-if="!isLastStep" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </button>
        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
.form-wizard {
  max-width: 56rem;
  margin: 0 auto;
}

.step-content {
  min-height: 400px;
}

/* Transições suaves entre etapas - Slide horizontal direcional com fade */

/* Transição para frente (próximo) */
.step-forward-enter-active,
.step-forward-leave-active {
  transition: all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  position: relative;
}

.step-forward-enter-from {
  opacity: 0;
  transform: translateX(50px);
}

.step-forward-leave-to {
  opacity: 0;
  transform: translateX(-50px);
}

.step-forward-enter-to,
.step-forward-leave-from {
  opacity: 1;
  transform: translateX(0);
}

/* Transição para trás (anterior) */
.step-backward-enter-active,
.step-backward-leave-active {
  transition: all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  position: relative;
}

.step-backward-enter-from {
  opacity: 0;
  transform: translateX(-50px);
}

.step-backward-leave-to {
  opacity: 0;
  transform: translateX(50px);
}

.step-backward-enter-to,
.step-backward-leave-from {
  opacity: 1;
  transform: translateX(0);
}

/* Wrapper para garantir altura consistente e transições suaves */
.step-wrapper {
  min-height: 400px;
  width: 100%;
}

.step-content {
  position: relative;
  overflow: visible;
}

/* Indicadores de etapa */
.step-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  font-size: 0.875rem;
  font-weight: 500;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.step-indicator.completed {
  background-color: #10b981;
  color: white;
  transform: scale(1.05);
}

.step-indicator.current {
  background-color: #3b82f6;
  color: white;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
  transform: scale(1.1);
}

.step-indicator.pending {
  background-color: #e5e7eb;
  color: #6b7280;
}

.step-indicator.invalid {
  background-color: #ef4444;
  color: white;
  animation: shake 0.5s ease-in-out;
}

.step-connector {
  flex: 1;
  height: 2px;
  background-color: #e5e7eb;
  margin: 0 0.5rem;
  transition: all 0.3s ease;
}

.step-connector.completed {
  background-color: #10b981;
}

/* Animação de shake para etapas inválidas */
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
}

/* Transições para botões */
.button-slide-enter-active,
.button-slide-leave-active {
  transition: all 0.3s ease;
}

.button-slide-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}

.button-slide-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

.button-morph-enter-active,
.button-morph-leave-active {
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.button-morph-enter-from {
  opacity: 0;
  transform: scale(0.9) rotate(-5deg);
}

.button-morph-leave-to {
  opacity: 0;
  transform: scale(0.9) rotate(5deg);
}

/* Estilos para botões com efeito de afundar */
.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem 1rem;
  border-radius: 9999px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: white;
  white-space: nowrap;
  background-color: #2563eb;
  transition: all 0.15s ease-in-out;
  transform: scale(1);
  border: none;
  cursor: pointer;
}

.btn-primary:hover {
  background-color: #1d4ed8;
  transform: scale(1.05);
}

.btn-primary:active {
  transform: translateY(2px) scale(0.98);
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.2);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-success {
  background-color: #16a34a;
}

.btn-success:hover {
  background-color: #15803d;
}

.btn-success:active {
  box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.2);
}

.btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem 1rem;
  border-radius: 9999px;
  font-size: 0.8125rem;
  font-weight: 500;
  white-space: nowrap;
  border: 1px solid #d1d5db;
  background-color: white;
  color: #374151;
  transition: all 0.15s ease-in-out;
  transform: scale(1);
  cursor: pointer;
}

.btn-secondary:hover {
  background-color: #f9fafb;
  transform: scale(1.05);
}

.btn-secondary:active {
  transform: translateY(1px) scale(0.98);
  box-shadow: 0 0 0 3px rgba(156, 163, 175, 0.2);
}

/* Botões de serviços selecionáveis */
.btn-service {
  padding: 0.625rem;
  text-align: left;
  border: 2px solid;
  border-radius: 0.5rem;
  transition: all 0.2s ease-in-out;
  transform: scale(1);
  cursor: pointer;
}

.btn-service:hover {
  transform: scale(1.05);
}

.btn-service.selected {
  border-color: #3b82f6;
  background-color: #eff6ff;
}

.btn-service.selected:active {
  transform: translateY(1px) scale(0.98);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.btn-service:not(.selected) {
  border-color: #e5e7eb;
}

.btn-service:not(.selected):hover {
  border-color: #d1d5db;
}

.btn-service:not(.selected):active {
  transform: translateY(1px) scale(0.98);
  box-shadow: 0 0 0 2px rgba(156, 163, 175, 0.15);
}

/* Animação de fade para elementos gerais */
.animate-fade-in {
  animation: fadeIn 0.3s ease-in-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
