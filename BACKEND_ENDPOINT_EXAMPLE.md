# Endpoint Backend para Consulta de Antecedentes

A API Infosimples bloqueia chamadas diretas do navegador por questões de CORS e segurança.
É necessário criar um endpoint no backend que faça a ponte entre o frontend e a Infosimples.

## Exemplo Node.js/Express

```javascript
// routes/antecedentes.js
const express = require('express');
const router = express.Router();

router.post('/api/antecedentes/consultar', async (req, res) => {
  try {
    const { nome, birthdate, genero, rg, rg_digito, rg_expedicao, 
            cin_cpf, cin_expedicao, pai, mae } = req.body;

    // Token deve estar no .env do backend, NÃO no frontend
    const token = process.env.INFOSIMPLES_TOKEN;
    
    if (!token) {
      return res.status(500).json({ 
        error: 'Token Infosimples não configurado no servidor' 
      });
    }

    // Monta o payload
    const params = new URLSearchParams({
      token,
      nome,
      birthdate,
      genero,
      timeout: '300',
    });
    
    if (rg) params.append('rg', rg);
    if (rg_digito) params.append('rg_digito', rg_digito);
    if (rg_expedicao) params.append('rg_expedicao', rg_expedicao);
    if (cin_cpf) params.append('cin_cpf', cin_cpf);
    if (cin_expedicao) params.append('cin_expedicao', cin_expedicao);
    if (pai) params.append('pai', pai);
    if (mae) params.append('mae', mae);

    // Faz a chamada para Infosimples
    const response = await fetch(
      'https://api.infosimples.com/api/v2/consultas/antecedentes-criminais/sp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      }
    );

    const data = await response.json();
    
    // Retorna para o frontend
    res.json(data);
    
  } catch (error) {
    console.error('Erro ao consultar antecedentes:', error);
    res.status(500).json({ 
      error: 'Erro ao processar consulta',
      message: error.message 
    });
  }
});

module.exports = router;
```

## Atualizar o Frontend

Depois de criar o endpoint backend, atualize `CooperadoDetailPage.vue`:

```typescript
// Trocar:
const antecedentesApiEndpoint = 'https://api.infosimples.com/api/v2/consultas/antecedentes-criminais/sp'

// Por:
const antecedentesApiEndpoint = '/api/antecedentes/consultar'

// E remover a variável de ambiente do frontend:
// const antecedentesApiToken = import.meta.env.VITE_INFO_SIMPLES_TOKEN || ''

// A função consultarAntecedentes deve enviar JSON em vez de URLSearchParams:
const response = await fetch(antecedentesApiEndpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    nome,
    birthdate: birthdateIso,
    genero,
    rg: rgBase,
    rg_digito: rgDigit,
    rg_expedicao: rgExpedicaoIso,
    cin_cpf: cinCpf,
    cin_expedicao: cinExpedicaoIso,
    pai,
    mae,
  }),
})
```

## Segurança

- ✅ Token fica **apenas no backend** (variável de ambiente do servidor)
- ✅ Frontend **nunca** expõe o token
- ✅ Adicione autenticação no endpoint para garantir que só usuários autorizados façam consultas
- ✅ Adicione rate limiting para evitar abuso
- ✅ Valide e sanitize os dados recebidos do frontend

## Próximos Passos

1. Criar o endpoint no backend
2. Mover o token do `.env.local` do frontend para o `.env` do backend
3. Atualizar o código do frontend para chamar o endpoint local
4. Testar a integração completa
