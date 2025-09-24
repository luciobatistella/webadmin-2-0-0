import { mountView } from '../testUtils'
import DashboardHomeView from '@/views/DashboardHomeView.vue'

describe('DashboardHomeView', () => {
  it('monta componente', () => {
    const wrapper = mountView(DashboardHomeView)
    expect(wrapper.exists()).toBe(true)
  })
})
