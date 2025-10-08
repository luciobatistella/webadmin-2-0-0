/// <reference types="vite/client" />
/// <reference types="vitest" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface ImportMetaEnv {
  readonly "HdV8k8qIrMSMpt4wAovkq6bxZThYZoePSYas_1-N"?: string
}

