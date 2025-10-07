<template>
  <section>
    <Breadcrumbs />

    <header class="mb-6 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <h1 class="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{{ form.evento_nome || 'Nova Solicitação' }}</h1>
        <span class="bg-green-100 mt-1 text-green-800 text-xs font-medium me-2 px-2.5 py-0.5 rounded-sm dark:bg-green-900 dark:text-green-300">Criação</span>
      </div>

      <!-- Espaço reservado para futuras ações -->
      <div class="flex items-center gap-2">
        <!-- Ações do header podem ser adicionadas aqui -->
      </div>
    </header>

    <!-- Wizard Mode (único modo disponível) -->
    <SolicitationWizard
      v-model="form"
      @complete="save"

    />
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import Breadcrumbs from '@/components/Breadcrumbs.vue'
import SolicitationWizard from './SolicitationWizard.vue'

const router = useRouter()

const STORAGE_KEY = 'solicitacoes:new:form:v1'

function defaultNewSolic(){
  return {
    cliente_id: '',
    cliente_nome: '',
    evento_nome: '',
    categoria: '',
    venue: { id: '', nome: '', endereco: '', maps_url: '' },
    datas: [],
    janelas: { montagem_ini: '', evento_ini: '', evento_fim: '', desmontagem_fim: '' },
    turnos: [],
    turnos_detectados: false, // false = turnos não foram detectados pela entrada inteligente
    estrategia_turnos: true, // true = minimizar custos (padrão)
    publico: { convidados_estimados: 0, segmentos: [] },
    acesso: { credenciamento: { ativo: false, impressao_cracha: false }, estacionamento: { vagas: 0, valet: false, vans: 0 } },
    ab: { servico: '', horarios_servico: [], cardapio: '', restricoes: { veg: false, sem_gluten: false, alergicos: '' }, infra_apoio: { cozinha: false, agua: false, gelo: false, louca: false } },
    tecnica: { palco: { largura_m: 0, profundidade_m: 0, backdrop: '' }, av: { som: [], luz: [], video: [], led: false, traducao: false }, streaming: { sim: false }, eletrica: { carga_prevista_kva: 0, gerador: false } },
    equipes: [],
    seguranca_saude: { controle_acesso: false, brigadistas: 0, ambulancia: false, limpeza: { pre: 0, durante: 0, pos: 0 } },
    fornecedores: [],
    documentos: { alvara_local: { required: false, status: '' }, avcb: { required: false, status: '' }, ecad: { aplicavel: false } },
    financeiro: { tabela_precos_ref: '', taxa_servico_pct: 0, custos_fixos: 0, condicoes_pagamento: '' },
    observacoes: ''
  }
}
const form = ref<any>(defaultNewSolic())

// Limpa rascunho ao abrir "Nova Solicitação" por navegação normal; restaura apenas em refresh
onMounted(() => {
  // Sempre limpar ao abrir /solicitacoes/new (acesso direto, navegação, refresh ou back/forward)
  try { localStorage.removeItem(STORAGE_KEY) } catch {}
  try { localStorage.removeItem('solicitacoes:new:step') } catch {}
  try { localStorage.removeItem('solicitacoes:new:wizard:v1') } catch {}
  try { localStorage.removeItem('evsp:lastDates') } catch {}
  try { localStorage.removeItem('evsp:lastDateInput') } catch {}
  try { localStorage.removeItem('evsp:lastBaseStartAbs') } catch {}
  try { localStorage.removeItem('evsp:lastBaseEndAbs') } catch {}
  form.value = defaultNewSolic()
})

// Persistir no localStorage (debounce leve)
let persistTimer: any = null
watch(form, (v) => {
  try {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(v))
    }, 200)
  } catch {}
}, { deep: true })

function fillSample(){
  form.value = {
    cliente_id: "cli_987",
    cliente_nome: "Google",
    evento_nome: "Google Cloud Summit 2025",
    categoria: "Lançamento",
    venue: { id: "ven_123", nome: "Centro de Convenções XYZ", endereco: "Av. Exemplo, 1000 - São Paulo/SP", maps_url: "https://maps.google.com/?q=..." },
    datas: ["2025-09-14"],
    janelas: { montagem_ini: "2025-09-14T06:00:00-03:00", evento_ini: "2025-09-14T10:00:00-03:00", evento_fim: "2025-09-14T16:00:00-03:00", desmontagem_fim: "2025-09-14T20:00:00-03:00" },
    turnos: [ { nome: "Manhã", inicio: "08:00", fim: "12:00" }, { nome: "Tarde", inicio: "12:00", fim: "18:00" } ],
    publico: { convidados_estimados: 150, segmentos: ["VIP", "Imprensa"] },
    acesso: { credenciamento: { ativo: true, impressao_cracha: true }, estacionamento: { vagas: 60, valet: true, vans: 2 } },
    ab: { servico: "Almoço Executivo", horarios_servico: ["12:30"], cardapio: "Entrada, prato principal, sobremesa, bebidas não alcoólicas.", restricoes: { veg: true, sem_gluten: true, alergicos: "castanhas" }, infra_apoio: { cozinha: true, agua: true, gelo: true, louca: true } },
    tecnica: { palco: { largura_m: 8, profundidade_m: 4, backdrop: "Logos em tecido" }, av: { som: ["PA","2 microfones de lapela"], luz: ["Fresnéis","Follow spot"], video: ["Projetor 10k lumens"], led: false, traducao: false }, streaming: { sim: false }, eletrica: { carga_prevista_kva: 25, gerador: false } },
    equipes: [
      { funcao_key: "recepcionista", setor: "Recepção", turno: "Manhã", quantidade: 2, horas: 5 },
      { funcao_key: "garcom", setor: "A&B", turno: "Tarde", quantidade: 10, horas: 6 },
      { funcao_key: "cozinheiro", setor: "Cozinha", turno: "Tarde", quantidade: 3, horas: 7 },
      { funcao_key: "ajudanteCozinha", setor: "Cozinha", turno: "Tarde", quantidade: 2, horas: 7 },
      { funcao_key: "steward", setor: "A&B", turno: "Tarde", quantidade: 2, horas: 6 },
      { funcao_key: "tecnicoSom", setor: "AV", turno: "Manhã", quantidade: 2, horas: 5 },
      { funcao_key: "tecnicoLuz", setor: "AV", turno: "Manhã", quantidade: 2, horas: 5 },
      { funcao_key: "seguranca", setor: "Segurança", turno: "Tarde", quantidade: 4, horas: 6 },
      { funcao_key: "brigadista", setor: "Emergência", turno: "Tarde", quantidade: 1, horas: 6 }
    ],
    seguranca_saude: { controle_acesso: true, brigadistas: 1, ambulancia: false, limpeza: { pre: 2, durante: 2, pos: 3 } },
    fornecedores: [ { nome: "Locadora Luz&Som", servico: "AV", contato: "11 9xxxx-xxxx", chegada: "2025-09-14T07:00:00-03:00" } ],
    documentos: { alvara_local: { required: true, status: "ok" }, avcb: { required: true, status: "ok" }, ecad: { aplicavel: false } },
    financeiro: { tabela_precos_ref: "2025_Q3", taxa_servico_pct: 10, custos_fixos: 500, condicoes_pagamento: "30 dias" },
    observacoes: "Briefing com o cliente D-3."
  }
}

function save(){
  console.log('[Nova Solicitação] payload:', { ...form.value })
  try { localStorage.removeItem(STORAGE_KEY) } catch {}
  try { localStorage.removeItem('solicitacoes:new:step') } catch {}
  try { localStorage.removeItem('solicitacoes:new:wizard:v1') } catch {}
  router.push({ name: 'solicitacoes' })
}

// Foca automaticamente no campo "Nome do Evento" quando a página carrega
onMounted(() => {
  // Delay para garantir que o SolicitationWizard seja totalmente renderizado
  setTimeout(() => {
    // Busca pelo campo de input do nome do evento
    const eventoNomeInput = document.querySelector('[data-field="evento-nome"]') as HTMLInputElement
    if (eventoNomeInput) {
      eventoNomeInput.focus()
      console.log('🎯 Foco automático no campo "Nome do Evento"')
    } else {
      console.log('❌ Campo "Nome do Evento" não encontrado')
    }
  }, 100)
})

// Função cancel removida - não utilizada
</script>

