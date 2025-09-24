import { mountView } from '../testUtils'
import UsersView from '@/views/UsersView.vue'

describe('UsersView', () => {
  it('monta componente', () => {
    const wrapper = mountView(UsersView)
    expect(wrapper.exists()).toBe(true)
  })
})
