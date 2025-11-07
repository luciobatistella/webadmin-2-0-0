/**
 * Serviço de envio de SMS para verificação de telefone
 * 
 * Integração com endpoint do backend /webadmin/sms
 */

import { createApi } from './api'
import { loadPublicConfig } from './http'

async function getApi() {
  const cfg = await loadPublicConfig()
  return createApi(cfg.api_url as string)
}

interface SendSMSParams {
  phone: string // Telefone em formato E.164 (ex: +5511999999999)
  code: string // Código de verificação (6 dígitos)
}

interface SendSMSResponse {
  success: boolean
  message?: string
  error?: string
}

/**
 * Envia SMS com código de verificação via backend
 */
export async function sendVerificationSMS(params: SendSMSParams): Promise<SendSMSResponse> {
  try {
    const message = `Seu código de verificação é: ${params.code}. Válido por 5 minutos.`
    
    // Remove +55 ou 55 do início do telefone, enviando apenas DDD + número
    const phoneWithoutCountryCode = params.phone.replace(/^\+?55/, '')
    
    console.log('=== DEBUG SMS ===')
    console.log('📱 Telefone original (E.164):', params.phone)
    console.log('📱 Telefone processado (sem +55):', phoneWithoutCountryCode)
    console.log('💬 Mensagem:', message)
    console.log('🔢 Código:', params.code)
    
    const api = await getApi()
    const cfg = await loadPublicConfig()
    console.log('🌐 API Base URL:', cfg.api_url)
    console.log('📡 Endpoint completo:', `${cfg.api_url}/webadmin/sms`)
    
    const payload = {
      phone: phoneWithoutCountryCode,
      message: message,
    }
    console.log('📦 Payload enviado:', JSON.stringify(payload, null, 2))
    
    const response = await api.post('/webadmin/sms', payload)
    
    console.log('✅ Resposta recebida:')
    console.log('  - Status:', response.status)
    console.log('  - Data:', JSON.stringify(response.data, null, 2))
    console.log('=== FIM DEBUG SMS ===')

    // Adapte conforme a resposta do seu backend
    if (response.data?.success || response.status === 200) {
      return {
        success: true,
        message: response.data?.message || 'SMS enviado com sucesso'
      }
    }

    return {
      success: false,
      error: response.data?.error || 'Erro ao enviar SMS'
    }

  } catch (error: any) {
    console.error('=== ERRO SMS ===')
    console.error('❌ Erro ao enviar SMS:', error)
    console.error('📋 Detalhes do erro:')
    console.error('  - Message:', error?.message)
    console.error('  - Code:', error?.code)
    console.error('  - Response Status:', error?.response?.status)
    console.error('  - Response Data:', JSON.stringify(error?.response?.data, null, 2))
    console.error('  - Config URL:', error?.config?.url)
    console.error('  - Config Method:', error?.config?.method)
    console.error('  - Config Data:', error?.config?.data)
    console.error('=== FIM ERRO SMS ===')
    
    if (error.code === 'ECONNABORTED') {
      return {
        success: false,
        error: 'Timeout ao enviar SMS. Tente novamente.'
      }
    }

    const errorMsg = error?.response?.data?.error 
      || error?.response?.data?.message 
      || error?.message 
      || 'Erro ao enviar SMS'

    return {
      success: false,
      error: errorMsg
    }
  }
}
