<template>
  <div v-if="open" class="fixed inset-0 z-50">
    <div class="absolute inset-0 bg-black/40" @click="$emit('close')" />
    <aside
      class="absolute right-0 top-0 h-full w-full sm:w-[480px] lg:w-[560px] bg-white dark:bg-zinc-900 shadow-xl border-l dark:border-zinc-700 flex flex-col"
    >
      <header class="flex items-center justify-between border-b dark:border-zinc-700 px-4 py-3">
        <h3 class="text-base font-semibold">{{ title }}</h3>
        <button class="rounded-md px-2 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800" @click="$emit('close')">Fechar</button>
      </header>
      <div class="min-h-0 flex-1 overflow-auto p-4">
        <slot />
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ open: boolean; title?: string }>(), { title: '' })
defineEmits<{ (e: 'close'): void }>()
</script>

