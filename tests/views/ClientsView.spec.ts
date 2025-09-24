import { mountView } from '../testUtils'
import ClientsView from '@/views/ClientsView.vue'

describe('ClientsView', () => {
  it('monta componente', () => {
    const wrapper = mountView(ClientsView)
    expect(wrapper.exists()).toBe(true)
  })
})
