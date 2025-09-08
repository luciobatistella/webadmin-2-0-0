<template>
  <!-- Sidebar vertical full-height com logo e navegação -->
  <aside class="fixed inset-y-0 left-0 z-40 flex w-60 flex-col gap-4 border-r bg-white px-4 py-4 dark:bg-zinc-900">
    <!-- Logo + papel -->
    <div class="flex items-center gap-2 align-center">
      <img src="/icone-evsp.svg" alt="Logo" class="h-12 w-auto p-1" onerror="this.style.display='none'" />
    </div>

    <!-- Navegação -->
    <nav class="mt-3 space-y-2">
      <RouterLink to="/dashboard" class="nav-link block flex items-center gap-3 border-b dark:border-zinc-700">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9.75l9-7.5 9 7.5M4.5 10.5V21h15V10.5" />
        </svg>
        <span>Home</span>
      </RouterLink>
      <RouterLink to="/solicitacoes" class="nav-link block flex items-center gap-3 border-b dark:border-zinc-700">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3h6m-6 4h6M7 7h10a2 2 0 012 2v10a2 2 0 01-2 2H7a2 2 0 01-2-2V9a2 2 0 012-2z" />
        </svg>
        <span>Solicitações</span>
      </RouterLink>
      <RouterLink to="/clients" class="nav-link block flex items-center gap-3 border-b dark:border-zinc-700">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2m14 0h4v-2a4 4 0 00-3-3.87M15 7a4 4 0 11-8 0 4 4 0 018 0" />
        </svg>
        <span>Clientes</span>
      </RouterLink>
      <RouterLink to="/cooperados" class="nav-link block flex items-center gap-3 border-b dark:border-zinc-700">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2m-9 0h10a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2V9a2 2 0 012-2z" />
        </svg>
        <span>Cooperados</span>
      </RouterLink>
      <RouterLink to="/billing" class="nav-link block flex items-center gap-3 border-b dark:border-zinc-700">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4m0-8V4m0 12v4m6-8a6 6 0 11-12 0 6 6 0 0112 0z" />
        </svg>
        <span>Faturamento</span>
      </RouterLink>
     

    </nav>

    <div class="flex-1" />

    <!-- Ações -->
    <div class="flex flex-col gap-2">
      <RouterLink to="/settings" class="nav-link text-left flex items-center gap-3">
        <Icon name="wrench-screwdriver" class="w-5 h-5" />
        <span>Configurações</span>
      </RouterLink>
      <RouterLink to="/users" class="nav-link text-left flex items-center gap-3">
        <Icon name="users" class="w-5 h-5" />
        <span>Usuários</span>
      </RouterLink>
      <button @click="toggleTheme" class="nav-link text-left flex items-center gap-3">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
          <circle cx="12" cy="12" r="3"></circle>
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 2v2M12 20v2M2 12h2M20 12h2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path>
        </svg>
        <span>{{ isDark ? 'Tema claro' : 'Tema escuro' }}</span>
      </button>
      <button v-if="currentUser" @click="handleLogout" class="nav-link text-left flex items-center gap-3">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 5v14"></path>
          <path stroke-linecap="round" stroke-linejoin="round" d="M11 8l4 4-4 4"></path>
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 12h12"></path>
        </svg>
        <span>Sair</span>
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../stores/auth'
import Icon from '@/components/Icon.vue'

const router = useRouter()
const { currentUser, logout } = useAuth()
const showDropdown = ref(false)
const isDark = ref(false)

// Close dropdown when clicking outside
function handleClickOutside(event: MouseEvent) {
  const target = event.target as Element | null
  if (!target?.closest('.relative')) {
    showDropdown.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)

  // Initialize theme
  const saved = localStorage.getItem('theme')
  if (saved === 'dark' || saved === 'light') {
    applyTheme(saved === 'dark')
  } else {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    applyTheme(prefersDark)
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

function applyTheme(dark: boolean) {
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  localStorage.setItem('theme', dark ? 'dark' : 'light')
  isDark.value = dark
}

function toggleTheme() {
  showDropdown.value = false
  applyTheme(!isDark.value)
}

function getUserDisplayName() {
  if (!currentUser.value) return 'Usuário'
  return currentUser.value.name || currentUser.value.nome || currentUser.value.email || 'Usuário'
}

function changePassword() {
  showDropdown.value = false
  // TODO: Implementar modal ou rota para troca de senha
  alert('Funcionalidade de troca de senha será implementada')
}

function handleLogout() {
  showDropdown.value = false
  logout()
  router.push('/')
}
</script>



<style scoped lang="postcss">
.nav-link {
  @apply rounded-lg px-4 py-2 text-[15px] font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 transition-colors duration-150 dark:text-zinc-200 dark:hover:bg-zinc-800;
}
.nav-link.router-link-active {
  @apply bg-brand-600 text-white dark:bg-brand-500;
}
</style>
