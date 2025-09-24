<template>
  <div :class="wrapperClass">
    <div class="flex items-center justify-between">
      <div class="text-sm font-medium text-slate-500 dark:text-slate-400">
        <slot name="label">Label</slot>
      </div>
      <div v-if="icon" class="flex items-center text-slate-400">
        <component :is="icon" class="w-4 h-4" />
      </div>
    </div>
    <div class="mt-1 flex items-end gap-2">
      <div class="text-2xl font-semibold text-slate-900 dark:text-slate-100 leading-tight">
        <slot name="value">--</slot>
      </div>
      <div v-if="$slots.sublabel" class="text-xs text-slate-500 dark:text-slate-400 mb-1">
        <slot name="sublabel" />
      </div>
    </div>
    <div v-if="$slots.meta" class="mt-3 text-[11px] uppercase tracking-wide font-medium text-slate-400 dark:text-slate-500">
      <slot name="meta" />
    </div>
    <div v-if="$slots.footer" class="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ variant?: 'default' | 'accent' | 'warning' | 'success'; icon?: any }>()

const variantClasses: Record<string, string> = {
  default: 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm',
  accent: 'bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-400/30 shadow-sm',
  warning: 'bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-400/30 shadow-sm',
  success: 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-400/30 shadow-sm'
}

const wrapperClass = computed(() => `rounded-xl p-4 transition-colors ${variantClasses[props.variant || 'default']}`)
</script>
