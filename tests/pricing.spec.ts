/// <reference types="vitest" />
import { describe, it, expect, beforeEach } from 'vitest'
import { priceFor } from '@/services/pricing'
import { __testingPatchConfig } from '@/stores/appConfig'

// Mock básico de configuração
function seedConfig(){
  __testingPatchConfig({
    catalog_roles: [ { key:'garcom', basePrice: 100 }, { key:'cozinheiro', basePrice: 120 } ],
    role_rates: {
      garcom: {
        weekday: { manha: 110, madrugada: 150 },
        saturday: { manha: 130 },
        holiday: { noite: 300 }
      }
    },
    adminConfig: {
      price_multipliers: {
        period: { madrugada:1.2, manha:1.05, tarde:1.1, noite:1.3, extra:1.5 },
        dayType: { weekday:1, weekend:1.4, holiday:1.6 },
        extra: { on:1.5, off:1 },
        madrugadaExtra: 1.25
      }
    }
  })
}

beforeEach(()=>{ seedConfig() })

const holidays = new Set(['2025-12-25'])

describe('priceFor precedence & multipliers', () => {
  it('usa valor matriz específico do dia quando disponível', () => {
    const p = priceFor({ roleKey:'garcom', period:'manha', dateStr:'2025-07-10' }, holidays)
    expect(p).toBe(110)
  })

  it('cai para weekday quando sábado sem entrada específica de período', () => {
    // sábado 2025-07-12: matriz tem saturday.manha mas não madrugada -> deve usar weekday.madrugada
    const p = priceFor({ roleKey:'garcom', period:'madrugada', dateStr:'2025-07-12' }, holidays)
    expect(p).toBe(150)
  })

  it('usa fallback base * multiplicadores config quando não há matriz', () => {
    // cozinheiro não está na matriz -> base 120 * manha(1.05)
    const p = priceFor({ roleKey:'cozinheiro', period:'manha', dateStr:'2025-07-10' }, holidays)
    expect(p).toBe(Math.round(120 * 1.05))
  })

  it('aplica multiplicador de dia (feriado) + período quando sem matriz', () => {
    // cozinheiro feriado: base 120 * noite(1.3) * holiday(1.6)
    const p = priceFor({ roleKey:'cozinheiro', period:'noite', dateStr:'2025-12-25' }, holidays)
    expect(p).toBe(Math.round(120 * 1.3 * 1.6))
  })

  it('empilha hora extra global e madrugadaExtra quando aplicável', () => {
    // base 100 * madrugada(1.2) * weekday(1) -> 120
    // hasExtraGlobal -> * multExtra(1.5) e madrugadaExtra(1.25)
    // Porém existe matriz weekday.madrugada=150 que tem precedência -> 150 * 1.25 * 1.5
    const p = priceFor({ roleKey:'garcom', period:'madrugada', dateStr:'2025-07-10', hasExtraGlobal:true }, holidays)
    expect(p).toBe(Math.round(150 * 1.25 * 1.5))
  })
})
