export type AgentRow = { id: string; name: string; task: string; status: string }
export type TokenUse = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  steps: number
  startup: number
}
export type Tokens = { main: TokenUse; agents: Record<string, TokenUse & { name: string }> }

export type Overview = {
  tools: number
  done: number
  byTool: Record<string, number>
  perAgent: Record<string, number>
  tasks: number
  tasksDone: number
  doneTasks: string[]
  notes: string[]
  folders: string[]
  errors: number
  errorsByTool: Record<string, number>
  startedAt: number
  recent: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'agent-dashboard': { agents: AgentRow[]; overview: Overview; history: number[]; tokens: Tokens }
  }
}
