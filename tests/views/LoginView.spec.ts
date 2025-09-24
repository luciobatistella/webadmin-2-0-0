import { mount } from '@vue/test-utils'
import LoginView from '@/views/LoginView.vue'

describe('LoginView', () => {
  it('monta sem erros', () => {
    const wrapper = mount(LoginView, { global: { stubs: ['router-link','router-view'] } })
    expect(wrapper.exists()).toBe(true)
  })
})
