<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { listClients } from '@/services/clients'
import Breadcrumbs from '@/components/Breadcrumbs.vue'
import ClientActions from '@/components/ClientActions.vue'
import PrintPreview from '@/components/PrintPreview.vue'
import ProgressBar from '@/components/ProgressBar.vue'

import * as XLSX from 'xlsx'

type SortKey = 'nome' | 'mais_recentes' | 'codigo'

type AnyRecord = Record<string, any>

const rows = ref<any[]>([])
const loading = ref<boolean>(false)
const page = ref<number>(1)
const limit = ref<number>(20)
const total = ref<number>(0)
const route = useRoute()
const router = useRouter()

import { CLIENT_DETAIL_VIEW_MODE } from '@/config/featureFlags'
const viewMode = computed<string | any>(() => (route.query.view || CLIENT_DETAIL_VIEW_MODE))


// filtros
const q = ref<string>('')
const sortBy = ref<SortKey>('mais_recentes')
const showFilters = ref<boolean>(false)
const showDateFilter = ref<boolean>(false)
const dateFilterType = ref<'sem_filtro'|'periodo'|'mes'>('sem_filtro') // sem_filtro, periodo, mes
// Helpers compat 1.0
function setRouteQuery(filter: AnyRecord, query: AnyRecord) {
  const current: AnyRecord = { ...query }
  if (filter) {
    Object.keys(filter).forEach(field => {
      if (filter[field]) current[field] = filter[field]
      else delete current[field]
    })
    router.replace({ query: current }).catch(() => {})
  }
  return current
}
// Normaliza texto para busca (remove acentos)
function normalizeText(s: unknown){
  return String(s||'')
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .toLowerCase()
}


// Tabs de situação
const currentTab = ref<'todos'|'ativos'|'inativos'>('todos') // 'todos' | 'ativos' | 'inativos'

function isActiveClient(it: any){ return Boolean((it as any).active ?? (it as any).ativo ?? true) }
function isInactiveClient(it: any){ return !isActiveClient(it) }

// Base sem filtro de aba (para contadores)
const baseFilteredRows = computed<any[]>(() => {
  let list: any[] = Array.isArray(rows.value) ? (rows.value as any[]) : []
  const rawTerm = String(q.value || '')
  const term = normalizeText(rawTerm)
  if (term) {
    list = list.filter(it => {
      const name = normalizeText(it.name || it.nome_comercial || it.nome || it.razao_social)
      const cnpj = normalizeText(it.cnpj || it.cpf_cnpj || it.document)
      const email = normalizeText(it.email)
      const id = String(it.id || '')
      return name.includes(term) || cnpj.includes(term) || email.includes(term) || id.includes(rawTerm)
    })
  }
  return list
})

const totalTodos = computed(() => baseFilteredRows.value.length)
const totalAtivos = computed(() => baseFilteredRows.value.filter(isActiveClient).length)
const totalInativos = computed(() => baseFilteredRows.value.filter(isInactiveClient).length)

// Derivações client-side (aba + ordenação + paginação local)
const filteredRows = computed<any[]>(() => {
  let list = baseFilteredRows.value as any[]
  // Aba (Situação)
  if (currentTab.value === 'ativos') list = list.filter(isActiveClient)
  else if (currentTab.value === 'inativos') list = list.filter(isInactiveClient)

  const byName = (it: AnyRecord) => normalizeText(it.name || it.nome_comercial || it.nome || it.razao_social)
  if (sortBy.value === 'nome') list = [...list].sort((a,b) => byName(a).localeCompare(byName(b)))
  else if (sortBy.value === 'codigo') list = [...list].sort((a,b) => (a.id??0) - (b.id??0))
  else list = [...list].sort((a,b) => (b.id??0) - (a.id??0))
  return list

})
const totalCount = computed(() => filteredRows.value.length)
const visibleRows = computed<any[]>(() => {
  const start = (page.value - 1) * limit.value
  return (filteredRows.value as any[]).slice(start, start + limit.value)
})

function buildParamsRouteQuery(query: AnyRecord) {
  const params = new URLSearchParams()

  const current: AnyRecord = { ...query }
  Object.keys(current).forEach(field => { if (current[field]) params.append(field, current[field]) })
  return params
}

const dateStart = ref<string>('')
const dateEnd = ref<string>('')
const selectedMonth = ref<string>('')

const present = computed(() => {
  const list: any[] = Array.isArray(rows.value) ? (rows.value as any[]) : []
  const first: any = list[0] || {}
  const anyHas = (keys: string[]) => list.some(it => keys.some(k => (k in it) && (it as any)[k] != null && String((it as any)[k]).trim() !== ''))
  return {
    nome: anyHas(['name','nome_comercial','nome','razao_social','razaoSocial']),
    unidadesCount: anyHas(['units_count','qtd_unidades']),
    cnpj: anyHas(['cnpj','cpf_cnpj','document']),
    unidadeNome: anyHas(['nome_unidade','unidade_nome']) || ('unidade' in first && first.unidade && ('nome' in first.unidade)),
    ativo: anyHas(['active','ativo']),
    cidade: anyHas(['cidade','city']),
    uf: anyHas(['uf','estado']),
    email: anyHas(['email','email_principal']),
  }
})


const tab = ref<string>('dados')

const showModal = ref<boolean>(false)

const selectedClientId = ref<number | null>(null)
import ClientEditModal from '@/components/ClientEditModal.vue'

function onCardClick(it: any) {
  selectedClientId.value = it.id;
  if (viewMode.value === 'page') {
    router.push({ path: `/clients/${it.id}` })
  } else {
    openEdit(it)
  }
}

const editId = ref<number | null>(null)
const form = ref<Record<string, any>>({})


async function openEdit(it: any) {
  try {
    console.log('[ClientsView.openEdit] item clicked:', it)
    const svc = await import('@/services/clients')
    editId.value = it.id
    showModal.value = true
    loading.value = true

    const data = await svc.getClient(it.id, new URLSearchParams())
    console.log('[ClientsView.openEdit] getClient response:', data)

    // Normaliza campos para o formulário
    // helper: ISO->BR
    const toBR = (iso: string) => {
      if (!iso) return ''
      const d = new Date(iso)
      if (isNaN(d.getTime())) return ''
      const dd = String(d.getDate()).padStart(2,'0')
      const mm = String(d.getMonth()+1).padStart(2,'0')
      const yyyy = d.getFullYear()
      return `${dd}/${mm}/${yyyy}`
    }

    // Normaliza campos para o formulário (mapeando do payload 1.0)
    const normalized = {
      ...data,
      id: data.id ?? it.id,
      // Identidade
      nome_comercial: data.nome_comercial || data.nomeComercial || data.name || data.nome || data.razao_social || data.razaoSocial || '',
      razao_social: data.razao_social || data.razaoSocial || '',
      cnpj: data.cnpj || data.cpf_cnpj || data.document || '',
      email: data.email || data.email_principal || '',
      dominio: data.dominio || data.dominioEmp || '',
      // Contatos
      telefone1: data.telefone1 || data.telefone || data.phone || data.celular || '',
      telefone2: data.telefone2 || data.phone2 || data.celular2 || '',
      // Financeiro/Tributário
      faturamento: data.faturamento || '',
      meio_recebimento: data.meio_recebimento || data.meioRecebimento || '',
      simples_nacional: typeof data.optanteSimplesNacional === 'string' ? (data.optanteSimplesNacional.toLowerCase() === 'sim') : Boolean(data.simples_nacional),
      // v1.0 usa string 'Com foto'/'Sem foto' para lista de presença
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
      // Coleções (endereços em Locais)
      locais: Array.isArray(data.locais) ? data.locais : [],
      setores: Array.isArray(data.setores) ? data.setores : [],
      funcoes: Array.isArray(data.funcoes) ? data.funcoes : [],
      usuarios: Array.isArray(data.usuarios) ? data.usuarios : [],
      gestores: Array.isArray(data.gestores) ? data.gestores : [],
      // Status
      active: (data.active ?? data.ativo ?? true) ? 1 : 0,
    }

    // Se não vierem locais, mas há endereço "geral", migra para um Local
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

    console.log('[ClientsView.openEdit] normalized form:', normalized)
    form.value = normalized
  } catch (e) { console.error('[ClientsView.openEdit] error:', e) }
  finally { loading.value = false }
}

async function save(payloadFromModal?: any) {
  try {
    ;(form.value as any).__loading = true
    const f: any = payloadFromModal || form.value
    // Helpers
    const digits = (s: unknown) => String(s||'').replace(/[^0-9]/g,'')
    const parseDate = (s: string) => {
      const m = String(s||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
      return m ? `${m[3]}-${m[2]}-${m[1]}` : s
    }

    // Validações leves
    const errors = []
    if (!(f.nome_comercial || f.razao_social)) errors.push('Informe Nome ou Razão Social')
    const doc = digits(f.cnpj)
    if (doc && !(doc.length === 11 || doc.length === 14)) errors.push('CPF/CNPJ inválido (11 ou 14 dígitos)')
    const email = String(f.email || '').trim()
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push('E-mail inválido')

    if (errors.length) {
      window.$toast?.error('Corrija os campos: ' + errors.join(' • '))
      return
    }

    const payload = {
      id: f.id,
      nomeComercial: f.nome_comercial,
      razaoSocial: f.razao_social,
      cnpj: digits(f.cnpj),
      email: f.email,
      dominioEmp: f.dominio,
      telefone1: digits(f.telefone1),
      telefone2: digits(f.telefone2),
      faturamento: f.faturamento,
      // Endereço removido dos dados gerais; Locais abaixo
      meioRecebimento: f.meio_recebimento,
      optanteSimplesNacional: f.simples_nacional ? 'Sim' : 'Não',
      listaPresenca: typeof f.lista_presenca === 'string' ? f.lista_presenca : (f.com_foto ? 'Com foto' : 'Sem foto'),
      situacaoTributaria: (typeof f.situacao_tributaria === 'object' ? (f.situacao_tributaria.value || f.situacao_tributaria.name || f.situacao_tributaria.label || '') : f.situacao_tributaria),
      contratoDataInicio: parseDate(f.contrato_inicio),
      contratoDataFim: parseDate(f.contrato_fim),
      orientacoesFaturamento: f.orientacoes_faturamento,
      // Coleções
      locais: (f.locais||[]).map((lc: AnyRecord)=>({
        nome: lc.nome,
        responsavel: lc.responsavel,
        regiao: lc.regiao,
        cep: digits(lc.cep),
        logradouro: lc.logradouro,
        numero: lc.numero,
        complemento: lc.complemento,
        bairro: lc.bairro,
        cidade: lc.cidade,
        uf: lc.uf,
        telefone: digits(lc.telefone),
        qrcode_fixo: !!lc.qrcode_fixo,
      })),
    }

    const svc = await import('@/services/clients')
    if (f.id) {
      await svc.updateClient(payload, new URLSearchParams())
      ;(window as any).$toast?.success('Cliente atualizado com sucesso')
    } else {
      delete payload.id
      await svc.createClient(payload, new URLSearchParams())
      ;(window as any).$toast?.success('Cliente criado com sucesso')
    }
    showModal.value = false
    await load()
  } catch (e) {
    console.error('[client save]', e)
    ;(window as any).$toast?.error('Falha ao salvar cliente. Verifique os campos e tente novamente.')
  } finally {
    ;(form.value as any).__loading = false
  }
}
function addRow(section: string, obj: any){
  const anyForm = form.value as AnyRecord
  if (!anyForm[section]) (anyForm as AnyRecord)[section] = [] as any[]
  (anyForm[section] as any[]).push({ ...obj })
}
function removeRow(section: string, idx: number){
  const anyForm = form.value as AnyRecord
  if (Array.isArray(anyForm[section])) (anyForm[section] as any[]).splice(idx,1)
}

// ViaCEP auto-preenchimento
async function fetchViaCEP(cep: string){
  try {
    const clean = String(cep || '').replace(/[^0-9]/g, '')
    if (clean.length !== 8) return
    const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`)
    const data = await res.json()
    if (data && !data.erro){
      const anyForm = form.value as AnyRecord
      anyForm.cep = data.cep || clean
      anyForm.logradouro = data.logradouro || anyForm.logradouro
      anyForm.bairro = data.bairro || anyForm.bairro
      anyForm.cidade = data.localidade || anyForm.cidade
      anyForm.uf = data.uf || anyForm.uf
      anyForm.complemento = data.complemento || anyForm.complemento
    }
  } catch (e) { console.warn('[viaCEP]', e) }
}

watch(() => (form.value as AnyRecord).cep as string, (v) => { fetchViaCEP(v as string) })



async function load() {
  loading.value = true

  try {
    // Build params ao estilo 1.0 a partir da URL
    const baseParams = buildParamsRouteQuery(route.query)
    // Paginacao (0-based no 1.0)
    baseParams.append('page', String(page.value - 1))
    baseParams.append('limit', String(limit.value))

    // Busca: no 1.0, o campo é nome_comercial (quando filtramos pelo nome)
    if (q.value) baseParams.append('nome_comercial', q.value)

    // Sort mapping compat 1.0
    const applySortParams = () => {
      switch (sortBy.value) {
        case 'nome':
          baseParams.append('sort_nome_comercial', 'asc'); break
        case 'codigo': // ID
          baseParams.append('sort_id', 'asc'); break
        case 'mais_recentes':
        default:
          // ordenar por ID desc aproxima "mais recentes"
          baseParams.append('sort_id', 'desc'); break
      }
    }
    applySortParams()

    // Filtros de data (mantidos caso backend aceite)
    if (dateFilterType.value === 'periodo' && dateStart.value && dateEnd.value) {
      baseParams.append('date_start', dateStart.value)
      baseParams.append('date_end', dateEnd.value)
    } else if (dateFilterType.value === 'mes' && selectedMonth.value) {
      baseParams.append('month', selectedMonth.value)
    }

    console.log('[ClientsView] Loading with params:', [...baseParams.entries()])
    const data: any = await listClients(baseParams)
    console.log('[ClientsView] Received data:', data)

    rows.value = Array.isArray(data) ? data : (data?.data || data?.rows || [])
    total.value = Array.isArray(data) ? data.length : (data?.total || rows.value.length)
  } catch (error) {
    console.error('[ClientsView] Error loading clients:', error)
  } finally {
    loading.value = false
  }
}

function getSortLabel() {
  const labels: Record<SortKey, string> = { nome: 'nome', mais_recentes: 'mais recentes', codigo: 'código' }
  return labels[sortBy.value as SortKey] || 'mais recentes'
}

// Contadores com base no filtro local
watch([filteredRows, limit], () => { total.value = totalCount.value })

function getDateFilterLabel() {
  return 'por data do cadastro'
}

function applyDateFilter() {
  showDateFilter.value = false
  filter()
}

function clearSearch() {
  q.value = ''
  page.value = 1
}

// Ações do cabeçalho (breadcrumb)

function onCreate(){
  // Novo cliente deve abrir em page view (/clients/new)
  router.push({ name: 'client-new' })
}
function onMoreActions(key: string){
  switch(key){
    case 'imprimir': onPrint(); break
    case 'imprimir_agrupados': window.$toast?.info('Impressão agrupada (em breve)'); break
    case 'aniversariantes': window.$toast?.info('Listar aniversariantes (em breve)'); break
    case 'exportar': exportXLSX(); break
    case 'importar': triggerImport(); break
    case 'export_contatos': window.$toast?.info('Exportar contatos (em breve)'); break
    case 'import_contatos': window.$toast?.info('Importar contatos (em breve)'); break
    default: window.$toast?.info('Mais ações em breve')
  }
}
const printOpen = ref(false)
function onPrint(){ printOpen.value = true }
function doPrint(){
  printOpen.value = false

  // Pequeno timeout para fechar o modal antes de imprimir
  setTimeout(() => window.print(), 50)
}
// XLSX Export/Import
const importInputRef = ref<HTMLInputElement | null>(null)
// XLSX Export/Import progress state (global for ProgressBar)
const exportProgress = ref(0)
const exportLabel = ref('')

async function exportXLSX(){
  try{
    exportProgress.value = 1
    exportLabel.value = 'Preparando exportação...'
    const rowsData = filteredRows.value || []

    const svc = await import('@/services/clients')

    const toBR = (iso: string) => {
      if (!iso) return ''
      const d = new Date(iso)
      if (isNaN(d.getTime())) return ''
      const dd = String(d.getDate()).padStart(2,'0')
      const mm = String(d.getMonth()+1).padStart(2,'0')
      const yyyy = d.getFullYear()
      return `${dd}/${mm}/${yyyy}`
    }

    // Acumular dados em múltiplas abas
    const clientesSheet: AnyRecord[] = []
    const locaisSheet: AnyRecord[] = []
    const setoresSheet: AnyRecord[] = []
    const funcoesSheet: AnyRecord[] = []
    const usuariosSheet: AnyRecord[] = []
    const gestoresSheet: AnyRecord[] = []

    let i = 0
    for (const it of rowsData){
      try{
        exportLabel.value = `Carregando cliente ${i+1} de ${rowsData.length}`
        exportProgress.value = Math.round(((i+1)/rowsData.length)*100)
        const full = await svc.getClient(it.id, new URLSearchParams())
        i++
        const data = full || {}
        const norm = {
          id: data.id ?? it.id,
          nome_comercial: data.nome_comercial || data.nomeComercial || data.name || data.nome || data.razao_social || data.razaoSocial || '',
          razao_social: data.razao_social || data.razaoSocial || '',
          cnpj: data.cnpj || data.cpf_cnpj || data.document || '',
          email: data.email || data.email_principal || '',
          dominio: data.dominio || data.dominioEmp || '',
          telefone1: data.telefone1 || data.telefone || data.phone || data.celular || '',
          telefone2: data.telefone2 || data.phone2 || data.celular2 || '',
          tributado_sp: Boolean(data.tributado_sp ?? false) ? 1 : 0,
          faturamento: data.faturamento || '',
          meio_recebimento: data.meio_recebimento || data.meioRecebimento || '',
          simples_nacional: (typeof data.optanteSimplesNacional === 'string' ? (data.optanteSimplesNacional.toLowerCase() === 'sim') : Boolean(data.simples_nacional)) ? 1 : 0,
          lista_presenca: (typeof data.listaPresenca === 'string' ? true : Boolean(data.lista_presenca)) ? 1 : 0,
          com_foto: (typeof data.listaPresenca === 'string' ? (data.listaPresenca.toLowerCase() === 'com foto') : Boolean(data.com_foto)) ? 1 : 0,
          situacao_tributaria: data.situacao_tributaria || data.situacaoTributaria || '',
          contrato: data.contrato || '',
          contrato_inicio: data.contrato_inicio || toBR(data.contratoDataInicio),
          contrato_fim: data.contrato_fim || toBR(data.contratoDataFim),
          orientacoes_faturamento: data.orientacoes_faturamento || data.orientacoesFaturamento || '',
          active: ((data.active ?? data.ativo ?? true) ? 1 : 0),
        }
        clientesSheet.push(norm)

        // Locais
        const locais: AnyRecord[] = Array.isArray(data.locais) ? (data.locais as AnyRecord[]) : []
        locais.forEach((lc: AnyRecord, idx: number) => {
          locaisSheet.push({
            id_cliente: norm.id,
            indice: idx+1,
            nome: lc.nome || '',
            responsavel: lc.responsavel || '',
            regiao: lc.regiao || '',
            cep: lc.cep || '',
            logradouro: lc.logradouro || '',
            numero: lc.numero || '',
            complemento: lc.complemento || '',
            bairro: lc.bairro || '',
            cidade: lc.cidade || '',
            uf: lc.uf || '',
            telefone: lc.telefone || '',
            qrcode_fixo: lc.qrcode_fixo ? 1 : 0,
          })
        })

        // Setores
        const setores: AnyRecord[] = Array.isArray(data.setores) ? (data.setores as AnyRecord[]) : []
        setores.forEach((st: AnyRecord, idx: number) => {
          setoresSheet.push({
            id_cliente: norm.id,
            indice: idx+1,
            local: st.local || '',
            setor: st.setor || '',
          })
        })

        // Funções
        const funcoes: AnyRecord[] = Array.isArray(data.funcoes) ? (data.funcoes as AnyRecord[]) : []
        funcoes.forEach((fn: AnyRecord, idx: number) => {
          funcoesSheet.push({
            id_cliente: norm.id,
            indice: idx+1,
            local: fn.local || '',
            setor: fn.setor || '',
            atividade: fn.atividade || '',
            funcao: fn.funcao || '',
            normal: fn.normal || '',
            extra: fn.extra || '',
            noturno: fn.noturno || '',
            extra_noturno: fn.extra_noturno || '',
            normal_cliente: fn.normal_cliente || '',
            extra_cliente: fn.extra_cliente || '',
            noturno_cliente: fn.noturno_cliente || '',
            extra_noturno_cliente: fn.extra_noturno_cliente || '',
            medida: fn.medida || '',
            carga: fn.carga || '',
            adicional_max: fn.adicional_max || '',
          })
        })

        // Usuários
        const usuarios: AnyRecord[] = Array.isArray(data.usuarios) ? (data.usuarios as AnyRecord[]) : []
        usuarios.forEach((us: AnyRecord, idx: number) => {
          usuariosSheet.push({
            id_cliente: norm.id,
            indice: idx+1,
            usuario: us.usuario || '',
            email: us.email || '',
            perfil: us.perfil || '',
            unidades_liberadas: us.unidades_liberadas || '',
          })
        })

        // Gestores
        const gestores: AnyRecord[] = Array.isArray(data.gestores) ? (data.gestores as AnyRecord[]) : []
        gestores.forEach((gs: AnyRecord, idx: number) => {
          gestoresSheet.push({
            id_cliente: norm.id,
            indice: idx+1,
            local: gs.local || '',
            setor: gs.setor || '',
            atividade: gs.atividade || '',
            gestor: gs.gestor || '',
            periodo_dia: gs.periodo_dia || '',
            periodo_mes: gs.periodo_mes || '',
          })
        })
      } catch (rowErr) {
        console.error('[export xlsx row]', rowErr)
      }
    }

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clientesSheet), 'Clientes')
    if (locaisSheet.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(locaisSheet), 'Locais')
    if (setoresSheet.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(setoresSheet), 'Setores')
    if (funcoesSheet.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(funcoesSheet), 'Funcoes')
    if (usuariosSheet.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(usuariosSheet), 'Usuarios')
    if (gestoresSheet.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gestoresSheet), 'Gestores')

    XLSX.writeFile(wb, `clientes_completo_${new Date().toISOString().slice(0,10)}.xlsx`)
    window.$toast?.success('Planilha completa gerada com sucesso')
  }catch(e){ console.error('[export xlsx]', e); window.$toast?.error('Falha ao gerar XLSX completo') }
  finally {
    exportProgress.value = 0
    exportLabel.value = ''
  }
}
function triggerImport(){ importInputRef.value?.click() }
async function onImportFileChange(e: Event){
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // reset
  if (!file) return
  try{
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rowsJson: AnyRecord[] = XLSX.utils.sheet_to_json(ws, { defval: '' }) as AnyRecord[]
    if (!rowsJson.length) { (window as any).$toast?.info('Planilha vazia'); return }
    const confirmMsg = `Importar ${rowsJson.length} cadastro(s)?`
    if (!confirm(confirmMsg)) return
    const svc = await import('@/services/clients')
    let ok = 0, fail = 0
    for (const r of rowsJson as any[]){
      try{
        const digits = (s: unknown)=>String(s||'').replace(/[^0-9]/g,'')
        const payload = {
          nomeComercial: r.nome_comercial || r.nome || r.razao_social || '',
          razaoSocial: r.razao_social || '',
          cnpj: digits(r.cnpj),
          email: r.email || '',
          dominioEmp: r.dominio || '',
          telefone1: digits(r.telefone1),
          telefone2: digits(r.telefone2),
          meioRecebimento: r.meio_recebimento || '',
          optanteSimplesNacional: false,
          listaPresenca: true,
          situacaoTributaria: '',
          locais: [{
            nome: r.local_nome || (r.nome_comercial||r.razao_social||''),
            responsavel: '',
            regiao: '',
            cep: digits(r.local_cep),
            logradouro: r.local_logradouro || '',
            numero: r.local_numero || '',
            complemento: '',
            bairro: r.local_bairro || '',
            cidade: r.local_cidade || '',
            uf: r.local_uf || '',
            telefone: digits(r.local_telefone),
            qrcode_fixo: false,
          }],
        }
        await svc.createClient(payload, new URLSearchParams())
        ok++
      }catch(err){ console.error('[import row]', err); fail++ }
    }
    ;(window as any).$toast?.success(`Importação concluída: ${ok} sucesso, ${fail} falha(s)`)
    await load()
  }catch(err){ console.error('[import xlsx]', err); window.$toast?.error('Falha ao importar XLSX') }
}



function onSearchInput() {
  page.value = 1
}

function filter() {
  page.value = 1
  // Atualiza query string (compat 1.0)
  setRouteQuery({ q: q.value, sort: sortBy.value }, route.query)
  showFilters.value = false
  showDateFilter.value = false
  load()
}

function nextPage() { page.value++; load() }
function prevPage() { if (page.value > 1) { page.value--; load() } }

// Close dropdowns when clicking outside
function handleClickOutside(event: MouseEvent) {
  const target = event.target as Element | null
  if (!target?.closest('.relative')) {
    showFilters.value = false
    showDateFilter.value = false
  }
}

onMounted(() => {
  load()
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>
<template>

  <section class="">
    <!-- Breadcrumb acima do título -->
    <Breadcrumbs />
    <!-- Título + ações -->
    <header class="mb-6 flex items-center justify-between gap-3 mb-3">
      <div class="flex items-center gap-2">
        <h1 class="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Clientes</h1>
        <span class="bg-blue-100 mt-1 text-blue-800 text-xs font-medium me-2 px-2.5 py-0.5 rounded-sm dark:bg-blue-900 dark:text-blue-300">Página {{ page }} • {{ total }} registros</span>
      </div>
      <ClientActions @print="onPrint" @create="onCreate" @action="onMoreActions" />
    </header>

    <!-- Barra de busca e filtros em uma linha -->
    <div class="card p-4 ">
      <div class="flex flex-wrap items-center gap-4">
        <!-- Campo de busca com lupa -->
        <div class="relative flex-1 min-w-[300px]">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg class="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            v-model="q"
            @keyup.enter="filter"
            @input="onSearchInput"
            class="w-full pl-10 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-800 dark:border-zinc-600 dark:text-zinc-100"
            :class="q ? 'pr-10' : 'pr-4'"
            placeholder="Buscar por nome, código, nome fantasia, email, CPF ou CNPJ..."
          />
          <!-- Botão X para limpar -->
          <button
            v-if="q"
            @click="clearSearch"
            class="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            type="button"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Filtro por data do cadastro -->
        <div class="relative">
          <button
            @click="showDateFilter = !showDateFilter"
            class="flex items-center gap-2 px-3 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
            :class="{ 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/20 dark:border-blue-600 dark:text-blue-300': dateFilterType !== 'sem_filtro' }"
>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span class="font-medium">{{ getDateFilterLabel() }}</span>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <!-- Dropdown de filtro por data -->
          <div v-if="showDateFilter" class="absolute z-10 mt-2 w-80 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700">
            <div class="p-4">
              <h3 class="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-3">Data do Cadastro</h3>

              <!-- Cards selecionáveis -->
              <div class="flex gap-1 mb-4">
                <button
                  @click="dateFilterType = 'sem_filtro'; applyDateFilter()"
                  class="px-2 py-1 text-xs rounded border transition-colors"
                  :class="dateFilterType === 'sem_filtro' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'"
                >
                  sem filtro
                </button>
                <button
                  @click="dateFilterType = 'periodo'"
                  class="px-2 py-1 text-xs rounded border transition-colors"
                  :class="dateFilterType === 'periodo' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'"
                >
                  Data do Cadastro
                </button>
                <button
                  @click="dateFilterType = 'mes'"
                  class="px-2 py-1 text-xs rounded border transition-colors"
                  :class="dateFilterType === 'mes' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'"
                >
                  mês
                </button>
              </div>

              <!-- Campos de período -->
              <div v-if="dateFilterType === 'periodo'" class="space-y-3">
                <div>
                  <label class="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Data inicial</label>
                  <div class="relative">
                    <input
                      v-model="dateStart"
                      type="date"
                      class="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-100"
                    />
                  </div>
                </div>
                <div>
                  <label class="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Data final</label>
                  <div class="relative">
                    <input
                      v-model="dateEnd"
                      type="date"
                      class="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-100"
                    />
                  </div>


                </div>


              </div>

              <!-- Campo de mês -->
              <div v-if="dateFilterType === 'mes'" class="space-y-3">
                <div>
                  <label class="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Mês</label>
                  <div class="flex items-center gap-2">
                    <button class="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <input
                      v-model="selectedMonth"
                      type="month"
                      class="flex-1 px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-100"
                    />
                    <button class="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Botões de ação (apenas para período e mês) -->
              <div v-if="dateFilterType !== 'sem_filtro'" class="flex justify-end gap-2 mt-4">
                <button
                  @click="applyDateFilter"
                  class="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 focus:ring-2 focus:ring-blue-500"
                >
                  aplicar
                </button>
                <button
                  @click="showDateFilter = false"
                  class="px-3 py-1.5 text-zinc-600 text-xs hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700 rounded"
                >
                  cancelar
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Filtro de ordenação -->
        <div class="relative">
          <button
            @click="showFilters = !showFilters"
            class="flex items-center gap-2 px-3 py-2 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
            :class="{ 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/20 dark:border-blue-600 dark:text-blue-300': sortBy !== 'mais_recentes' }"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span class="font-medium">{{ getSortLabel() }}</span>
            <span class="text-xs text-zinc-500">por situação</span>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <!-- Dropdown de ordenação -->
          <div v-if="showFilters" class="absolute z-10 mt-2 w-64 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700">
            <div class="p-4">
              <h3 class="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-3">Ordenar por</h3>
              <div class="flex gap-1">
                <button
                  @click="sortBy = 'nome'; filter()"
                  class="px-2 py-1 text-xs rounded border transition-colors"
                  :class="sortBy === 'nome' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'"
                >
                  nome
                </button>
                <button
                  @click="sortBy = 'mais_recentes'; filter()"
                  class="px-2 py-1 text-xs rounded border transition-colors"
                  :class="sortBy === 'mais_recentes' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'"
                >
                  mais recentes
                </button>
                <button
                  @click="sortBy = 'codigo'; filter()"
                  class="px-2 py-1 text-xs rounded border transition-colors"


                  :class="sortBy === 'codigo' ? 'border-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700'"
                >
                  código
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>

    <!-- Tabs de situação -->
    <div class="mb-3 mt-3">
      <nav class="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-700">
        <div class="flex gap-2">
          <button @click="currentTab = 'todos'"
            :class="currentTab === 'todos' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'"
            class="px-3 py-2 text-sm">Todos <span>({{ totalTodos }})</span></button>
          <button @click="currentTab = 'ativos'"
            :class="currentTab === 'ativos' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'"
            class="px-3 py-2 text-sm">Ativos <span>({{ totalAtivos }})</span></button>
          <button @click="currentTab = 'inativos'"
            :class="currentTab === 'inativos' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-zinc-600'"
            class="px-3 py-2 text-sm">Inativos <span>({{ totalInativos }})</span></button>
          </div>
        </nav>
      </div>

      <!-- Informações de paginação -->
    <!-- Cards (desktop e mobile) -->
    <div class="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      <template v-if="loading">
        <div v-for="n in 6" :key="'sk' + n" class="card p-3 animate-pulse">
          <div class="mb-2 h-4 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800"></div>
          <div class="space-y-2 text-xs">
            <div class="h-3 w-1/3 rounded bg-zinc-200 dark:bg-zinc-800"></div>
            <div class="h-3 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800"></div>
            <div class="h-3 w-1/4 rounded bg-zinc-200 dark:bg-zinc-800"></div>
          </div>
        </div>
      </template>
      <template v-else>
        <article v-for="it in visibleRows" :key="it.id" @click="onCardClick(it)"
          class="card p-3 transition-colors hover:border-brand-300 hover:bg-brand-50/40 dark:hover:bg-brand-900/10 cursor-pointer"
          :class="{ 'border-2 border-brand-600': selectedClientId === it.id }">
          <header class="mb-2 flex items-center justify-between">
            <strong class="truncate">{{ it.name || it.nome_comercial || it.nome || it.razao_social || '—' }}</strong>
            <span
              :class="(it.active ?? it.ativo) ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200'"
              class="rounded px-2 py-0.5 text-xs font-medium">
              {{ (it.active ?? it.ativo) ? 'Ativo' : 'Inativo' }}
            </span>
          </header>
          <dl class="space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
            <!-- <div class="flex justify-between">
              <dd>{{ it.id }}</dd>
            </div> -->
            <div v-if="present.cnpj" class="flex justify-between">
              <dd>{{ it.cnpj || it.cpf_cnpj || it.document || '-' }}</dd>
            </div>
            <div v-if="present.unidadeNome" class="flex justify-between">
              <dd>{{ it.unidade?.nome || it.nome_unidade || it.unidade_nome || '-' }}</dd>
            </div>
            <div v-if="present.email" class="flex justify-between">
              <dd class="truncate max-w-[12rem]">{{ it.email || '-' }}</dd>
            </div>
          </dl>
        </article>
      </template>
    </div>

  <!-- Modal montado fora dos dropdowns para não ser clippado pelo overflow -->
  <ClientEditModal :model-value="showModal" :edit-id="editId" :form="form" @update:modelValue="(v:boolean)=>showModal=v" @save="save" />



  <PrintPreview :open="printOpen" :items="filteredRows" @close="printOpen=false" @print="doPrint" />

  </section>
</template>
