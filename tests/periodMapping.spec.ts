/// <reference types="vitest" />
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DateRangePicker from '@/components/ui/DateRangePicker.vue'

// Helper para processar input e retornar turnos detectados + resumo
async function process(wrapper: any, text: string){
  const input = wrapper.find('input.input')
  input.setValue(text)
  await input.trigger('keydown.enter')
  // aguarda processamento async (tem setTimeout 300ms + 80ms)
  await new Promise(r => setTimeout(r, 450))
  await wrapper.vm.$nextTick()
  return {
    turnos: wrapper.vm.processedInfo?.turnos || [],
    resumo: wrapper.vm.resumoLocal
  }
}

describe('DateRangePicker period mapping', () => {
  it('classifica madrugada corretamente (02h inicio)', async () => {
    const w = mount(DateRangePicker)
    const { resumo } = await process(w, '10/09 das 02 às 05')
    expect(resumo.tiposTurno.madrugada).toBeGreaterThan(0)
  })

  it('classifica manhã entre 09-13', async () => {
    const w = mount(DateRangePicker)
    const { resumo } = await process(w, '10/09 das 09 às 12')
    expect(resumo.tiposTurno.manha).toBeGreaterThan(0)
  })

  it('classifica tarde entre 13-18', async () => {
    const w = mount(DateRangePicker)
    const { resumo } = await process(w, '10/09 das 13 às 17')
    expect(resumo.tiposTurno.tarde).toBeGreaterThan(0)
  })

  it('classifica noite entre 18-24', async () => {
    const w = mount(DateRangePicker)
    const { resumo } = await process(w, '10/09 das 18 às 22')
    expect(resumo.tiposTurno.noite).toBeGreaterThan(0)
  })

  it('faixa de virada 23-02 cria Noite + Madrugada', async () => {
    const w = mount(DateRangePicker)
    const { resumo } = await process(w, '10/09 das 23 às 02')
    expect(resumo.tiposTurno.noite).toBeGreaterThan(0)
    expect(resumo.tiposTurno.madrugada).toBeGreaterThan(0)
  })

  it('janela completa 09-03 inclui Manhã Tarde Noite Madrugada', async () => {
    const w = mount(DateRangePicker)
    const { resumo } = await process(w, '10/09 das 09 às 03')
    expect(resumo.tiposTurno.manha).toBeGreaterThan(0)
    expect(resumo.tiposTurno.tarde).toBeGreaterThan(0)
    expect(resumo.tiposTurno.noite).toBeGreaterThan(0)
    expect(resumo.tiposTurno.madrugada).toBeGreaterThan(0)
  })

  it('intervalo textual cruza mês: 29 até 03 de outubro', async () => {
    const w = mount(DateRangePicker as any)
    const { resumo } = await process(w, '29 até 03 de outubro das 09 as 18')
    const setup = (w.vm as any).$?.setupState || {}
    // Deve gerar 5 dias de datas (29,30/09 e 01,02,03/10)
    expect((setup.processedInfo?.dates?.length || 0)).toBeGreaterThanOrEqual(5)
    // Deve reconhecer janela de 09 às 18 com pausa embutida
    expect(resumo.horasPorDia).toBeGreaterThanOrEqual(8)
  })
})
