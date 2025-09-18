<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { createHttp, loadPublicConfig } from '../services/http'

const router = useRouter()
const email = ref('')
const password = ref('')
const remember = ref(true)
const loading = ref(false)
const errorMsg = ref('')

async function onSubmit() {
  errorMsg.value = ''
  loading.value = true
  try {
    const cfg = await loadPublicConfig()
    const http = createHttp(cfg.api_url)
    const form = { email: email.value, senha: password.value }
    const { data } = await http.post('signin/web-admin', form)

    // Persistência básica (pode evoluir para pinia/vuex)
    if (remember.value && email.value) localStorage.setItem('loginEmail', email.value)
    localStorage.setItem('authResult', JSON.stringify(data))

    router.push('/dashboard')
  } catch (err) {
    errorMsg.value = 'Credenciais inválidas ou erro de conexão.'
    console.error('[login][error]', err)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="min-h-[70svh] grid place-items-center bg-white-300 dark:bg-zinc-950">
    <img src="/logo.png" alt="Logo" class="h-30 w-auto p-1" onerror="this.style.display='none'" />  
    <form class="card w-full max-w-sm space-y-4 p-6 bg-white" @submit.prevent="onSubmit">
    
      <header class="space-y-1">
    
        
        <h1 class="text-xl font-semibold">Acessar painel</h1>
        <p class="text-sm text-zinc-600 dark:text-zinc-400">Use seu e‑mail e senha para entrar</p>
      </header>

      <div class="space-y-1">
        <label class="text-sm font-medium" for="email">E‑mail</label>
        <input id="email" v-model="email" type="email" required class="w-full rounded-md border px-3 py-2 outline-none ring-1 ring-zinc-200 focus:ring-brand-500" />
      </div>
      <div class="space-y-1">
        <label class="text-sm font-medium" for="password">Senha</label>
        <input id="password" v-model="password" type="password" required class="w-full rounded-md border px-3 py-2 outline-none ring-1 ring-zinc-200 focus:ring-brand-500" />
      </div>

      <label class="flex items-center gap-2 text-sm"><input type="checkbox" v-model="remember" /> Lembrar e‑mail</label>

      <p v-if="errorMsg" class="text-sm text-red-600">{{ errorMsg }}</p>

      <button type="submit" class="btn-primary w-full" :disabled="loading">
        <span v-if="!loading">Entrar</span>
        <span v-else class="inline-flex items-center gap-2">
          <svg class="size-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle class="opacity-25" cx="12" cy="12" r="10" stroke-width="4"/><path class="opacity-75" d="M4 12a8 8 0 018-8" stroke-width="4"/></svg>
          Entrando...
        </span>
      </button>
    </form>
  </main>
</template>

