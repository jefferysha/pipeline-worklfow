import type { AdmissionPort } from './scheduler-support.js'

/** Compile-time regression: pre-v1 custom admissions remain assignable without the capability. */
type LegacyCustomAdmissionCompatibilityFixture = {
  reserve: AdmissionPort['reserve']
  activate: AdmissionPort['activate']
  settleWon: AdmissionPort['settleWon']
  settleLost: AdmissionPort['settleLost']
  isActive: AdmissionPort['isActive']
}
type AssertTrue<T extends true> = T
export type AdmissionPortLegacyCompatibility = AssertTrue<
  LegacyCustomAdmissionCompatibilityFixture extends AdmissionPort ? true : false
>
