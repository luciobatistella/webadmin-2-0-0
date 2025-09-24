import { mountView } from '../testUtils'
import BillingView from '@/views/BillingView.vue'

describe('BillingView', () => {
  it('monta componente', () => {
    const wrapper = mountView(BillingView)
    expect(wrapper.exists()).toBe(true)
  })
})
