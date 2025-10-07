<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const crumbs = computed(() => {
  const list: Array<{ label: string; to?: any }> = []
  // Dashboard como raiz
  if (route.name !== 'dashboard') {
    list.push({ label: 'Dashboard', to: { name: 'dashboard' } })
  } else {
    list.push({ label: 'Dashboard' })
  }
  // Intermediários conhecidos
  if (route.name === 'request-new') {
    list.push({ label: 'Solicitações', to: { name: 'solicitacoes' } })
  }
  if (route.name === 'client-detail' || route.name === 'client-new') {
    list.push({ label: 'Clientes', to: { name: 'clients' } })
  }
  if (route.name === 'cooperado-detail' || route.name === 'cooperado-new') {
    // Preserva a query atual (vinda da lista) para manter busca/filtros ao clicar no breadcrumb
    list.push({ label: 'Cooperados', to: { name: 'cooperados', query: { ...route.query } } })
  }
  const label = String(route.meta?.breadcrumb || route.meta?.title || '')
  if (label && route.name !== 'dashboard') list.push({ label })
  return list
})

const showBack = computed(() => (
  route.name === 'client-detail' || route.name === 'client-new' ||
  route.name === 'cooperado-detail' || route.name === 'cooperado-new'
))

function onBack() {
  // Regras de retorno
  if (route.name === 'client-detail' || route.name === 'client-new') {
    router.push({ name: 'clients' })
    return
  }
  if (route.name === 'cooperado-detail' || route.name === 'cooperado-new') {
    // Preservar a query (busca/filtros/página) ao voltar para a lista
    router.push({ name: 'cooperados', query: { ...route.query } })
    return
  }
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push({ name: 'dashboard' })
  }
}
</script>

<template>
  <nav class="h-8 text-xs text-zinc-500 flex items-center flex-wrap gap-2">
    <button v-if="showBack" @click="onBack" class="inline-flex items-center gap-1 rounded-full border bg-white px-1 pr-3 py-0.5 shadow-sm hover:bg-zinc-50">
      <span class="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#0B61F3] text-white">
        <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
      </span>
      <span class="font-semibold">voltar</span>
    </button>
    <template v-for="(it, i) in crumbs" :key="i">
      <router-link v-if="it.to" :to="it.to" class="hover:underline text-zinc-600 dark:text-zinc-300">{{ it.label }}</router-link>
      <span v-else class="text-zinc-500">{{ it.label }}</span>
      <span v-if="i < crumbs.length - 1" class="mx-2 text-zinc-400">/</span>
    </template>
  </nav>
</template>

