import { mountView } from '../testUtils'
import RequestsView from '@/views/RequestsView.vue'

describe('RequestsView', () => {
  it('monta componente', () => {
    const wrapper = mountView(RequestsView)
    expect(wrapper.exists()).toBe(true)
  })
})
