<template>
  <section class="space-y-4 p-4">
    <!-- Breadcrumb acima do título -->
    <Breadcrumbs />

    <!-- Título sem botão voltar (agora está no breadcrumb) -->
    <header class="mb-2 flex items-center gap-3">
      <h1 class="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{{ pageTitle }}</h1>
      <span class="bg-blue-100 mt-1 text-blue-800 text-xs font-medium me-2 px-2.5 py-0.5 rounded-sm dark:bg-blue-900 dark:text-blue-300">Status Cliente</span>
    </header>

    <div class="mx-auto card p-3">
      <ClientEditModal :asPage="true" :model-value="pageOpen" :edit-id="clientId" :form="form" @update:modelValue="noop" @save="onSaved" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ClientEditModal from '@/components/ClientEditModal.vue'
import Breadcrumbs from '@/components/Breadcrumbs.vue'
import { getClient } from '@/services/clients'

const route = useRoute()
const router = useRouter()

const clientId = computed(() => route.params.id as string | undefined)
const form = ref<any>({})
const pageOpen = ref(true)

async function loadClient() {
  const id = clientId.value
  if (!id) { form.value = {}; return }
  try {
    const data:any = await getClient(id, new URLSearchParams())
    const toBR = (iso: any) => {
      if (!iso) return ''
      const d = new Date(iso)
      if (isNaN(d as any)) return ''
      const dd = String(d.getDate()).padStart(2,'0')
      const mm = String(d.getMonth()+1).padStart(2,'0')
      const yyyy = d.getFullYear()
      return `${dd}/${mm}/${yyyy}`
    }
    const normalized:any = {
      ...data,
      id: data.id ?? id,
      nome_comercial: data.nome_comercial || data.nomeComercial || data.name || data.nome || data.razao_social || data.razaoSocial || '',
      razao_social: data.razao_social || data.razaoSocial || '',
      cnpj: data.cnpj || data.cpf_cnpj || data.document || '',
      email: data.email || data.email_principal || '',
      dominio: data.dominio || data.dominioEmp || '',
      telefone1: data.telefone1 || data.telefone || data.phone || data.celular || '',
      telefone2: data.telefone2 || data.phone2 || data.celular2 || '',
      faturamento: data.faturamento || '',
      meio_recebimento: data.meio_recebimento || data.meioRecebimento || '',
      simples_nacional: typeof data.optanteSimplesNacional === 'string' ? (data.optanteSimplesNacional.toLowerCase() === 'sim') : Boolean(data.simples_nacional),
      lista_presenca: (function(){
        if (typeof data.listaPresenca === 'string') return data.listaPresenca
        if (data.com_foto != null || data.lista_presenca != null) return (data.com_foto ? 'Com foto' : 'Sem foto')
        return 'Sem foto'
      })(),
      situacao_tributaria: data.situacao_tributaria || data.situacaoTributaria || '',
      tributado_sp: Boolean(data.tributado_sp ?? false),
      contrato: data.contrato || '',
      contrato_inicio: data.contrato_inicio || toBR(data.contratoDataInicio),
      contrato_fim: data.contrato_fim || toBR(data.contratoDataFim),
      orientacoes_faturamento: data.orientacoes_faturamento || data.orientacoesFaturamento || '',
      locais: Array.isArray(data.locais) ? data.locais : [],
      setores: Array.isArray(data.setores) ? data.setores : [],
      funcoes: Array.isArray(data.funcoes) ? data.funcoes : [],
      usuarios: Array.isArray(data.usuarios) ? data.usuarios : [],
      gestores: Array.isArray(data.gestores) ? data.gestores : [],
      active: (data.active ?? data.ativo ?? true) ? 1 : 0,
    }
    const hasAddress = Boolean(data.cep || data.logradouro || data.numero || data.bairro || data.cidade || data.uf)
    if ((!normalized.locais || normalized.locais.length === 0) && hasAddress) {
      normalized.locais = [{
        nome: normalized.nome_comercial || normalized.razao_social || '',
        responsavel: '',
        regiao: '',
        cep: data.cep || '',
        logradouro: data.logradouro || '',
        numero: data.numero || '',
        complemento: data.complemento || '',
        bairro: data.bairro || '',
        cidade: data.cidade || '',
        uf: data.uf || '',
        telefone: data.telefone1 || '',
        qrcode_fixo: false,
      }]
    }
    form.value = normalized
  } catch (e) {
    console.error('[ClientDetailPage.loadClient]', e)
    form.value = {}
  }
}

const pageTitle = computed(() => {
  const f:any = form.value || {}
  return f.nome_comercial || f.razao_social || f.name || f.nome || 'Cliente'
})

function goBack() {
  router.push({ name: 'clients' })
}

function onSaved() {}

onMounted(loadClient)
watch(clientId, loadClient)

function noop() {}
</script>

