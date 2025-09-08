<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'

const props = defineProps<{
  value: number | null | undefined
  duration?: number
  formatter?: (v: number) => string
}>()

const display = ref('—')

function fmtDefault(v: number){
  return Math.round(v).toLocaleString('pt-BR')
}

function animate(from: number, to: number, duration: number){
  if (!Number.isFinite(to)) { display.value = '—'; return }
  const start = performance.now()
  const delta = to - from
  function frame(now: number){
    const t = Math.min(1, (now - start) / duration)
    const curr = from + delta * t
    const f = props.formatter || fmtDefault
    display.value = f(curr)
    if (t < 1) requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

onMounted(() => {
  const to = typeof props.value === 'number' ? props.value : 0
  animate(0, to, props.duration ?? 800)
})

watch(() => props.value, (nv, ov) => {
  const from = typeof ov === 'number' ? ov : 0
  const to = typeof nv === 'number' ? nv : 0
  animate(from, to, props.duration ?? 800)
})
</script>

<template>
  <span>{{ display }}</span>
</template>

