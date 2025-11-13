#!/bin/bash

# Script para configurar CORS no Firebase Storage
# Requer Google Cloud SDK instalado e autenticado

echo "🔧 Configurando CORS no Firebase Storage..."
echo ""

# Verifica se gsutil está instalado
if ! command -v gsutil &> /dev/null; then
    echo "❌ Erro: Google Cloud SDK (gsutil) não está instalado"
    echo ""
    echo "Instale em: https://cloud.google.com/sdk/docs/install"
    echo ""
    echo "Ou use o Cloud Shell no console do Google Cloud:"
    echo "https://console.cloud.google.com"
    exit 1
fi

# Define o projeto
PROJECT_ID="eventossp-69c43"
BUCKET="gs://${PROJECT_ID}.appspot.com"

echo "📦 Projeto: $PROJECT_ID"
echo "🗄️  Bucket: $BUCKET"
echo ""

# Configura o projeto
echo "⚙️  Configurando projeto..."
gcloud config set project $PROJECT_ID

# Aplica o CORS
echo "📤 Aplicando configuração CORS..."
gsutil cors set firebase-cors.json $BUCKET

# Verifica
echo ""
echo "✅ Configuração aplicada!"
echo ""
echo "🔍 Verificando configuração atual:"
gsutil cors get $BUCKET

echo ""
echo "✨ Pronto! Aguarde 5-10 minutos para as alterações propagarem."
echo "   Depois limpe o cache do navegador e teste novamente."
