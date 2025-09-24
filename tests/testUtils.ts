import { h } from 'vue'
import { mount, DOMWrapper, VueWrapper, config } from '@vue/test-utils'

export function mountView(component: any, options: any = {}) {
  return mount(component, {
    global: {
      stubs: ['router-link','router-view','apexchart'],
      ...options.global,
    },
    ...options,
  })
}

export type MountReturn = VueWrapper<any> & { findByTestId: (id: string) => DOMWrapper<Element> }

config.global.stubs = { ...(config.global.stubs||{}), apexchart: true }
