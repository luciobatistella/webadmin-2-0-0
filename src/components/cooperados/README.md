# Módulo de Cooperados - CRUD Completo

## 📁 Estrutura de Arquivos

```
src/components/cooperados/
├── CooperadoForm.vue          # Formulário reutilizável (criar/editar)
├── CooperadoCreatePage.vue    # Página de cadastro
├── CooperadoEditPage.vue      # Página de edição
└── CooperadoDetailPage.vue    # Página de detalhes (visualização)
```

## 🎯 Funcionalidades Implementadas

### ✅ CooperadoForm.vue
- **Formulário completo** com todos os campos do cooperado
- **Validação em tempo real** de campos obrigatórios
- **Auto-formatação** de CPF e CEP
- **Busca automática de endereço** via ViaCEP
- **Modo create/edit** com props
- **Indicadores visuais** de erro por campo
- **Seções organizadas**:
  - Dados Pessoais
  - Contato
  - Endereço
  - Dados Bancários
  - Observações

### ✅ CooperadoCreatePage.vue
- Página dedicada para **novo cadastro**
- Breadcrumbs de navegação
- Feedback visual de loading
- Mensagens de erro globais
- Redirecionamento automático após sucesso
- Botão voltar para lista

### ✅ CooperadoEditPage.vue
- Página dedicada para **edição completa**
- Carregamento dos dados existentes
- Mesmo formulário do cadastro (reutilização)
- Loading state durante carregamento
- Validação antes de salvar
- Retorno para detalhes após salvar

### ✅ CooperadoDetailPage.vue (atualizado)
- Botão **"Editar"** agora redireciona para página de edição
- Mantém visualização somente-leitura
- Integração com consulta de antecedentes

## 🛣️ Rotas Configuradas

```typescript
/cooperados                    → Lista de cooperados
/cooperados/new                → Cadastro de novo cooperado
/cooperados/:id                → Detalhes do cooperado
/cooperados/:id/edit           → Edição do cooperado
```

**⚠️ Importante**: A rota `/cooperados/new` deve vir **antes** de `/cooperados/:id` para não conflitar.

## 🔌 API Service

Foram adicionadas as seguintes funções em `src/services/cooperados.ts`:

```typescript
// Criar novo cooperado
createCooperado(payload: any): Promise<any>

// Atualizar cooperado existente
updateCooperado(id: string | number, payload: any): Promise<any>

// Deletar cooperado
deleteCooperado(id: string | number): Promise<any>
```

Todas as funções usam **múltiplos endpoints** como fallback para compatibilidade com diferentes versões do backend.

## 📝 Campos do Formulário

### Obrigatórios (*)
- Nome Completo
- CPF
- Data de Nascimento
- Sexo
- Situação Cooperativa (Cooperado ou Pré-Cadastro)
- Telefone 1
- Cidade
- UF

### Opcionais
- RG
- Data Expedição RG
- Nome da Mãe
- Nome do Pai
- E-mail
- Telefone 2
- CEP (com busca automática)
- Logradouro
- Número
- Complemento
- Bairro
- Região/Zona (auto-preenchida para SP)
- Tipo de Pagamento
- Banco
- Agência
- Conta + Dígito
- Observações

### Situação Cooperativa
O campo `situacaoCooperativa` aceita os seguintes valores:
- **3** - Cooperado (membro ativo da cooperativa)
- **4** - Pré-Cadastro (padrão para novos cadastros)

Este valor numérico é enviado ao backend e deve ser tratado adequadamente pela API.

## 🎨 Features UX

### Validação
- Validação em tempo real ao sair do campo (blur)
- Bordas vermelhas em campos com erro
- Mensagens de erro abaixo de cada campo
- Scroll automático para primeiro erro
- Validação completa antes de submit

### Auto-formatação
- **CPF**: `000.000.000-00`
- **CEP**: `00000-000`
- **Telefones**: aceita qualquer formato

### Busca CEP (ViaCEP)
- Preenche automaticamente:
  - Logradouro
  - Bairro
  - Cidade
  - UF
  - Complemento
  - **Região/Zona** (para São Paulo)
- Mapeamento de CEP → Zona SP:
  - `01xxxxx` → Centro
  - `02xxxxx` → Zona Norte
  - `03xxxxx` → Zona Leste
  - `04xxxxx` → Zona Sul
  - `05xxxxx` → Zona Oeste
  - Cidade
  - UF
  - Complemento (quando disponível)

### Loading States
- Spinner durante carregamento de dados
- Botão desabilitado durante salvamento
- Indicador visual de processamento

### Mensagens
- Toast de sucesso ao salvar
- Toast de erro em falhas
- Mensagens contextuais inline

## 🚀 Como Usar

### Criar Novo Cooperado
```vue
<!-- Navegação programática -->
router.push({ name: 'cooperado-new' })

<!-- Link direto -->
<RouterLink :to="{ name: 'cooperado-new' }">
  Novo Cooperado
</RouterLink>
```

### Editar Cooperado Existente
```vue
<!-- Navegação programática -->
router.push({ 
  name: 'cooperado-edit', 
  params: { id: cooperadoId } 
})

<!-- Link direto -->
<RouterLink :to="{ name: 'cooperado-edit', params: { id: '123' } }">
  Editar
</RouterLink>
```

### Ver Detalhes
```vue
router.push({ 
  name: 'cooperado-detail', 
  params: { id: cooperadoId } 
})
```

## 🔄 Fluxo de Navegação

```
Lista de Cooperados
    ↓
    ├→ [Novo] → Formulário de Cadastro → [Salvar] → Detalhes
    │
    ├→ [Ver Detalhes] → Página de Detalhes
    │                      ↓
    │                   [Editar] → Formulário de Edição → [Salvar] → Detalhes
    │
    └→ [Voltar]
```

## 🎯 Próximos Passos Recomendados

1. **Upload de Documentos**
   - Adicionar campo de upload na edição
   - Gerenciar documentos obrigatórios
   
2. **Validações Avançadas**
   - Validar CPF (dígitos verificadores)
   - Validar telefones (formato)
   - Validar e-mail (formato completo)

3. **Campos Adicionais**
   - Seleção de funções/habilidades
   - Status operacional
   - Cooperativa

4. **Histórico**
   - Log de alterações
   - Auditoria de campos

5. **Bulk Actions**
   - Importar cooperados via CSV
   - Exportar lista

## 📚 Exemplo de Uso Completo

```vue
<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

// Criar novo cooperado
function handleCreate() {
  router.push({ name: 'cooperado-new' })
}

// Editar cooperado existente
function handleEdit(cooperadoId) {
  router.push({ 
    name: 'cooperado-edit', 
    params: { id: cooperadoId } 
  })
}

// Ver detalhes
function handleView(cooperadoId) {
  router.push({ 
    name: 'cooperado-detail', 
    params: { id: cooperadoId } 
  })
}
</script>

<template>
  <button @click="handleCreate">Novo Cooperado</button>
  <button @click="handleEdit('123')">Editar #123</button>
  <button @click="handleView('123')">Ver Detalhes #123</button>
</template>
```

## 🐛 Debug

Para ativar logs detalhados de requisições:
```javascript
localStorage.setItem('debug:cooperados', '1')
```

---

**Desenvolvido para EventosSP Web Admin 2.0**
