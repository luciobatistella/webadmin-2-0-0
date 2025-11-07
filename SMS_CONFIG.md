# Configuração de SMS para Verificação de Telefone

Este documento descreve como funciona o envio de SMS para verificação de telefone dos cooperados.

## 📱 Como Funciona

1. **Usuário preenche o telefone** no formulário de cooperado
2. **Clica em "Verificar"** → sistema gera código de 6 dígitos
3. **SMS é enviado** automaticamente via backend (`POST /webadmin/sms`)
4. **Usuário digita o código** recebido por SMS
5. **Sistema valida** e marca o telefone como verificado

## 🔧 Integração

### Endpoint Backend

O frontend faz uma chamada para o endpoint do seu backend:

```
POST /webadmin/sms
```

### Payload Enviado

```json
{
  "phone": "5511999999999",
  "message": "Seu código de verificação é: 123456. Válido por 5 minutos."
}
```

**Campos:**
- `phone` (string): Telefone em formato E.164 (+55 seguido de DDD e número)
- `message` (string): Mensagem completa já formatada com o código

### Resposta Esperada

**Sucesso (200):**
```json
{
  "success": true,
  "message": "SMS enviado com sucesso"
}
```

**Erro (4xx/5xx):**
```json
{
  "success": false,
  "error": "Descrição do erro"
}
```

## � Implementação Backend

O backend recebe a requisição e se encarrega de:

1. Validar o telefone
2. Chamar provedor de SMS (Twilio, Zenvia, Total Voice, etc.)
3. Retornar sucesso ou erro

### Exemplo de Implementação (Node.js/Express)

```javascript
app.post('/webadmin/sms', async (req, res) => {
  try {
    const { phone, message } = req.body
    
    // Validação
    if (!phone || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Phone e message são obrigatórios' 
      })
    }
    
    // Chamar provedor de SMS (exemplo genérico)
    await smsProvider.send({
      to: phone,
      text: message
    })
    
    res.json({ 
      success: true, 
      message: 'SMS enviado com sucesso' 
    })
    
  } catch (error) {
    console.error('Erro ao enviar SMS:', error)
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Erro ao enviar SMS' 
    })
  }
})
```

## 🔌 Provedores de SMS

### Twilio

```javascript
const twilio = require('twilio')
const client = twilio(ACCOUNT_SID, AUTH_TOKEN)

await client.messages.create({
  body: message,
  from: '+5511999999999', // Seu número Twilio
  to: phone
})
```

### Zenvia

```javascript
const axios = require('axios')

await axios.post('https://api.zenvia.com/v2/channels/sms/messages', {
  from: 'SuaMarca',
  to: phone,
  contents: [{ type: 'text', text: message }]
}, {
  headers: { 'X-API-TOKEN': ZENVIA_TOKEN }
})
```

### Total Voice

```javascript
const axios = require('axios')

await axios.post('https://api.totalvoice.com.br/sms', {
  numero_destino: phone.substring(2), // Remove +55
  mensagem: message
}, {
  headers: { 'Access-Token': TOTALVOICE_TOKEN }
})
```

## 🧪 Teste

### 1. Teste Manual no Frontend

1. Acesse a página de novo cooperado
2. Preencha um telefone válido
3. Clique em "Verificar"
4. Verifique o console do navegador para logs
5. Confira se o SMS chegou

### 2. Teste do Endpoint Backend

```bash
curl -X POST http://localhost:3000/webadmin/sms \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "5511999999999",
    "message": "Teste de SMS"
  }'
```

### 3. Logs de Debug

No navegador, ative logs detalhados:
```javascript
localStorage.setItem('debug:http', '1')
```

Recarregue a página e veja os logs de requisições no console.

## 🔒 Segurança

✅ **Vantagens desta abordagem:**
- Tokens de SMS ficam **seguros no backend**
- Frontend não precisa de credenciais sensíveis
- Backend pode implementar rate limiting
- Logs centralizados no servidor

⚠️ **Recomendações:**
- Implemente rate limiting (máximo de SMSs por hora/dia por usuário)
- Valide formato do telefone no backend
- Monitore custos de SMS no provedor
- Registre logs de envios para auditoria

## 📊 Rate Limiting

Exemplo de proteção contra abuso:

```javascript
const rateLimit = {}

app.post('/webadmin/sms', async (req, res) => {
  const { phone } = req.body
  const key = `sms:${phone}`
  const now = Date.now()
  
  // Permitir apenas 1 SMS a cada 60 segundos
  if (rateLimit[key] && now - rateLimit[key] < 60000) {
    return res.status(429).json({
      success: false,
      error: 'Aguarde 60 segundos para reenviar'
    })
  }
  
  rateLimit[key] = now
  
  // ... resto da lógica
})
```

## � Monitoramento

Monitore métricas importantes:

- **Taxa de sucesso**: % de SMSs entregues com sucesso
- **Tempo de resposta**: Latência do provedor de SMS
- **Custo**: Número de SMSs enviados × custo unitário
- **Erros**: Telefones inválidos, falhas de API

## 💰 Custos Estimados

Provedores brasileiros (preços aproximados):

- **Twilio**: ~R$ 0,15 por SMS
- **Zenvia**: ~R$ 0,10 por SMS  
- **Total Voice**: ~R$ 0,08 por SMS

**Proteção de custos:**
- Cooldown de 60s (frontend) ✅
- Rate limiting (backend) ⚠️ Implementar
- Validação de telefone ✅
- Logs de abuso 📋 Recomendado

## 🐛 Troubleshooting

**Frontend mostra "Erro ao enviar SMS"**
1. Verifique console do navegador (F12)
2. Veja se a requisição chegou ao backend
3. Confira logs do backend

**Backend retorna erro 400/500**
1. Verifique formato do payload
2. Confirme credenciais do provedor SMS
3. Teste endpoint diretamente (curl/Postman)

**SMS não chega**
1. Confirme telefone está em formato correto (+5511...)
2. Verifique créditos no provedor de SMS
3. Consulte logs/dashboard do provedor
4. Teste com outro número

**Erro de timeout**
1. Aumente timeout do axios (padrão: 60s)
2. Verifique latência do provedor SMS
3. Implemente retry no backend

## ✅ Checklist

- [ ] Endpoint `/webadmin/sms` implementado no backend
- [ ] Provedor de SMS configurado (Twilio/Zenvia/Total Voice)
- [ ] Credenciais seguras no backend (.env)
- [ ] Rate limiting implementado
- [ ] Testado em desenvolvimento
- [ ] Testado em produção
- [ ] Logs de auditoria configurados
- [ ] Monitoramento de custos ativo
