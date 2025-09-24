import { mountView } from '../testUtils'
import EventView from '@/views/EventView.vue'

describe('EventView', () => {
  it('monta componente', () => {
    const wrapper = mountView(EventView)
    expect(wrapper.exists()).toBe(true)
  })
})
