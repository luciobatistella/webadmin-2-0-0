export type PeriodKey = 'madrugada' | 'manha' | 'tarde' | 'noite' | 'extra'
export type DayTypeKey = 'weekday' | 'saturday' | 'sunday' | 'holiday'

export interface RoleRatesMatrix {
  [roleKey: string]: {
    [day in DayTypeKey]?: { [p in PeriodKey]?: number }
  }
}
