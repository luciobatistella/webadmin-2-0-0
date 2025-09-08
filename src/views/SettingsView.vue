<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getAdminConfig, updateAdminConfig } from '@/services/settings'

const form = ref<Record<string, any>>({})
const loading = ref(false)

async function load(){
  loading.value = true
  try {
    const data = await getAdminConfig(new URLSearchParams())
    form.value = (data as any)?.data || data || {}
  } finally { loading.value = false }
}

async function save(){
  loading.value = true
  try {
    await updateAdminConfig(form.value, new URLSearchParams())
    alert('Configurações salvas')
  } finally { loading.value = false }
}

onMounted(load)
</script>

<template>
  <section class="space-y-4 p-4">
    <header class="flex items-center gap-3">
      <h1 class="text-lg font-semibold">Configurações</h1>
      <div class="ml-auto">
        <button class="btn btn-primary" @click="save" :disabled="loading">Salvar</button>
      </div>
    </header>

    <div class="card p-4 space-y-3">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label class="text-xs text-zinc-500">Nome do sistema</label>
          <input v-model="form.app_name" class="w-full rounded border px-2 py-1" />
        </div>
        <div>
          <label class="text-xs text-zinc-500">Logo URL</label>
          <input v-model="form.logo_url" class="w-full rounded border px-2 py-1" />
        </div>
      </div>
    </div>
  </section>
</template>

