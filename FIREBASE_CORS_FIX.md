# Configuração CORS - Firebase Storage

## Problema

Erro ao fazer upload de arquivos para o Firebase Storage:

```
Access to XMLHttpRequest at 'https://firebasestorage.googleapis.com/...' from origin 'https://eventossp.menumaster.app.br' has been blocked by CORS policy
```

## Solução

O Firebase Storage precisa de configuração CORS para aceitar requisições do seu domínio.

### Opção 1: Aplicar CORS via Google Cloud Console (Recomendado)

1. **Instale o Google Cloud CLI** (se ainda não tiver):
   - Windows: https://cloud.google.com/sdk/docs/install
   - Ou use o Cloud Shell no console do Google Cloud

2. **Configure o CORS** executando no terminal:

```bash
# Autentique-se (se necessário)
gcloud auth login

# Configure o projeto
gcloud config set project eventossp-69c43

# Aplique o CORS ao bucket
gsutil cors set firebase-cors.json gs://eventossp-69c43.appspot.com
```

3. **Verifique se foi aplicado**:

```bash
gsutil cors get gs://eventossp-69c43.appspot.com
```

### Opção 2: Via Console Web do Firebase

1. Acesse https://console.cloud.google.com/storage/browser
2. Selecione o projeto `eventossp-69c43`
3. Encontre o bucket `eventossp-69c43.appspot.com`
4. Clique em **Permissions** (Permissões)
5. Na aba **CORS**, adicione a configuração:

```json
[
  {
    "origin": ["*"],
    "method": ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"],
    "maxAgeSeconds": 3600,
    "responseHeader": ["Content-Type", "Authorization", "Content-Length", "User-Agent", "X-Requested-With"]
  }
]
```

### Opção 3: Restringir apenas ao seu domínio (Mais Seguro)

Se quiser restringir apenas ao domínio da aplicação, use:

```json
[
  {
    "origin": ["https://eventossp.menumaster.app.br"],
    "method": ["GET", "POST", "PUT", "DELETE", "HEAD"],
    "maxAgeSeconds": 3600,
    "responseHeader": ["Content-Type", "Authorization", "Content-Length", "User-Agent", "X-Requested-With"]
  }
]
```

## Regras de Segurança do Firebase Storage

Além do CORS, configure as regras de segurança no Firebase Console:

1. Acesse https://console.firebase.google.com
2. Selecione o projeto `eventossp-69c43`
3. Vá em **Storage** → **Rules**
4. Configure as regras:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Permite upload de documentos não autenticados (para cadastro inicial)
    match /uploads/anon/{allPaths=**} {
      allow read, write: if true;
    }
    
    // Documentos de cooperados autenticados
    match /uploads/{cooperadoId}/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

## Teste

Após aplicar o CORS:

1. Limpe o cache do navegador (Ctrl+Shift+Del)
2. Recarregue a página
3. Tente fazer upload de um documento novamente
4. Verifique o console do navegador - não deve mais aparecer erro de CORS

## Troubleshooting

### Erro persiste após aplicar CORS

1. **Aguarde 5-10 minutos** - As configurações de CORS podem levar alguns minutos para propagar
2. **Limpe o cache** do navegador completamente
3. **Teste em aba anônima** do navegador
4. **Verifique as regras de segurança** do Firebase Storage

### Como verificar se o CORS está configurado

Execute no terminal:

```bash
curl -H "Origin: https://eventossp.menumaster.app.br" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     -I \
     https://firebasestorage.googleapis.com/v0/b/eventossp-69c43.appspot.com/o
```

Deve retornar headers como:
```
access-control-allow-origin: https://eventossp.menumaster.app.br
access-control-allow-methods: GET, POST, PUT, DELETE, HEAD
```

### Erro de autenticação

Se aparecer erro de autenticação após resolver o CORS:

1. Verifique se as variáveis de ambiente do Firebase estão corretas no Vercel
2. Confirme que as regras de segurança do Storage permitem upload
3. Teste com regras abertas temporariamente: `allow read, write: if true;`

## Links Úteis

- [Firebase Storage CORS Documentation](https://firebase.google.com/docs/storage/web/download-files#cors_configuration)
- [Google Cloud Storage CORS](https://cloud.google.com/storage/docs/configuring-cors)
- [Firebase Security Rules](https://firebase.google.com/docs/storage/security)
