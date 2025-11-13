@echo off
REM Script para configurar CORS no Firebase Storage (Windows)
REM Requer Google Cloud SDK instalado e autenticado

echo ====================================================
echo    Configurando CORS no Firebase Storage
echo ====================================================
echo.

REM Verifica se gsutil está instalado
where gsutil >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Google Cloud SDK nao esta instalado
    echo.
    echo Instale em: https://cloud.google.com/sdk/docs/install
    echo.
    echo Ou use o Cloud Shell no console do Google Cloud:
    echo https://console.cloud.google.com
    echo.
    pause
    exit /b 1
)

set PROJECT_ID=eventossp-69c43
set BUCKET=gs://%PROJECT_ID%.appspot.com

echo Projeto: %PROJECT_ID%
echo Bucket: %BUCKET%
echo.

REM Configura o projeto
echo Configurando projeto...
call gcloud config set project %PROJECT_ID%

REM Aplica o CORS
echo.
echo Aplicando configuracao CORS...
call gsutil cors set firebase-cors.json %BUCKET%

REM Verifica
echo.
echo [OK] Configuracao aplicada!
echo.
echo Verificando configuracao atual:
call gsutil cors get %BUCKET%

echo.
echo ====================================================
echo Pronto! Aguarde 5-10 minutos para propagar.
echo Depois limpe o cache do navegador e teste novamente.
echo ====================================================
echo.
pause
