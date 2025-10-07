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
const success = ref(false)

async function onSubmit() {
  errorMsg.value = ''
  success.value = false
  loading.value = true
  try {
    const cfg = await loadPublicConfig()
    const http = createHttp(cfg.api_url)
    const form = { email: email.value, senha: password.value }
    const { data } = await http.post('signin/web-admin', form)

    // Persistência básica (pode evoluir para pinia/vuex)
    if (remember.value && email.value) localStorage.setItem('loginEmail', email.value)
    localStorage.setItem('authResult', JSON.stringify(data))

    success.value = true
    // Mostra estado de sucesso rapidamente antes de navegar
    await new Promise((r) => setTimeout(r, 400))
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
  <main class="min-h-screen grid place-items-center bg-gradient-to-b from-slate-50 to-slate-100 dark:from-zinc-900 dark:to-zinc-950">
    <form class="w-full max-w-sm space-y-5 p-6 sm:p-8 bg-white/90 backdrop-blur rounded-2xl border border-slate-200 shadow-lg" @submit.prevent="onSubmit">
      <div class="flex justify-center">
        <img src="/logo.png" alt="Logo" class="h-16 w-auto mb-2" onerror="this.style.display='none'" />
      </div>
    
  <header class="space-y-1">
    
        
        <h1 class="text-xl font-semibold text-slate-900">Acessar painel</h1>
        <p class="text-sm text-slate-600">Use seu e‑mail e senha para entrar</p>
      </header>

      <div class="space-y-1">
        <label class="text-sm font-medium" for="email">E‑mail</label>
        <input id="email" v-model="email" type="email" required autocomplete="email" autofocus
               class="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 placeholder:text-slate-400 transition" />
      </div>
      <div class="space-y-1">
        <label class="text-sm font-medium" for="password">Senha</label>
        <input id="password" v-model="password" type="password" required autocomplete="current-password"
               class="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 placeholder:text-slate-400 transition" />
      </div>

      <label class="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" v-model="remember" class="rounded border-slate-300 text-brand-600 focus:ring-brand-500"/> Lembrar e‑mail</label>

      <p v-if="errorMsg" class="text-sm text-red-600" role="alert">{{ errorMsg }}</p>

      <button type="submit"
              class="inline-flex items-center justify-center w-full rounded-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-2.5 px-4 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-500 disabled:opacity-60 disabled:cursor-not-allowed"
              :disabled="loading || success">
        <span v-if="loading" class="inline-flex items-center gap-2">
          <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle class="opacity-25" cx="12" cy="12" r="10" stroke-width="4"/><path class="opacity-75" d="M4 12a8 8 0 018-8" stroke-width="4"/></svg>
          Entrando...
        </span>
        <span v-else-if="success" class="inline-flex items-center gap-2">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0"/></svg>
          Conectado
        </span>
        <span v-else>Entrar</span>
      </button>
    </form>
  </main>
</template>

