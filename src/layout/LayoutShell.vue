<template>
  <div class="min-h-[100svh] bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
    <!-- Sidebar fixa à esquerda -->
    <Navbar />

    <!-- Conteúdo deslocado à direita da sidebar -->
    <div class="min-w-0 ml-60">
      <main class="p-4 container mx-auto max-w-[1400px] pb-20">
        <RouterView v-slot="{ Component, route }">
          <template v-if="route?.meta?.keepAlive">
            <KeepAlive>
              <component :is="Component" :key="route.name" />
            </KeepAlive>
          </template>
          <template v-else>
            <Transition name="route-fade" mode="out-in">
              <component :is="Component" :key="route.fullPath" />
            </Transition>
          </template>
        </RouterView>
      </main>
    </div>
  </div>
</template>

<script setup>
import Navbar from './Navbar.vue'
</script>

<style scoped>
.route-fade-enter-active,
.route-fade-leave-active {
  transition: opacity 200ms ease;
}
.route-fade-enter-from,
.route-fade-leave-to {
  opacity: 0;
}
</style>

