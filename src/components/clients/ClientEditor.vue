<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  asPage?: boolean
  modelValue?: boolean
  editId?: string | number | undefined
  form?: any
}>(), {
  asPage: false,
  modelValue: false,
  form: () => ({})
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'save', payload?: any): void
}>()

const isOpen = computed({
  get: () => !!props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v)
})

function onSave(){
  emit('save', props.form)
  if (!props.asPage) emit('update:modelValue', false)
}
</script>

<template>
  <div class="space-y-3">
    <div class="mb-2 text-sm text-zinc-600">{{ props.editId ? 'Editar cliente' : 'Novo cliente' }}</div>
    <div class="rounded-md border p-3 bg-white">
      <div class="text-sm mb-2">Editor de Cliente (fake provisório). Depois substituímos pelos campos reais.</div>
      <div class="text-xs text-zinc-500 mb-2">ID: {{ props.editId || 'novo' }}</div>
      <pre class="text-xs overflow-auto max-h-80 bg-zinc-50 p-2 rounded">{{ JSON.stringify(props.form, null, 2) }}</pre>
      <div class="mt-3 flex justify-end gap-2">
        <button class="px-3 py-2 rounded border" @click="onSave">Salvar</button>
      </div>
    </div>
  </div>
</template>

