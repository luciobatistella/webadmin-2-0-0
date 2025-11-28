/**
 * Serviço de upload via Backend
 * 
 * Rotas disponíveis:
 * - POST /upload/foto-perfil
 * - POST /upload/foto-atestado
 * - POST /upload/foto-uniforme
 * - POST /upload/antecedentes-criminais
 * - POST /upload/multiplos
 * - POST /upload/faturamento/boleto/:id
 * 
 * Todos enviam formData com campo "file"
 * Para atualizar na base, enviar também: cooperativa, matricula
 */

import { createApi } from './api'
import { loadPublicConfig } from './http'

async function getApi() {
  const cfg = await loadPublicConfig()
  return createApi(cfg.api_url as string)
}

export type UploadResult = { 
  path: string // Caminho do arquivo salvo no servidor
  url: string  // URL pública para acessar o arquivo
}

/**
 * Mapeamento de docType para endpoint específico
 */
const DOC_TYPE_ENDPOINTS: Record<string, string> = {
  fotoPerfil: '/upload/foto-perfil',
  fotoAtestado: '/upload/foto-atestado',
  fotoUniforme: '/upload/foto-uniforme',
  antecedentesCriminais: '/upload/antecedentes-criminais',
}

/**
 * Faz upload de documento via backend
 * 
 * @param docType - Tipo do documento (fotoPerfil, fotoAtestado, fotoUniforme, antecedentesCriminais)
 * @param file - Arquivo a ser enviado
 * @param opts - Opções adicionais (cooperativa, matricula para atualizar na base)
 */
export async function uploadDocument(
  docType: string, 
  file: File, 
  opts?: { cooperativa?: string; matricula?: string }
): Promise<UploadResult> {
  try {
    console.log('📤 Iniciando upload via Backend')
    console.log('  - Tipo:', docType)
    console.log('  - Arquivo:', file.name)
    console.log('  - Tamanho:', (file.size / 1024).toFixed(2), 'KB')
    console.log('  - Content-Type:', file.type)
    
    const api = await getApi()
    const cfg = await loadPublicConfig()
    
    // Determinar endpoint baseado no tipo de documento
    const endpoint = DOC_TYPE_ENDPOINTS[docType] || '/upload/foto-perfil'
    
    // Cria FormData para enviar o arquivo
    const formData = new FormData()
    formData.append('file', file)
    
    // Se forneceu cooperativa e matrícula, envia para atualizar na base
    if (opts?.cooperativa) {
      formData.append('cooperativa', opts.cooperativa)
    }
    if (opts?.matricula) {
      formData.append('matricula', opts.matricula)
    }
    
    console.log('  - Endpoint:', `${cfg.api_url}${endpoint}`)
    console.log('  - Atualizar base:', !!(opts?.cooperativa && opts?.matricula))
    console.log('⏳ Enviando arquivo...')
    
    // Envia para o backend
    const response = await api.post(endpoint, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      // Timeout maior para arquivos grandes
      timeout: 60000, // 60 segundos
    })
    
    console.log('✅ Upload concluído!')
    console.log('  - Resposta:', response.data)
    
    // Backend retorna: { url: "https://..." } ou { path: "...", url: "..." }
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

/**
 * Upload múltiplo de documentos
 * Apenas faz upload no Firebase e retorna as URLs, não atualiza na base
 * 
 * @param files - Objeto com os arquivos a serem enviados
 * @returns Objeto com as URLs dos arquivos enviados
 */
export async function uploadMultiplos(files: {
  fotoPerfil?: File
  fotoAtestado?: File
  fotoUniforme?: File
  antecedentesCriminais?: File
  boleto?: File
}): Promise<Record<string, string>> {
  try {
    console.log('📤 Iniciando upload múltiplo')
    
    const api = await getApi()
    const cfg = await loadPublicConfig()
    
    // Cria FormData com todos os arquivos
    const formData = new FormData()
    
    if (files.fotoPerfil) formData.append('fotoPerfil', files.fotoPerfil)
    if (files.fotoAtestado) formData.append('fotoAtestado', files.fotoAtestado)
    if (files.fotoUniforme) formData.append('fotoUniforme', files.fotoUniforme)
    if (files.antecedentesCriminais) formData.append('antecedentesCriminais', files.antecedentesCriminais)
    if (files.boleto) formData.append('boleto', files.boleto)
    
    console.log('  - Endpoint:', `${cfg.api_url}/upload/multiplos`)
    console.log('⏳ Enviando arquivos...')
    
    const response = await api.post('/upload/multiplos', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 120000, // 2 minutos para múltiplos arquivos
    })
    
    console.log('✅ Upload múltiplo concluído!')
    console.log('  - Resposta:', response.data)
    
    // Backend retorna: { fotoPerfil: "url", fotoAtestado: "url", ... }
    return response.data || {}
    
  } catch (error: any) {
    console.error('❌ Erro no upload múltiplo:', error)
    throw new Error(error?.response?.data?.error || error?.message || 'Erro ao fazer upload múltiplo')
  }
}

/**
 * Upload de boleto de faturamento
 * 
 * @param faturamentoId - ID do faturamento
 * @param file - Arquivo do boleto
 * @param faturamentoData - Dados adicionais do faturamento
 */
export async function uploadBoletoFaturamento(
  faturamentoId: string | number,
  file: File,
  faturamentoData?: Record<string, any>
): Promise<UploadResult> {
  try {
    console.log('📤 Iniciando upload de boleto de faturamento')
    console.log('  - ID:', faturamentoId)
    console.log('  - Arquivo:', file.name)
    
    const api = await getApi()
    const cfg = await loadPublicConfig()
    
    const formData = new FormData()
    formData.append('file', file)
    
    // Adiciona dados adicionais do faturamento se fornecidos
    if (faturamentoData) {
      Object.entries(faturamentoData).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          formData.append(key, String(value))
        }
      })
    }
    
    const endpoint = `/upload/faturamento/boleto/${faturamentoId}`
    console.log('  - Endpoint:', `${cfg.api_url}${endpoint}`)
    console.log('⏳ Enviando boleto...')
    
    const response = await api.post(endpoint, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 60000,
    })
    
    console.log('✅ Upload de boleto concluído!')
    console.log('  - Resposta:', response.data)
    
    const result = response.data
    
    return {
      path: result.path || file.name,
      url: result.url || '',
    }
    
  } catch (error: any) {
    console.error('❌ Erro no upload de boleto:', error)
    throw new Error(error?.response?.data?.error || error?.message || 'Erro ao fazer upload do boleto')
  }
}
