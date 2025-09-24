<template>
  <!-- Minimal inline outline icons (Heroicons-style) -->
  <svg v-if="name==='identification'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" v-bind="$attrs">
    <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"/>
    <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 20.25a8.25 8.25 0 1115 0v.75H4.5v-.75z"/>
  </svg>

  <svg v-else-if="name==='document-text'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" v-bind="$attrs">
    <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-6a2.25 2.25 0 00-2.25-2.25h-6.75m0 0L4.5 8.25m6-2.25V8.25h-4.5"/>
    <path stroke-linecap="round" stroke-linejoin="round" d="M9 13.5h6m-6 3h6"/>
  </svg>

  <svg v-else-if="name==='banknotes'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" v-bind="$attrs">
    <rect x="3" y="6.75" width="18" height="10.5" rx="2"/>
    <circle cx="12" cy="12" r="2.25"/>
  </svg>

  <svg v-else-if="name==='map-pin'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" v-bind="$attrs">
    <path stroke-linecap="round" stroke-linejoin="round" d="M12 21s-6-4.5-6-9a6 6 0 1112 0c0 4.5-6 9-6 9z"/>
    <circle cx="12" cy="12" r="2.25"/>
  </svg>

  <svg v-else-if="name==='squares-2x2'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" v-bind="$attrs">
    <rect x="4.5" y="4.5" width="7" height="7" rx="1.5"/>
    <rect x="12.5" y="4.5" width="7" height="7" rx="1.5"/>
    <rect x="4.5" y="12.5" width="7" height="7" rx="1.5"/>
    <rect x="12.5" y="12.5" width="7" height="7" rx="1.5"/>
  </svg>

  <svg v-else-if="name==='wrench-screwdriver'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" v-bind="$attrs">
    <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l2.651 2.651-4.95 4.95-2.65-2.651m4.949-4.95l.884-2.356 2.356-.884m-3.24 3.24l-2.06 5.48M9 12l-5.25 5.25a1.5 1.5 0 102.121 2.121L11.121 14.12M9 12l3 3"/>
  </svg>

  <svg v-else-if="name==='users'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" v-bind="$attrs">
    <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.5a4.5 4.5 0 00-9 0v.75h9v-.75z"/>
    <path stroke-linecap="round" stroke-linejoin="round" d="M12 8.25a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM19.5 20.25v-.75a5.25 5.25 0 00-3-4.74m3-7.26a3 3 0 11-6 0 3 3 0 016 0z"/>
  </svg>

  <svg v-else-if="name==='shield-check'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" v-bind="$attrs">
    <path stroke-linecap="round" stroke-linejoin="round" d="M12 3l7.5 3v6c0 5.25-4.5 8.25-7.5 9-3-0.75-7.5-3.75-7.5-9V6l7.5-3z"/>
    <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 12.75l1.5 1.5 3-3"/>
  </svg>

  <svg v-else-if="name==='magnifying-glass'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" v-bind="$attrs">
    <circle cx="11" cy="11" r="6"/>
    <path stroke-linecap="round" stroke-linejoin="round" d="M20 20l-3.5-3.5"/>
  </svg>
  <PencilSquareIcon v-else-if="name==='pencil-square'" v-bind="$attrs" />


  <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" v-bind="$attrs">
    <circle cx="12" cy="12" r="9"/>
  </svg>
</template>

<script setup lang="ts">
import { PencilSquareIcon } from '@heroicons/vue/24/outline'
const props = withDefaults(defineProps<{ name?: string }>(), { name: '' })
</script>

