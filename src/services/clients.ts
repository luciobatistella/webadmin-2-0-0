import { createApi } from './api'
import { loadPublicConfig } from './http'
import AppConstants from '@/constants/AppConstants'

async function api() {
  const cfg = await loadPublicConfig()
  return createApi(cfg.api_url as string)
}

export async function listClients(params?: URLSearchParams): Promise<any[]> {
  const http = await api()
  const { data } = await http.get(AppConstants.API_CLIENTS, { params })
  return data
}

export async function getClient(id: string | number, params?: URLSearchParams): Promise<any> {
  const http = await api()
  const { data } = await http.get(`${AppConstants.API_CLIENTS_DETAIL}/${id}`, { params })
  return data
}

export async function createClient(form: Record<string, any>, params?: URLSearchParams): Promise<any> {
  const http = await api()
  const { data } = await http.post(AppConstants.API_CLIENTS, form, { params })
  return data
}

export async function updateClient(form: Record<string, any>, params?: URLSearchParams): Promise<any> {
  const http = await api()
  const { data } = await http.put(AppConstants.API_CLIENTS, form, { params })
  return data
}

export async function findClientUnitLocation(idClient: string | number, params?: URLSearchParams): Promise<any> {
  const http = await api()
  const { data } = await http.get(`${AppConstants.API_CLIENTS_DETAIL_UNIT_LOCATION}/${idClient}`, { params })
  return data
}

export async function findClientUnitSel(idClient: string | number, params?: URLSearchParams): Promise<any> {
  const http = await api()
  const { data } = await http.get(`${AppConstants.API_CLIENTS_UNIT_SEL}/${idClient}`, { params })
  return data
}

async function tryEndpoints(method: 'get' | 'post' | 'put' | 'delete', variants: string[], body?: any, params?: URLSearchParams): Promise<any> {
  const http = await api()
  let lastErr: any
  for (const path of variants){
    try {
      let data
      if (method === 'get') {
        ({ data } = await http.get(path, { params }))
      } else if (method === 'delete') {
        ({ data } = await http.delete(path, { params }))
      } else {
        ;({ data } = await (http as any)[method](path, body, { params }))
      }
      return data
    } catch (e: any) {
      lastErr = e
      const status = e?.response?.status
      if (status !== 404 && status !== 405) throw e
    }
  }
  throw lastErr
}

export async function createClientUnit(idClient: string | number, form: Record<string, any>, params?: URLSearchParams): Promise<any> {
  const http = await api()
  const payload = {
    idCliente: idClient,
    nome: form?.nome ?? '',
    responsavel: form?.responsavel ?? '',
    telefone: form?.telefone ?? '',
    email: form?.email ?? '',
    endereco: form?.endereco ?? '',
    cep: form?.cep ?? '',
    bairro: form?.bairro ?? '',
    cidade: form?.cidade ?? '',
    uf: form?.uf ?? '',
    numero: form?.numero ?? '',
    complemento: form?.complemento ?? '',
    regiao: form?.regiao ?? '',
    qr_code_fixo: form?.qr_code_fixo ?? !!form?.qrcode_fixo,
  }
  const { data } = await http.post(AppConstants.API_CLIENTS_UNIT_LOCATION, payload, { params })
  return data
}

export async function updateClientUnit(idUnit: string | number, form: Record<string, any>, params?: URLSearchParams): Promise<any> {
  const http = await api()
  const payload = {
    id: idUnit,
    idCliente: form?.idCliente,
    nome: form?.nome ?? '',
    responsavel: form?.responsavel ?? '',
    telefone: form?.telefone ?? '',
    email: form?.email ?? '',
    endereco: form?.endereco ?? '',
    cep: form?.cep ?? '',
    bairro: form?.bairro ?? '',
    cidade: form?.cidade ?? '',
    uf: form?.uf ?? '',
    numero: form?.numero ?? '',
    complemento: form?.complemento ?? '',
    regiao: form?.regiao ?? '',
    qr_code_fixo: form?.qr_code_fixo ?? !!form?.qrcode_fixo,
  }
  const { data } = await http.put(AppConstants.API_CLIENTS_UNIT_LOCATION, payload, { params })
  return data
}

export async function createClientSector(form: Record<string, any>, params?: URLSearchParams): Promise<any> {
  const payload = {
    idCliente: form?.idCliente,
    id_unidade: form?.id_unidade ?? form?.local_id ?? form?.unidade_id,
    nome: form?.nome ?? form?.setor ?? '',
  }
  return await tryEndpoints('post', [
    AppConstants.API_CLIENT_SECTORS,
  ], payload, params)
}

export async function updateClientSector(form: Record<string, any>, params?: URLSearchParams): Promise<any> {
  const payload = {
    id: form?.id,
    idCliente: form?.idCliente,
    id_unidade: form?.id_unidade ?? form?.local_id ?? form?.unidade_id,
    nome: form?.nome ?? form?.setor ?? '',
  }
  return await tryEndpoints('put', [
    AppConstants.API_CLIENT_SECTORS,
  ], payload, params)
}

export async function deleteClientSector(id: string | number, params?: URLSearchParams): Promise<any> {
  return await tryEndpoints('delete', [
    `${AppConstants.API_CLIENT_SECTORS}/${id}`,
    `${AppConstants.API_CLIENTS_SECTOR}/${id}`,
    `${AppConstants.API_CLIENTS_SECTORS}/${id}`,
    `webadmin/cliente/setor/${id}`,
  ], null, params)
}

export async function createClientFuntion(form: Record<string, any>, params?: URLSearchParams): Promise<any> {
  const payload = {
    idCliente: form?.idCliente,
    local: form?.local,
    setor: form?.setor,
    atividade: form?.atividade,
    funcao: form?.funcao,
    uniforme: form?.uniforme,
    medicao: form?.medicao,
    cargaHoras: form?.cargaHoras,
    maximoAdic: form?.maximoAdic,
    horaNorProf: form?.horaNorProf,
    extraProf: form?.extraProf,
    noturnoProf: form?.noturnoProf,
    extraNotProf: form?.extraNotProf,
    horaNorCli: form?.horaNorCli,
    extraCli: form?.extraCli,
    noturnoCli: form?.noturnoCli,
    extraNotCli: form?.extraNotCli,
  }
  return await tryEndpoints('post', [
    `${AppConstants.API_CLIENTS}/${form?.idCliente}/funcoes`,
    AppConstants.API_CLIENTS_FUNCTION,
    AppConstants.API_CLIENTS_FUNCTIONS,
  ], payload, params)
}
export async function createClientFunction(form: Record<string, any>, params?: URLSearchParams): Promise<any> {
  return await createClientFuntion(form, params)
}

export async function updateClientFunction(form: Record<string, any>, params?: URLSearchParams): Promise<any> {
  const payload = {
    id: form?.id,
    idCliente: form?.idCliente,
    local: form?.local,
    setor: form?.setor,
    atividade: form?.atividade,
    funcao: form?.funcao,
    uniforme: form?.uniforme,
    medicao: form?.medicao,
    cargaHoras: form?.cargaHoras,
    maximoAdic: form?.maximoAdic,
    horaNorProf: form?.horaNorProf,
    extraProf: form?.extraProf,
    noturnoProf: form?.noturnoProf,
    extraNotProf: form?.extraNotProf,
    horaNorCli: form?.horaNorCli,
    extraCli: form?.extraCli,
    noturnoCli: form?.noturnoCli,
    extraNotCli: form?.extraNotCli,
  }
  return await tryEndpoints('put', [
    `${AppConstants.API_CLIENTS}/${form?.idCliente}/funcoes/${form?.id}`,
    AppConstants.API_CLIENTS_FUNCTION,
    AppConstants.API_CLIENTS_FUNCTIONS,
  ], payload, params)
}
export async function deleteClientFunction(idCliente: string | number, idFuncao: string | number, params?: URLSearchParams): Promise<any> {
  return await tryEndpoints('delete', [
    `${AppConstants.API_CLIENTS}/${idCliente}/funcoes/${idFuncao}`,
    `${AppConstants.API_CLIENTS_FUNCTIONS}/${idFuncao}`,
    `${AppConstants.API_CLIENTS_FUNCTION}/${idFuncao}`,
  ], null, params)
}

export async function createClientUsers(form: Record<string, any>, params?: URLSearchParams): Promise<any> {
  const http = await api()
  const payload = { ...form }
  const { data } = await http.post(AppConstants.API_CLIENTS_USERS, payload, { params })
  return data
}
export async function updateClientUsers(form: Record<string, any>, params?: URLSearchParams): Promise<any> {
  const http = await api()
  const payload = { ...form }
  const { data } = await http.put(AppConstants.API_CLIENTS_USERS, payload, { params })
  return data
}
export async function deleteClientUsers(id: string | number, idUser: string | number, params?: URLSearchParams): Promise<any> {
  const http = await api()
  const { data } = await http.delete(`${AppConstants.API_CLIENTS_USERS}/${id}/${idUser}`, { params })
  return data
}

export async function createClientManagers(form: Record<string, any>, params?: URLSearchParams): Promise<any> {
  const http = await api()
  const payload = { ...form }
  const { data } = await http.post(AppConstants.API_CLIENTS_MANAGERS, payload, { params })
  return data
}
export async function updateClientManagers(form: Record<string, any>, params?: URLSearchParams): Promise<any> {
  const http = await api()
  const payload = { ...form }
  const { data } = await http.put(AppConstants.API_CLIENTS_MANAGERS, payload, { params })
  return data
}
export async function deleteClientManagers(id: string | number, params?: URLSearchParams): Promise<any> {
  const http = await api()
  const { data } = await http.delete(`${AppConstants.API_CLIENTS_MANAGERS}/${id}`, { params })
  return data
}

export async function deleteClientUnit(idUnit: string | number, params?: URLSearchParams): Promise<any> {
  return await tryEndpoints('delete', [
    `webadmin/clientes/unidades/${idUnit}`,
    `webadmin/clientes/unidade/${idUnit}`,
    `webadmin/cliente/unidades/${idUnit}`,
    `webadmin/cliente/unidade/${idUnit}`,
    `webadmin/unidades/${idUnit}`,
    `webadmin/unidade/${idUnit}`,
  ], null, params)
}

export async function findTaxSituation(params?: URLSearchParams): Promise<any> {
  const http = await api()
  const { data } = await http.get(AppConstants.API_CLIENTS_TAX_SITUATION, { params })
  return data
}

export async function findClientSector(idClient: string | number, params?: URLSearchParams): Promise<any> {
  const http = await api()
  const { data } = await http.get(`${AppConstants.API_CLIENTS_SECTORS}/${idClient}`, { params })
  return data
}

export async function findClientFunctions(idClient: string | number, params?: URLSearchParams): Promise<any> {
  return await tryEndpoints('get', [
    `${AppConstants.API_CLIENTS}/${idClient}/funcoes`,
    `${AppConstants.API_CLIENTS_FUNCTIONS}/${idClient}`,
  ], null, params)
}

export async function listAtividades(params?: URLSearchParams): Promise<Array<{ value: string | number; text: string }>> {
  const http = await api()
  const { data } = await http.get(AppConstants.API_CLIENTS_ACTIVITIES, { params })
  const src = (data as any)?.apoio_funcao ?? (data as any)?.data ?? (data as any)?.rows ?? data
  const rows = Array.isArray(src) ? src : []
  return rows.map((it: any, idx: number) => {
    if (typeof it !== 'object' || it === null) return { value: String(idx+1), text: String(it) }
    const value = it.value ?? it.id ?? it.codigo ?? idx+1
    const text  = it.text ?? it.profissao ?? it.nome ?? it.name ?? it.label ?? JSON.stringify(it)
    return { value, text }
  })
}

export async function findClientUsers(idClient: string | number, params?: URLSearchParams): Promise<any> {
  const http = await api()
  const { data } = await http.get(`${AppConstants.API_CLIENTS_USERS}/${idClient}`, { params })
  return data
}

export async function findClientManagers(idClient: string | number, params?: URLSearchParams): Promise<any> {
  const http = await api()
  const { data } = await http.get(`${AppConstants.API_CLIENTS_MANAGERS}/${idClient}`, { params })
  return data
}

const _cache = {
  setores: new Map<string | number, any[]>(),
  funcoes: new Map<string, any[]>(),
}

export async function listSetores(local_id: string | number, params?: URLSearchParams): Promise<any[]> {
  if (!local_id) return []
  if (_cache.setores.has(local_id)) return _cache.setores.get(local_id) as any[]
  const http = await api()
  const { data } = await http.get(`webadmin/clientes/usuarios/setores/${local_id}`, { params })
  const rows = (data as any)?.data || (data as any)?.rows || data || []
  _cache.setores.set(local_id, rows)
  return rows
}

export async function listFuncoes(local_id: string | number, setor: string | number, params?: URLSearchParams): Promise<any[]> {
  if (!local_id || !setor) return []
  const key = `${local_id}|${setor}`
  if (_cache.funcoes.has(key)) return _cache.funcoes.get(key) as any[]
  const http = await api()
  const { data } = await http.get('webadmin/clientes/funcoes', { params: { ...Object.fromEntries(params ?? []), local_id, setor } })
  const rows = (data as any)?.data || (data as any)?.rows || data || []
  _cache.funcoes.set(key, rows)
  return rows
}

export async function listRegioes(params?: URLSearchParams): Promise<any[]> {
  const http = await api()
  const { data } = await http.get(AppConstants.API_REGIONS, { params })
  return data
}

