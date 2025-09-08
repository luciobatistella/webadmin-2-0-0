<script setup lang="ts">
withDefaults(defineProps<{ value?: number; label?: string }>(), { value: 0, label: '' })
</script>
<template>
  <div class="fixed top-0 left-0 right-0 z-[1200]">
    <div class="mx-auto mt-2 w-full max-w-3xl rounded bg-white/80 p-2 shadow backdrop-blur">
      <div class="mb-1 flex items-center justify-between text-xs text-zinc-700">
        <span>{{ label || 'Processando...' }}</span>
        <span>{{ Math.round(value) }}%</span>
      </div>
      <div class="h-2 w-full overflow-hidden rounded bg-zinc-200">
        <div class="h-full bg-blue-600 transition-all" :style="{ width: (value||0) + '%' }" />
      </div>
    </div>
  </div>
</template>

