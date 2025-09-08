import { createApi } from './api'
import { loadPublicConfig } from './http'
import AppConstants from '@/constants/AppConstants'
import type { User } from '@/types/User'

async function api() {
  const cfg = await loadPublicConfig()
  return createApi(cfg.api_url as string)
}

export async function listUsers(params?: URLSearchParams): Promise<User[]> {
  const http = await api()
  const { data } = await http.get<User[] | { data?: User[]; rows?: User[] }>(AppConstants.API_USERS, { params })
  return Array.isArray(data) ? data : (data?.data || data?.rows || [])
}

export async function getUser(id: string | number, params?: URLSearchParams): Promise<User> {
  const http = await api()
  const { data } = await http.get<User>(`${AppConstants.API_USERS_DETAIL}/${id}`, { params })
  return data as User
}

export async function createUser(form: Partial<User>, params?: URLSearchParams): Promise<User> {
  const http = await api()
  const { data } = await http.post<User>(AppConstants.API_USERS, form, { params })
  return data
}

export async function updateUser(form: Partial<User>, params?: URLSearchParams): Promise<User> {
  const http = await api()
  const { data } = await http.put<User>(AppConstants.API_USERS, form, { params })
  return data
}

export async function deleteUser(id: string | number, params?: URLSearchParams): Promise<{ success?: boolean } | any> {
  const http = await api()
  const { data } = await http.delete(`${AppConstants.API_USERS}/${id}`, { params })
  return data
}

