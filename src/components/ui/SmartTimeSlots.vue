<script setup lang="ts">
import { ref, computed, watch } from 'vue'

export interface Turno {
  nome: string
  inicio: string
  fim: string
}

const props = defineProps<{
  modelValue: Turno[]
  eventDates: string[]
  eventName?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: Turno[]): void
}>()

const turnos = ref<Turno[]>([...props.modelValue])
const smartInput = ref('')
const showAdvanced = ref(false)

// Templates de eventos comuns
const eventTemplates = [
  {
    name: 'Evento Corporativo (1 dia)',
    pattern: 'Montagem 06:00, Evento 10:00-18:00, Desmontagem até 22:00',
    icon: '🏢',
    turnos: [
      { nome: 'Montagem', inicio: '06:00', fim: '10:00' },
      { nome: 'Evento', inicio: '10:00', fim: '18:00' },
      { nome: 'Desmontagem', inicio: '18:00', fim: '22:00' }
    ]
  },
  {
    name: 'Festival (3 dias)',
    pattern: 'Dia 1: 06:00-02:00, Dias 2-3: 12:00-02:00',
    icon: '🎪',
    turnos: [
      { nome: 'Montagem + Dia 1', inicio: '06:00', fim: '02:00' },
      { nome: 'Dia 2', inicio: '12:00', fim: '02:00' },
      { nome: 'Dia 3 + Desmontagem', inicio: '12:00', fim: '06:00' }
    ]
  },
  {
    name: 'The Town Style',
    pattern: 'Inicia 06:00, termina 02:00 do dia seguinte',
    icon: '🎵',
    turnos: [
      { nome: 'Montagem', inicio: '06:00', fim: '14:00' },
      { nome: 'Evento', inicio: '14:00', fim: '02:00' },
      { nome: 'Desmontagem', inicio: '02:00', fim: '06:00' }
    ]
  },
  {
    name: 'Congresso (2 dias)',
    pattern: 'Dia 1: 07:00-18:00, Dia 2: 08:00-17:00',
    icon: '🎓',
    turnos: [
      { nome: 'Montagem', inicio: '06:00', fim: '08:00' },
      { nome: 'Dia 1', inicio: '08:00', fim: '18:00' },
      { nome: 'Dia 2', inicio: '08:00', fim: '17:00' },
      { nome: 'Desmontagem', inicio: '17:00', fim: '20:00' }
    ]
  }
]

// Computed para sugerir turnos baseado nas datas
const suggestedTurnos = computed(() => {
  if (props.eventDates.length === 0) return []
  
  if (props.eventDates.length === 1) {
    // Evento de 1 dia
    return [
      { nome: 'Montagem', inicio: '06:00', fim: '10:00' },
      { nome: 'Evento', inicio: '10:00', fim: '18:00' },
      { nome: 'Desmontagem', inicio: '18:00', fim: '22:00' }
    ]
  } else if (props.eventDates.length <= 3) {
    // Evento de 2-3 dias
    return [
      { nome: 'Montagem + Dia 1', inicio: '06:00', fim: '02:00' },
      { nome: 'Dias Intermediários', inicio: '12:00', fim: '02:00' },
      { nome: 'Último Dia + Desmontagem', inicio: '12:00', fim: '06:00' }
    ]
  } else {
    // Evento longo (4+ dias)
    return [
      { nome: 'Montagem', inicio: '06:00', fim: '14:00' },
      { nome: 'Primeiro Dia', inicio: '14:00', fim: '02:00' },
      { nome: 'Dias Intermediários', inicio: '12:00', fim: '02:00' },
      { nome: 'Último Dia', inicio: '12:00', fim: '02:00' },
      { nome: 'Desmontagem', inicio: '02:00', fim: '10:00' }
    ]
  }
})

// Detecta automaticamente o tipo de evento baseado no nome
const suggestedTemplate = computed(() => {
  if (!props.eventName) return null

  const name = props.eventName.toLowerCase()

  if (name.includes('town') || name.includes('festival') || name.includes('rock')) {
    return eventTemplates.find(t => t.name.includes('The Town'))
  }
  if (name.includes('congresso') || name.includes('summit') || name.includes('conferência')) {
    return eventTemplates.find(t => t.name.includes('Congresso'))
  }
  if (name.includes('festival') && props.eventDates.length >= 3) {
    return eventTemplates.find(t => t.name.includes('Festival'))
  }

  return eventTemplates[0] // Default: Evento Corporativo
})

// Watch para atualizar turnos quando as datas mudarem
watch(() => props.eventDates, () => {
  if (turnos.value.length === 0) {
    turnos.value = [...suggestedTurnos.value]
    emit('update:modelValue', turnos.value)
  }
}, { immediate: true })

// Watch para sugerir template baseado no nome do evento
watch(() => props.eventName, () => {
  if (turnos.value.length === 0 && suggestedTemplate.value) {
    turnos.value = [...suggestedTemplate.value.turnos]
    emit('update:modelValue', turnos.value)
  }
}, { immediate: true })

watch(turnos, (newTurnos) => {
  emit('update:modelValue', newTurnos)
}, { deep: true })

function applyTemplate(template: typeof eventTemplates[0]) {
  turnos.value = [...template.turnos]
}

function addTurno() {
  turnos.value.push({
    nome: `Turno ${turnos.value.length + 1}`,
    inicio: '09:00',
    fim: '18:00'
  })
}

function removeTurno(index: number) {
  turnos.value.splice(index, 1)
}

// Função para processar entrada inteligente
function parseSmartInput(input: string): Turno[] {
  const result: Turno[] = []
  const lines = input.split('\n').filter(line => line.trim())

  // Primeiro, tenta detectar padrões especiais como "The Town"
  const fullText = input.toLowerCase().trim()

  // Padrão "The Town": "inicia às 6 da manhã e termina 2 horas da manhã do dia seguinte"
  const theTownPattern = /inicia.*?(\d{1,2}).*?manhã.*?termina.*?(\d{1,2}).*?horas.*?manhã.*?seguinte/
  const theTownMatch = fullText.match(theTownPattern)

  if (theTownMatch) {
    const startHour = parseInt(theTownMatch[1])
    const endHour = parseInt(theTownMatch[2])

    return [
      { nome: 'Montagem', inicio: `${startHour.toString().padStart(2, '0')}:00`, fim: '14:00' },
      { nome: 'Evento', inicio: '14:00', fim: `${endHour.toString().padStart(2, '0')}:00` },
      { nome: 'Desmontagem', inicio: `${endHour.toString().padStart(2, '0')}:00`, fim: '06:00' }
    ]
  }

  // Padrões linha por linha
  for (const line of lines) {
    // Padrões diversos
    const patterns = [
      // "Nome: HH:MM-HH:MM"
      /^(.+?):\s*(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/,
      // "Nome HH:MM às HH:MM"
      /^(.+?)\s+(\d{1,2}):(\d{2})\s+às\s+(\d{1,2}):(\d{2})$/,
      // "Nome das HH:MM às HH:MM"
      /^(.+?)\s+das\s+(\d{1,2}):(\d{2})\s+às\s+(\d{1,2}):(\d{2})$/,
      // "Nome de HH:MM a HH:MM"
      /^(.+?)\s+de\s+(\d{1,2}):(\d{2})\s+a\s+(\d{1,2}):(\d{2})$/,
      // "Nome HH:MM-HH:MM"
      /^(.+?)\s+(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/,
      // "HH:MM-HH:MM Nome"
      /^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})\s+(.+)$/
    ]

    for (const pattern of patterns) {
      const match = line.trim().match(pattern)
      if (match) {
        let nome, startH, startM, endH, endM

        if (pattern.source.startsWith('^(\\d')) {
          // Padrão "HH:MM-HH:MM Nome"
          [, startH, startM, endH, endM, nome] = match
        } else {
          // Outros padrões "Nome ..."
          [, nome, startH, startM, endH, endM] = match
        }

        result.push({
          nome: nome.trim(),
          inicio: `${startH.padStart(2, '0')}:${startM}`,
          fim: `${endH.padStart(2, '0')}:${endM}`
        })
        break
      }
    }
  }

  return result
}

function processSmartInput() {
  if (!smartInput.value.trim()) return

  const parsed = parseSmartInput(smartInput.value)
  if (parsed.length > 0) {
    turnos.value = parsed
    smartInput.value = ''
  } else {
    alert('Formato não reconhecido. Tente:\n• "Montagem: 06:00-10:00"\n• "Evento das 10:00 às 18:00"\n• "Desmontagem 18:00 às 22:00"\n• "Inicia às 6 da manhã e termina 2 horas da manhã do dia seguinte"')
  }
}

function formatDuration(inicio: string, fim: string): string {
  const [startH, startM] = inicio.split(':').map(Number)
  const [endH, endM] = fim.split(':').map(Number)
  
  let startMinutes = startH * 60 + startM
  let endMinutes = endH * 60 + endM
  
  // Se fim é menor que início, assume que é no dia seguinte
  if (endMinutes < startMinutes) {
    endMinutes += 24 * 60
  }
  
  const durationMinutes = endMinutes - startMinutes
  const hours = Math.floor(durationMinutes / 60)
  const minutes = durationMinutes % 60
  
  if (minutes === 0) {
    return `${hours}h`
  } else {
    return `${hours}h${minutes.toString().padStart(2, '0')}m`
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Sugestão Inteligente -->
    <div v-if="suggestedTemplate && turnos.length === 0" class="p-3 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg">
      <div class="flex items-center gap-2 mb-2">
        <svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <span class="text-sm font-medium text-green-800">💡 Sugestão Inteligente</span>
      </div>
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm text-green-900">
            Baseado no nome "{{ eventName }}", sugerimos: <strong>{{ suggestedTemplate.name }}</strong>
          </div>
          <div class="text-xs text-green-700 mt-1">{{ suggestedTemplate.pattern }}</div>
        </div>
        <button
          type="button"
          @click="applyTemplate(suggestedTemplate)"
          class="btn btn-sm btn-success"
        >
          Aplicar
        </button>
      </div>
    </div>

    <!-- Templates Rápidos -->
    <div class="p-3 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg">
      <div class="flex items-center gap-2 mb-3">
        <svg class="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span class="text-sm font-medium text-purple-800">Templates Rápidos</span>
      </div>
      <div class="grid grid-cols-1 gap-2">
        <button
          v-for="template in eventTemplates"
          :key="template.name"
          type="button"
          @click="applyTemplate(template)"
          class="p-2 text-left bg-white border border-purple-200 rounded hover:border-purple-300 hover:shadow-sm transition-all"
        >
          <div class="flex items-center gap-2">
            <span class="text-lg">{{ template.icon }}</span>
            <div>
              <div class="font-medium text-gray-900 text-sm">{{ template.name }}</div>
              <div class="text-xs text-gray-600 mt-1">{{ template.pattern }}</div>
            </div>
          </div>
        </button>
      </div>
    </div>

    <!-- Entrada Inteligente -->
    <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
      <div class="flex items-center gap-2 mb-2">
        <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <span class="text-sm font-medium text-blue-800">Entrada Inteligente de Horários</span>
      </div>
      <div class="space-y-2">
        <textarea
          v-model="smartInput"
          class="input text-sm"
          rows="4"
          placeholder="Ex:&#10;Montagem: 06:00-14:00&#10;Evento das 14:00 às 02:00&#10;Desmontagem 02:00 às 06:00&#10;&#10;Ou: Inicia às 6 da manhã e termina 2 horas da manhã do dia seguinte"
          @keyup.ctrl.enter="processSmartInput"
        />
        <div class="flex justify-between items-center">
          <div class="text-xs text-blue-600">
            Formatos: "Nome: HH:MM-HH:MM" • "Nome das HH:MM às HH:MM" • Linguagem natural
          </div>
          <button
            type="button"
            @click="processSmartInput"
            :disabled="!smartInput.trim()"
            class="btn btn-sm btn-primary"
          >
            Processar
          </button>
        </div>
      </div>
    </div>

    <!-- Turnos Atuais -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h4 class="font-medium text-gray-900">Turnos Configurados</h4>
        <button
          type="button"
          @click="addTurno"
          class="btn btn-sm btn-ghost"
        >
          + Adicionar Turno
        </button>
      </div>

      <div v-if="turnos.length === 0" class="text-center py-6 text-gray-500">
        <svg class="w-8 h-8 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="text-sm">Nenhum turno configurado</p>
        <p class="text-xs text-gray-400 mt-1">Use os templates ou adicione manualmente</p>
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="(turno, index) in turnos"
          :key="index"
          class="flex items-center gap-3 p-3 border border-gray-200 rounded-lg"
        >
          <div class="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              v-model="turno.nome"
              class="input input-sm"
              placeholder="Nome do turno"
            />
            <input
              v-model="turno.inicio"
              type="time"
              class="input input-sm"
            />
            <input
              v-model="turno.fim"
              type="time"
              class="input input-sm"
            />
          </div>
          <div class="text-xs text-gray-500 min-w-[60px]">
            {{ formatDuration(turno.inicio, turno.fim) }}
          </div>
          <button
            type="button"
            @click="removeTurno(index)"
            class="text-red-600 hover:text-red-800"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Resumo -->
    <div v-if="turnos.length > 0" class="p-3 bg-gray-50 border border-gray-200 rounded-lg">
      <div class="text-sm text-gray-700">
        <strong>Resumo:</strong> {{ turnos.length }} {{ turnos.length === 1 ? 'turno' : 'turnos' }} configurados
        para {{ eventDates.length }} {{ eventDates.length === 1 ? 'dia' : 'dias' }} de evento
      </div>
    </div>
  </div>
</template>
