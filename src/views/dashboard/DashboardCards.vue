<script setup lang="ts">
// loosely typed dashboard card data
const props = defineProps<{ data?: Record<string, any> }>()

function pct(v: unknown) {
  const n = Number((v as any) || 0)
  if (!isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}
</script>

<template>
  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <div class="card p-3">
      <div class="text-xs text-zinc-500">PROF. SOLICITADOS</div>
      <div class="text-2xl font-semibold">{{ data?.requested_professional ?? 0 }}</div>
    </div>

    <div class="card p-3">
      <div class="text-xs text-zinc-500">CORTESIAS</div>
      <div class="text-2xl font-semibold">{{ data?.courtesy ?? 0 }}</div>
    </div>

    <div class="card p-3">
      <div class="mb-1 flex items-center justify-between text-xs text-zinc-500">
        <span>CONVITES ENVIADOS</span>
        <span>{{ pct(data?.invitations_sent_percent) }}%</span>
      </div>
      <div class="text-2xl font-semibold">{{ data?.invitations_sent ?? 0 }}</div>
      <div class="mt-2 h-2 w-full rounded bg-zinc-200 dark:bg-zinc-800">
        <div class="h-2 rounded bg-brand-500" :style="{ width: pct(data?.invitations_sent_percent) + '%' }"></div>
      </div>
    </div>

    <div class="card p-3">
      <div class="mb-1 flex items-center justify-between text-xs text-zinc-500">
        <span>CONVITES ACEITOS</span>
        <span>{{ pct(data?.invitations_accepted_percent) }}%</span>
      </div>
      <div class="text-2xl font-semibold">{{ data?.invitations_accepted ?? 0 }}</div>
      <div class="mt-2 h-2 w-full rounded bg-zinc-200 dark:bg-zinc-800">
        <div class="h-2 rounded bg-brand-500" :style="{ width: pct(data?.invitations_accepted_percent) + '%' }"></div>
      </div>
    </div>

    <div class="card p-3">
      <div class="mb-1 flex items-center justify-between text-xs text-zinc-500">
        <span>TOTAL DE CHECK-INS</span>
        <span>{{ pct(data?.total_checkin_percent) }}%</span>
      </div>
      <div class="text-2xl font-semibold">{{ data?.checkin ?? 0 }}</div>
      <div class="mt-2 h-2 w-full rounded bg-zinc-200 dark:bg-zinc-800">
        <div class="h-2 rounded bg-brand-500" :style="{ width: pct(data?.total_checkin_percent) + '%' }"></div>
      </div>
    </div>

    <div class="card p-3">
      <div class="mb-1 flex items-center justify-between text-xs text-zinc-500">
        <span>TOTAL DE CHECK-OUTS</span>
        <span>{{ pct(data?.total_checkout_percent) }}%</span>
      </div>
      <div class="text-2xl font-semibold">{{ data?.checkout ?? 0 }}</div>
      <div class="mt-2 h-2 w-full rounded bg-zinc-200 dark:bg-zinc-800">
        <div class="h-2 rounded bg-brand-500" :style="{ width: pct(data?.total_checkout_percent) + '%' }"></div>
      </div>
    </div>
  </div>
</template>

