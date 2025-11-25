/**
 * Serviço de upload via Backend
 * 
 * Envia arquivos para o backend que salva em disco local.
 * O banco de dados armazena apenas o caminho do arquivo.
 */

import { createApi } from './api'
import { loadPublicConfig } from './http'

async function getApi() {
  const cfg = await loadPublicConfig()
  return createApi(cfg.api_url as string)
}

export type UploadResult = { 
  path: string // Caminho do arquivo salvo no servidor (ex: uploads/anon/rgFrente/2025-11-13-RG.pdf)
  url: string  // URL pública para acessar o arquivo (ex: https://api.com/uploads/...)
}

/**
 * Faz upload de documento via backend
 * 
 * Endpoint esperado: POST /webadmin/upload
 * 
 * Aceita multipart/form-data com:
 * - file: File (o arquivo)
 * - docType: string (rgFrente, rgVerso, etc)
 * - cooperadoId: string (opcional, default: 'anon')
 */
export async function uploadDocument(
  docType: string, 
  file: File, 
  opts?: { cooperadoId?: string }
): Promise<UploadResult> {
  try {
    console.log('📤 Iniciando upload via Backend')
    console.log('  - Tipo:', docType)
    console.log('  - Arquivo:', file.name)
    console.log('  - Tamanho:', (file.size / 1024).toFixed(2), 'KB')
    console.log('  - Content-Type:', file.type)
    
    const api = await getApi()
    const cfg = await loadPublicConfig()
    
    // Cria FormData para enviar o arquivo
    const formData = new FormData()
    formData.append('file', file)
    formData.append('docType', docType)
    formData.append('cooperadoId', opts?.cooperadoId || 'anon')
    
    console.log('  - Endpoint:', `${cfg.api_url}/webadmin/upload`)
    console.log('⏳ Enviando arquivo...')
    
    // Envia para o backend
    const response = await api.post('/webadmin/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      // Timeout maior para arquivos grandes
      timeout: 60000, // 60 segundos
    })
    
    console.log('✅ Upload concluído!')
    console.log('  - Resposta:', response.data)
    
    // Backend deve retornar: { success: true, path: "caminho/arquivo", url: "https://..." }
    const result = response.data
    
    return {
      path: result.path || result.fullPath || file.name,
      url: result.url || result.publicUrl || result.downloadURL || '',
    }
    
  } catch (error: any) {
    console.error('❌ Erro no upload via Backend:', error)
    console.error('  - Message:', error.message)
    console.error('  - Response Status:', error?.response?.status)
    console.error('  - Response Data:', error?.response?.data)
    
    // Mensagem de erro amigável
    let errorMessage = 'Erro ao fazer upload do arquivo'
    
    if (error?.response?.status === 413) {
      errorMessage = 'Arquivo muito grande. Tamanho máximo: 10MB'
    } else if (error?.response?.status === 415) {
      errorMessage = 'Tipo de arquivo não suportado. Use PDF ou imagens'
    } else if (error?.code === 'ECONNABORTED') {
      errorMessage = 'Timeout: arquivo demorou muito para enviar'
    } else if (error?.response?.data?.error) {
      errorMessage = error.response.data.error
    } else if (error?.message) {
      errorMessage = error.message
    }
    
    throw new Error(errorMessage)
  }
}
