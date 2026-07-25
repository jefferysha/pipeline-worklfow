export type DoctorStatus = 'green' | 'yellow' | 'red'

export interface DoctorCheck {
  id: string
  status: DoctorStatus
  detail: string
  hint: string
}

export const green = (id: string, detail: string): DoctorCheck => ({
  id,
  status: 'green',
  detail,
  hint: '',
})

export const yellow = (id: string, detail: string, hint: string): DoctorCheck => ({
  id,
  status: 'yellow',
  detail,
  hint,
})

export const red = (id: string, detail: string, hint: string): DoctorCheck => ({
  id,
  status: 'red',
  detail,
  hint,
})
