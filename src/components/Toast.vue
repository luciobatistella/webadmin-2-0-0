<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

type ToastKind = 'success' | 'error' | 'info'
interface ToastMsg { id: number; kind: ToastKind; text: string }

const messages = ref<ToastMsg[]>([])
let idSeq = 1
let timer: any

function add(kind: ToastKind, text: string) {
  const id = idSeq++
  messages.value.push({ id, kind, text })
  clearTimeout(timer)
  timer = setTimeout(() => remove(id), 3000)
}

function remove(id: number) {
  messages.value = messages.value.filter(m => m.id !== id)
}

declare global {
  interface Window {
    $toast?: { success: (t: string) => void; error: (t: string) => void; info: (t: string) => void }
  }
}

onMounted(() => {
  window.$toast = {
    success: (t: string) => add('success', t),
    error: (t: string) => add('error', t),
    info: (t: string) => add('info', t),
  }
})

onUnmounted(() => { if (window.$toast) delete window.$toast })
</script>

<template>
  <div class="pointer-events-none fixed left-1/2 top-4 z-[1000] -translate-x-1/2 space-y-2">
    <div v-for="m in messages" :key="m.id" class="pointer-events-auto rounded-full px-4 py-2 text-sm shadow-md border flex items-center gap-2"
      :class="m.kind==='success' ? 'bg-green-600 text-white border-green-700' : m.kind==='error' ? 'bg-red-600 text-white border-red-700' : 'bg-zinc-800 text-white border-zinc-700'">
      <span>{{ m.text }}</span>
      <button class="ml-2 opacity-80 hover:opacity-100" @click="remove(m.id)">×</button>
    </div>
  </div>
</template>

