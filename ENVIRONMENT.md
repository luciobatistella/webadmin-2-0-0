# Configuração de Ambientes

Este projeto usa variáveis de ambiente para configurar diferentes URLs de API em desenvolvimento e produção.

## Como Funciona

O sistema carrega a URL da API seguindo esta ordem de prioridade:

1. **`VITE_API_URL`** (variável de ambiente) - **PRIORIDADE MÁXIMA**
2. **`public/config.json`** - Fallback se VITE_API_URL não existir

## Arquivos de Ambiente

### `.env.development`
Carregado automaticamente quando você roda:
```bash
npm run dev
```
- Define `VITE_API_URL=http://localhost:3000/`
- Útil para desenvolvimento local

### `.env.production`
Carregado automaticamente quando você faz build:
```bash
npm run build
```
- Define `VITE_API_URL=https://testapi.eventossp.app.br/`
- Usado em deploys (Vercel, Netlify, etc.)

### `.env.example`
Template de referência - **não é carregado automaticamente**

## Setup Inicial

1. **Desenvolvimento Local:**
   ```bash
   # Já está configurado! Apenas rode:
   npm run dev
   ```
   A URL `http://localhost:3000/` será usada automaticamente.

2. **Produção (Vercel):**
   - O arquivo `.env.production` já está configurado
   - A URL `https://testapi.eventossp.app.br/` será usada no build
   
   **OU** configure diretamente no Vercel:
   - Acesse: Project Settings → Environment Variables
   - Adicione: `VITE_API_URL` = `https://testapi.eventossp.app.br/`
   - Marque para: Production, Preview, Development

## Mudando a URL de Produção

**Opção 1: Editar `.env.production`** (recomendado)
```bash
# Edite o arquivo .env.production
VITE_API_URL=https://api.eventossp.app.br/
```

**Opção 2: Variável de Ambiente no Vercel**
- Acesse Project Settings → Environment Variables
- Edite `VITE_API_URL` com a nova URL
- Redeploy

## Firebase

Configure as credenciais do Firebase nos arquivos `.env.development` e `.env.production`:

```bash
VITE_FIREBASE_API_KEY=sua-api-key
VITE_FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=seu-projeto
VITE_FIREBASE_STORAGE_BUCKET=seu-projeto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

## Verificação

Para verificar qual URL está sendo usada:
1. Abra o Console do navegador (F12)
2. Digite: `localStorage.setItem('debug:http', '1')`
3. Recarregue a página
4. Veja os logs `[http][config]` no console

## Segurança

⚠️ **Importante:**
- Os arquivos `.env.development` e `.env.production` **PODEM** ser commitados (não contêm secrets)
- Se você criar um `.env.local` com credenciais sensíveis, ele **NÃO será commitado** (já está no .gitignore)
- As variáveis VITE_* são injetadas no build e ficam visíveis no código do navegador
- **Nunca coloque tokens secretos ou senhas em variáveis VITE_***

## Fallback

Se nenhuma variável de ambiente estiver definida, o sistema usa `public/config.json`:
```json
{
  "api_url": "https://testapi.eventossp.app.br/",
  "version": "2.0.0"
}
```
