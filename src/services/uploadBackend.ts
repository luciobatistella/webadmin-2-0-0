/**
 * Serviço de upload via Backend
 * 
 * Como alternativa ao Firebase Storage (que tem problemas de CORS),
 * este serviço envia arquivos diretamente para o backend,
 * que pode então:
 * 1. Salvar localmente no servidor
 * 2. Fazer upload para Firebase Storage (sem CORS pois é server-to-server)
 * 3. Enviar para qualquer outro storage (S3, Cloudinary, etc)
 */

import { createApi } from './api'
import { loadPublicConfig } from './http'

async function getApi() {
  const cfg = await loadPublicConfig()
  return createApi(cfg.api_url as string)
}

export type UploadResult = { 
  fullPath: string
  downloadURL: string
  publicUrl?: string
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
    
    // Adapte conforme a resposta do seu backend
    const result = response.data
    
    return {
      fullPath: result.path || result.fullPath || file.name,
      downloadURL: result.url || result.downloadURL || '',
      publicUrl: result.publicUrl || result.url,
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
