<template>
  <section>
    <Breadcrumbs />

    <header class="mb-2 flex items-center gap-3">
      <h1 class="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Novo Cliente</h1>
      <span class="bg-green-100 mt-1 text-green-800 text-xs font-medium me-2 px-2.5 py-0.5 rounded-sm dark:bg-green-900 dark:text-green-300">Criação</span>
    </header>

    <div class="mx-auto card p-3">
      <ClientEditor :asPage="true" :model-value="true" :edit-id="undefined" :form="form" @save="onSaved" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Breadcrumbs from '@/components/Breadcrumbs.vue'
import ClientEditor from './ClientEditor.vue'

const form = ref<any>({
  nome_comercial: '',
  razao_social: '',
  cnpj: '',
  email: '',
  telefone1: '',
  telefone2: '',
  dominio: '',
  faturamento: '',
  meio_recebimento: '',
  simples_nacional: false,
  lista_presenca: 'Sem foto',
  situacao_tributaria: '',
  tributado_sp: false,
  contrato: '',
  contrato_inicio: '',
  contrato_fim: '',
  orientacoes_faturamento: '',
  locais: [], setores: [], funcoes: [], usuarios: [], gestores: [],
  active: 1,
})

function onSaved(){
  // TODO: integrar POST de criação
  console.log('[ClientCreate] salvar (fake):', form.value)
  alert('Cliente salvo (fake).')
}
</script>

