<template>
  <div class="w-full">
    <div class="flex justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wide">
      <span>{{ label }}</span>
      <span v-if="showPercent">{{ percentLabel }}</span>
    </div>
    <div class="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
      <div
        class="h-full rounded-full transition-all duration-500"
        :class="barColor"
        :style="{ width: Math.min(100, percent) + '%' }"
      />
    </div>
    <div v-if="details" class="mt-1 text-xs text-slate-500 dark:text-slate-400 flex gap-2 flex-wrap">
      <span v-for="d in details" :key="d.key" class="flex items-center gap-1">
        <span class="w-2 h-2 rounded-sm" :class="d.color" />
        {{ d.label }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  label: string
  value: number
  total: number
  color?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate'
  showPercent?: boolean
  details?: { key: string; label: string; color: string }[]
}>()

const percent = computed(() => props.total > 0 ? (props.value / props.total) * 100 : 0)
const percentLabel = computed(() => `${percent.value.toFixed(0)}%`)

const colorMap: Record<string, string> = {
  indigo: 'bg-indigo-500 dark:bg-indigo-400',
  emerald: 'bg-emerald-500 dark:bg-emerald-400',
  amber: 'bg-amber-500 dark:bg-amber-400',
  rose: 'bg-rose-500 dark:bg-rose-400',
  slate: 'bg-slate-500 dark:bg-slate-300'
}

const barColor = computed(() => colorMap[props.color || 'indigo'])
</script>
