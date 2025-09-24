<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import TurnosResumoOperacao from '@/components/ui/TurnosResumoOperacao.vue'

export interface Turno {
  nome: string
  inicio: string
  fim: string
  isExtra?: boolean
  isPausa?: boolean
  inicioAbs?: number
  fimAbs?: number
}

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
  tiposTurno: { manha: number, tarde: number, noite: number, madrugada: number }
  perTurno: { totalMinutes: number, hasExtra: boolean }[]
}

const props = defineProps<{
  turnos: Turno[]
  datas: string[]
  estrategiaTurnos: boolean
  resumo?: ResumoOperacao | null
  tipoEscala?: 'hora' | 'diaria' | 'escala'
  pausaInformada?: boolean
}>()

const emit = defineEmits<{
  (e: 'recalcular-turnos'): void
  (e: 'alterar-escala', horas: number): void
  (e: 'alterar-pausa', checked: boolean): void
  (e: 'alterar-tipo-escala', tipo: 'hora' | 'diaria' | 'escala'): void
}>()

const escalaLocal = ref<number>(8)
function onChangeEscala(v:number){
  const v2 = Math.max(4, v)
  escalaLocal.value = v2
  emit('alterar-escala', v2)
}

// Tipo de escala (hora, diaria, escala)
const tipoEscalaLocal = ref<'hora'|'diaria'|'escala'>(props.tipoEscala ?? 'escala')
function onChangeTipo(tipo: 'hora'|'diaria'|'escala'){
  tipoEscalaLocal.value = tipo
  emit('alterar-tipo-escala', tipo)
}
watch(() => props.tipoEscala, (v) => {
  if (v) tipoEscalaLocal.value = v
}, { immediate: true })

// Sincroniza escala com resumo (quando presente)
watch(() => props.resumo?.escalaHoras, (v) => {
  if (typeof v === 'number' && v > 0) {
    escalaLocal.value = v
  }
}, { immediate: true })

// Debug opcional
const showDebug = ref(false)
const debugDump = computed(() => JSON.stringify({ datas: props.datas, turnos: props.turnos, resumo: props.resumo, tipoEscala: tipoEscalaLocal.value }, null, 2))

// Função para verificar se é fim de semana
function isFimDeSemana(dateStr: string): boolean {
  const date = new Date(dateStr + 'T00:00:00')
  const dayOfWeek = date.getDay()
  return dayOfWeek === 0 || dayOfWeek === 6 // 0 = domingo, 6 = sábado
}

// Helpers para lidar com horários "(+1d)" e duração humana
function stripPlus1dFlag(s: string): { hh: number; mm: number; plus1d: boolean; days: number } {
  const hasPlusToken = /(\(\+1d\))/.test(s)
  const core = s.replace(/\(\+1d\)/, '').trim()



  const [hStr, mStr] = core.split(':')
  let hh = parseInt(hStr || '0', 10)
  const mm = parseInt((mStr || '0').replace(/[^0-9].*$/, ''), 10)

  // se vier "26:00", normaliza para 02:00 e guarda quantos dias passou
  let days = 0
  if (!isNaN(hh) && hh >= 24) {
    days = Math.floor(hh / 24)
    hh = hh % 24
  }

  // se tinha "(+1d)", soma mais 1 dia
  if (hasPlusToken) days += 1

  return {
    hh: isNaN(hh) ? 0 : hh,
    mm: isNaN(mm) ? 0 : mm,
    plus1d: days > 0,
    days
  }
}

function humanDuration(mins: number): string {
  const h = Math.floor(mins/60), m = mins % 60
  if (m === 0) return `${h}h`
  if (h === 0) return `${m}min`
  return `${h}h ${m}min`
}

function isTurnoMadrugada(t: Turno): boolean {
  return /madrugada/i.test(t?.nome || '')
}

function turnoMinutes(t: Turno): number {
  // Prefer absolutes when provided
  if (typeof t.inicioAbs === 'number' && typeof t.fimAbs === 'number') {
    return Math.max(0, (t.fimAbs as number) - (t.inicioAbs as number))
  }
  const s = stripPlus1dFlag(t.inicio)


  const e = stripPlus1dFlag(t.fim)
  let start = s.hh*60 + s.mm
  let end = e.hh*60 + e.mm + (e.plus1d ? 1440 : 0)
  if (!e.plus1d && end <= start) end += 1440
  return Math.max(0, end - start)
}

function formatDateBR(dateStr: string): string {
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR')
  } catch {
    const [y,m,d] = (dateStr||'').split('-')
    return `${d}/${m}/${y}`
  }
}




// Ordena turnos para exibição: em 'hora' e 'diaria', coloca a pausa no meio
const turnosOrdenados = computed(() => {
  const tipo = props.tipoEscala ?? 'escala'
  const arr = [...(props.turnos || [])]
  if (tipo === 'hora' || tipo === 'diaria') {
    const toMin = (t: Turno) =>
      typeof t.inicioAbs === 'number'
        ? (t.inicioAbs as number)
        : (() => { const p = stripPlus1dFlag(t.inicio); return p.hh*60 + p.mm })()

    const nonPause = arr.filter(t => !t.isPausa).sort((a,b) => toMin(a) - toMin(b))
    const pauses = arr.filter(t => t.isPausa)
    if (pauses.length > 0) {
      const mid = Math.ceil(nonPause.length / 2) // pausa inserida no meio
      nonPause.splice(mid, 0, ...pauses)
    }
    return nonPause
  }
  return arr
})

// Interseção em minutos entre dois intervalos [a1,a2) e [b1,b2)





// Computed para totais POR DIA (baseado no resumo do DateRangePicker)
const totalByType = computed(() => {
  const r = props.resumo
  if (!r) return { totalMinutes: 0, totalReais: 0, totalCalculado: 0, normais: 0, noturnas: 0, normaisExtras: 0, noturnaExtras: 0, temPausa: false, horasTrabalho: 0 }

  const totalMinutes = (r.horasPorDia + (r.temPausa1h ? 1 : 0)) * 60
  return {
    totalMinutes,
    totalReais: 0,
    totalCalculado: 0,
    normais: r.horasNormaisPorDia,
    noturnas: r.horasNoturnasPorDia,
    normaisExtras: 0,
    noturnaExtras: 0,
    temPausa: r.temPausa1h,
    horasTrabalho: r.horasPorDia
  }
})

// Horas por turno padronizado (minutos por dia por janela: manhã/tarde/noite/madrugada),
// calculado a partir da janela diária do resumo (sem usar o array de turnos)
const horasPorTurnoDiario = computed(() => {
  const r = props.resumo
  if (!r || !r.janelaInicioStr || !r.janelaFimStr) {
    return { manha: 0, tarde: 0, noite: 0, madrugada: 0 }
  }
  const day = 24 * 60
  const parseHHMM = (s: string) => {
    const [hh, mm] = s.slice(0, 5).split(':').map(x => parseInt(x, 10) || 0)
    return hh * 60 + mm
  }
  let s = parseHHMM(r.janelaInicioStr)
  let e = parseHHMM(r.janelaFimStr)
  if (e <= s) e += day
  const base = s - (s % day)
  const win = {
    manha: { a: base + 9 * 60, b: base + 13 * 60 },
    tarde: { a: base + 13 * 60, b: base + 18 * 60 },
    noite: { a: base + 18 * 60, b: base + 24 * 60 },
    madrugada: { a: base + 24 * 60, b: base + 30 * 60 }
  }
  const ov = (a: number, b: number, c: number, d: number) => Math.max(0, Math.min(b, d) - Math.max(a, c))
  const mins = {
    manha: ov(s, e, win.manha.a, win.manha.b),
    tarde: ov(s, e, win.tarde.a, win.tarde.b),
    noite: ov(s, e, win.noite.a, win.noite.b),
    madrugada: ov(s, e, win.madrugada.a, win.madrugada.b)
  }
  // Desconto da pausa 1h se estiver contabilizada
  if (r.temPausa1h) {
    let pStart = base + 13 * 60
    let pEnd = base + 14 * 60
    if (pStart < s || pEnd > e) {
      const mid = s + Math.floor((e - s) / 2)
      pStart = Math.max(s, Math.min(e - 60, mid - 30))
      pEnd = pStart + 60
    }
    const sub = (w: { a: number, b: number }, cur: number) => Math.max(0, cur - ov(w.a, w.b, pStart, pEnd))
    mins.manha = sub(win.manha, mins.manha)
    mins.tarde = sub(win.tarde, mins.tarde)
    mins.noite = sub(win.noite, mins.noite)
    mins.madrugada = sub(win.madrugada, mins.madrugada)
  }
  return mins
})


// Minutos de hora extra por dia (com base nos turnos exibidos)
const dailyExtraMinutes = computed(() => {
  const arr = props.turnos || []
  let total = 0
  for (const t of arr) {
    if ((t as any)?.isExtra) total += turnoMinutes(t as any)
  }
  return total
})




// Lista de resumos por turno vinda do DateRangePicker
const perTurnoResumo = computed(() => props.resumo?.perTurno || [])


function onTogglePausa(v:boolean){ emit('alterar-pausa', v) }

// Contagem de turnos e média



// Total de turnos no período (dias x turnos/dia)
const totalTurnosPeriodo = computed(() => {
  const dias = (props.datas || []).length
  const porDia = props.resumo?.quantidadeTurnos || 0
  return dias * porDia
})

// Equipes por dia conforme regra: proporcional às horas/dia e escala
const equipesPorDia = computed(() => {
  const r = props.resumo
  if (!r) return 1
  if (typeof r.colaboradoresPorDia === 'number' && r.colaboradoresPorDia > 0) return r.colaboradoresPorDia
  const escala = r.escalaHoras || 8
  const horas = r.horasPorDia || 0
  return Math.max(1, Math.ceil(horas / escala))
})


// Mostrar Estratégia quando: 3 turnos OU fim de semana OU noturno OU horas extras
const showEstrategia = computed(() => {
  return false
})





// --- Cálculo de custo: contagens por tipo de dia e noite/extras ---


const countCurrentWeekend = computed(() => props.resumo?.diasFimDeSemana || 0)
const countCurrentWeekday = computed(() => (props.datas || []).length - countCurrentWeekend.value)






// Computed para opções de escala inteligentes (apenas escalas vantajosas)
const escalaOptions = computed<number[]>(() => {
  const dailyMins = totalByType.value.totalMinutes
  const base = [4, 6, 8, 12]
  if (!dailyMins || dailyMins <= 0) return base
  const h = Math.floor(dailyMins / 60)
  // Mostrar todas as escalas que cabem no total de horas do dia
  return base.filter(s => s <= h)
})

// Garante que a escala selecionada esteja sempre entre as opções válidas
watch(escalaOptions, (opts) => {
  console.log(`🔍 Opções de escala mudaram:`, opts, `atual: ${escalaLocal.value}`)
  if (opts.length && !opts.includes(escalaLocal.value)) {
    // Prioriza a escala mais próxima da atual, senão a maior
    const closest = opts.reduce((prev, curr) =>
      Math.abs(curr - escalaLocal.value) < Math.abs(prev - escalaLocal.value) ? curr : prev
    )
    console.log(`🔍 Mudando escala de ${escalaLocal.value}h para ${closest}h`)
    onChangeEscala(closest)
  }
}, { immediate: true })

</script>

<template>
  <div v-if="(datas && datas.length) || (turnos && turnos.length)" class="card p-4 bg-blue-50 border-blue-200">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-semibold text-gray-900">Turnos Detectados Automaticamente
        <span class="ml-2 align-middle inline-flex items-center px-2 py-0.5 rounded-full border border-gray-300 bg-white text-[10px] uppercase tracking-wide text-gray-600">resumo da operação</span>
      </h3>


    </div>

    <!-- Explicação da Estratégia -->
    <div v-if="showEstrategia" class="mb-4 p-3 rounded border"
         :class="estrategiaTurnos ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'">
      <div class="flex items-start gap-2">
        <span class="text-lg">{{ estrategiaTurnos ? '💰' : '👥' }}</span>
        <div class="text-sm">
          <div class="font-medium"
               :class="estrategiaTurnos ? 'text-blue-800' : 'text-orange-800'">
            {{ estrategiaTurnos ? 'Minimizar Custos' : 'Minimizar Funcionários' }}
          </div>
          <div class="text-gray-600 mt-1">
            {{ estrategiaTurnos
               ? 'Cria turnos adicionais para evitar horas extras. Mais funcionários, menor custo por hora.'
               : 'Aceita horas extras para usar menos funcionários. Menos pessoas, maior custo por hora.' }}
          </div>
        </div>
      </div>
    </div>

    <!-- Layout em duas colunas principais -->
    <div class="grid grid-cols-1 gap-6">

      <!-- Coluna Esquerda: Turnos Configurados -->
      <div v-if="false" class="space-y-3">
        <div
          v-for="(turno, index) in turnos"
          :key="index"
          class="bg-white border border-blue-200 rounded-lg p-4"
        >
          <!-- Layout em duas colunas -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <!-- Coluna 1: Informações do Turno -->

            <div class="flex items-center gap-2">
              <span v-if="perTurnoResumo[index]?.hasExtra" class="text-orange-500 text-xl">⚡</span>
              <span v-else-if="turno.nome.includes('Manhã')" class="text-yellow-500 text-xl">🌅</span>
              <span v-else-if="turno.nome.includes('Tarde')" class="text-orange-500 text-xl">☀️</span>
              <span v-else-if="turno.nome.includes('Noite')" class="text-blue-500 text-xl">🌙</span>
              <span v-else-if="turno.nome.includes('Madrugada')" class="text-purple-500 text-xl">🌃</span>
              <span v-else class="text-gray-500 text-xl">⏰</span>

              <div>
                <div class="font-semibold text-gray-900">{{ turno.nome }}</div>
                <div class="text-sm text-gray-600">{{ turno.inicio }} - {{ turno.fim }}</div>
                    <div class="mt-1 flex flex-wrap gap-2">

                      <span v-if="perTurnoResumo[index]?.hasExtra" class="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">⚡ Hora extra ({{ humanDuration(Math.max((perTurnoResumo[index]?.totalMinutes || 0) - (escalaLocal * 60), 0)) }})</span>
                    </div>
              </div>
            </div>

            <!-- Coluna 2: Totais em cards alinhados verticalmente -->

            <div class="space-y-2">
              <!-- Total -->
              <div class="bg-gray-50 border border-gray-200 px-3 py-2 rounded flex justify-between items-center">
                <div class="text-xs text-gray-600 uppercase font-medium">Duração</div>
                <div class="font-bold text-gray-900 text-sm">{{ humanDuration(perTurnoResumo[index]?.totalMinutes || 0) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Coluna Direita: Resumo da Operação -->
      <div class="space-y-4">
        <!-- Barra de controles (fora do card verde) -->
        <div class="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div class="flex items-center gap-2 flex-wrap ">
            <!-- Tipo de Escala + (quando Escala/Plantão) opções de escala ao lado -->
            <div class="inline-flex items-center rounded-lg border border-blue-300 overflow-hidden flex items-center gap-1 pl-2 px-2.5 py-1.5">
              <button type="button"
                      class="px-2.5 py-1.5 text-[11px] border-r"
                      :class="tipoEscalaLocal==='hora' ? 'px-2 py-1 rounded-lg text-[11px] focus:outline-none bg-blue-600 text-white' : 'bg-white text-blue-700 border-blue-300'"
                      @click="onChangeTipo('hora')">
                Hora Trabalhada
              </button>
              <button type="button"
                      class="px-2.5 py-1.5 text-[11px] border-r"
                      :class="tipoEscalaLocal==='diaria' ? 'px-2 py-1 rounded-lg text-[11px] focus:outline-none bg-blue-600 text-white' : 'bg-white text-blue-700 border-blue-300'"
                      @click="onChangeTipo('diaria')">
                Diária
              </button>
              <button type="button"
                      class="px-2.5 py-1.5 text-[11px]"
                      :class="tipoEscalaLocal==='escala' ? 'px-2 py-1 rounded-lg text-[11px] focus:outline-none bg-blue-600 text-white' : 'bg-white text-blue-700 border-blue-300'"
                      @click="onChangeTipo('escala')">
                Escala/Plantão
              </button>
              <!-- Escalas agrupadas ao botão Escala/Plantão (sem label 'Escala' e sem bordas nos cards) -->
              <div v-if="tipoEscalaLocal==='escala' && escalaOptions.length" class="flex items-center gap-1 ">
                <div class="inline-flex gap-1 ">
                  <button
                    v-for="h in escalaOptions"
                    :key="h"
                    type="button"
                    class="px-2 py-1 rounded-lg text-[11px] focus:outline-none"
                    :class="escalaLocal === h ? 'bg-blue-600 text-white' : 'bg-white-100 text-blue-800 hover:bg-blue-200'"
                    @click="onChangeEscala(h)"
                    role="radio"
                    :aria-checked="escalaLocal === h"
                  >
                    {{ h }}h
                  </button>
                </div>
              </div>
            </div>

            <!-- Grupo: 1 Hora de Almoço / Hora Extra -->
            <div class="inline-flex rounded-lg border border-blue-300 overflow-hidden  gap-1 pl-2 px-2.5 py-1.5" role="group" aria-label="Pausa ou Hora Extra">
              <button type="button"
                      class="px-2.5 py-1.5 text-[11px]"
                      :class="props.pausaInformada ? 'px-2 py-1 rounded-lg text-[11px] focus:outline-none bg-blue-600 text-white' : 'bg-white text-blue-700 border-blue-300'"
                      @click="onTogglePausa(true)"
                      :aria-pressed="props.pausaInformada">
                1 Hora de Almoço
              </button>
              <button type="button"
                      class="px-2.5 py-1.5 text-[11px]"
                      :class="! props.pausaInformada ? 'px-2 py-1 rounded-lg text-[11px] focus:outline-none bg-blue-600 text-white' : 'bg-white text-blue-700 border-blue-300'"
                      @click="onTogglePausa(false)"
                      :aria-pressed="!props.pausaInformada">
                Hora Extra
              </button>
            </div>


          </div>
          <button type="button" @click="showDebug = !showDebug" class="text-[11px] text-blue-700 underline">Debug</button>
        </div>

        <div class="p-4 bg-blue-100 border border-blue-300 rounded">
          <!-- Cabeçalho removido (controles movidos para fora do card verde) -->
          <div v-if="showDebug" class="mb-3">
            <pre class="text-[10px] leading-tight bg-white p-2 rounded border overflow-auto max-h-64">{{ debugDump }}</pre>
          </div>

          <!-- Informações principais -->

            <!-- Comparativo de Estratégias (estimativa) -->
            <div v-if="false" class="bg-white p-3 rounded border border-blue-200">
              <div class="text-xs text-blue-600 uppercase font-medium mb-2">Comparativo de Estratégias (estimativa)</div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div class="p-2 rounded border border-blue-200 bg-blue-50">
                  <div class="font-medium text-blue-800">💰 Minimizar Custos</div>
                  <div class="text-gray-700 mt-1">
                    Turnos/dia: <b>{{ Math.ceil(totalByType.totalMinutes / (escalaLocal * 60)) }}</b><br/>
                    Extras/dia: <b>0</b>
                  </div>
                </div>
                <div class="p-2 rounded border border-orange-200 bg-orange-50">
                  <div class="font-medium text-orange-800">👥 Minimizar Funcionários</div>
                  <div class="text-gray-700 mt-1">
                    Turnos/dia: <b>2</b><br/>
                    Extras/dia: <b>{{ humanDuration(Math.max(totalByType.totalMinutes - (2 * escalaLocal * 60), 0)) }}</b>
                  </div>
                </div>
              </div>
              <div class="text-[11px] text-gray-500 mt-2">Valores aproximados para referência rápida.</div>
            </div>

          <!-- Resumo da Operação movido para componente TurnosResumoOperacao -->
          <TurnosResumoOperacao
            :resumo="resumo"
            :datas="datas"
            :total-by-type="totalByType"
            :horas-por-turno-diario="horasPorTurnoDiario"
            :daily-extra-minutes="dailyExtraMinutes"
            :total-turnos-periodo="totalTurnosPeriodo"
          />


        </div>

        <!-- Turnos por dia: 1 linha por dia com seus turnos -->
        <div class="space-y-2 mt-4">
          <div
            v-for="(d, di) in datas"
            :key="'dia-'+d"
            class="flex gap-2 items-stretch w-full"
            :class="isFimDeSemana(d) ? 'weekend-row' : ''"
          >
            <!-- Card da data -->
            <div
              class="flex-1 basis-0 border rounded p-2"
              :class="isFimDeSemana(d)
                ? 'bg-orange-100 border-orange-300'
                : 'bg-white border-gray-200'"
            >
              <div class="font-semibold text-gray-900 flex items-center gap-2">
                <span>Dia {{ di + 1 }}</span>
                <span v-if="isFimDeSemana(d)" class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-200 text-orange-900 uppercase tracking-wide">FDS</span>
              </div>
              <div class="text-sm" :class="isFimDeSemana(d) ? 'text-orange-800' : 'text-gray-600'">{{ formatDateBR(d) }}</div>
            </div>
            <!-- Cards dos turnos -->
            <div
              v-for="(t, i) in turnosOrdenados"
              :key="'dia-'+d+'-turno-'+i"
              :class="[
                'flex-1 basis-0 rounded p-2 border',
                t.isPausa
                  ? (isFimDeSemana(d) ? 'bg-yellow-100 border-yellow-200' : 'bg-yellow-50 border-yellow-200')
                  : t.isExtra
                    ? (isFimDeSemana(d) ? 'bg-orange-200 border-orange-300' : 'bg-orange-50 border-orange-200')
                    : (isTurnoMadrugada(t)
                        ? (isFimDeSemana(d) ? 'bg-purple-200 border-purple-400' : 'bg-purple-50 border-purple-300')
                        : (isFimDeSemana(d) ? 'bg-orange-100 border-orange-300' : 'bg-white border-gray-200'))
              ]"
            >
              <div class="flex items-center justify-between font-semibold text-gray-900 leading-tight">
                <span class="flex items-center gap-1">
                  <span v-if="isTurnoMadrugada(t)" class="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold bg-purple-600 text-white shadow-sm" title="Turno Madrugada">🌃</span>
                  {{ t.nome }}
                </span>
                <span
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                  :class="t.isExtra
                    ? 'bg-orange-100 text-orange-800'
                    : (t.isPausa
                        ? 'bg-yellow-100 text-yellow-800'
                        : (isTurnoMadrugada(t)
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-gray-100 text-gray-700'))"
                >
                  {{ humanDuration(turnoMinutes(t)) }}
                </span>
              </div>
              <div class="text-sm text-gray-600 leading-tight">{{ t.inicio }} - {{ t.fim }}</div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>


