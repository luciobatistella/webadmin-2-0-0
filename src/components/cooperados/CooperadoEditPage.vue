<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Breadcrumbs from '@/components/Breadcrumbs.vue'
import CooperadoForm from './CooperadoForm.vue'
import { getCooperado, updateCooperado } from '@/services/cooperados'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const loadingData = ref(true)
const errorMessage = ref('')
const cooperado = ref<Record<string, any>>({})

const cooperadoId = route.params.id as string

async function loadCooperado() {
  if (!cooperadoId || cooperadoId === 'new') {
    router.push({ name: 'cooperado-new' })
    return
  }

  loadingData.value = true
  errorMessage.value = ''

  try {
    const data = await getCooperado(cooperadoId, new URLSearchParams())
    
    // Normalização do objeto
    let parsed: any = data
    if (data && typeof data === 'object' && 'data' in data) {
      const inner = (data as any).data
      if (Array.isArray(inner)) parsed = inner[0] || {}
      else if (inner && typeof inner === 'object') parsed = inner
    }
    if (parsed && typeof parsed === 'object' && (parsed as any).cooperado) {
      parsed = (parsed as any).cooperado
    }

    cooperado.value = parsed || {}
  } catch (error: any) {
    console.error('Erro ao carregar cooperado:', error)
    errorMessage.value = 'Não foi possível carregar os dados do cooperado.'
    ;(window as any).$toast?.error?.(errorMessage.value)
  } finally {
    loadingData.value = false
  }
}

async function handleSave(data: Record<string, any>) {
  loading.value = true
  errorMessage.value = ''

  try {
    await updateCooperado(cooperadoId, data)
    ;(window as any).$toast?.success?.('Dados atualizados com sucesso!')
    router.push({ name: 'cooperado-detail', params: { id: cooperadoId } })
  } catch (error: any) {
    console.error('Erro ao atualizar cooperado:', error)
    errorMessage.value = error?.message || 'Erro ao salvar alterações. Tente novamente.'
    ;(window as any).$toast?.error?.(errorMessage.value)
  } finally {
    loading.value = false
  }
}

function handleCancel() {
  router.push({ name: 'cooperado-detail', params: { id: cooperadoId } })
}

onMounted(() => {
  loadCooperado()
})
</script>

<template>
  <div class="p-4 container mx-auto max-w-[1400px] pb-20">
    <Breadcrumbs />

    <!-- Cabeçalho -->
    <header class="mb-6 mt-4">
      <div class="flex items-center gap-3 mb-2">
        <button
          @click="handleCancel"
          class="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          title="Voltar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <div>
          <h1 class="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            Editar Cooperado
          </h1>
          <p class="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {{ cooperado.nome || 'Carregando...' }}
          </p>
        </div>
      </div>
    </header>

    <!-- Loading -->
    <div v-if="loadingData" class="card p-8 text-center">
      <svg class="animate-spin h-8 w-8 mx-auto text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <p class="mt-3 text-sm text-zinc-500">Carregando dados...</p>
    </div>

    <!-- Mensagem de Erro -->
    <div
      v-else-if="errorMessage"
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
      v-else
      mode="edit"
      :initial-data="cooperado"
      :loading="loading"
      @save="handleSave"
      @cancel="handleCancel"
    />
  </div>
</template>
