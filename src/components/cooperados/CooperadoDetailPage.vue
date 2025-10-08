<script setup lang="ts">
import { ref, onMounted, watch, computed, onBeforeUnmount } from 'vue'
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
  // 1) Campos diretos
  const direct = (it as any).urlImg1 || (it as any).foto || (it as any).photo || (it as any).avatar || (it as any).picture
  if (direct) return String(direct)
  // 2) Buscar em documentos (normalizados ou brutos)
  const fromDocs = getAvatarFromDocuments(it)
  if (fromDocs) return fromDocs
  return ''
}
function getAvatarFromDocuments(it: Row): string {
  if (!it) return ''
  const gather = (obj: any): any[] => {
    if (!obj || typeof obj !== 'object') return []
    const arrs: any[] = []
    const pushIfArray = (a: any) => { if (Array.isArray(a)) arrs.push(...a) }
    // Prioriza documentos normalizados
    pushIfArray((obj as any).documentos)
    // Alternativos (caso ainda não normalizado)
    pushIfArray((obj as any).docs)
    pushIfArray((obj as any).documentosEnviados)
    pushIfArray((obj as any).arquivos)
    pushIfArray((obj as any).anexos)
    pushIfArray((obj as any).listaDocumentos)
    pushIfArray((obj as any).documentosCooperado)
    pushIfArray((obj as any).images)
    pushIfArray((obj as any).imagens)
    pushIfArray((obj as any).uploads)
    return arrs
  }
  const docs = gather(it)
  if (!docs.length) return ''
  // Heurística: procurar tipo "fotoPerfil" (ou contendo 'foto' e 'perfil'), priorizando por dataEnvio/ordem
  const toUrl = (d: any) => d?.urlDocumento ?? d?.url ?? d?.link ?? d?.arquivoUrl ?? d?.path ?? d?.caminho ?? d?.downloadUrl
  const score = (d: any): number => {
    // maior é melhor
    let s = 0
    const tipo = String(d?.tipo ?? d?.documento ?? d?.nomeTipo ?? '').toLowerCase()
    const nome = String(d?.nomeImagem ?? d?.nomeArquivo ?? d?.filename ?? '').toLowerCase()
    if (tipo === 'fotoperfil' || tipo === 'foto_perfil' || tipo === 'foto-perfil') s += 5
    if (tipo.includes('foto') && tipo.includes('perfil')) s += 4
    if (nome.includes('foto') && nome.includes('perfil')) s += 2
    // bônus por ter dataEnvio válida mais recente
    const de = new Date(String(d?.dataEnvio || d?.enviadoEm || d?.data))
    if (!isNaN(de.getTime())) s += Math.min(3, Math.floor((de.getTime() / 1e3) % 3))
    return s
  }
  let best: any = null
  let bestScore = -1
  for (const d of docs) {
    const url = toUrl(d)
    if (!url) continue
    const s = score(d)
    if (s > bestScore) { best = d; bestScore = s }
  }
  return best ? String(toUrl(best)) : ''
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

// Modal de visualização de imagem
const showImageModal = ref(false)
const imageToPreview = ref<string | null>(null)
function openImage(src: unknown) {
  const s = String(src || '').trim()
  if (!s) return
  imageToPreview.value = s
  showImageModal.value = true
}
function closeImage(){
  showImageModal.value = false
  imageToPreview.value = null
}
let escHandler: ((e: KeyboardEvent) => void) | null = null

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

function sexoLabel(v: unknown): string {
  const s = String(v || '').trim().toUpperCase()
  if (!s) return ''
  if (s.startsWith('M')) return 'Masculino'
  if (s.startsWith('F')) return 'Feminino'
  return String(v || '')
}

// Classes de badge por status (leve no claro, sutil no escuro)
function normStatus(v: unknown): string {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}
function statusToBadge(v: unknown): string {
  const s = normStatus(v)
  if (!s) return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
  // Warning
  if (s.includes('pendente') || s.includes('aguard')) {
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
  }
  // Sucesso / Ativo
  if (s.includes('ativo') || s.includes('aprov') || s.includes('liber')) {
    return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
  }
  // Erro / Negado / Inativo
  if (s.includes('reprov') || s.includes('inativo') || s.includes('bloque') || s.includes('cancel')) {
    return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
  }
  // Informativo / Em análise / Processando
  if (s.includes('analise') || s.includes('análise') || s.includes('process') || s.includes('valid')) {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
  }
  // Neutro
  return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
}
const statusBadgeClass = computed(() => statusToBadge((form.value as any)?.status))

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
    fotoPerfil: 'Foto de Perfil',
    atestadoMedico: 'Atestado Médico',
    antecedentesCriminais: 'Antecedentes Criminais',
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

const requiredDocStatuses = computed(() => {
  const list = documentosList.value || []
  const hasFotoPerfil = list.some((d) => {
    const tipo = String(d?.tipo || '').toLowerCase()
    const label = String(d?.label || '').toLowerCase()
    return tipo === 'fotoperfil' || label.includes('foto de perfil')
  })
  const hasAtestado = list.some((d) => {
    const tipo = String(d?.tipo || '').toLowerCase()
    const label = String(d?.label || '').toLowerCase()
    return tipo.includes('atestado') || label.includes('atestado')
  })
  const hasAntecedentes = list.some((d) => {
    const tipo = String(d?.tipo || '').toLowerCase()
    const label = String(d?.label || '').toLowerCase()
    return tipo.includes('antecedente') || label.includes('antecedente')
  })
  const hasFotoUniforme = list.some((d) => {
    const tipo = String(d?.tipo || '').toLowerCase()
    const label = String(d?.label || '').toLowerCase()
    const nome = String((d as any)?.nomeImagem || '').toLowerCase()
    return tipo === 'fotouniforme' || (label.includes('uniforme') && label.includes('foto')) || (tipo === 'uniforme' && (label.includes('foto') || nome.includes('foto')))
  })
  return { fotoPerfil: hasFotoPerfil, atestado: hasAtestado, antecedentes: hasAntecedentes, fotoUniforme: hasFotoUniforme }
})

// Helper: identifica documento de Foto de Perfil
function isFotoPerfilDoc(d: any): boolean {
  const tipo = String(d?.tipo || '').toLowerCase()
  const label = String(d?.label || '').toLowerCase()
  return tipo === 'fotoperfil' || label.includes('foto de perfil')
}
// Helper: monta tooltip com informações completas do documento
function buildDocTooltip(d: any): string {
  const parts: string[] = []
  parts.push(`Envio:${formatDate(d?.dataEnvio)}`)
  if (d?.dataVencimento) parts.push(`Venc.:${formatDate(d?.dataVencimento)}`)
  if (d?.avaliacao != null) parts.push(`Avaliação:${String(d?.avaliacao)}`)
  if (d?.dataAvaliacao) parts.push(`Avaliado em:${formatDate(d?.dataAvaliacao)}`)
  if (d?.usuarioAvaliacao) parts.push(`Usuário:${String(d?.usuarioAvaliacao)}`)
  if (d?.matricula) parts.push(`Matrícula:${String(d?.matricula)}`)
  if (d?.cooperativa != null) parts.push(`Coop:${String(d?.cooperativa)}`)
  return parts.join('\n')
}

const antecedentesApiToken = import.meta.env.VITE_INFO_SIMPLES_TOKEN || ''
const antecedentesApiEndpoint = '/api/infosimples/api/v2/consultas/antecedentes-criminais/sp'
const antecedentesLoading = ref(false)
const antecedentesMessage = ref('')
const antecedentesMessageType = ref<'info' | 'error' | 'success'>('info')
const antecedentesLinks = ref<string[]>([])
const antecedentesLastResponse = ref<any | null>(null)

// Debug: log do token no console (remover em produção)
console.log('[Antecedentes] Token configurado:', antecedentesApiToken ? 'SIM (' + antecedentesApiToken.substring(0, 8) + '...)' : 'NÃO')

const antecedentesMessageClass = computed(() => {
  if (antecedentesMessageType.value === 'error') return 'text-red-600'
  if (antecedentesMessageType.value === 'success') return 'text-green-600'
  return 'text-zinc-500'
})

function toIsoDateString(val: unknown): string | null {
  if (!val) return null
  const raw = String(val).trim()
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [dd, mm, yyyy] = raw.split('/')
    return `${yyyy}-${mm}-${dd}`
  }
  const date = new Date(raw)
  if (!isNaN(date.getTime())) {
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }
  return null
}

function splitRg(val: unknown): { base: string | null; digit: string | null } {
  const cleaned = String(val || '').replace(/[^0-9Xx]/g, '')
  if (!cleaned) return { base: null, digit: null }
  if (cleaned.length === 1) return { base: cleaned, digit: null }
  return { base: cleaned.slice(0, -1), digit: cleaned.slice(-1).toUpperCase() }
}

function resolveGenero(): string | null {
  const rawGenero = (form.value as any)?.genero ?? (form.value as any)?.sexo ?? ''
  const s = String(rawGenero || '').trim().toUpperCase()
  if (!s) return null
  if (s === 'MASCULINO' || s === 'FEMININO') return s
  if (s.startsWith('M')) return 'MASCULINO'
  if (s.startsWith('F')) return 'FEMININO'
  return null
}

async function consultarAntecedentes() {
  antecedentesLinks.value = []
  antecedentesLastResponse.value = null
  antecedentesMessage.value = ''
  antecedentesMessageType.value = 'info'

  if (!antecedentesApiToken) {
    antecedentesMessage.value = 'Configure a variável VITE_INFO_SIMPLES_TOKEN no ambiente para habilitar a consulta.'
    antecedentesMessageType.value = 'error'
    return
  }

  const nome = String((form.value as any)?.nome || (form.value as any)?.name || '').trim()
  const birthdateIso = toIsoDateString((form.value as any)?.dataNasc ?? (form.value as any)?.birthdate)
  const genero = resolveGenero()

  if (!nome || !birthdateIso || !genero) {
    antecedentesMessage.value = 'Preencha nome, data de nascimento e gênero do cooperado para realizar a consulta.'
    antecedentesMessageType.value = 'error'
    return
  }

  const { base: rgBase, digit: rgDigit } = splitRg((form.value as any)?.rg)
  const rgExpedicaoIso = toIsoDateString((form.value as any)?.dataExp ?? (form.value as any)?.rgExpedicao)
  const cinCpf = String((form.value as any)?.cpf || '').replace(/[^0-9]/g, '')
  const cinExpedicaoIso = toIsoDateString(
    (form.value as any)?.cinExpedicao ??
    (form.value as any)?.cpfExpedicao ??
    (form.value as any)?.cinDataExpedicao
  )
  const pai = String((form.value as any)?.nomePai ?? (form.value as any)?.pai ?? '').trim()
  const mae = String((form.value as any)?.nomeMae ?? (form.value as any)?.mae ?? '').trim()

  const payload: Record<string, string> = {
    token: antecedentesApiToken,
    nome,
    birthdate: birthdateIso,
    genero,
    timeout: '300',
  }
  if (rgBase) payload.rg = rgBase
  if (rgDigit) payload.rg_digito = rgDigit
  if (rgExpedicaoIso) payload.rg_expedicao = rgExpedicaoIso
  if (cinCpf) payload.cin_cpf = cinCpf
  if (cinExpedicaoIso) payload.cin_expedicao = cinExpedicaoIso
  if (pai) payload.pai = pai
  if (mae) payload.mae = mae

  antecedentesLoading.value = true
  console.log('[Antecedentes] Payload:', payload)
  
  try {
    const response = await fetch(antecedentesApiEndpoint, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(payload),
      mode: 'cors',
    })
    
    console.log('[Antecedentes] Response status:', response.status)
    const json = await response.json().catch(() => ({}))
    console.log('[Antecedentes] Response JSON:', json)
    antecedentesLastResponse.value = json

    const code = Number(json?.code)
    const codeMessage = json?.code_message || json?.message || ''

    if (code === 200) {
      antecedentesMessage.value = codeMessage ? `Consulta realizada: ${codeMessage}` : 'Consulta realizada com sucesso.'
      antecedentesMessageType.value = 'success'
      const receipts = Array.isArray(json?.site_receipts)
        ? json.site_receipts.filter((link: any) => typeof link === 'string' && link)
        : []
      antecedentesLinks.value = receipts
    } else {
      const baseMessage = code ? `(${code})` : ''
      antecedentesMessage.value = `Não foi possível concluir a consulta ${baseMessage} ${codeMessage}`.trim()
      antecedentesMessageType.value = 'error'
      antecedentesLinks.value = []
    }

    if (!response.ok && !json?.code) {
      antecedentesMessage.value = `Erro ${response.status}: ${response.statusText || 'falha na consulta.'}`
      antecedentesMessageType.value = 'error'
      antecedentesLinks.value = []
    }
  } catch (err: any) {
    console.error('Erro ao consultar antecedentes', err)
    
    // Detecta erro de CORS
    if (err?.message?.includes('fetch') || err?.name === 'TypeError') {
      antecedentesMessage.value = 'Erro de CORS: A API Infosimples bloqueia chamadas diretas do navegador. É necessário criar um endpoint no backend para fazer a consulta.'
      antecedentesMessageType.value = 'error'
    } else {
      antecedentesMessage.value = `Erro ao consultar: ${err?.message || 'Verifique o console para detalhes.'}`
      antecedentesMessageType.value = 'error'
    }
    
    antecedentesLinks.value = []
  } finally {
    antecedentesLoading.value = false
  }
}

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
    const rawDocs = [...collectDocs(form.value), ...collectDocs(data)]
    // Normaliza e remove duplicidades mantendo a ordem (id -> url -> nome/tipo como chave)
    const seen = new Set<string>()
    const normalized: any[] = []
    for (const d of rawDocs) {
      const item = {
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
      }
      const key = String(
        item.id != null && String(item.id).trim() !== ''
          ? `id:${item.id}`
          : item.urlDocumento
            ? `url:${item.urlDocumento}`
            : `nm:${item.nomeImagem || ''}|t:${item.tipo || ''}|e:${item.dataEnvio || ''}|v:${item.dataVencimento || ''}`
      )
      if (seen.has(key)) continue
      seen.add(key)
      normalized.push(item)
    }
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
      cidade: form.value.cidade,
      uf: form.value.uf || form.value.estado,
      status: form.value.status,
    }
    await updateCooperado(String(id), payload)
    editing.value = false
  }catch(e){
    console.error('Falha ao salvar alterações', e)
  }
}

onMounted(async () => {
  await Promise.all([ensureFuncoesCatalog(), load()])
  escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeImage()
  }
  window.addEventListener('keydown', escHandler)
})
onBeforeUnmount(() => {
  if (escHandler) window.removeEventListener('keydown', escHandler)
})
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
    <header class="mb-3 flex items-start justify-between gap-3 card p-3 mt-3">
      <div class="flex items-center gap-3 min-w-0">
        <div class="h-20 w-20 overflow-hidden bg-zinc-200 text-zinc-600 flex items-center justify-center ring-1 ring-zinc-300 rounded">
          <img
            v-if="getAvatarUrl(form)"
            :src="getAvatarUrl(form)"
            class="h-full w-full object-cover cursor-zoom-in"
            @click="openImage(getAvatarUrl(form))"
          />
          <span v-else class="text-[12px] font-semibold">{{ getInitials(form) }}</span>
        </div>
        <div class="min-w-0">
          <h1 class="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 truncate">
            {{ pageTitle }}
            <span v-if="form.status" :class="['ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded align-middle text-xs', statusBadgeClass]">
              {{ form.status }}
            </span>
          </h1>
          <div class="flex flex-wrap items-center gap-2 text-xs text-zinc-600 mt-1">
            <span v-if="form.cidade || form.regiao || form.regiao_sp || form.zona" class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">
              {{ form.cidade || '-' }}
              <span v-if="form.regiao || form.regiao_sp || form.zona"> - {{ form.regiao || form.regiao_sp || form.zona }}</span>
            </span>
            <span v-if="form.dataNasc" class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">
              {{ formatDate(form.dataNasc) }}
              <span v-if="calcIdade(form.dataNasc) !== null"> ({{ calcIdade(form.dataNasc) }} anos)</span>
            </span>
          </div>
        </div>
      </div>
      <div class="shrink-0">
        <button
          @click="startEdit"
          class="h-7 px-2 inline-flex items-center gap-1 rounded-full bg-blue-600 text-white hover:bg-blue-700 text-xs"
          title="Editar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9"/>
            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
          <span>Editar</span>
        </button>
      </div>
    </header>

    <!-- Abas -->
    <nav class="mb-4 border-b border-zinc-200 dark:border-zinc-700 text-sm">
      <ul class="flex gap-4">
        <li><button @click="activeTab='perfil'" :class="activeTab==='perfil'?'border-b-2 border-blue-600 text-blue-700':'text-zinc-600'" class="px-1 py-2">Perfil</button></li>
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
      <div v-if="activeTab==='perfil'" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <!-- Coluna 1: Informações Pessoais + Funções -->
        <div class="flex flex-col gap-3">
          <div class="card p-4 h-full">
          <div class="text-[11px] uppercase text-zinc-500 mb-2">Informações Pessoais</div>
          <div v-if="!editing" class="text-sm space-y-3">
            <!-- Linha 1: Nome (2 colunas) + Nascimento (1 coluna) -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div class="sm:col-span-2">
                <div class="text-[11px] uppercase text-zinc-500">Nome</div>
                <div class="font-medium">{{ form.nome || pageTitle }}</div>
              </div>
              <div>
                <div class="text-[11px] uppercase text-zinc-500">Nascimento</div>
                <div class="font-medium flex items-center gap-2">
                  <span>{{ formatDate(form.dataNasc) }}</span>
                  <span v-if="calcIdade(form.dataNasc) !== null" class="text-xs text-zinc-500">({{ calcIdade(form.dataNasc) }} anos)</span>
                </div>
              </div>
            </div>
            <!-- Linha 2: CPF + RG + Expedição -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <div class="text-[11px] uppercase text-zinc-500">CPF</div>
                <div class="font-medium">{{ form.cpf || '-' }}</div>
              </div>
              <div>
                <div class="text-[11px] uppercase text-zinc-500">RG</div>
                <div class="font-medium">{{ form.rg || '-' }}</div>
              </div>
              <div>
                <div class="text-[11px] uppercase text-zinc-500">Expedição (RG)</div>
                <div class="font-medium">{{ formatDate(form.dataExp) }}</div>
              </div>
            </div>
            <!-- Linha 3: Mãe + Pai -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div class="text-[11px] uppercase text-zinc-500">Mãe</div>
                <div class="font-medium">{{ form.nomeMae || '-' }}</div>
              </div>
              <div>
                <div class="text-[11px] uppercase text-zinc-500">Pai</div>
                <div class="font-medium">{{ form.nomePai || '-' }}</div>
              </div>
            </div>
          </div>
          <!-- Form edição -->
          <div v-else class="space-y-3">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label class="text-sm">Nome
                <input v-model="(form as any).nome" class="px-2 py-1 border rounded w-full" />
              </label>
              <label class="text-sm">Cidade
                <input v-model="(form as any).cidade" class="px-2 py-1 border rounded w-full" />
              </label>
              <label class="text-sm">UF
                <input v-model="(form as any).uf" class="px-2 py-1 border rounded w-full" />
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
          <!-- Endereço -->
          <div class="card p-4 h-full">
            <div class="text-[11px] uppercase text-zinc-500 mb-2">Endereço</div>
            <div class="text-sm space-y-3">
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <div class="text-[11px] uppercase text-zinc-500">Logradouro</div>
                  <div class="font-medium">{{ form.logradouro || form.endereco || form.rua || '-' }}</div>
                </div>
                <div>
                  <div class="text-[11px] uppercase text-zinc-500">Número</div>
                  <div class="font-medium">{{ form.numero || form.num || '-' }}</div>
                </div>
                <div>
                  <div class="text-[11px] uppercase text-zinc-500">Complemento</div>
                  <div class="font-medium">{{ form.complemento || form.compl || '-' }}</div>
                </div>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <div class="text-[11px] uppercase text-zinc-500">Bairro</div>
                  <div class="font-medium">{{ form.bairro || '-' }}</div>
                </div>
                <div>
                  <div class="text-[11px] uppercase text-zinc-500">Cidade</div>
                  <div class="font-medium">{{ form.cidade || '-' }}</div>
                </div>
                <div>
                  <div class="text-[11px] uppercase text-zinc-500">UF</div>
                  <div class="font-medium">{{ form.uf || form.estado || '-' }}</div>
                </div>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <div class="text-[11px] uppercase text-zinc-500">CEP</div>
                  <div class="font-medium">{{ form.cep || '-' }}</div>
                </div>
                <div class="sm:col-span-2">
                  <div class="text-[11px] uppercase text-zinc-500">Região/Zona</div>
                  <div class="font-medium">{{ form.regiao || form.regiao_sp || form.zona || '-' }}</div>
                </div>
              </div>
            </div>
          </div>
          <!-- (Funções movido para a coluna do meio) -->
        </div>

        <!-- Coluna 2: Informações de Contato + Funções -->
        <div class="flex flex-col gap-3">
          <!-- Informações de Contato -->
          <div v-if="!editing" class="card p-4">
            <div class="text-[11px] uppercase text-zinc-500 mb-2">Informações de Contato</div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
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
            </div>
          </div>
          <!-- Funções -->
          <div class="card p-4 h-full">
            <div class="text-[11px] uppercase text-zinc-500 mb-2">Funções</div>
            <div class="flex flex-wrap gap-1">
              <template v-for="(f, i) in funcoesDedupe" :key="String(f)+i">
                <span class="px-2 py-0.5 text-xs rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">{{ f }}</span>
              </template>
              <span v-if="!funcoesDedupe.length" class="text-sm text-zinc-500">—</span>
            </div>
          </div>
        </div>

        <!-- Coluna 3: Documentos -->
        <div class="card p-4 h-full">
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
                  </div>
                  <div class="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                    <div class="text-zinc-500"><span class="mr-1">Envio:</span><span class="text-zinc-800 dark:text-zinc-200 font-medium">{{ formatDate(d.dataEnvio) }}</span></div>
                    <div v-if="d.dataVencimento" class="text-zinc-500"><span class="mr-1">Validade:</span><span class="text-zinc-800 dark:text-zinc-200 font-medium">{{ formatDate(d.dataVencimento) }}</span></div>
                    <div v-if="d.avaliacao != null" class="text-zinc-500">
                      <span class="mr-1">Avaliação:</span>
                      <span :class="['inline-flex items-center gap-1 px-1.5 py-0.5 rounded align-middle', statusToBadge(d.avaliacao)]">{{ String(d.avaliacao) }}</span>
                    </div>
                    <div v-if="d.dataAvaliacao" class="text-zinc-500"><span class="mr-1">Avaliado em:</span><span class="text-zinc-800 dark:text-zinc-200 font-medium">{{ formatDate(d.dataAvaliacao) }}</span></div>
                    <div v-if="d.motivoReprovacao" class="text-zinc-500"><span class="mr-1">Motivo:</span><span class="text-zinc-800 dark:text-zinc-200 font-medium">{{ d.motivoReprovacao }}</span></div>
                  </div>
                </div>
                <div class="shrink-0 flex items-center gap-3">
                  <button
                    v-if="d.url"
                    type="button"
                    class="block h-10 w-10 rounded overflow-hidden ring-1 ring-zinc-300 cursor-zoom-in"
                    @click="openImage(d.url)"
                    title="Ampliar"
                  >
                    <img :src="d.url" alt="doc" class="h-full w-full object-cover" />
                  </button>
                </div>
              </li>
            </ul>
            <!-- Requisitos obrigatórios abaixo, seguindo padrão de divisão -->
            <div
              v-if="!requiredDocStatuses.fotoPerfil || !requiredDocStatuses.atestado || !requiredDocStatuses.antecedentes || !requiredDocStatuses.fotoUniforme"
              class="mt-2 divide-y divide-zinc-200 dark:divide-zinc-700"
            >
              <div v-if="!requiredDocStatuses.fotoPerfil" class="py-2 flex items-center justify-between">
                <div class="font-medium">Foto de Perfil</div>
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800">Pendente</span>
              </div>
              <div v-if="!requiredDocStatuses.atestado" class="py-2 flex items-center justify-between">
                <div class="font-medium">Atestado Médico</div>
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800">Pendente</span>
              </div>
              <div
                v-if="!requiredDocStatuses.antecedentes"
                class="py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div class="min-w-0">
                  <div class="font-medium">Antecedentes Criminais</div>
                  <div
                    v-if="antecedentesMessage"
                    :class="['text-xs mt-1', antecedentesMessageClass]"
                  >
                    {{ antecedentesMessage }}
                  </div>
                  <div v-if="antecedentesLinks.length" class="mt-1 flex flex-wrap gap-2 text-xs">
                    <a
                      v-for="(link, idx) in antecedentesLinks"
                      :key="link"
                      :href="link"
                      target="_blank"
                      rel="noopener"
                      class="text-blue-600 hover:underline"
                    >
                      Comprovante {{ idx + 1 }}
                    </a>
                  </div>
                </div>
                <button
                  type="button"
                  class="inline-flex items-center justify-center px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed"
                  @click="consultarAntecedentes"
                  :disabled="antecedentesLoading"
                >
                  <span v-if="antecedentesLoading">Consultando…</span>
                  <span v-else>Consultar</span>
                </button>
              </div>
              
            </div>
            
          </div>
        </div>
      </div>

      <!-- Financeiro (Aba) -->
      <div v-else-if="activeTab==='financeiro'" class="grid grid-cols-1 gap-3">
        <div class="card p-4">
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

      <!-- Observações (somente na aba Perfil) -->
      <div v-if="activeTab==='perfil'" class="card p-4">
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
  <!-- Modal de imagem -->
  <teleport to="body">
    <div
      v-if="showImageModal && imageToPreview"
      class="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
      @click.self="closeImage"
    >
      <div class="relative max-h-full max-w-full">
        <button
          class="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-white/90 text-zinc-800 shadow flex items-center justify-center hover:bg-white"
          @click="closeImage"
          aria-label="Fechar"
          title="Fechar"
        >
          ✕
        </button>
        <img :src="String(imageToPreview || '')" class="max-h-[85vh] max-w-[90vw] object-contain rounded shadow-lg bg-zinc-900/20" />
      </div>
    </div>
  </teleport>
  <!--/ Modal de imagem -->
</template>
