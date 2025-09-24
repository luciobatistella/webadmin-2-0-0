import { mountView } from '../testUtils'
import HomeView from '@/views/HomeView.vue'

describe('HomeView', () => {
  it('monta componente', () => {
    const wrapper = mountView(HomeView)
    expect(wrapper.exists()).toBe(true)
  })
})
