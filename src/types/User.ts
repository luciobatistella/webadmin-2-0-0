export interface User {
  id: number | string
  name?: string
  nome?: string
  usuario?: string
  email?: string
  role?: string
  perfil?: string
  active?: boolean | number
  ativo?: boolean | number
}

export interface AuthResult {
  token?: string
  access_token?: string
  data?: { token?: string } & Record<string, unknown>
  [key: string]: unknown
}

