import axios, { type AxiosInstance } from 'axios'

export async function loadPublicConfig(): Promise<any> {
  const resp = await fetch('/config.json')
  return resp.json()
}

export function createHttp(apiBaseUrl: string): AxiosInstance {
  const http = axios.create({ baseURL: apiBaseUrl, timeout: 15000 })
  return http
}

