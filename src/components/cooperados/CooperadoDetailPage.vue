<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Breadcrumbs from '@/components/Breadcrumbs.vue'
import { getCooperado, listCooperadoPayments, listCooperadoCheckins, updateCooperado } from '@/services/cooperados'

type Row = Record<string, any>

const route = useRoute()
const router = useRouter()
const idParam = computed(() => route.params.id as string | undefined)

const loading = ref(false)
const form = ref<Row>({})
const activeTab = ref<'perfil'|'documentos'|'pagamentos'|'presencas'>('perfil')
const editing = ref(false)
const payments = ref<Row[]>([])
const checkins = ref<Row[]>([])
const pageTitle = computed(() => {
  const f = form.value || {}
  return (f.nome || f.name || 'Cooperado') as string
})

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

const funcoesDedupe = computed<string[]>(() => {
  const f = form.value || {}
  const listA = [f.funcao, f.funcao1, f.funcao2, f.funcao3, f.funcao4, f.funcao5, f.funcao6, f.funcao7, f.funcao8]
    .map(v => String(v || '').trim()).filter(Boolean)
  const listB = Array.isArray(f.funcoes) ? (f.funcoes as any[]).map(x => String(x?.profissao || '').trim()).filter(Boolean) : []
  const merged = [...listA, ...listB]
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of merged) { if (v && !seen.has(v)) { seen.add(v); out.push(v) } }
  return out
})

type DocItem = { id?: number|string; tipo?: string; label: string; dataEnvio?: string; dataVencimento?: string; url?: string }
const documentosList = computed<DocItem[]>(() => {
  const f = form.value || {}
  const arr = Array.isArray(f.documentos) ? (f.documentos as any[]) : []
  const labelMap: Record<string,string> = {
    fotoPerfil: 'Foto de perfil',
    atestadoMedico: 'Atestado médico',
    antecedentesCriminais: 'Antecedentes criminais',
    uniforme: 'Uniforme',
  }
  return arr.map((d: any) => ({
    id: d.id,
    tipo: d.tipo,
    label: labelMap[d.tipo] || String(d.tipo || 'Documento'),
    dataEnvio: d.dataEnvio,
    dataVencimento: d.dataVencimento,
    url: d.urlDocumento || d.url,
  }))
})

async function load(){
  try{
    loading.value = true
    const id = idParam.value
    if (!id || id === 'new') return
    const data = await getCooperado(id, new URLSearchParams())
    form.value = (data && (data.data || data)) as Row
    // carrega históricos adicionais
    try{
      const [p, c] = await Promise.all([
        listCooperadoPayments(String(id)),
        listCooperadoCheckins(String(id)),
      ])
      payments.value = Array.isArray(p) ? p : []
      checkins.value = Array.isArray(c) ? c : []
    }catch(e){
      // silencia erros de histórico; mostram-se vazios
      payments.value = payments.value || []
      checkins.value = checkins.value || []
    }
  } finally { loading.value = false }
}

function goBack(){ router.push({ name: 'cooperados', query: { ...route.query } }) }

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

onMounted(load)
watch(idParam, load)
</script>

<template>
  <section>
    <!-- Breadcrumb acima do título -->
    <Breadcrumbs />
    <!-- Cabeçalho com avatar e botão editar -->
    <header class="mb-3 flex items-start justify-between gap-3">
      <div class="flex items-center gap-3 min-w-0">
        <div class="h-16 w-16 rounded-full overflow-hidden bg-zinc-200 text-zinc-600 flex items-center justify-center ring-2 ring-zinc-300">
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
        <li><button @click="activeTab='pagamentos'" :class="activeTab==='pagamentos'?'border-b-2 border-blue-600 text-blue-700':'text-zinc-600'" class="px-1 py-2">Pagamentos</button></li>
        <li><button @click="activeTab='presencas'" :class="activeTab==='presencas'?'border-b-2 border-blue-600 text-blue-700':'text-zinc-600'" class="px-1 py-2">Presenças</button></li>
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
            </div>
            <div class="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm border-t pt-3">
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
            <li v-for="d in documentosList" :key="String(d.id || d.label + d.url)" class="py-2 flex items-center justify-between gap-3">
              <div>
                <div class="font-medium">{{ d.label }}</div>
                <div class="text-xs text-zinc-500">Envio: {{ formatDate(d.dataEnvio) }}<span v-if="d.dataVencimento"> • Venc.: {{ formatDate(d.dataVencimento) }}</span></div>
              </div>
              <div>
                <a v-if="d.url" :href="d.url" target="_blank" rel="noopener" class="text-blue-600 hover:underline text-xs">abrir</a>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <!-- Pagamentos -->
      <div v-else-if="activeTab==='pagamentos'" class="card p-4">
        <div class="text-[11px] uppercase text-zinc-500 mb-2">Histórico de Pagamentos</div>
        <div v-if="!payments.length" class="text-sm text-zinc-500">Sem registros.</div>
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

      <!-- Presenças -->
      <div v-else-if="activeTab==='presencas'" class="card p-4">
        <div class="text-[11px] uppercase text-zinc-500 mb-2">Histórico de Presenças</div>
        <div v-if="!checkins.length" class="text-sm text-zinc-500">Sem registros.</div>
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
    </div>
  </section>
</template>
