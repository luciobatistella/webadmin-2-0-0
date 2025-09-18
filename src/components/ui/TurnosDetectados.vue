<script setup lang="ts">
import { computed, ref, watch } from 'vue'

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
function overlap(a1:number,a2:number,b1:number,b2:number){
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1))
}

// Conta minutos noturnos (22:00–06:00) no intervalo [start,end)
function countNightMinutes(start:number, end:number){
  let total = 0
  const baseDay = Math.floor(start / 1440) - 1
  for (let d = baseDay; d <= baseDay + 2; d++) {
    const night1Start = d*1440 + 22*60
    const night1End   = d*1440 + 24*60
    const night2Start = d*1440 + 0
    const night2End   = d*1440 + 6*60
    total += overlap(start,end, night1Start, night1End)
    total += overlap(start,end, night2Start, night2End)
  }
  return total
}


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

// Indicador de pausa diária (somente leitura, vindo do resumo)
const temPausaLocal = computed(() => props.resumo?.temPausa1h === true)
const pausaInformadaLocal = computed(() => props.resumo?.pausaInformada === true)
function onTogglePausa(v:boolean){ emit('alterar-pausa', v) }

// Contagem de turnos e média
const turnosCountResumo = computed(() => {
  const r = props.resumo
  if (!r) return 0
  // Em Hora/Diária, contar os turnos padronizados cobertos (manhã/tarde/noite/madrugada)
  if ((props.tipoEscala || 'hora') !== 'escala') {
    const t = r.tiposTurno || { manha:0, tarde:0, noite:0, madrugada:0 }
    return (t.manha||0) + (t.tarde||0) + (t.noite||0) + (t.madrugada||0)
  }
  // Em Escala/Plantão, usar a contagem real dos blocos fatiados
  return perTurnoResumo.value.length
})
const avgMinPorTurnoResumo = computed(() => {
  const count = turnosCountResumo.value
  const horasDia = props.resumo?.horasPorDia || 0
  if (!count) return 0
  return Math.round((horasDia * 60) / count)
})

// Total de turnos no período (dias x turnos/dia)
const totalTurnosPeriodo = computed(() => {
  const dias = (props.datas || []).length
  const porDia = props.resumo?.quantidadeTurnos || 0
  return dias * porDia
})


// Mostrar Estratégia quando: 3 turnos OU fim de semana OU noturno OU horas extras
const showEstrategia = computed(() => {
  return false
})





// --- Cálculo de custo: contagens por tipo de dia e noite/extras ---
function nextDateStr(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

const countCurrentWeekend = computed(() => props.resumo?.diasFimDeSemana || 0)
const countCurrentWeekday = computed(() => (props.datas || []).length - countCurrentWeekend.value)
const countNextWeekend = computed(() => (props.datas || []).filter(d => isFimDeSemana(nextDateStr(d))).length)
const countNextWeekday = computed(() => (props.datas || []).length - countNextWeekend.value)

function breakdownTurnoAllocations(inicio: string, fim: string, capMinutes: number){
  const s = stripPlus1dFlag(inicio)
  const e = stripPlus1dFlag(fim)
  let start = s.hh*60 + s.mm
  let end = e.hh*60 + e.mm + (e.plus1d ? 1440 : 0)
  if (!e.plus1d && end <= start) end += 1440
  const total = end - start
  const extra = Math.max(0, total - capMinutes)
  const regularBoundary = end - extra

  const seg1Start = start
  const seg1End = Math.min(end, 1440)
  const seg2Start = Math.max(1440, start)
  const seg2End = end

  function part(startA:number, endA:number){
    let rd=0, rn=0, ed=0, en=0
    if (endA > startA){
      const rS = Math.max(startA, start)
      const rE = Math.min(endA, regularBoundary)
      if (rE > rS){
        const n = countNightMinutes(rS, rE)
        rn += n; rd += (rE - rS) - n
      }
      const eS = Math.max(startA, regularBoundary)
      const eE = Math.min(endA, end)
      if (eE > eS){
        const n = countNightMinutes(eS, eE)
        en += n; ed += (eE - eS) - n
      }
    }
    return { rd, rn, ed, en }
  }

  const a = part(seg1Start, seg1End)
  const b = seg2End > seg2Start ? part(seg2Start, seg2End) : { rd:0, rn:0, ed:0, en:0 }
  return { seg1: a, seg2: b }
}

const perDayTypeMinutes = computed(() => {
  const cap = Math.max(4, escalaLocal.value) * 60
  let weekday = { regularDay:0, regularNight:0, extraDay:0, extraNight:0 }
  let weekend = { regularDay:0, regularNight:0, extraDay:0, extraNight:0 }
  for (const t of props.turnos || []){
    const b = breakdownTurnoAllocations(t.inicio, t.fim, cap)
    // seg1 pertence ao mesmo dia; seg2 pertence ao dia seguinte
    weekend.regularDay += b.seg1.rd * countCurrentWeekend.value
    weekend.regularNight += b.seg1.rn * countCurrentWeekend.value
    weekend.extraDay += b.seg1.ed * countCurrentWeekend.value
    weekend.extraNight += b.seg1.en * countCurrentWeekend.value

    weekday.regularDay += b.seg1.rd * countCurrentWeekday.value
    weekday.regularNight += b.seg1.rn * countCurrentWeekday.value
    weekday.extraDay += b.seg1.ed * countCurrentWeekday.value
    weekday.extraNight += b.seg1.en * countCurrentWeekday.value

    weekend.regularDay += b.seg2.rd * countNextWeekend.value
    weekend.regularNight += b.seg2.rn * countNextWeekend.value
    weekend.extraDay += b.seg2.ed * countNextWeekend.value
    weekend.extraNight += b.seg2.en * countNextWeekend.value

    weekday.regularDay += b.seg2.rd * countNextWeekday.value
    weekday.regularNight += b.seg2.rn * countNextWeekday.value
    weekday.extraDay += b.seg2.ed * countNextWeekday.value
    weekday.extraNight += b.seg2.en * countNextWeekday.value
  }
  return { weekday, weekend }
})

// Opções de custo
const baseRate = ref<number>(0)
const optReduceNight = ref<boolean>(true)
const pctNight = ref<number>(0)
const pctWeekend = ref<number>(0)
const pctExtraDay = ref<number>(0)
const pctExtraNight = ref<number>(0)

function currencyBRL(v:number){
  try { return new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(v || 0) } catch { return `R$ ${ (v||0).toFixed(2) }` }
}

const costSummary = computed(() => {
  const m = perDayTypeMinutes.value
  const red = optReduceNight.value ? (60/52.5) : 1
  // Horas pagas por bucket
  const wdRegDayH = m.weekday.regularDay / 60
  const wdRegNightH = (m.weekday.regularNight / 60) * red
  const wdExtDayH = m.weekday.extraDay / 60
  const wdExtNightH = (m.weekday.extraNight / 60) * red

  const weRegDayH = m.weekend.regularDay / 60
  const weRegNightH = (m.weekend.regularNight / 60) * red
  const weExtDayH = m.weekend.extraDay / 60
  const weExtNightH = (m.weekend.extraNight / 60) * red

  const paidNightH = wdRegNightH + wdExtNightH + weRegNightH + weExtNightH
  const paidWeekendH = weRegDayH + weRegNightH + weExtDayH + weExtNightH
  const paidExtraDayH = wdExtDayH + weExtDayH
  const paidExtraNightH = wdExtNightH + weExtNightH

  const totalPaidH = wdRegDayH + wdRegNightH + wdExtDayH + wdExtNightH + weRegDayH + weRegNightH + weExtDayH + weExtNightH

  const rate = baseRate.value || 0
  const base = rate * totalPaidH
  const addNight = rate * paidNightH * (pctNight.value/100)
  const addWeekend = rate * paidWeekendH * (pctWeekend.value/100)
  const addExtraDay = rate * paidExtraDayH * (pctExtraDay.value/100)
  const addExtraNight = rate * paidExtraNightH * (pctExtraNight.value/100)
  const total = base + addNight + addWeekend + addExtraDay + addExtraNight

  return { totalPaidH, base, addNight, addWeekend, addExtraDay, addExtraNight, total,
           buckets:{ wdRegDayH, wdRegNightH, wdExtDayH, wdExtNightH, weRegDayH, weRegNightH, weExtDayH, weExtNightH } }
})

// Computed para opções de escala inteligentes (apenas escalas vantajosas)
const escalaOptions = computed<number[]>(() => {
  const dailyMins = totalByType.value.totalMinutes
  const base = [4, 6, 8, 12]
  if (!dailyMins || dailyMins <= 0) return base
  const h = Math.floor(dailyMins / 60)

  // Prioridade 1: Divisores exatos (sem hora extra)
  const exact = base.filter(s => s <= h && (h % s === 0))

  // Prioridade 2: Se há poucos divisores (≤1), adicionar escalas "próximas" que minimizam desperdício
  if (exact.length <= 1) {
    const efficient = base.filter(s => {
      if (s > h) return false // não pode ser maior que o período
      const waste = h % s // horas extras geradas
      return waste <= 2 // aceita até 2h de extra
    })
    return efficient.length ? efficient : [4]
  }

  return exact
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
  <div v-if="(datas && datas.length) || (turnos && turnos.length)" class="card p-4 bg-green-50 border-green-200">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-semibold text-gray-900">Turnos Detectados Automaticamente
        <span class="ml-2 align-middle inline-flex items-center px-2 py-0.5 rounded-full border border-gray-300 bg-white text-[10px] uppercase tracking-wide text-gray-600">resumo da operação</span>
      </h3>


    </div>

    <!-- Explicação da Estratégia -->
    <div v-if="showEstrategia" class="mb-4 p-3 rounded border"
         :class="estrategiaTurnos ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'">
      <div class="flex items-start gap-2">
        <span class="text-lg">{{ estrategiaTurnos ? '💰' : '👥' }}</span>
        <div class="text-sm">
          <div class="font-medium"
               :class="estrategiaTurnos ? 'text-green-800' : 'text-orange-800'">
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
          class="bg-white border border-green-200 rounded-lg p-4"
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
          <div class="flex items-center gap-2 flex-wrap">
            <!-- Tipo de Escala -->
            <div class="inline-flex rounded-lg border border-green-300 overflow-hidden">
              <button type="button"
                      class="px-2.5 py-1.5 text-[11px] border-r"
                      :class="tipoEscalaLocal==='hora' ? 'bg-green-50 text-green-800 border-green-400' : 'bg-white text-green-700 border-green-300'"
                      @click="onChangeTipo('hora')">
                Hora Trabalhada
              </button>
              <button type="button"
                      class="px-2.5 py-1.5 text-[11px] border-r"
                      :class="tipoEscalaLocal==='diaria' ? 'bg-green-50 text-green-800 border-green-400' : 'bg-white text-green-700 border-green-300'"
                      @click="onChangeTipo('diaria')">
                Diária
              </button>
              <button type="button"
                      class="px-2.5 py-1.5 text-[11px]"
                      :class="tipoEscalaLocal==='escala' ? 'bg-green-50 text-green-800 border-green-400' : 'bg-white text-green-700 border-green-300'"
                      @click="onChangeTipo('escala')">
                Escala/Plantão
              </button>
            </div>

            <!-- 1h Pausa como card selecionável -->
            <button type="button"
                    class="px-2.5 py-1.5 text-[11px] rounded-lg border"
                    :class="pausaInformadaLocal ? 'border-green-500 bg-green-50 text-green-800' : 'border-green-300 bg-white text-green-700'"
                    @click="onTogglePausa(!pausaInformadaLocal)"
                    :aria-pressed="pausaInformadaLocal">
              1h Pausa
            </button>

            <!-- Escalas (só quando tipo = Escala/Plantão) -->
            <div v-if="tipoEscalaLocal==='escala' && escalaOptions.length" class="inline-flex items-center gap-2">
              <div class="text-[11px] uppercase text-green-700">Escala</div>
              <div class="inline-flex gap-1">
                <button
                  v-for="h in escalaOptions"
                  :key="h"
                  type="button"
                  class="px-3 py-1.5 rounded-lg border text-[11px] focus:outline-none"
                  :class="escalaLocal === h ? 'border-green-500 bg-green-50 text-green-800' : 'border-green-300 bg-white text-green-700 hover:border-green-400'"
                  @click="onChangeEscala(h)"
                  role="radio"
                  :aria-checked="escalaLocal === h"
                >
                  {{ h }}h
                </button>
              </div>
            </div>
          </div>
          <button type="button" @click="showDebug = !showDebug" class="text-[11px] text-green-700 underline">Debug</button>
        </div>

        <div class="p-4 bg-green-100 border border-green-300 rounded">
          <!-- Cabeçalho removido (controles movidos para fora do card verde) -->
          <div v-if="showDebug" class="mb-3">
            <pre class="text-[10px] leading-tight bg-white p-2 rounded border overflow-auto max-h-64">{{ debugDump }}</pre>
          </div>

          <!-- Informações principais -->

            <!-- Comparativo de Estratégias (estimativa) -->
            <div v-if="false" class="bg-white p-3 rounded border border-blue-200">
              <div class="text-xs text-blue-600 uppercase font-medium mb-2">Comparativo de Estratégias (estimativa)</div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div class="p-2 rounded border border-green-200 bg-green-50">
                  <div class="font-medium text-green-800">💰 Minimizar Custos</div>
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

          <!-- Resumo da Operação - Cards lado a lado com badges -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

            <!-- PERÍODO -->
            <div class="bg-white p-4 rounded-lg border border-green-200">
              <div class="text-xs text-green-600 uppercase font-medium mb-3">PERÍODO</div>

              <div class="flex flex-wrap gap-2">
                <span v-if="countCurrentWeekday > 0" class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  📅 {{ countCurrentWeekday }} {{ countCurrentWeekday === 1 ? 'dia útil' : 'dias úteis' }}
                </span>
                <span v-if="countCurrentWeekend > 0" class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                  {{ countCurrentWeekend }} {{ countCurrentWeekend === 1 ? 'fim de semana' : 'fins de semana' }}
                </span>
              </div>

              <div v-if="resumo?.janelaInicioStr && resumo?.janelaFimStr" class="mt-2 flex flex-wrap gap-2">
                <span
                  v-for="(d, di) in datas"
                  :key="'badge-dia-'+di"
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                  :class="isFimDeSemana(d) ? 'bg-orange-100 text-orange-800 border border-orange-200' : 'bg-gray-100 text-gray-800'"
                  :title="isFimDeSemana(d) ? 'Fim de semana' : 'Dia útil'"
                >
                  {{ d.split('-').reverse().join('/') }} das {{ resumo.janelaInicioStr.slice(0,5) }} às {{ resumo.janelaFimStr.slice(0,5) }}
                </span>
              </div>
            </div>

            <!-- OPERAÇÃO DIÁRIA -->
            <div class="bg-white p-3 rounded-lg border border-green-200">
              <div class="text-xs text-green-600 uppercase font-medium mb-2">OPERAÇÃO DIÁRIA</div>
              <div class="flex items-center gap-2 mb-2">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  ⏱️ {{ totalByType.horasTrabalho }}h trabalhadas por dia
                </span>
              </div>
              <!-- <div class="text-xs text-gray-700 mb-2">
                {{ turnosCountResumo }} {{ turnosCountResumo === 1 ? 'turno' : 'turnos' }}
                <span v-if="temPausaLocal" class="text-orange-600"> • com 1h pausa obrigatória</span>
              </div> -->
              <div class="flex flex-wrap gap-2">

                <!-- Cobertura por turnos padronizados (por dia) -->
                <div v-if="resumo?.tiposTurno" class="mt-1 flex flex-wrap gap-2">
                  <span v-if="resumo.tiposTurno.manha>0" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">🌅 Manhã: {{ humanDuration(horasPorTurnoDiario.manha) }}</span>
                  <span v-if="resumo.tiposTurno.tarde>0" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">☀️ Tarde: {{ humanDuration(horasPorTurnoDiario.tarde) }}</span>
                  <span v-if="resumo.tiposTurno.noite>0" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">🌙 Noite: {{ humanDuration(horasPorTurnoDiario.noite) }}</span>
                  <span v-if="resumo.tiposTurno.madrugada>0" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">🌃 Madrugada: {{ humanDuration(horasPorTurnoDiario.madrugada) }}</span>

                  <span v-if="dailyExtraMinutes > 0" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">
                    ⚡ Hora extra: {{ humanDuration(dailyExtraMinutes) }}
                  </span>

                </div>

                <!-- <span v-if="totalByType.normais > 0" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {{ totalByType.horasTrabalho }}h normais
                </span> -->
                <span v-if="totalByType.noturnas > 0" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                  {{ totalByType.noturnas }}h noturnas
                </span>
                <span v-if="totalByType.temPausa" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                  ⏰ 1h pausa
                </span>
              </div>
            </div>

            <!-- OPERAÇÃO TOTAL -->
            <div class="bg-white p-3 rounded-lg border border-green-200">
              <div class="text-xs text-green-600 uppercase font-medium mb-2">OPERAÇÃO TOTAL</div>
              <div class="flex items-center gap-2 mb-2">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  🎯 {{ (resumo?.horasTotalPeriodo ?? 0).toFixed(0) }}h trabalhadas
                </span>
              </div>
              <div class="flex items-center gap-2 mb-2">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                  🧩 {{ totalTurnosPeriodo }} {{ totalTurnosPeriodo === 1 ? 'turno' : 'turnos' }} no período
                </span>
              </div>

                <span v-if="dailyExtraMinutes > 0" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">
                  ⚡ {{ humanDuration(dailyExtraMinutes * datas.length) }} extras no período
                </span>

              <!-- <div class="text-xs text-gray-600 mb-2">Para Cálculo (com adicionais):</div> -->
              <!-- <div class="flex flex-wrap gap-2 mb-2">
                <span v-if="totalByType.horasTrabalho > 0" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {{ (totalByType.horasTrabalho * countCurrentWeekday).toFixed(0) }}h dia útil (100%)
                </span>
                <span v-if="totalByType.horasTrabalho > 0 && countCurrentWeekend > 0" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                  {{ (totalByType.horasTrabalho * countCurrentWeekend).toFixed(0) }}h fim de semana (100% adicional)
                </span>
                <span v-if="totalByType.noturnas > 0" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                  {{ (totalByType.noturnas * datas.length).toFixed(0) }}h noturnas
                </span>
              </div> -->
              <!-- <div>
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-200 text-green-900">
                  Total: {{ (resumo?.horasTotalPeriodo ?? 0).toFixed(0) }}h para pagamento
                </span>
              </div> -->
            </div>
          </div>


        </div>

        <!-- Turnos por dia: 1 linha por dia com seus turnos -->
        <div class="space-y-2 mt-4">
          <div v-for="(d, di) in datas" :key="'dia-'+d" class="flex gap-2 items-stretch w-full">
            <!-- Card da data -->
            <div class="flex-1 basis-0 bg-white border border-gray-200 rounded p-2">
              <div class="font-semibold text-gray-900">Dia {{ di + 1 }}</div>
              <div class="text-sm text-gray-600">{{ formatDateBR(d) }}</div>
            </div>
            <!-- Cards dos turnos -->
            <div
              v-for="(t, i) in turnosOrdenados"
              :key="'dia-'+d+'-turno-'+i"
              :class="t.isExtra
                ? 'flex-1 basis-0 bg-orange-50 border border-orange-200 rounded p-2'
                : (t.isPausa
                  ? 'flex-1 basis-0 bg-yellow-50 border border-yellow-200 rounded p-2'
                  : 'flex-1 basis-0 bg-white border border-gray-200 rounded p-2')"
            >
              <div class="flex items-center justify-between font-semibold text-gray-900 leading-tight">
                <span>{{ t.nome }}</span>
                <span
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                  :class="t.isExtra ? 'bg-orange-100 text-orange-800' : (t.isPausa ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-700')"
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


