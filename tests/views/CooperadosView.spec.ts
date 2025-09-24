import { mountView } from '../testUtils'
import CooperadosView from '@/views/CooperadosView.vue'

describe('CooperadosView', () => {
  it('monta componente', () => {
    const wrapper = mountView(CooperadosView)
    expect(wrapper.exists()).toBe(true)
  })
})
