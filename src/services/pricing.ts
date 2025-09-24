import { useAppConfig } from '@/stores/appConfig'

export type PeriodKey = 'madrugada' | 'manha' | 'tarde' | 'noite' | 'extra'
export type DayTypeKey = 'weekday' | 'saturday' | 'sunday' | 'holiday'

interface RoleRatesMatrix { [roleKey: string]: { [day in DayTypeKey]?: { [period in PeriodKey]?: number } } }

interface PriceContext {
  roleKey: string
  period: PeriodKey
  dateStr: string // YYYY-MM-DD
  hasExtraGlobal?: boolean // se fluxo determinou hora extra geral
  considerExtraMultiplier?: boolean // default true
}

// Determina tipo de dia considerando sábado/domingo/feriado explicitamente; feriados devem ser tratados fora e passados via callback se necessário
export function resolveDayType(dateStr: string, holidays: Set<string>): DayTypeKey {
  if (holidays.has(dateStr)) return 'holiday'
  const d = new Date(dateStr + 'T12:00:00')
  const dow = d.getDay() // 0 domingo ... 6 sábado
  if (dow === 0) return 'sunday'
  if (dow === 6) return 'saturday'
  return 'weekday'
}

export function priceFor(ctx: PriceContext, holidays: Set<string>): number {
  const { roleKey, period, dateStr, hasExtraGlobal, considerExtraMultiplier = true } = ctx
  const { catalogRoles, roleRates } = useAppConfig()

  const role = (catalogRoles.value || []).find((r: any) => r.key === roleKey)
  const base = Number(role?.basePrice) || 0
  if (!base) return 0

  const matrix: RoleRatesMatrix = (roleRates.value || {}) as any
  const dayType = resolveDayType(dateStr, holidays)
  const fromMatrix = matrix?.[roleKey]?.[dayType]?.[period]
  if (typeof fromMatrix === 'number') {
    let v = fromMatrix
    if (hasExtraGlobal && period === 'madrugada') {
      try {
        const { adminConfig } = useAppConfig() as any
        const multExtra = adminConfig?.value?.price_multipliers?.extra?.on || 1.5
        const madrugadaExtra = adminConfig?.value?.price_multipliers?.madrugadaExtra || 1.25
        v = v * madrugadaExtra * multExtra
      } catch {
        v = v * 1.25 * 1.5
      }
    }
    return Math.round(v)
  }

  // Fallback: usar weekday->period se existir
  const weekdayFallback = matrix?.[roleKey]?.weekday?.[period]
  if (typeof weekdayFallback === 'number') {
    let v = weekdayFallback
    if (hasExtraGlobal && period === 'madrugada') {
      try {
        const { adminConfig } = useAppConfig() as any
        const multExtra = adminConfig?.value?.price_multipliers?.extra?.on || 1.5
        const madrugadaExtra = adminConfig?.value?.price_multipliers?.madrugadaExtra || 1.25
        v = v * madrugadaExtra * multExtra
      } catch {
        v = v * 1.25 * 1.5
      }
    }
    return Math.round(v)
  }

  // Fallback 2: base + heurísticas simples (replica regra seed + madrugada)
  let v = base
  try {
    const { adminConfig } = useAppConfig() as any
    const mults = adminConfig?.value?.price_multipliers || {}
    const periodMult = mults?.period?.[period] || ((): number => {
      if (period === 'madrugada') return 1.2
      if (period === 'tarde') return 1.05
      if (period === 'noite') return 1.15
      if (period === 'extra') return 1.5
      return 1
    })()
    v = v * periodMult
    // Mapear dayType store (saturday/sunday) para weekend se config usar weekend / feriado
    const dayMultRaw = mults?.dayType || {}
    // Config aceita tanto weekend quanto saturday/sunday específicos
    let dayMult = 1
    if (dayType === 'saturday') dayMult = dayMultRaw.saturday || dayMultRaw.weekend || 1.3
    else if (dayType === 'sunday') dayMult = dayMultRaw.sunday || dayMultRaw.weekend || 1.5
    else if (dayType === 'holiday') dayMult = dayMultRaw.holiday || 1.7
    else dayMult = dayMultRaw.weekday || 1
    v = v * dayMult
  } catch {
    if (period === 'madrugada') v = base * 1.2
    else if (period === 'tarde') v = base * 1.05
    else if (period === 'noite') v = base * 1.15
    else if (period === 'extra') v = base * 1.5
    if (dayType === 'saturday') v = v * 1.30
    else if (dayType === 'sunday') v = v * 1.50
    else if (dayType === 'holiday') v = v * 1.70
  }

  // Hora extra global pode aplicar multiplicador adicional apenas se período não já for 'extra'
  if (considerExtraMultiplier && hasExtraGlobal && period === 'madrugada') {
    try {
      const { adminConfig } = useAppConfig() as any
      const multExtra = adminConfig?.value?.price_multipliers?.extra?.on || 1.5
      const madrugadaExtra = adminConfig?.value?.price_multipliers?.madrugadaExtra || 1.25
      v = v * madrugadaExtra * multExtra
    } catch {
      v = v * 1.25 * 1.5
    }
  }

  return Math.round(v)
}

export function batchPrices(roleKey: string, dates: string[], periods: PeriodKey[], holidays: Set<string>, hasExtraGlobal?: boolean) {
  return dates.flatMap(date => periods.map(period => ({ date, period, price: priceFor({ roleKey, dateStr: date, period, hasExtraGlobal }, holidays) })))
}

// Detalha o cálculo de preço retornando componentes e origem
export function priceBreakdown(ctx: PriceContext, holidays: Set<string>) {
  const { roleKey, period, dateStr, hasExtraGlobal, considerExtraMultiplier = true } = ctx
  const { catalogRoles, roleRates } = useAppConfig()
  const role = (catalogRoles.value || []).find((r: any) => r.key === roleKey)
  const base = Number(role?.basePrice) || 0
  const dayType = resolveDayType(dateStr, holidays)
  const matrix: RoleRatesMatrix = (roleRates.value || {}) as any
  const path: string[] = []
  let origin: 'matrix' | 'weekdayFallback' | 'configFallback' | 'heuristic' | 'none' = 'none'
  let applied = {
    base,
    matrixValue: 0,
    weekdayFallback: 0,
    periodMultiplier: 1,
    dayTypeMultiplier: 1,
    madrugadaExtraMultiplier: 1,
    extraGlobalMultiplier: 1,
    final: 0
  }
  if (!base) return { ...applied, origin, path, reason: 'no_base_price' }

  const fromMatrix = matrix?.[roleKey]?.[dayType]?.[period]
  if (typeof fromMatrix === 'number') {
    origin = 'matrix'
    applied.matrixValue = fromMatrix
    let v = fromMatrix
    if (hasExtraGlobal && period === 'madrugada') {
      try {
        const { adminConfig } = useAppConfig() as any
        const multExtra = adminConfig?.value?.price_multipliers?.extra?.on || 1.5
        const madrugadaExtra = adminConfig?.value?.price_multipliers?.madrugadaExtra || 1.25
        applied.madrugadaExtraMultiplier = madrugadaExtra
        applied.extraGlobalMultiplier = multExtra
        v = v * madrugadaExtra * multExtra
      } catch {
        applied.madrugadaExtraMultiplier = 1.25
        applied.extraGlobalMultiplier = 1.5
        v = v * 1.25 * 1.5
      }
    }
    applied.final = Math.round(v)
    path.push('matrix')
    return { ...applied, origin, dayType }
  }

  const weekdayFallback = matrix?.[roleKey]?.weekday?.[period]
  if (typeof weekdayFallback === 'number') {
    origin = 'weekdayFallback'
    applied.weekdayFallback = weekdayFallback
    let v = weekdayFallback
    if (hasExtraGlobal && period === 'madrugada') {
      try {
        const { adminConfig } = useAppConfig() as any
        const multExtra = adminConfig?.value?.price_multipliers?.extra?.on || 1.5
        const madrugadaExtra = adminConfig?.value?.price_multipliers?.madrugadaExtra || 1.25
        applied.madrugadaExtraMultiplier = madrugadaExtra
        applied.extraGlobalMultiplier = multExtra
        v = v * madrugadaExtra * multExtra
      } catch {
        applied.madrugadaExtraMultiplier = 1.25
        applied.extraGlobalMultiplier = 1.5
        v = v * 1.25 * 1.5
      }
    }
    applied.final = Math.round(v)
    path.push('weekdayFallback')
    return { ...applied, origin, dayType }
  }

  // Config / heurística
  origin = 'configFallback'
  let v = base
  try {
    const { adminConfig } = useAppConfig() as any
    const mults = adminConfig?.value?.price_multipliers || {}
    const periodMult = mults?.period?.[period] || ((): number => {
      if (period === 'madrugada') return 1.2
      if (period === 'tarde') return 1.05
      if (period === 'noite') return 1.15
      if (period === 'extra') return 1.5
      return 1
    })()
    applied.periodMultiplier = periodMult
    v *= periodMult
    const dayMultRaw = mults?.dayType || {}
    let dayMult = 1
    if (dayType === 'saturday') dayMult = dayMultRaw.saturday || dayMultRaw.weekend || 1.3
    else if (dayType === 'sunday') dayMult = dayMultRaw.sunday || dayMultRaw.weekend || 1.5
    else if (dayType === 'holiday') dayMult = dayMultRaw.holiday || 1.7
    else dayMult = dayMultRaw.weekday || 1
    applied.dayTypeMultiplier = dayMult
    v *= dayMult
  } catch {
    origin = 'heuristic'
    if (period === 'madrugada') { applied.periodMultiplier = 1.2; v = base * 1.2 }
    else if (period === 'tarde') { applied.periodMultiplier = 1.05; v = base * 1.05 }
    else if (period === 'noite') { applied.periodMultiplier = 1.15; v = base * 1.15 }
    else if (period === 'extra') { applied.periodMultiplier = 1.5; v = base * 1.5 }
    if (dayType === 'saturday') { applied.dayTypeMultiplier = 1.3; v *= 1.30 }
    else if (dayType === 'sunday') { applied.dayTypeMultiplier = 1.5; v *= 1.50 }
    else if (dayType === 'holiday') { applied.dayTypeMultiplier = 1.7; v *= 1.70 }
  }

  if (considerExtraMultiplier && hasExtraGlobal && period === 'madrugada') {
    try {
      const { adminConfig } = useAppConfig() as any
      const multExtra = adminConfig?.value?.price_multipliers?.extra?.on || 1.5
      const madrugadaExtra = adminConfig?.value?.price_multipliers?.madrugadaExtra || 1.25
      applied.madrugadaExtraMultiplier = madrugadaExtra
      applied.extraGlobalMultiplier = multExtra
      v = v * madrugadaExtra * multExtra
    } catch {
      applied.madrugadaExtraMultiplier = 1.25
      applied.extraGlobalMultiplier = 1.5
      v = v * 1.25 * 1.5
    }
  }
  applied.final = Math.round(v)
  path.push(origin)
  return { ...applied, origin, dayType }
}
