import { mountView } from '../testUtils'
import DashboardView from '@/views/DashboardView.vue'

describe('DashboardView', () => {
  it('monta componente', () => {
    const wrapper = mountView(DashboardView)
    expect(wrapper.exists()).toBe(true)
  })
})
