<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const props = withDefaults(defineProps<{
  showPrintButton?: boolean
  showPrintAction?: boolean
  createLabel?: string
}>(), {
  showPrintButton: true,
  showPrintAction: true,
  createLabel: 'incluir cadastro',
})

const emit = defineEmits<{ (e: 'print'): void; (e: 'create'): void; (e: 'action', key: string): void }>()
const open = ref(false)
const root = ref<HTMLElement | null>(null)

function toggle() { open.value = !open.value }
function close() { open.value = false }
function onAction(key: string){ emit('action', key); close() }

function onEsc(e: KeyboardEvent){ if(e.key==='Escape') close() }
function onDocClick(e: MouseEvent){
  if (!open.value) return
  const el = root.value
  if (el && !el.contains(e.target as Node)) close()
}

onMounted(() => {
  document.addEventListener('keydown', onEsc)
  document.addEventListener('click', onDocClick)
})
onUnmounted(() => {
  document.removeEventListener('keydown', onEsc)
  document.removeEventListener('click', onDocClick)
})
</script>

<template>
  <div class="relative flex items-center gap-2" ref="root">
    <button v-if="props.showPrintButton" class="flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-sm shadow-sm hover:bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-100"
      @click="$emit('print')">
      <span class="inline-flex h-5 w-5 items-center justify-center rounded-full border bg-white dark:bg-zinc-800 dark:border-zinc-600">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
      </span>
      <span class="text-sm font-semibold">imprimir</span>
    </button>

    <button class="rounded-full bg-[#0B61F3] px-3 py-1 text-sm font-semibold text-white shadow-sm hover:bg-blue-600"
      @click="$emit('create')">
      {{ props.createLabel }}
    </button>

    <div class="relative">
      <button
        class="flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-sm shadow-sm hover:bg-zinc-50 pr-1 pl-2 dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-100"
        :class="open ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-white dark:ring-offset-zinc-900' : ''"
        @click="toggle">
        <span class="font-semibold">mais ações</span>
        <span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#0B61F3] text-white">
          <svg class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><circle cx="3" cy="10" r="2"/><circle cx="10" cy="10" r="2"/><circle cx="17" cy="10" r="2"/></svg>
        </span>
      </button>
      <div v-if="open" class="absolute right-0 z-50 mt-2 w-56 rounded-md border bg-white p-1 shadow-lg dark:bg-zinc-900 dark:border-zinc-700">
        <ul class="text-sm p-1">
          <li v-if="props.showPrintAction">
            <button class="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800" @click="onAction('imprimir')">
              <svg class="h-4 w-4 text-zinc-600 dark:text-zinc-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a 2 2 0 0 1-2-2v-5a 2 2 0 0 1 2-2h16a 2 2 0 0 1 2 2v5a 2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
              imprimir
            </button>
          </li>
          <li><hr class="my-1"/></li>
          <li>
            <button class="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800" @click="onAction('exportar')">
              <svg class="h-4 w-4 text-zinc-600 dark:text-zinc-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5-5 5 5"/><path d="M12 15V3"/></svg>
              exportar para planilha
            </button>
          </li>
          <li>
            <button class="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800" @click="onAction('importar')">
              <svg class="h-4 w-4 text-zinc-600 dark:text-zinc-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 4v11"/></svg>
              importar de uma planilha
            </button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

