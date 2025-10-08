<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import Breadcrumbs from '@/components/Breadcrumbs.vue'
import CooperadoForm from './CooperadoForm.vue'
import { createCooperado } from '@/services/cooperados'

const router = useRouter()
const loading = ref(false)
const errorMessage = ref('')
const formRef = ref<InstanceType<typeof CooperadoForm> | null>(null)

async function handleSave(data: Record<string, any>) {
  loading.value = true
  errorMessage.value = ''
  
  try {
    const response = await createCooperado(data)
    
    // Sucesso - redirecionar para a página de detalhes
    const cooperadoId = response?.id || response?.data?.id
    
    if (cooperadoId) {
      ;(window as any).$toast?.success?.('Cooperado cadastrado com sucesso!')
      router.push({ name: 'cooperado-detail', params: { id: String(cooperadoId) } })
    } else {
      ;(window as any).$toast?.success?.('Cooperado cadastrado com sucesso!')
      router.push({ name: 'cooperados' })
    }
  } catch (error: any) {
    console.error('Erro ao criar cooperado:', error)
    errorMessage.value = error?.message || 'Erro ao cadastrar cooperado. Tente novamente.'
    ;(window as any).$toast?.error?.(errorMessage.value)
  } finally {
    loading.value = false
  }
}

function handleCancel() {
  router.push({ name: 'cooperados' })
}

function handleSubmit() {
  // Acionar submit do formulário
  const form = (formRef.value as any)?.$el?.querySelector('form')
  if (form) {
    form.requestSubmit()
  }
}
</script>

<template>
  <div class="p-4 container mx-auto max-w-[1400px] pb-20">
    <Breadcrumbs />
    
    <!-- Cabeçalho com Botões -->
    <header class="mb-6 mt-4 flex items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Novo Cooperado
        </h1>
        <p class="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Preencha os dados do cooperado abaixo
        </p>
      </div>
      
      <div class="flex items-center gap-2 shrink-0">
        <button
          type="button"
          @click="handleCancel"
          class="flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-sm shadow-sm hover:bg-zinc-50"
          :disabled="loading"
        >
          <span class="text-sm font-semibold">Cancelar</span>
        </button>
        <button
          type="button"
          @click="handleSubmit"
          class="rounded-full bg-[#0B61F3] px-3 py-1 text-sm font-semibold text-white shadow-sm hover:bg-blue-600 disabled:opacity-50"
          :disabled="loading"
        >
          {{ loading ? 'Salvando...' : 'Cadastrar' }}
        </button>
      </div>
    </header>

    <!-- Mensagem de Erro -->
    <div
      v-if="errorMessage"
      class="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
    >
      <div class="flex items-center gap-2">
        <svg class="h-5 w-5 text-red-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 8v4M12 16h.01"/>
        </svg>
        <p class="text-sm text-red-800 dark:text-red-200">{{ errorMessage }}</p>
      </div>
    </div>

    <!-- Formulário -->
    <CooperadoForm
      ref="formRef"
      mode="create"
      :loading="loading"
      :hide-actions="true"
      @save="handleSave"
      @cancel="handleCancel"
    />
  </div>
</template>
