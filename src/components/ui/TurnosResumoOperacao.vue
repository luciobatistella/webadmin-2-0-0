<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    <!-- PERÍODO -->
    <div class="bg-white p-4 rounded-lg border border-blue-200">
      <div class="text-xs text-blue-600 uppercase font-medium mb-3">PERÍODO</div>
      <div class="flex flex-wrap gap-2">
        <span v-if="countCurrentWeekday > 0" class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 whitespace-nowrap">
          📅 {{ countCurrentWeekday }} {{ countCurrentWeekday === 1 ? 'dia útil' : 'dias úteis' }}
        </span>
        <span v-if="countCurrentWeekend > 0" class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 whitespace-nowrap">
          {{ countCurrentWeekend }} {{ countCurrentWeekend === 1 ? 'fim de semana' : 'fins de semana' }}
        </span>
      </div>
      <div v-if="resumo?.janelaInicioStr && resumo?.janelaFimStr" class="mt-2 flex flex-wrap gap-2">
        <span v-for="(d, di) in datas" :key="'badge-dia-'+di" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" :class="isFimDeSemana(d) ? 'bg-orange-100 text-orange-800 border border-orange-200' : 'bg-gray-100 text-gray-800'" :title="isFimDeSemana(d) ? 'Fim de semana' : 'Dia útil'">
          {{ d.split('-').reverse().join('/') }} das {{ resumo.janelaInicioStr.slice(0,5) }} às {{ resumo.janelaFimStr.slice(0,5) }}
        </span>
      </div>
    </div>

    <!-- OPERAÇÃO DIÁRIA -->
    <div class="bg-white p-3 rounded-lg border border-blue-200">
      <div class="text-xs text-blue-600 uppercase font-medium mb-2">OPERAÇÃO DIÁRIA</div>
      <div class="flex items-center gap-2 mb-1">
        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 whitespace-nowrap">
          ⏱️ {{ totalByType.horasTrabalho }}h trabalhadas por dia
        </span>
      </div>
      <div class="flex items-center gap-2 mb-2">
        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 whitespace-nowrap" title="Equipes por dia conforme escala e horas do dia">
          👥 {{ equipesPorDia }} {{ equipesPorDia === 1 ? 'equipe' : 'equipes' }}
        </span>
      </div>
      <div class="flex flex-wrap gap-2">
        <div v-if="resumo?.tiposTurno" class="mt-1 flex flex-wrap gap-2">
          <span v-if="resumo.tiposTurno.manha>0" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 whitespace-nowrap">🌅 Manhã: {{ humanDuration(horasPorTurnoDiario.manha) }}</span>
          <span v-if="resumo.tiposTurno.tarde>0" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 whitespace-nowrap">☀️ Tarde: {{ humanDuration(horasPorTurnoDiario.tarde) }}</span>
          <span v-if="resumo.tiposTurno.noite>0" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 whitespace-nowrap">🌙 Noite: {{ humanDuration(horasPorTurnoDiario.noite) }}</span>
          <span v-if="resumo.tiposTurno.madrugada>0" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 whitespace-nowrap">🌃 Madrugada: {{ humanDuration(horasPorTurnoDiario.madrugada) }}</span>
          <span v-if="dailyExtraMinutes > 0" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200 whitespace-nowrap">⚡ Hora extra: {{ humanDuration(dailyExtraMinutes) }}</span>
        </div>
        <span v-if="totalByType.noturnas > 0" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">{{ totalByType.noturnas }}h noturnas</span>
        <span v-if="totalByType.temPausa" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">🍽️ 1h almoço</span>
      </div>
    </div>

    <!-- OPERAÇÃO TOTAL -->
    <div class="bg-white p-3 rounded-lg border border-blue-200">
      <div class="text-xs text-blue-600 uppercase font-medium mb-2">OPERAÇÃO TOTAL</div>
      <div class="flex items-center gap-2 mb-2">
        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">🎯 {{ (resumo?.horasTotalPeriodo ?? 0).toFixed(0) }}h trabalhadas</span>
      </div>
      <div class="flex items-center gap-2 mb-2">
        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">🧩 {{ totalTurnosPeriodo }} {{ totalTurnosPeriodo === 1 ? 'turno' : 'turnos' }} no período</span>
      </div>
      <span v-if="dailyExtraMinutes > 0" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">⚡ {{ humanDuration(dailyExtraMinutes * datas.length) }} extras no período</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface ResumoOperacao {
  quantidadeDias: number
  quantidadeTurnos: number
  horasPorDia: number
  horasTotalPeriodo: number
  temPausa1h: boolean
  pausaInformada: boolean
  escalaHoras: number | null
  colaboradoresPorDia: number
  temHoraExtra: boolean
  temFimDeSemana: boolean
  diasFimDeSemana: number
  temFeriado: boolean
  diasFeriado: number
  temAdicionalNoturno: boolean
  horasNoturnasPorDia: number
  horasNormaisPorDia: number
  janelaInicioStr: string
  janelaFimStr: string
  tiposTurno: { manha: number; tarde: number; noite: number; madrugada: number }
  perTurno: { totalMinutes: number; hasExtra: boolean }[]
}

const props = defineProps<{ resumo?: ResumoOperacao | null; datas: string[]; totalByType: any; horasPorTurnoDiario: any; dailyExtraMinutes: number; totalTurnosPeriodo: number }>()

function isFimDeSemana(dateStr: string): boolean {
  const date = new Date(dateStr + 'T00:00:00')
  const dayOfWeek = date.getDay()
  return dayOfWeek === 0 || dayOfWeek === 6
}

function humanDuration(mins: number): string {
  const h = Math.floor(mins / 60), m = mins % 60
  if (m === 0) return `${h}h`
  if (h === 0) return `${m}min`
  return `${h}h ${m}min`
}

const countCurrentWeekend = computed(() => props.resumo?.diasFimDeSemana || 0)
const countCurrentWeekday = computed(() => props.datas.length - countCurrentWeekend.value)

const dailyExtraMinutes = computed(() => props.dailyExtraMinutes)

// Equipes por dia: diretamente proporcional às horas trabalhadas/dia e à escala
const equipesPorDia = computed(() => {
  if (!props.resumo) return 1
  const pre = typeof props.resumo.colaboradoresPorDia === 'number' && props.resumo.colaboradoresPorDia > 0
    ? props.resumo.colaboradoresPorDia
    : Math.max(1, Math.ceil((props.resumo.horasPorDia || 0) / (props.resumo.escalaHoras || 8)))
  return pre
})

</script>
