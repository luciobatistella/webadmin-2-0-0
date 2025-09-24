import { mountView } from '../testUtils'
import SettingsView from '@/views/SettingsView.vue'

describe('SettingsView', () => {
  it('monta componente', () => {
    const wrapper = mountView(SettingsView)
    expect(wrapper.exists()).toBe(true)
  })
})
