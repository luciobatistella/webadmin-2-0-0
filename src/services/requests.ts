import { createApi } from './api'
import { loadPublicConfig } from './http'
import AppConstants from '@/constants/AppConstants'
import type { RequestItem } from '@/types/Request'

async function api() {
  const cfg = await loadPublicConfig()
  return createApi(cfg.api_url as string)
}

export async function listRequests(params?: URLSearchParams): Promise<RequestItem[]> {
  const http = await api()
  const { data } = await http.get<RequestItem[] | { data?: RequestItem[]; rows?: RequestItem[] }>(AppConstants.API_REQUESTS, { params })
  return Array.isArray(data) ? data : (data?.data || data?.rows || [])
}

export async function getRequest(id: string | number, params?: URLSearchParams): Promise<RequestItem> {
  const http = await api()
  const { data } = await http.get<RequestItem>(`${AppConstants.API_REQUESTS_DETAIL}/${id}`, { params })
  return data
}

