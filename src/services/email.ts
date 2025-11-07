/**
 * Serviço de envio de Email para verificação
 * 
 * Integração com endpoint do backend /webadmin/email
 */

import { createApi } from './api'
import { loadPublicConfig } from './http'

async function getApi() {
  const cfg = await loadPublicConfig()
  return createApi(cfg.api_url as string)
}

interface SendEmailParams {
  email: string // Email do usuário
  code: string // Código de verificação (6 dígitos)
}

interface SendEmailResponse {
  success: boolean
  message?: string
  error?: string
}

/**
 * Envia email com código de verificação via backend
 */
export async function sendVerificationEmail(params: SendEmailParams): Promise<SendEmailResponse> {
  try {
    const message = `Seu código de verificação é: ${params.code}. Válido por 5 minutos.`
    
    console.log('=== DEBUG EMAIL ===')
    console.log('📧 Email:', params.email)
    console.log('💬 Mensagem:', message)
    console.log('🔢 Código:', params.code)
    
    const api = await getApi()
    const cfg = await loadPublicConfig()
    console.log('🌐 API Base URL:', cfg.api_url)
    console.log('📡 Endpoint completo:', `${cfg.api_url}/webadmin/email`)
    
    const payload = {
      email: params.email,
      subject: 'Código de Verificação - EventosSP',
      message: message,
    }
    console.log('📦 Payload enviado:', JSON.stringify(payload, null, 2))
    
    const response = await api.post('/webadmin/email', payload)
    
    console.log('✅ Resposta recebida:')
    console.log('  - Status:', response.status)
    console.log('  - Data:', JSON.stringify(response.data, null, 2))
    console.log('=== FIM DEBUG EMAIL ===')

    // Adapte conforme a resposta do seu backend
    if (response.data?.success || response.status === 200) {
      return {
        success: true,
        message: response.data?.message || 'Email enviado com sucesso'
      }
    }

    return {
      success: false,
      error: response.data?.error || 'Erro ao enviar email'
    }

  } catch (error: any) {
    console.error('=== ERRO EMAIL ===')
    console.error('❌ Erro ao enviar email:', error)
    console.error('📋 Detalhes do erro:')
    console.error('  - Message:', error?.message)
    console.error('  - Code:', error?.code)
    console.error('  - Response Status:', error?.response?.status)
    console.error('  - Response Data:', JSON.stringify(error?.response?.data, null, 2))
    console.error('  - Config URL:', error?.config?.url)
    console.error('  - Config Method:', error?.config?.method)
    console.error('  - Config Data:', error?.config?.data)
    console.error('=== FIM ERRO EMAIL ===')
    
    if (error.code === 'ECONNABORTED') {
      return {
        success: false,
        error: 'Timeout ao enviar email. Tente novamente.'
      }
    }

    const errorMsg = error?.response?.data?.error 
      || error?.response?.data?.message 
      || error?.message 
      || 'Erro ao enviar email'

    return {
      success: false,
      error: errorMsg
    }
  }
}
