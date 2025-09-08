<script setup lang="ts">
import { ref, onMounted } from 'vue'

const model = ref<{ client: string; unit: string; sector: string; dt_event: string }>({ client: '', unit: '', sector: '', dt_event: '' })
// dropdowns removidos: filtro apenas por data

const emit = defineEmits<{ (e: 'filter', client: string, unit: string, sector: string, dt_event: string): void; (e: 'date-change', date: string): void }>()

// dropdowns removidos: cliente/unidade/setor agora via busca global em outras telas

function submit() {
  const { client, unit, sector, dt_event } = model.value
  emit('filter', client, unit, sector, dt_event)
}

// watchers removidos (sem dependência de cliente/unidade/setor)

onMounted(() => {
  const today = new Date().toISOString().slice(0,10)
  model.value.dt_event = today
  emit('date-change', today)
})
</script>

<template>
  <form class="card flex flex-wrap items-end gap-3 p-3" @submit.prevent="submit">
    <div class="flex min-w-40 flex-col">
      <label class="text-xs">Data</label>
      <input v-model="model.dt_event" type="date" class="rounded-md border px-2 py-1 text-sm"
             @change="emit('date-change', model.dt_event)" />
    </div>
    <!-- filtros de cliente/unidade/setor removidos -->
    <button type="submit" class="btn btn-primary">Filtrar</button>
  </form>
</template>

