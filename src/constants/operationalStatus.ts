// Configuração centralizada dos Status Operacionais
// Atualize apenas este arquivo para mudar nomes/labels e mapeamentos.

export type OpStatusKey =
  | 'disponivel'
  | 'contratacao'
  | 'pre_doc'
  | 'agendado'
  | 'trabalhando'
  | 'concluido'
  | 'faltou_cancelou'

export type OpStatusItem = {
  key: OpStatusKey
  label: string
  // termos que podem aparecer em status do backend e que mapeiam para este key
  synonyms: string[]
}

// Lista padrão atual (substitua labels/synonyms conforme os novos status oficiais)
export const OP_STATUS_LIST: OpStatusItem[] = [
  { key: 'disponivel', label: 'Disponível', synonyms: ['disponivel', 'livre', 'disponível'] },
  { key: 'contratacao', label: 'Contratação', synonyms: ['contratacao', 'processo', 'convite', 'contratação'] },
  { key: 'pre_doc', label: 'Pré-doc', synonyms: ['pre', 'pré', 'aguardando', 'documenta', 'documentação'] },
  { key: 'agendado', label: 'Agendado', synonyms: ['agendado', 'escalado', 'escala'] },
  { key: 'trabalhando', label: 'Trabalhando', synonyms: ['trabalhando', 'check-in', 'checkin'] },
  { key: 'concluido', label: 'Concluído', synonyms: ['concluido', 'concluído', 'check-out', 'checkout'] },
  { key: 'faltou_cancelou', label: 'Faltou / Cancelou', synonyms: ['faltou', 'cancelou', 'no show', 'noshow'] },
]

export const OP_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  OP_STATUS_LIST.map((it) => [it.key, it.label])
)

// Normaliza um texto qualquer para tentar mapear para uma das chaves
export function normalizeOpStatusKey(raw: unknown): OpStatusKey | '' {
  const s = String(raw || '').toLowerCase()
  if (!s) return ''
  for (const it of OP_STATUS_LIST) {
    for (const syn of it.synonyms) {
      if (s.includes(syn)) return it.key
    }
  }
  return ''
}
