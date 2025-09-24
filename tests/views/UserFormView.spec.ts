import { mountView } from '../testUtils'
import UserFormView from '@/views/UserFormView.vue'

describe('UserFormView', () => {
  it('monta componente', () => {
    const wrapper = mountView(UserFormView)
    expect(wrapper.exists()).toBe(true)
  })
})
