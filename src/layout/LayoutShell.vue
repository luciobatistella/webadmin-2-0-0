<template>
  <div class="min-h-[100svh] bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
    <!-- Sidebar fixa à esquerda -->
    <Navbar />

    <!-- Conteúdo deslocado à direita da sidebar -->
    <div class="min-w-0 ml-60">
      <main class="p-4 container mx-auto max-w-[1400px] pb-20">
        <RouterView v-slot="{ Component, route }">
          <component :is="Component" v-if="!route?.meta?.keepAlive" :key="route.fullPath" />
          <KeepAlive v-else>
            <component :is="Component" :key="route.fullPath" />
          </KeepAlive>
        </RouterView>
      </main>
    </div>
  </div>
</template>

<script setup>
import Navbar from './Navbar.vue'
</script>

