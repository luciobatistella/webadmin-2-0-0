/// <reference types="vitest" />
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TurnosDetectados from '../src/components/ui/TurnosDetectados.vue'

describe('TurnosDetectados - badge Madrugada', () => {
  it('exibe Turno Madrugada sem ícone ou cor especial', () => {
    const wrapper = mount(TurnosDetectados, {
      props: {
        turnos: [
          { nome: 'Turno Madrugada', inicio: '00:00', fim: '06:00' }
        ],
        datas: ['2025-01-01'],
        estrategiaTurnos: true,
        resumo: {
          quantidadeDias: 1,
            quantidadeTurnos: 1,
            horasPorDia: 6,
            horasTotalPeriodo: 6,
            temPausa1h: false,
            pausaInformada: false,
            escalaHoras: 6,
            temHoraExtra: false,
            temFimDeSemana: false,
            diasFimDeSemana: 0,
            temFeriado: false,
            diasFeriado: 0,
            temAdicionalNoturno: true,
            horasNoturnasPorDia: 6,
            horasNormaisPorDia: 0,
            janelaInicioStr: '00:00',
            janelaFimStr: '06:00',
            colaboradoresPorDia: 1,
            tiposTurno: { manha: 0, tarde: 0, noite: 0, madrugada: 1 },
            perTurno: [{ totalMinutes: 360, hasExtra: false }]
        }
      }
    })

    // Não deve ter destaque roxo nem ícone específico
    expect(wrapper.html()).toMatch(/Turno Madrugada/)
    expect(wrapper.find('span.bg-purple-100, span.bg-purple-600').exists()).toBeFalsy()
  })
})
