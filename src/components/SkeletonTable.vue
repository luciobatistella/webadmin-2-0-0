<template>
  <tbody>
    <tr v-for="i in rows" :key="i" class="border-b">
      <td v-for="j in cols" :key="j" class="px-2 py-2">
        <div class="h-4 w-full animate-pulse rounded bg-zinc-200 dark:bg-zinc-800"></div>
      </td>
    </tr>
  </tbody>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ rows?: number; cols?: number }>(), { rows: 5, cols: 4 })
</script>

