export interface Client {
  id: number | string
  name?: string
  nome_comercial?: string
  razao_social?: string
  cnpj?: string
  cpf_cnpj?: string
  document?: string
  email?: string
  active?: boolean | number
  ativo?: boolean | number
  unidade?: { nome?: string } | null
  nome_unidade?: string
  unidade_nome?: string
  [key: string]: unknown
}

