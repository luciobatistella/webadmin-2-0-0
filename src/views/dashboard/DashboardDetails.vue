<script setup lang="ts">
import { ref } from 'vue'

type AnyRecord = Record<string, any>
const props = defineProps<{ details: AnyRecord; items: AnyRecord[]; managers: AnyRecord[] }>()

const statusFilter = ref<StatusKey | ''>('')
const statusOptions: StatusKey[] = ['lido','confirmado','não lido','recusado','removido','desistiu','sem vaga']

const STATUS_STYLE = {
  'lido':       { chip: 'border-blue-300 text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-900/20', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200' },
  'confirmado': { chip: 'border-green-300 text-green-700 hover:bg-green-50 dark:text-green-300 dark:hover:bg-green-900/20', badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200' },
  'não lido':   { chip: 'border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800', badge: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200' },
  'recusado':   { chip: 'border-red-300 text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/20', badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200' },
  'removido':   { chip: 'border-orange-300 text-orange-700 hover:bg-orange-50 dark:text-orange-300 dark:hover:bg-orange-900/20', badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200' },
  'desistiu':   { chip: 'border-yellow-300 text-yellow-700 hover:bg-yellow-50 dark:text-yellow-300 dark:hover:bg-yellow-900/20', badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-200' },
  'sem vaga':   { chip: 'border-purple-300 text-purple-700 hover:bg-purple-50 dark:text-purple-300 dark:hover:bg-purple-900/20', badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-200' },
} as const

type StatusKey = keyof typeof STATUS_STYLE

function chipClass(s: StatusKey){ const st = STATUS_STYLE[s] || STATUS_STYLE['não lido']; return `rounded-md border px-2 py-1 text-xs ${st.chip}` }
function chipSelectedClass(s: StatusKey){
  const base = 'rounded-md border px-2 py-1 text-xs text-white'
  const color: Record<StatusKey, string> = {
    'lido':'bg-blue-600 border-blue-600','confirmado':'bg-green-600 border-green-600','não lido':'bg-zinc-700 border-zinc-700',
    'recusado':'bg-red-600 border-red-600','removido':'bg-orange-600 border-orange-600','desistiu':'bg-yellow-600 border-yellow-600','sem vaga':'bg-purple-600 border-purple-600'
  }
  return `${base} ${(color[s] || 'bg-zinc-700 border-zinc-700')}`
}
function statusBadgeClass(s: StatusKey){ const st = STATUS_STYLE[s] || STATUS_STYLE['não lido']; return `inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${st.badge}` }

function fmtTime(val: unknown) {
  if (!val) return '-'
  try {
    const d = new Date(val as any)
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  } catch { return String(val) }
}

function fmtDateTime(val: unknown) {
  if (!val) return '-'
  try {
    const d = new Date(val as any)
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  } catch { return String(val) }
}

function countByStatus(item: any, s: StatusKey) {
  return (item?.data || []).filter((d: any) => (d.evento_escala_prof_status || '').toLowerCase() === s).length
}
</script>

<template>
  <section class="space-y-4">
    <div class="grid gap-3 sm:grid-cols-2">
      <div class="card p-3">
        <div class="text-xs text-zinc-500">PROF. SOLICITADOS</div>
        <div class="text-2xl font-semibold">{{ details?.requested_professional ?? 0 }}</div>
      </div>
      <div class="card p-3">
        <div class="text-xs text-zinc-500">CONVITES ENVIADOS</div>
        <div class="text-2xl font-semibold">{{ details?.invitations_sent ?? 0 }}</div>
      </div>
      <div class="card p-3">
        <div class="text-xs text-zinc-500">CONVITES ACEITOS</div>
        <div class="text-2xl font-semibold">{{ details?.invitations_accepted ?? 0 }}</div>
      </div>
      <div class="card p-3">
        <div class="text-xs text-zinc-500">CHECK‑IN</div>
        <div class="text-2xl font-semibold">{{ details?.checkin ?? 0 }}</div>
      </div>
      <div class="card p-3">
        <div class="text-xs text-zinc-500">CHECK‑OUT</div>
        <div class="text-2xl font-semibold">{{ details?.checkout ?? 0 }}</div>
      </div>
      <div class="card p-3">
        <div class="text-xs text-zinc-500">CORTESIAS</div>
        <div class="text-2xl font-semibold">{{ details?.courtesy ?? 0 }}</div>
      </div>
    </div>

    <div v-if="managers?.length" class="card p-3">
      <h3 class="mb-2 text-sm font-medium">Gestores</h3>
      <ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="m in managers" :key="m.id" class="rounded-md border p-2 text-sm">
          {{ m.name || m.nome || m.descricao }}
        </li>
      </ul>
    </div>

    <div v-if="!items?.length" class="rounded-md border p-3 text-xs">
      Nenhum item detalhado para este filtro.
    </div>

    <div v-for="(item, idx) in items" :key="idx" class="card">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b p-3 text-sm">
        <div>
          <strong>{{ item.requested }}</strong> {{ item.nome_profissao }} • Vagas fechadas: <strong>{{ item.accepted }}</strong>
        </div>
        <small>Gestor: {{ item.nome_gestor }}</small>
      </div>

      <div class="flex flex-wrap gap-2 border-b p-3">
        <button v-for="s in statusOptions" :key="s"
                :class="statusFilter===s ? chipSelectedClass(s) : chipClass(s)"
                @click="statusFilter = statusFilter===s ? '' : s">
          {{ s }} ({{ countByStatus(item, s) }})
        </button>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs text-zinc-600">
        <div>Horário: {{ fmtTime(item.entrada) }} às {{ fmtTime(item.saida) }}</div>
        <div>Evento: {{ item.nome_evento }}</div>
        <div>Setor: {{ item.nome_setor }}</div>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2 px-3 pb-2 text-xs text-zinc-600">
        <div>Solicitante: {{ item.nome_solicitante }}</div>
        <div>Criação: {{ fmtDateTime(item.data_criacao_escala) }}</div>
      </div>

      <div class="overflow-auto p-3">
        <table class="min-w-full text-left text-sm">
          <thead class="bg-zinc-100 text-xs dark:bg-zinc-800">
            <tr>
              <th class="px-2 py-1">#</th>
              <th class="px-2 py-1">Nome</th>
              <th class="px-2 py-1">Entrada</th>
              <th class="px-2 py-1">Saída</th>
              <th class="px-2 py-1">Convite</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(detail, i) in (item.data || []).filter((d: any) => !statusFilter || (d.evento_escala_prof_status || '').toLowerCase()===statusFilter)"
                :key="i" class="border-b">
              <td class="px-2 py-1">{{ i + 1 }}</td>
              <td class="px-2 py-1">{{ detail.nome_usuario }}</td>
              <td class="px-2 py-1">{{ fmtTime(detail.evento_escala_prof_check_in) }}</td>
              <td class="px-2 py-1">{{ fmtTime(detail.evento_escala_prof_check_out) }}</td>
              <td class="px-2 py-1">
                <span :class="statusBadgeClass((detail.evento_escala_prof_status || '').toLowerCase())">
                  {{ detail.evento_escala_prof_status }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <details class="rounded-md border p-3 text-xs">
      <summary class="cursor-pointer select-none">Dados recebidos (debug)</summary>
      <pre class="mt-2 overflow-auto">{{ details }}</pre>
    </details>
  </section>
</template>

