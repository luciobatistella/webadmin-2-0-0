// Serviço de upload para Firebase Storage
// Observação: requer variáveis de ambiente VITE_FIREBASE_*

import { initializeApp, type FirebaseApp, getApps } from 'firebase/app'
import { getStorage, ref, uploadBytes, getDownloadURL, type FirebaseStorage } from 'firebase/storage'

let app: FirebaseApp | null = null
let storage: FirebaseStorage | null = null

function ensureFirebase() {
  if (app && storage) return { app, storage }
  const cfg = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
    appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
  }
  const missing = Object.entries(cfg).filter(([, v]) => !v)
  if (missing.length) {
    throw new Error('Firebase não configurado: defina as variáveis VITE_FIREBASE_* no .env')
  }
  app = getApps().length ? getApps()[0]! : initializeApp(cfg)
  storage = getStorage(app)
  return { app, storage }
}

export type UploadResult = { fullPath: string; downloadURL: string }

export async function uploadDocument(docType: string, file: File, opts?: { cooperadoId?: string }) : Promise<UploadResult> {
  try {
    console.log('📤 Iniciando upload Firebase Storage')
    console.log('  - Tipo:', docType)
    console.log('  - Arquivo:', file.name)
    console.log('  - Tamanho:', (file.size / 1024).toFixed(2), 'KB')
    console.log('  - Content-Type:', file.type)
    
    const { storage } = ensureFirebase()
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const safeName = file.name?.replace(/[^a-zA-Z0-9_.-]/g, '_') || `${docType}.bin`
    const path = `uploads/${opts?.cooperadoId || 'anon'}/${docType}/${ts}-${safeName}`
    
    console.log('  - Path:', path)
    
    const r = ref(storage, path)
    
    // Metadata para garantir CORS
    const metadata = {
      contentType: file.type || 'application/octet-stream',
      cacheControl: 'public, max-age=31536000',
      customMetadata: {
        uploadedAt: new Date().toISOString(),
        docType: docType,
      }
    }
    
    console.log('  - Metadata:', metadata)
    console.log('⏳ Fazendo upload...')
    
    const snapshot = await uploadBytes(r, file, metadata)
    console.log('✅ Upload concluído:', snapshot.metadata.fullPath)
    
    console.log('🔗 Obtendo URL de download...')
    const url = await getDownloadURL(r)
    console.log('✅ URL obtida:', url)
    
    return { fullPath: path, downloadURL: url }
  } catch (error: any) {
    console.error('❌ Erro no upload Firebase:', error)
    console.error('  - Code:', error.code)
    console.error('  - Message:', error.message)
    console.error('  - ServerResponse:', error.serverResponse)
    throw error
  }
}
