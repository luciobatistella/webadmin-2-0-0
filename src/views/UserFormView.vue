<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getUser, createUser, updateUser } from '@/services/users'

const route = useRoute()
const router = useRouter()

type Form = { id: number | null; name: string; email: string; profile: string; role: string }
const form = ref<Form>({ id: null, name: '', email: '', profile: '', role: '' })
const loading = ref(false)

const isEdit = computed(() => !!route.params.id)

async function load() {
  if (!isEdit.value) return
  loading.value = true
  try {
    const data = await getUser(route.params.id as string, new URLSearchParams())
    const row: any = Array.isArray((data as any)?.data) ? (data as any).data[0] : ((data as any)?.data || data)
    form.value = {
      id: row.id as number,
      name: (row.name || row.nome || '') as string,
      email: (row.email || '') as string,
      profile: (row.profile || row.perfil || '') as string,
      role: (row.role || row.cargo || '') as string,
    }
  } finally { loading.value = false }
}

async function submit() {
  loading.value = true
  try {
    const payload: any = { ...form.value }
    if (payload.id == null) delete payload.id
    if (form.value.id) await updateUser(payload, new URLSearchParams())
    else await createUser(payload, new URLSearchParams())
    router.push({ name: 'users' })
  } finally { loading.value = false }
}

onMounted(load)
</script>

<template>
  <section class="space-y-4 p-4">
    <header class="flex items-center gap-3">
      <h1 class="text-lg font-semibold">{{ isEdit ? 'Editar usuário' : 'Novo usuário' }}</h1>
      <div class="ml-auto">
        <button class="btn btn-secondary mr-2" @click="$router.back()">Voltar</button>
        <button class="btn btn-primary" @click="submit" :disabled="loading">Salvar</button>
      </div>
    </header>

    <div class="card p-4 space-y-3">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label class="text-xs text-zinc-500">Nome</label>
          <input v-model="form.name" class="w-full rounded border px-2 py-1" />
        </div>
        <div>
          <label class="text-xs text-zinc-500">E-mail</label>
          <input v-model="form.email" class="w-full rounded border px-2 py-1" />
        </div>
        <div>
          <label class="text-xs text-zinc-500">Perfil</label>
          <input v-model="form.profile" class="w-full rounded border px-2 py-1" />
        </div>
        <div>
          <label class="text-xs text-zinc-500">Cargo</label>
          <input v-model="form.role" class="w-full rounded border px-2 py-1" />
        </div>
      </div>
    </div>
  </section>
</template>

