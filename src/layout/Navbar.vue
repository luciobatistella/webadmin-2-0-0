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
        <HomeIcon class="w-5 h-5" />
        <span>Home</span>
      </RouterLink>
      <RouterLink to="/solicitacoes" class="nav-link block flex items-center gap-3 border-b dark:border-zinc-700">
        <ClipboardDocumentListIcon class="w-5 h-5" />
        <span>Solicitações</span>
      </RouterLink>
      <RouterLink to="/clients" class="nav-link block flex items-center gap-3 border-b dark:border-zinc-700">
        <UsersIcon class="w-5 h-5" />
        <span>Clientes</span>
      </RouterLink>
      <RouterLink to="/cooperados" class="nav-link block flex items-center gap-3 border-b dark:border-zinc-700">
        <BriefcaseIcon class="w-5 h-5" />
        <span>Cooperados</span>
      </RouterLink>
      <RouterLink to="/billing" class="nav-link block flex items-center gap-3 border-b dark:border-zinc-700">
        <BanknotesIcon class="w-5 h-5" />
        <span>Faturamento</span>
      </RouterLink>
     

    </nav>

    <div class="flex-1" />

    <!-- Ações -->
    <div class="flex flex-col gap-2">
      <RouterLink to="/settings" class="nav-link text-left flex items-center gap-3">
        <WrenchScrewdriverIcon class="w-5 h-5" />
        <span>Configurações</span>
      </RouterLink>
      <RouterLink to="/users" class="nav-link text-left flex items-center gap-3">
        <UserGroupIcon class="w-5 h-5" />
        <span>Usuários</span>
      </RouterLink>
      <button @click="toggleTheme" class="nav-link text-left flex items-center gap-3">
        <component :is="isDark ? SunIcon : MoonIcon" class="w-5 h-5" />
        <span>{{ isDark ? 'Tema claro' : 'Tema escuro' }}</span>
      </button>
      <button v-if="currentUser" @click="handleLogout" class="nav-link text-left flex items-center gap-3">
        <ArrowRightOnRectangleIcon class="w-5 h-5" />
        <span>Sair</span>
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../stores/auth'
import { HomeIcon, ClipboardDocumentListIcon, UsersIcon, BriefcaseIcon, BanknotesIcon, WrenchScrewdriverIcon, UserGroupIcon, SunIcon, MoonIcon, ArrowRightOnRectangleIcon } from '@heroicons/vue/24/outline'

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
