<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ items?: any[]; open?: boolean }>(), { items: () => [], open: false })
const emit = defineEmits<{ (e: 'close'): void; (e: 'print'): void }>()

const hasData = computed(() => (props.items || []).length > 0)
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-[1100] bg-black/40 flex items-center justify-center p-4">
    <div class="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-xl bg-white p-4 shadow-lg">
      <header class="mb-3 flex items-center justify-between">
        <h2 class="text-lg font-semibold">Pré-visualização para impressão</h2>
        <div class="space-x-2">
          <button class="btn btn-secondary" @click="$emit('close')">Fechar</button>
          <button class="btn btn-primary" :disabled="!hasData" @click="$emit('print')">Imprimir</button>
        </div>
      </header>
      <div class="space-y-2">
        <article v-for="it in items" :key="it.id" class="rounded border p-3">
          <header class="flex items-center justify-between">
            <strong>{{ it.name || it.nome_comercial || it.razao_social }}</strong>
            <span class="text-xs text-zinc-500">#{{ it.id }}</span>
          </header>
          <div class="text-xs text-zinc-600">
            <div>Email: {{ it.email || '-' }}</div>
            <div>Documento: {{ it.cnpj || it.cpf_cnpj || it.document || '-' }}</div>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

