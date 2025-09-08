import { createApi } from './api'
import { loadPublicConfig } from './http'
import AppConstants from '@/constants/AppConstants'

async function api() {
  const cfg = await loadPublicConfig()
  return createApi(cfg.api_url as string)
}

export async function getAdminConfig(params?: URLSearchParams): Promise<any> {
  const http = await api()
  const { data } = await http.get(AppConstants.API_ADMIN_CONFIG, { params })
  return data
}

export async function updateAdminConfig(form: Record<string, any>, params?: URLSearchParams): Promise<any> {
  const http = await api()
  const { data } = await http.put(AppConstants.API_ADMIN_CONFIG, form, { params })
  return data
}

