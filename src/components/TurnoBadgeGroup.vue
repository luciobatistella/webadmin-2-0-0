<template>
  <div class="flex flex-wrap gap-1.5">
    <span
      v-for="turno in turnosOrdenados"
      :key="turno.key"
      :class="[
        'px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1',
        turno.ativo
          ? turno.estiloAtivo
          : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
      ]"
      :title="turno.title"
    >
      <span class="w-1.5 h-1.5 rounded-full" :class="turno.dotClass" />
      {{ turno.label }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

type TiposInput = string | string[] | Set<string> | Record<string, any> | undefined | null
const props = defineProps<{ tiposTurno?: TiposInput }>()

const ordem = ['madrugada', 'manha', 'tarde', 'noite', 'extra']

const meta: Record<string, { label: string; estiloAtivo: string; dotClass: string; title: string }> = {
  madrugada: { label: 'Madrugada', estiloAtivo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300', dotClass: 'bg-indigo-500', title: 'Janela entre 00:00 e 06:00' },
  manha: { label: 'Manhã', estiloAtivo: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300', dotClass: 'bg-amber-500', title: 'Janela entre 09:00 e 13:00' },
  tarde: { label: 'Tarde', estiloAtivo: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300', dotClass: 'bg-emerald-500', title: 'Janela entre 13:00 e 18:00' },
  noite: { label: 'Noite', estiloAtivo: 'bg-slate-200 text-slate-800 dark:bg-slate-600/60 dark:text-slate-200', dotClass: 'bg-slate-500', title: 'Janela entre 18:00 e 24:00' },
  extra: { label: 'Extra', estiloAtivo: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300', dotClass: 'bg-rose-500', title: 'Horas excedentes / adicionais' }
}

function normalizar(input: TiposInput): string[] {
  if (!input) return []
  if (typeof input === 'string') return [input]
  if (Array.isArray(input)) return input
  if (input instanceof Set) return Array.from(input)
  if (typeof input === 'object') {
    // Se for objeto com chaves que indicam flags verdadeiras (ex: {manha:true})
    const vals: string[] = []
    for (const [k, v] of Object.entries(input)) {
      if (v && typeof v !== 'object') vals.push(k)
      else if (typeof v === 'string') vals.push(v)
    }
    return vals
  }
  return []
}

const turnosOrdenados = computed(() => {
  const normalizados = normalizar(props.tiposTurno).map(t => (t || '').toString().toLowerCase())
  const ativos = new Set(normalizados)
  return ordem.map(key => ({
    key,
    ativo: ativos.has(key),
    ...meta[key]
  }))
})
</script>
