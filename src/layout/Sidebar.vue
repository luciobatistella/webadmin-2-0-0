<template>
  <div>
    <div v-if="!open" class="fixed inset-0 z-20 bg-black/40 sm:hidden" @click="$emit('close')"></div>
    <aside
      :class="[
        'fixed inset-y-0 left-0 z-30 w-60 border-r bg-white p-3 transition-transform dark:bg-zinc-900 sm:sticky sm:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full'
      ]"
    >
      <nav class="space-y-1 text-sm">
        <RouterLink to="/dashboard" class="nav-item">Dashboard</RouterLink>
        <RouterLink to="/clients" class="nav-item">Clientes</RouterLink>
        <RouterLink to="/users" class="nav-item">Usuários</RouterLink>
        <RouterLink to="/requests" class="nav-item">Requests</RouterLink>
      </nav>
    </aside>
  </div>
</template>

<script setup>
defineProps({ open: { type: Boolean, default: true } })
</script>

<style scoped>
.nav-item {
  @apply block rounded-md px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800;
}
.nav-item.router-link-active {
  @apply bg-zinc-100 font-medium dark:bg-zinc-800;
}
</style>

