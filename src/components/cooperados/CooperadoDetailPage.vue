<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Breadcrumbs from '@/components/Breadcrumbs.vue'
import { getCooperado, listCooperadoPayments, listCooperadoCheckins, updateCooperado, listFuncoesCooperados } from '@/services/cooperados'

type Row = Record<string, any>

const route = useRoute()
const router = useRouter()
const idParam = computed(() => route.params.id as string | undefined)

const loading = ref(false)
const form = ref<Row>({})
const activeTab = ref<'perfil'|'documentos'|'financeiro'|'presencas'|'alertas'|'ofertas'|'agenda'>('perfil')
const editing = ref(false)
const payments = ref<Row[]>([])
const checkins = ref<Row[]>([])
// Lazy-load de históricos
const extrasLoaded = ref(false)
const extrasLoading = ref(false)
// Debug helpers
const rawResponse = ref<any>(null)
const rawDataArray = ref<any[] | null>(null)
const showDebug = computed(() => String(route.query.debug || '') === '1')
const pageTitle = computed(() => {
  const f = form.value || {}
  return (f.nome || f.name || 'Cooperado') as string
})

function resolveCooperadoId(it: Row | null | undefined): string | number | null {
  const cand: any = it || {}
  const id = cand.id ?? cand.cooperadoId ?? cand.cooperado_id ?? cand.codigo ?? cand.matricula
  return (id !== undefined && id !== null && String(id).trim() !== '') ? id : null
}

function getAvatarUrl(it: Row) {
  return it.urlImg1 || it.foto || it.photo || it.avatar || it.picture || ''
}
function getInitials(it: Row) {
  const name = String(it.nome || it.name || '').trim()
  if (!name) return '?'
  const parts = name.split(/\s+/).slice(0, 2)
  return parts.map(p => p[0]?.toUpperCase() || '').join('')
}

function toWhatsUrl(number: unknown) {
  const digits = String(number || '').replace(/[^0-9]/g, '')
  if (!digits) return ''
  return `https://api.whatsapp.com/send/?phone=55${digits}&text&type=phone_number&app_absent=0`
}

function formatDate(val: unknown): string {
  if (!val) return '-'
  try {
    const s = String(val)
    const d = new Date(s)
    if (isNaN(d.getTime())) return '-'
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    return `${dd}/${mm}/${yyyy}`
  } catch { return '-' }
}

function calcIdade(val: unknown): number | null {
  if (!val) return null
  try {
    const d = new Date(String(val))
    if (isNaN(d.getTime())) return null
    const today = new Date()
    let idade = today.getFullYear() - d.getFullYear()
    const m = today.getMonth() - d.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) idade--
    return idade
  } catch { return null }
}

function truthyFlag(v: any): boolean {
  return v === true || v === 'true' || v === 1 || v === '1'
}

const docFlags = computed(() => {
  const f = form.value || {}
  return {
    foto: truthyFlag((f as any).fotoPerfilVencimento ?? (f as any).fotoPerfiVencimento),
    atestado: truthyFlag((f as any).atestadoVencimento),
    antecedentes: truthyFlag((f as any).antecedentesVencimento),
    uniforme: truthyFlag((f as any).uniformeVencimento),
  }
})

// Catálogo opcional para mapear IDs -> nomes, quando o backend envia apenas IDs
const funcoesCatalog = ref<Array<{ id: number; name: string }> | null>(null)
async function ensureFuncoesCatalog(){
  try {
    if (!funcoesCatalog.value) {
      const list = await listFuncoesCooperados()
      funcoesCatalog.value = Array.isArray(list) ? list : []
    }
  } catch (e) {
    // silencioso
  }
}

const funcoesDedupe = computed<string[]>(() => {
  const f = form.value || {}
  const out: string[] = []
  const seen = new Set<string>()
  const push = (v: unknown) => {
    const s = String(v ?? '').trim()
    if (!s) return
    if (seen.has(s)) return
    seen.add(s)
    out.push(s)
  }

  // 1) Campos simples comuns e variações encontradas
  const directCandidates = [
    (f as any).funcao,
    (f as any).funcao1, (f as any).funcao2, (f as any).funcao3, (f as any).funcao4,
    (f as any).funcao5, (f as any).funcao6, (f as any).funcao7, (f as any).funcao8,
    (f as any).profissao, (f as any).cargo, (f as any).ocupacao,
    (f as any).especialidade, (f as any).habilidade, (f as any).atividade,
  ]
  for (const v of directCandidates) {
    if (typeof v === 'string') {
      // valores concatenados "cargo1, cargo2; cargo3"
      const parts = String(v).split(/[;,|]/).map(s => s.trim()).filter(Boolean)
      if (parts.length > 1) parts.forEach(push)
      else push(v)
    }
  }

  // 2) Vasculha quaisquer campos string cujo nome contenha palavras-chave
  try {
    for (const [k, v] of Object.entries(f)) {
      if (typeof v !== 'string') continue
      if (/(funcao|função|profissao|profissão|cargo|ocupacao|ocupação|especialidade|habilidade|atividade)/i.test(k)) {
        const parts = String(v).split(/[;,|]/).map(s => s.trim()).filter(Boolean)
        if (parts.length > 1) parts.forEach(push)
        else push(v)
      }
    }
  } catch {}

  // 3) Arrays típicos (funcoes, profissoes, cargos, ...)
  const arrayKeys = ['funcoes','profissoes','cargos','ocupacoes','especialidades','habilidades','atividades']
  for (const key of arrayKeys) {
    const arr: any = (f as any)[key]
    if (!arr) continue
    if (Array.isArray(arr)) {
      for (const it of arr) {
        if (typeof it === 'string') { push(it); continue }
        if (it && typeof it === 'object') {
          const name = (it as any).profissao ?? (it as any).funcao ?? (it as any).name ?? (it as any).nome ?? (it as any).descricao ?? (it as any).titulo
          if (name) push(String(name))
        }
      }
    }
  }

  // 4) IDs mapeados pelo catálogo (funcaoId, idFuncao, funcao1Id...)
  const idNames: string[] = []
  const catalog = funcoesCatalog.value
  if (catalog && catalog.length) {
    const idSet = new Set<number>()
    try {
      for (const [k, v] of Object.entries(f)) {
        if (/^(funcao\d*id|idFuncao\d*)$/i.test(k) && (typeof v === 'number' || (typeof v === 'string' && v.trim() !== ''))) {
          const n = Number(v)
          if (Number.isFinite(n)) idSet.add(n)
        }
        // arrays de IDs
        if (/^(funcoesIds|idsFuncoes)$/i.test(k) && Array.isArray(v)) {
          for (const x of v) { const n = Number(x); if (Number.isFinite(n)) idSet.add(n) }
        }
      }
    } catch {}
    if (idSet.size) {
      const byId = new Map<number, string>(catalog.map(x => [x.id, x.name]))
      for (const id of idSet) {
        const nm = byId.get(id)
        if (nm) idNames.push(nm)
      }
    }
  }
  idNames.forEach(push)

  return out
})

type DocItem = {
  id?: number|string
  tipo?: string
  label: string
  dataEnvio?: string
  dataVencimento?: string
  url?: string
  avaliacao?: any
  matricula?: number
  nomeImagem?: string
  cooperativa?: number
  dataAvaliacao?: string
  motivoReprovacao?: string
  usuarioAvaliacao?: string
}
const documentosList = computed<DocItem[]>(() => {
  const f = form.value || {}
  const alt = [
    (f as any).documentos,
    (f as any).docs,
    (f as any).documentosEnviados,
    (f as any).arquivos,
    (f as any).anexos,
    (f as any).listaDocumentos,
    (f as any).documentosCooperado,
    (f as any).images,
    (f as any).imagens,
    (f as any).uploads,
  ]
  const arrSrc = Array.isArray((f as any).documentos) ? (f as any).documentos : (alt.find(a => Array.isArray(a)) as any[] | undefined)
  const arr = Array.isArray(arrSrc) ? arrSrc : []
  const labelMap: Record<string,string> = {
    fotoPerfil: 'Foto de perfil',
    atestadoMedico: 'Atestado médico',
    antecedentesCriminais: 'Antecedentes criminais',
    uniforme: 'Uniforme',
  }
  return arr.map((d: any) => {
    const tipo = d?.tipo ?? d?.documento ?? d?.nomeTipo ?? d?.categoria ?? d?.tipoDocumento
    const label = labelMap[tipo as string] || String(tipo || 'Documento')
    const url = d?.urlDocumento ?? d?.url ?? d?.link ?? d?.arquivoUrl ?? d?.path ?? d?.caminho ?? d?.downloadUrl
    return {
      id: d?.id ?? d?.documentoId ?? d?.docId ?? d?.codigo,
      tipo,
      label,
  dataEnvio: d?.dataEnvio ?? d?.enviadoEm ?? d?.data ?? d?.dtEnvio,
      dataVencimento: d?.dataVencimento ?? d?.vencimento ?? d?.validade ?? d?.dataValidade ?? d?.dtVencimento,
      url,
      avaliacao: d?.avaliacao,
      matricula: d?.matricula,
      nomeImagem: d?.nomeImagem ?? d?.nomeArquivo ?? d?.filename,
      cooperativa: d?.cooperativa,
      dataAvaliacao: d?.dataAvaliacao,
      motivoReprovacao: d?.motivoReprovacao,
      usuarioAvaliacao: d?.usuarioAvaliacao,
    } as DocItem
  })
})

async function load(){
  try{
    loading.value = true
    const id = idParam.value
    if (!id || id === 'new') return
    // 1) Tenta usar o objeto completo salvo ao clicar no card (sem refetch)
    let data: any = null
    let usedCache = false
    try {
      const raw = sessionStorage.getItem('cooperados:detail')
      if (raw) {
        const obj = JSON.parse(raw)
        const objId = resolveCooperadoId(obj)
        if (obj && objId != null && String(objId) === String(id)) {
          data = obj
          usedCache = true
          // Opcional: limpar logo após o uso para evitar confusão ao navegar entre detalhes diferentes
          // sessionStorage.removeItem('cooperados:detail')
        }
      }
    } catch {}
    // 2) Fallback: se não achou no sessionStorage, buscar por id
    if (!data) {
      data = await getCooperado(id, new URLSearchParams())
    }
    // 2.1) Se usamos cache do card mas não há documentos, buscar o detalhe para enriquecer
    try {
      const hasDocsIn = (obj: any): boolean => {
        if (!obj || typeof obj !== 'object') return false
        const candidates = [
          obj?.documentos,
          obj?.docs,
          obj?.documentosEnviados,
          obj?.arquivos,
          obj?.anexos,
          obj?.listaDocumentos,
          obj?.documentosCooperado,
          obj?.images,
          obj?.imagens,
          obj?.uploads,
        ]
        return candidates.some(arr => Array.isArray(arr) && arr.length > 0)
      }
      if (usedCache && !hasDocsIn(data)) {
        const fresh = await getCooperado(id, new URLSearchParams())
        if (fresh && typeof fresh === 'object') {
          data = { ...(data || {}), ...(fresh || {}) }
        }
      }
    } catch {}
    // Debug: payload bruto e array 'data' (se houver)
    try {
      console.log('[cooperado.detail][raw]', data)
      if (data && Array.isArray((data as any).data)) {
        console.log('[cooperado.detail][raw.data] length=', (data as any).data.length, (data as any).data)
      }
    } catch {}
  rawResponse.value = data
  rawDataArray.value = (data && Array.isArray((data as any).data)) ? (data as any).data : null
  // Normalização do objeto principal
  let parsed: any = data
  if (data && typeof data === 'object' && 'data' in data) {
    const inner = (data as any).data
    if (Array.isArray(inner)) parsed = inner[0] || {}
    else if (inner && typeof inner === 'object') parsed = inner
  }
  if (parsed && typeof parsed === 'object' && (parsed as any).cooperado) parsed = (parsed as any).cooperado
  if (parsed && typeof parsed === 'object' && (parsed as any).cooperator) parsed = (parsed as any).cooperator
  form.value = (parsed || {}) as Row

  // Normalização de documentos: agrega de múltiplas origens e mapeia campos conhecidos
  try {
    const collectDocs = (obj: any): any[] => {
      if (!obj || typeof obj !== 'object') return []
      const out: any[] = []
      const pushIfArray = (arr: any) => { if (Array.isArray(arr)) out.push(...arr) }
      pushIfArray((obj as any).documentos)
      pushIfArray((obj as any).docs)
      pushIfArray((obj as any).documentosEnviados)
      pushIfArray((obj as any).arquivos)
      pushIfArray((obj as any).anexos)
      pushIfArray((obj as any).listaDocumentos)
      pushIfArray((obj as any).documentosCooperado)
      pushIfArray((obj as any).images)
      pushIfArray((obj as any).imagens)
      pushIfArray((obj as any).uploads)
      // também vasculha em data, se houver
      const inner = (obj && (obj as any).data && typeof (obj as any).data === 'object') ? (obj as any).data : null
      if (inner) {
        pushIfArray((inner as any).documentos)
        pushIfArray((inner as any).docs)
        pushIfArray((inner as any).documentosEnviados)
        pushIfArray((inner as any).arquivos)
        pushIfArray((inner as any).anexos)
        pushIfArray((inner as any).listaDocumentos)
        pushIfArray((inner as any).documentosCooperado)
        pushIfArray((inner as any).images)
        pushIfArray((inner as any).imagens)
        pushIfArray((inner as any).uploads)
      }
      return out
    }
    const rawDocs = collectDocs(form.value).concat(collectDocs(data))
    const normalized = rawDocs.map((d: any) => ({
      id: d?.id ?? d?.documentoId ?? d?.docId ?? d?.codigo,
      tipo: d?.tipo ?? d?.documento ?? d?.nomeTipo ?? d?.categoria ?? d?.tipoDocumento,
  dataEnvio: d?.dataEnvio ?? d?.enviadoEm ?? d?.data ?? d?.dtEnvio,
      dataVencimento: d?.dataVencimento ?? d?.vencimento ?? d?.validade ?? d?.dataValidade ?? d?.dtVencimento,
      urlDocumento: d?.urlDocumento ?? d?.url ?? d?.link ?? d?.arquivoUrl ?? d?.path ?? d?.caminho ?? d?.downloadUrl,
      avaliacao: d?.avaliacao,
      matricula: d?.matricula,
      nomeImagem: d?.nomeImagem ?? d?.nomeArquivo ?? d?.filename,
      cooperativa: d?.cooperativa,
      dataAvaliacao: d?.dataAvaliacao,
      motivoReprovacao: d?.motivoReprovacao,
      usuarioAvaliacao: d?.usuarioAvaliacao,
    }))
    ;(form.value as any).documentos = normalized
    console.log('[cooperado.detail][documentos.normalized]', normalized.length)
  } catch (e) {
    console.warn('[cooperado.detail] normalização de documentos falhou', e)
  }
    // Debug: objeto normalizado, documentos e urls de imagem
    try {
      console.log('[cooperado.detail][parsed]', form.value)
      const docs = (form.value as any)?.documentos
      console.log('[cooperado.detail][documentos]', Array.isArray(docs) ? docs : 'documentos não é array')
      console.log('[cooperado.detail][urls]', {
        urlImg1: (form.value as any)?.urlImg1,
        urlImg2: (form.value as any)?.urlImg2,
        urlImg3: (form.value as any)?.urlImg3,
        urlImg4: (form.value as any)?.urlImg4,
      })
    } catch {}
    // históricos: carregaremos sob demanda ao abrir as abas
    payments.value = []
    checkins.value = []
    extrasLoaded.value = false
  } finally { loading.value = false }
}

async function ensureExtrasLoaded(){
  if (extrasLoaded.value) return
  const id = idParam.value
  if (!id || id === 'new') return
  try {
    extrasLoading.value = true
    const [p, c] = await Promise.all([
      listCooperadoPayments(String(id)),
      listCooperadoCheckins(String(id)),
    ])
    payments.value = Array.isArray(p) ? p : []
    checkins.value = Array.isArray(c) ? c : []
    extrasLoaded.value = true
  } catch (e) {
    payments.value = payments.value || []
    checkins.value = checkins.value || []
  } finally {
    extrasLoading.value = false
  }
}

function goBack(){
  try {
    sessionStorage.setItem('cooperados:restore', '1')
    const id = idParam.value
    if (id) {
      sessionStorage.setItem('cooperados:last', JSON.stringify({ id: String(id), at: Date.now() }))
    }
  } catch {}
  if (window.history.length > 1) router.back()
  else router.push({ name: 'cooperados' })
}

function startEdit(){ editing.value = true }
function cancelEdit(){ editing.value = false }
async function saveEdit(){
  try{
    const id = idParam.value
    if (!id) return
    const payload: any = {
      nome: form.value.nome,
      sexo: form.value.sexo,
      cidade: form.value.cidade,
      uf: form.value.uf || form.value.estado,
      cooperativa: form.value.cooperativa,
      status: form.value.status,
    }
    await updateCooperado(String(id), payload)
    editing.value = false
  }catch(e){
    console.error('Falha ao salvar alterações', e)
  }
}

onMounted(async () => { await Promise.all([ensureFuncoesCatalog(), load()]) })
// Lazy-load quando o usuário abrir as abas que dependem de históricos
watch(activeTab, async (tab) => {
  if (tab === 'financeiro' || tab === 'presencas') {
    await ensureExtrasLoaded()
  }
})
watch(idParam, load)
</script>

<template>
  <section>
    <!-- Breadcrumb acima do título -->
    <Breadcrumbs />
    <!-- Cabeçalho com avatar e botão editar -->
    <header class="mb-3 flex items-start justify-between gap-3">
      <div class="flex items-center gap-3 min-w-0">
        <div class="h-28 w-20 rounded-none overflow-hidden bg-zinc-200 text-zinc-600 flex items-center justify-center ring-1 ring-zinc-300">
          <img v-if="getAvatarUrl(form)" :src="getAvatarUrl(form)" class="h-full w-full object-cover" />
          <span v-else class="text-[12px] font-semibold">{{ getInitials(form) }}</span>
        </div>
        <div class="min-w-0">
          <h1 class="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 truncate">{{ pageTitle }}</h1>
          <div class="flex flex-wrap items-center gap-2 text-xs text-zinc-600 mt-1">
            <span v-if="form.cidade" class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">{{ form.cidade }}<span v-if="form.uf || form.estado">/{{ form.uf || form.estado }}</span></span>
            <span v-if="form.status" class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">{{ form.status }}</span>
            <span v-if="form.sexo" class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">{{ form.sexo }}</span>
            <span v-if="form.cooperativa" class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">{{ form.cooperativa }}</span>
          </div>
          <div class="text-xs text-zinc-500 mt-1 truncate">Matrícula #{{ form.matricula || form.matricola || form.registration || '-' }}</div>
        </div>
      </div>
      <div class="shrink-0">
        <button @click="startEdit" class="h-9 w-9 inline-flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700" title="Editar">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9"/>
            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
        </button>
      </div>
    </header>

    <!-- Abas -->
    <nav class="mb-4 border-b border-zinc-200 dark:border-zinc-700 text-sm">
      <ul class="flex gap-4">
        <li><button @click="activeTab='perfil'" :class="activeTab==='perfil'?'border-b-2 border-blue-600 text-blue-700':'text-zinc-600'" class="px-1 py-2">Perfil</button></li>
        <li><button @click="activeTab='documentos'" :class="activeTab==='documentos'?'border-b-2 border-blue-600 text-blue-700':'text-zinc-600'" class="px-1 py-2">Documentos</button></li>
        <li><button @click="activeTab='financeiro'" :class="activeTab==='financeiro'?'border-b-2 border-blue-600 text-blue-700':'text-zinc-600'" class="px-1 py-2">Financeiro</button></li>
        <li><button @click="activeTab='presencas'" :class="activeTab==='presencas'?'border-b-2 border-blue-600 text-blue-700':'text-zinc-600'" class="px-1 py-2">Presenças</button></li>
        <li><button @click="activeTab='alertas'" :class="activeTab==='alertas'?'border-b-2 border-blue-600 text-blue-700':'text-zinc-600'" class="px-1 py-2">Alertas</button></li>
        <li><button @click="activeTab='ofertas'" :class="activeTab==='ofertas'?'border-b-2 border-blue-600 text-blue-700':'text-zinc-600'" class="px-1 py-2">Ofertas</button></li>
        <li><button @click="activeTab='agenda'" :class="activeTab==='agenda'?'border-b-2 border-blue-600 text-blue-700':'text-zinc-600'" class="px-1 py-2">Agenda</button></li>
      </ul>
    </nav>

    <div v-if="loading" class="card p-4 animate-pulse">
      <div class="h-5 w-1/4 bg-zinc-200 rounded"></div>
      <div class="mt-2 h-4 w-1/3 bg-zinc-200 rounded"></div>
    </div>
    <div v-else class="space-y-3">
      <!-- Perfil -->
      <div v-if="activeTab==='perfil'" class="space-y-3">
        <div class="card p-4">
          <div v-if="!editing" class="text-sm grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div class="text-[11px] uppercase text-zinc-500">CPF</div>
              <div class="font-medium">{{ form.cpf || '-' }}</div>
            </div>
            <div>
              <div class="text-[11px] uppercase text-zinc-500">RG</div>
              <div class="font-medium">{{ form.rg || '-' }}</div>
            </div>
            <div>
              <div class="text-[11px] uppercase text-zinc-500">Nascimento</div>
              <div class="font-medium flex items-center gap-2">
                <span>{{ formatDate(form.dataNasc) }}</span>
                <span v-if="calcIdade(form.dataNasc) !== null" class="text-xs text-zinc-500">({{ calcIdade(form.dataNasc) }} anos)</span>
              </div>
            </div>
            <div>
              <div class="text-[11px] uppercase text-zinc-500">Sexo</div>
              <div class="font-medium">{{ form.sexo || form.gender || '-' }}</div>
            </div>
            <div>
              <div class="text-[11px] uppercase text-zinc-500">Mãe</div>
              <div class="font-medium">{{ form.nomeMae || '-' }}</div>
            </div>
            <div>
              <div class="text-[11px] uppercase text-zinc-500">Pai</div>
              <div class="font-medium">{{ form.nomePai || '-' }}</div>
            </div>
            <div>
              <div class="text-[11px] uppercase text-zinc-500">Expedição (RG)</div>
              <div class="font-medium">{{ formatDate(form.dataExp) }}</div>
            </div>
            <div>
              <div class="text-[11px] uppercase text-zinc-500">Status</div>
              <div class="font-medium">{{ form.status || '-' }}</div>
            </div>
            <div>
              <div class="text-[11px] uppercase text-zinc-500">Matrícula</div>
              <div class="font-medium">{{ form.matricula || '-' }}</div>
            </div>
            <div>
              <div class="text-[11px] uppercase text-zinc-500">Cooperativa</div>
              <div class="font-medium">{{ form.cooperativa ?? '-' }}</div>
            </div>
            <div class="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm border-t pt-3">
              <div class="sm:col-span-2">
                <div class="text-[11px] uppercase text-zinc-500">E-mail</div>
                <div class="font-medium break-all">{{ form.email || '-' }}</div>
              </div>
              <div>
                <div class="text-[11px] uppercase text-zinc-500">Telefone 1</div>
                <div class="font-medium flex items-center gap-2">
                  <a :href="toWhatsUrl(form.telefone1)" target="_blank" rel="noopener" class="text-green-600 hover:underline" v-if="form.telefone1">{{ form.telefone1 }}</a>
                  <span v-else>-</span>
                </div>
              </div>
              <div>
                <div class="text-[11px] uppercase text-zinc-500">Telefone 2</div>
                <div class="font-medium">{{ form.telefone2 || '-' }}</div>
              </div>
              <div>
                <div class="text-[11px] uppercase text-zinc-500">Gestor</div>
                <div class="font-medium">{{ form.gestor || '-' }}</div>
              </div>
            </div>
            <div class="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm border-t pt-3">
              <div>
                <div class="text-[11px] uppercase text-zinc-500">CEP</div>
                <div class="font-medium">{{ form.cep || '-' }}</div>
              </div>
              <div>
                <div class="text-[11px] uppercase text-zinc-500">Cidade/UF</div>
                <div class="font-medium">{{ form.cidade || '-' }}<span v-if="form.uf || form.estado">/{{ (form.uf || form.estado) }}</span></div>
              </div>
              <div>
                <div class="text-[11px] uppercase text-zinc-500">Bairro</div>
                <div class="font-medium">{{ form.bairro || '-' }}</div>
              </div>
              <div>
                <div class="text-[11px] uppercase text-zinc-500">Endereço</div>
                <div class="font-medium">{{ form.endereco || '-' }}</div>
              </div>
              <div>
                <div class="text-[11px] uppercase text-zinc-500">Número</div>
                <div class="font-medium">{{ form.numero || '-' }}</div>
              </div>
              <div>
                <div class="text-[11px] uppercase text-zinc-500">Complemento</div>
                <div class="font-medium">{{ form.complemento || '-' }}</div>
              </div>
              <div>
                <div class="text-[11px] uppercase text-zinc-500">Região</div>
                <div class="font-medium">{{ form.regiao || form.regiao_sp || form.zona || '-' }}</div>
              </div>
            </div>
            <div class="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm border-t pt-3">
              <div>
                <div class="text-[11px] uppercase text-zinc-500">Tipo de Pagamento</div>
                <div class="font-medium">{{ form.tipoPagto || '-' }}</div>
              </div>
              <div>
                <div class="text-[11px] uppercase text-zinc-500">Banco</div>
                <div class="font-medium">{{ form.banco || '-' }}</div>
              </div>
              <div>
                <div class="text-[11px] uppercase text-zinc-500">Agência</div>
                <div class="font-medium">{{ form.agencia || '-' }}</div>
              </div>
              <div>
                <div class="text-[11px] uppercase text-zinc-500">Conta</div>
                <div class="font-medium">{{ form.conta || '-' }}</div>
              </div>
              <div>
                <div class="text-[11px] uppercase text-zinc-500">Dígito</div>
                <div class="font-medium">{{ form.digConta || '-' }}</div>
              </div>
            </div>
            <div class="sm:col-span-2 border-t pt-3">
              <div class="text-[11px] uppercase text-zinc-500 mb-1">Funções</div>
              <div class="flex flex-wrap gap-1">
                <template v-for="(f, i) in funcoesDedupe" :key="String(f)+i">
                  <span class="px-2 py-0.5 text-xs rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">{{ f }}</span>
                </template>
                <span v-if="!funcoesDedupe.length" class="text-sm text-zinc-500">—</span>
              </div>
            </div>
          </div>
          <!-- Form edição -->
          <div v-else class="space-y-3">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label class="text-sm">Nome
                <input v-model="(form as any).nome" class="px-2 py-1 border rounded w-full" />
              </label>
              <label class="text-sm">Sexo
                <select v-model="(form as any).sexo" class="px-2 py-1 border rounded w-full">
                  <option value="">-</option>
                  <option value="M">M</option>
                  <option value="F">F</option>
                </select>
              </label>
              <label class="text-sm">Cidade
                <input v-model="(form as any).cidade" class="px-2 py-1 border rounded w-full" />
              </label>
              <label class="text-sm">UF
                <input v-model="(form as any).uf" class="px-2 py-1 border rounded w-full" />
              </label>
              <label class="text-sm">Cooperativa
                <input v-model="(form as any).cooperativa" class="px-2 py-1 border rounded w-full" />
              </label>
              <label class="text-sm">Status
                <input v-model="(form as any).status" class="px-2 py-1 border rounded w-full" />
              </label>
            </div>
            <div class="flex justify-end gap-2">
              <button @click="cancelEdit" class="px-3 py-1.5 rounded border">Cancelar</button>
              <button @click="saveEdit" class="px-3 py-1.5 rounded bg-blue-600 text-white">Salvar</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Documentos -->
      <div v-else-if="activeTab==='documentos'" class="card p-4">
        <div class="flex items-center justify-between mb-2">
          <div class="text-[11px] uppercase text-zinc-500">Documentos</div>
          <div class="flex items-center gap-1">
            <span v-if="docFlags.foto" class="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">Foto perfil vencida</span>
            <span v-if="docFlags.atestado" class="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">Atestado vencido</span>
            <span v-if="docFlags.antecedentes" class="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">Antecedentes vencidos</span>
            <span v-if="docFlags.uniforme" class="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">Uniforme vencido</span>
          </div>
        </div>
        <div class="text-sm">
          <div v-if="!documentosList.length" class="text-zinc-500">Nenhum documento enviado.</div>
          <ul v-else class="divide-y divide-zinc-200 dark:divide-zinc-700">
            <li v-for="d in documentosList" :key="String(d.id || d.label + d.url)" class="py-2 flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="font-medium flex items-center gap-2">
                  <span>{{ d.label }}</span>
                  <span v-if="d.nomeImagem" class="text-xs text-zinc-500">• {{ d.nomeImagem }}</span>
                </div>
                <div class="text-xs text-zinc-500 flex flex-wrap gap-2 mt-0.5">
                  <span>Envio: {{ formatDate(d.dataEnvio) }}</span>
                  <span v-if="d.dataVencimento">• Venc.: {{ formatDate(d.dataVencimento) }}</span>
                  <span v-if="d.avaliacao != null">• Avaliação: {{ String(d.avaliacao) }}</span>
                  <span v-if="d.dataAvaliacao">• Avaliado em: {{ formatDate(d.dataAvaliacao) }}</span>
                  <span v-if="d.motivoReprovacao">• Motivo: {{ d.motivoReprovacao }}</span>
                  <span v-if="d.usuarioAvaliacao">• Usuário: {{ d.usuarioAvaliacao }}</span>
                  <span v-if="d.matricula">• Matricula: {{ d.matricula }}</span>
                  <span v-if="d.cooperativa != null">• Coop: {{ d.cooperativa }}</span>
                </div>
              </div>
              <div class="shrink-0 flex items-center gap-3">
                <a v-if="d.url" :href="d.url" target="_blank" rel="noopener" class="text-blue-600 hover:underline text-xs">abrir</a>
                <a v-if="d.url" :href="d.url" target="_blank" rel="noopener" class="block h-10 w-10 rounded overflow-hidden ring-1 ring-zinc-300">
                  <img :src="d.url" alt="doc" class="h-full w-full object-cover" />
                </a>
              </div>
            </li>
          </ul>
          <!-- URLs diretas (urlImg1..4), se existirem -->
          <div class="mt-2 space-y-1">
            <div v-if="form.urlImg1" class="text-xs">
              <span class="text-zinc-500 mr-1">Imagem 1:</span>
              <a :href="form.urlImg1" target="_blank" rel="noopener" class="text-blue-600 hover:underline">abrir</a>
            </div>
            <div v-if="form.urlImg2" class="text-xs">
              <span class="text-zinc-500 mr-1">Imagem 2:</span>
              <a :href="form.urlImg2" target="_blank" rel="noopener" class="text-blue-600 hover:underline">abrir</a>
            </div>
            <div v-if="form.urlImg3" class="text-xs">
              <span class="text-zinc-500 mr-1">Imagem 3:</span>
              <a :href="form.urlImg3" target="_blank" rel="noopener" class="text-blue-600 hover:underline">abrir</a>
            </div>
            <div v-if="form.urlImg4" class="text-xs">
              <span class="text-zinc-500 mr-1">Imagem 4:</span>
              <a :href="form.urlImg4" target="_blank" rel="noopener" class="text-blue-600 hover:underline">abrir</a>
            </div>
          </div>
        </div>
      </div>

      <!-- Financeiro -->
      <div v-else-if="activeTab==='financeiro'" class="card p-4">
        <div class="text-[11px] uppercase text-zinc-500 mb-2">Financeiro</div>
        <div v-if="extrasLoading" class="text-sm text-zinc-500">Carregando…</div>
        <div v-else-if="!payments.length" class="text-sm text-zinc-500">Sem registros.</div>
        <ul v-else class="divide-y divide-zinc-200 dark:divide-zinc-700 text-sm">
          <li v-for="(p,i) in payments" :key="'p'+i" class="py-2 flex items-center justify-between">
            <div class="min-w-0">
              <div class="font-medium truncate">{{ p.descricao || p.descr || p.referencia || 'Pagamento' }}</div>
              <div class="text-xs text-zinc-500">{{ formatDate(p.data || p.data_pagamento || p.dt) }}</div>
            </div>
            <div class="shrink-0 font-medium">{{ p.valor || p.total || '-' }}</div>
          </li>
        </ul>
      </div>
      <!-- Alertas -->
      <div v-else-if="activeTab==='alertas'" class="card p-4">
        <div class="text-[11px] uppercase text-zinc-500 mb-2">Alertas</div>
        <div class="text-sm text-zinc-500">Sem alertas.</div>
      </div>

      <!-- Ofertas -->
      <div v-else-if="activeTab==='ofertas'" class="card p-4">
        <div class="text-[11px] uppercase text-zinc-500 mb-2">Ofertas</div>
        <div class="text-sm text-zinc-500">Sem ofertas.</div>
      </div>

      <!-- Agenda -->
      <div v-else-if="activeTab==='agenda'" class="card p-4">
        <div class="text-[11px] uppercase text-zinc-500 mb-2">Agenda</div>
        <div class="text-sm text-zinc-500">Sem itens de agenda.</div>
      </div>

      <!-- Presenças -->
      <div v-else-if="activeTab==='presencas'" class="card p-4">
        <div class="text-[11px] uppercase text-zinc-500 mb-2">Histórico de Presenças</div>
        <div v-if="extrasLoading" class="text-sm text-zinc-500">Carregando…</div>
        <div v-else-if="!checkins.length" class="text-sm text-zinc-500">Sem registros.</div>
        <ul v-else class="divide-y divide-zinc-200 dark:divide-zinc-700 text-sm">
          <li v-for="(c,i) in checkins" :key="'c'+i" class="py-2 flex items-center justify-between">
            <div class="min-w-0">
              <div class="font-medium truncate">{{ c.evento || c.event || c.nome || 'Evento' }}</div>
              <div class="text-xs text-zinc-500">Check-in: {{ formatDate(c.checkin || c.inicio) }} • Check-out: {{ formatDate(c.checkout || c.fim) }}</div>
            </div>
            <div class="shrink-0 text-xs text-zinc-500">{{ c.status || '-' }}</div>
          </li>
        </ul>
      </div>

      <!-- Observações -->
      <div class="card p-4">
        <div class="text-[11px] uppercase text-zinc-500 mb-2">Observações</div>
        <div class="text-sm whitespace-pre-wrap">{{ form.observacoes || form.obs || '-' }}</div>
      </div>

      <!-- Debug (visível quando ?debug=1 na URL) -->
      <div v-if="showDebug" class="card p-4">
        <div class="text-[11px] uppercase text-zinc-500 mb-2">Debug do Response</div>
        <div class="text-xs text-zinc-500 mb-1">rawResponse</div>
        <pre class="text-xs bg-zinc-50 dark:bg-zinc-900/40 rounded p-2 overflow-auto max-h-64">{{ JSON.stringify(rawResponse, null, 2) }}</pre>
        <div v-if="rawDataArray" class="text-xs text-zinc-500 mt-3 mb-1">rawResponse.data (array)</div>
        <pre v-if="rawDataArray" class="text-xs bg-zinc-50 dark:bg-zinc-900/40 rounded p-2 overflow-auto max-h-64">{{ JSON.stringify(rawDataArray, null, 2) }}</pre>
        <div class="text-xs text-zinc-500 mt-3 mb-1">form (parsed)</div>
        <pre class="text-xs bg-zinc-50 dark:bg-zinc-900/40 rounded p-2 overflow-auto max-h-64">{{ JSON.stringify(form, null, 2) }}</pre>
        <div class="text-xs text-zinc-500 mt-3 mb-1">form.documentos</div>
        <pre class="text-xs bg-zinc-50 dark:bg-zinc-900/40 rounded p-2 overflow-auto max-h-64">{{ JSON.stringify((form as any)?.documentos, null, 2) }}</pre>
      </div>
    </div>
  </section>
</template>
