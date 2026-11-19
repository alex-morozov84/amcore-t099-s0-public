export interface S0Scenario {
  directory: string
  files: string[]
  fixture?: string
  extraDirectory?: string
  extraFiles?: string[]
  grep?: string
  https?: boolean
  closedSignup?: boolean
}
export const s0Scenarios: Record<string, S0Scenario>
