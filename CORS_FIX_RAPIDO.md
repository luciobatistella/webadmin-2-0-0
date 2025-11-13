# 🚨 Solução Rápida - Erro CORS Firebase Storage

## Problema
```
Access to XMLHttpRequest at 'https://firebasestorage.googleapis.com/...' 
has been blocked by CORS policy
```

## ✅ Solução Rápida (3 passos)

### 1️⃣ Instale o Google Cloud SDK

**Windows:**
```powershell
# Execute como Administrador
winget install Google.CloudSDK
```

Ou baixe: https://cloud.google.com/sdk/docs/install

**Linux/Mac:**
```bash
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
```

### 2️⃣ Configure e Aplique o CORS

**Windows (PowerShell):**
```powershell
cd f:\Clientes\EventosSP\evsp\web\webadmin-2-0-0

# Execute o script
.\apply-firebase-cors.bat
```

**Linux/Mac:**
```bash
cd /caminho/do/projeto

# Torne executável
chmod +x apply-firebase-cors.sh

# Execute
./apply-firebase-cors.sh
```

**Ou manualmente:**
```bash
# Autentique (se necessário)
gcloud auth login

# Configure o projeto
gcloud config set project eventossp-69c43

# Aplique CORS
gsutil cors set firebase-cors.json gs://eventossp-69c43.appspot.com

# Verifique
gsutil cors get gs://eventossp-69c43.appspot.com
```

### 3️⃣ Configure as Regras de Segurança

1. Acesse: https://console.firebase.google.com/project/eventossp-69c43/storage/rules
2. Cole o conteúdo do arquivo `storage.rules`
3. Clique em **Publicar**

## 🧪 Teste

1. **Aguarde 5-10 minutos** (propagação)
2. **Limpe o cache** do navegador (Ctrl+Shift+Del)
3. **Recarregue a página** (Ctrl+F5)
4. **Teste o upload** novamente

## 📋 Checklist

- [ ] Google Cloud SDK instalado
- [ ] Autenticado com `gcloud auth login`
- [ ] CORS aplicado com sucesso
- [ ] Regras de segurança publicadas no Firebase Console
- [ ] Cache do navegador limpo
- [ ] Teste de upload funcionando

## 🆘 Se não funcionar

### Alternativa: Console Web

1. Acesse: https://console.cloud.google.com/storage/browser
2. Selecione: `eventossp-69c43.appspot.com`
3. Clique em **Permissions** (3 pontinhos)
4. Aba **CORS**
5. Cole o JSON do arquivo `firebase-cors.json`
6. Salve

### Logs detalhados

O código agora tem logs detalhados no console. Abra o DevTools (F12) e veja:

- 📤 Informações do upload
- ⏳ Progresso
- ✅ Sucesso com URL
- ❌ Erros detalhados

## 📞 Suporte

Se o erro persistir, verifique:

1. **Variáveis de ambiente corretas** no Vercel
2. **Projeto Firebase ativo** e sem billing issues
3. **Regras de segurança** não bloqueando
4. **Network** tab no DevTools para ver a requisição exata

---

**Arquivos criados para você:**

- `firebase-cors.json` - Configuração CORS
- `storage.rules` - Regras de segurança
- `apply-firebase-cors.bat` - Script Windows
- `apply-firebase-cors.sh` - Script Linux/Mac
- `FIREBASE_CORS_FIX.md` - Documentação completa
