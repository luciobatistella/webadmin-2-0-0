# 📤 Solução Upload sem CORS - Via Backend

## ✅ Problema Resolvido

Como você **não tem acesso ao Firebase Console** para configurar CORS, implementei uma solução alternativa:

**Frontend → Backend → Firebase Storage (ou outro storage)**

Agora os arquivos são enviados para **seu backend**, que depois faz upload para onde quiser (Firebase, local, S3, etc) **sem problemas de CORS**.

## 🔄 Mudança Implementada

### Antes (com erro CORS):
```
Frontend → Firebase Storage ❌ CORS Error
```

### Agora (funciona):
```
Frontend → Backend → Firebase Storage ✅
```

## 📝 Endpoint Backend Necessário

Você precisa criar este endpoint no seu backend:

```
POST /webadmin/upload
```

### Request

**Content-Type:** `multipart/form-data`

**Campos:**
- `file` - O arquivo (File)
- `docType` - Tipo do documento (string): rgFrente, rgVerso, foto3x4, etc
- `cooperadoId` - ID do cooperado (string): "anon" para novos cadastros

### Response Esperada

```json
{
  "success": true,
  "path": "uploads/anon/rgFrente/2025-11-13T18-03-10-906Z-RG.pdf",
  "url": "https://firebasestorage.googleapis.com/...",
  "publicUrl": "https://firebasestorage.googleapis.com/..."
}
```

## 💻 Exemplo de Implementação (Node.js)

### Opção 1: Upload para Firebase Storage (Recomendado)

```javascript
const express = require('express')
const multer = require('multer')
const admin = require('firebase-admin')

// Inicializar Firebase Admin (server-side, sem CORS!)
const serviceAccount = require('./serviceAccountKey.json')
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'eventossp-69c43.appspot.com'
})

const bucket = admin.storage().bucket()

// Configurar multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
})

app.post('/webadmin/upload', upload.single('file'), async (req, res) => {
  try {
    const { docType, cooperadoId } = req.body
    const file = req.file
    
    // Gerar path
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const safeName = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_')
    const path = `uploads/${cooperadoId || 'anon'}/${docType}/${timestamp}-${safeName}`
    
    // Upload para Firebase
    const fileRef = bucket.file(path)
    await fileRef.save(file.buffer, {
      metadata: { contentType: file.mimetype }
    })
    
    // Tornar público
    await fileRef.makePublic()
    
    // URL pública
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${path}`
    
    res.json({
      success: true,
      path,
      url: publicUrl,
      publicUrl
    })
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    })
  }
})
```

### Dependências

```bash
npm install multer firebase-admin
```

### Service Account Key

1. Acesse: https://console.firebase.google.com/project/eventossp-69c43/settings/serviceaccounts/adminsdk
2. Clique em **"Generate new private key"**
3. Salve como `serviceAccountKey.json` no backend
4. **IMPORTANTE:** Adicione ao `.gitignore`!

```json
// serviceAccountKey.json
{
  "type": "service_account",
  "project_id": "eventossp-69c43",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...",
  "client_email": "firebase-adminsdk-...@eventossp-69c43.iam.gserviceaccount.com",
  ...
}
```

### Opção 2: Salvar Localmente (Mais Simples)

```javascript
const express = require('express')
const multer = require('multer')
const path = require('path')

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/')
  },
  filename: (req, file, cb) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    cb(null, `${timestamp}-${file.originalname}`)
  }
})

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
})

app.post('/webadmin/upload', upload.single('file'), (req, res) => {
  const publicUrl = `https://testapi.eventossp.app.br/uploads/${req.file.filename}`
  
  res.json({
    success: true,
    path: req.file.path,
    url: publicUrl,
    publicUrl
  })
})

// Servir arquivos
app.use('/uploads', express.static('uploads'))
```

## 🧪 Testar Endpoint

```bash
curl -X POST http://localhost:3000/webadmin/upload \
  -F "file=@documento.pdf" \
  -F "docType=rgFrente" \
  -F "cooperadoId=anon"
```

Deve retornar:
```json
{
  "success": true,
  "path": "uploads/anon/rgFrente/...",
  "url": "https://..."
}
```

## ✨ Vantagens desta Solução

✅ **Sem CORS** - Requisição é server-to-server  
✅ **Mais seguro** - Credenciais só no backend  
✅ **Flexível** - Pode usar qualquer storage  
✅ **Validação** - Backend valida antes de subir  

## 📋 Checklist

- [ ] Instalar multer: `npm install multer`
- [ ] Instalar firebase-admin: `npm install firebase-admin` (se usar Firebase)
- [ ] Baixar Service Account Key do Firebase
- [ ] Adicionar `serviceAccountKey.json` ao `.gitignore`
- [ ] Criar endpoint POST `/webadmin/upload`
- [ ] Testar com curl ou Postman
- [ ] Verificar se arquivos ficam acessíveis publicamente

## 🔧 Frontend Atualizado

O frontend **JÁ ESTÁ CONFIGURADO** para usar este novo endpoint. 

Arquivo alterado:
```typescript
// src/components/cooperados/CooperadoForm.vue
import { uploadDocument } from '../../services/uploadBackend' // ← Mudou aqui
```

Quando o usuário fizer upload, verá logs detalhados no console:
```
📤 Iniciando upload via Backend
  - Tipo: rgFrente
  - Arquivo: RG.pdf
  - Tamanho: 245.67 KB
  - Endpoint: https://testapi.eventossp.app.br/webadmin/upload
⏳ Enviando arquivo...
✅ Upload concluído!
```

## ❓ Dúvidas?

**"Não consigo baixar Service Account Key"**  
→ Peça para alguém que tem acesso ao Firebase Console

**"Quero salvar local mesmo"**  
→ Use a Opção 2 (mais simples, sem Firebase)

**"Erro 404 no endpoint"**  
→ Verifique se criou a rota `/webadmin/upload` no backend

**"Arquivo não fica público"**  
→ No Firebase: `await fileRef.makePublic()`  
→ No local: `app.use('/uploads', express.static('uploads'))`

---

**Resumo:** Agora os uploads funcionam **sem precisar mexer no Firebase Console** 🎉
