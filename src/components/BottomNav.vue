<template>
  <nav class="fixed bottom-0 left-0 right-0 z-50 border-t bg-white/90 backdrop-blur dark:bg-zinc-900/90">
    <ul class="mx-auto grid max-w-md grid-cols-4 gap-1 p-2 text-xs text-zinc-500">
      <li v-for="item in items" :key="item.key">
        <button
          class="flex w-full flex-col items-center justify-center gap-1 rounded-md p-2 hover:bg-zinc-100 active:bg-zinc-200 dark:hover:bg-zinc-800"
          :class="{ 'text-brand-600': modelValue === item.key }"
          @click="$emit('update:modelValue', item.key)"
        >
          <span class="text-lg" aria-hidden> {{ item.icon }} </span>
          <span>{{ item.label }}</span>
        </button>
      </li>
    </ul>
  </nav>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ modelValue?: string }>(), { modelValue: 'home' })

type Item = { key: string; label: string; icon: string }
const items: Item[] = [
  { key: 'home', label: 'Home', icon: '🏠' },
  { key: 'dash', label: 'Dash', icon: '📊' },
  { key: 'search', label: 'Buscar', icon: '🔎' },
  { key: 'user', label: 'Perfil', icon: '👤' },
]
</script>

