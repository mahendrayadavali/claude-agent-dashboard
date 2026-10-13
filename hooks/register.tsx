import { atom, read, update } from 'claude-code'
import type { ElementConstructor, InputProps, Register } from 'claude-code'

import type { AgentRow, Overview } from '../types'

const PANE = 'agent-dashboard'
const ACCENT = '#d97757'
const agents = atom({ plugin: 'agent-dashboard', key: 'agents' } as const, [] as AgentRow[])
const history = atom({ plugin: 'agent-dashboard', key: 'history' } as const, [] as number[])
const overview = atom(
  { plugin: 'agent-dashboard', key: 'overview' } as const,
  {
    tools: 0,
    done: 0,
    byTool: {},
    perAgent: {},
    tasks: 0,
    tasksDone: 0,
    notes: [],
    folders: [],
  } as Overview,
)

const LIVE = ['pending', 'running', 'waiting']
const BLOCKS = '▁▂▃▄▅▆▇█'

const bar = (n: number, max: number, width = 20) => {
  const filled = max <= 0 ? 0 : Math.min(width, Math.max(n > 0 ? 1 : 0, Math.round((n / max) * width)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

const spark = (values: number[]) => {
  const top = Math.max(1, ...values)
  return values.map(v => BLOCKS[Math.min(7, Math.round((v / top) * 7))]).join('')
}

const tagFor = (a: AgentRow, calls: number): { label: string; color: string } => {
  if (a.status === 'running') return calls === 0 ? { label: 'Thinking', color: ACCENT } : { label: 'Running', color: 'green' }
  if (a.status === 'pending' || a.status === 'waiting' || a.status === 'idle') return { label: 'Queued', color: 'gray' }
  if (a.status === 'completed') return { label: 'Done', color: 'cyan' }
  if (a.status === 'failed') return { label: 'Failed', color: 'red' }
  return { label: 'Stopped', color: 'gray' }
}

const dirOf = (path: string) => path.split('/').slice(0, -1).join('/') || '/'
const push = (list: string[], v: string) => (list.includes(v) ? list : [...list, v].slice(-500))

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'dashboard',
      description: 'Open the agent dashboard pane',
    })
    void $.ui.open({ id: PANE, title: 'Dashboard' })
    $.clock.every(1000, async () => {
      const list = await $.agent.list()
      await update($, agents, () =>
        list.map(a => ({
          id: a.id,
          name: a.name ?? a.type,
          task: a.description,
          status: a.status,
        })),
      )
      const live = list.filter(a => LIVE.includes(a.status)).length
      await update($, history, h => [...h, live].slice(-24))
    })

    return next(e)
  })

  on('command.run', { command: 'dashboard' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: 'Dashboard' })
    const live = (await $.agent.list()).filter(a => LIVE.includes(a.status)).length
    const stats = await read($, overview)
    const summary = `${live} agents live · ${stats.tools} tool calls this session.`

    return {
      text: opened.isPlaced
        ? `Dashboard opened. ${summary}`
        : `This screen has no room to draw the Dashboard pane. ${summary}`,
    }
  })

  on('tool.call', async ($, e, next) => {
    const args = e as unknown as Record<string, unknown>
    const path = typeof args.file_path === 'string' ? args.file_path : ''
    const agentId = (e as unknown as { agentId?: string }).agentId
    await update($, overview, o => ({
      ...o,
      tools: o.tools + 1,
      byTool: { ...o.byTool, [e.tool]: (o.byTool[e.tool] ?? 0) + 1 },
      perAgent: agentId ? { ...o.perAgent, [agentId]: (o.perAgent[agentId] ?? 0) + 1 } : o.perAgent,
      tasks: e.tool === 'TaskCreate' ? o.tasks + 1 : o.tasks,
      tasksDone:
        e.tool === 'TaskUpdate' && args.status === 'completed' ? o.tasksDone + 1 : o.tasksDone,
      notes: path && (e.tool === 'Write' || e.tool === 'Edit') ? push(o.notes, path) : o.notes,
      folders: path ? push(o.folders, dirOf(path)) : o.folders,
    }))
    const ran = await next(e)
    await update($, overview, o => ({ ...o, done: o.done + 1 }))

    return ran
  })

  on('ui.input', { element: 'reply' }, async ($, e, next) => {
    if (e.kind === 'submit' && e.value.trim()) {
      void $.prompt.submit({ text: e.value.trim() })
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, ...rest } = $.ui.resolve(e)
    const Input = (rest as { Input?: ElementConstructor<InputProps> }).Input
    const list = await read($, agents)
    const stats = await read($, overview)
    const hist = await read($, history)
    const live = list.filter(a => LIVE.includes(a.status)).length
    const total = stats.tasks + stats.notes.length + stats.folders.length
    const lit = Math.min(9, Math.ceil(total / 2))
    const n = (i: number) => (i < lit ? '●' : '○')
    const top = Object.entries(stats.byTool)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
    const peak = top[0]?.[1] ?? 0

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold color={ACCENT}>
            ✺ Dashboard
          </Text>
          <Text dimColor>RIGHT INSIDE CLAUDE CODE</Text>
        </Box>

        <Box flexDirection="column" borderStyle="round" paddingX={1}>
          <Text>
            <Text bold color={ACCENT}>
              {live}
            </Text>{' '}
            <Text dimColor>AGENTS LIVE</Text>
          </Text>
          <Text color={ACCENT}>{hist.length ? spark(hist) : '▁'}</Text>
        </Box>

        <Box flexDirection="column" borderStyle="round" paddingX={1}>
          <Text bold>Your agents</Text>
          <Text dimColor>WHAT THEY'RE DOING RIGHT NOW</Text>
          {list.length === 0 && <Text dimColor>No agents yet. Ask Claude to run one.</Text>}
          {list.slice(-6).map(a => {
            const calls = stats.perAgent[a.id] ?? 0
            const tag = tagFor(a, calls)
            const isLive = LIVE.includes(a.status)

            return (
              <Box flexDirection="column">
                <Text>
                  <Text color={ACCENT}>({a.name.charAt(0).toUpperCase()})</Text> <Text bold>{a.name}</Text>{' '}
                  <Text color={tag.color}>● {tag.label}</Text>
                </Text>
                <Text dimColor>
                  {'    '}
                  {a.task}
                  {calls ? ` · ${calls} tool calls` : ''}
                </Text>
                <Text color={isLive ? ACCENT : undefined} dimColor={!isLive}>
                  {'    '}
                  {bar(a.status === 'completed' ? 10 : calls, 10, 24)}
                </Text>
              </Box>
            )
          })}
        </Box>

        <Box flexDirection="column" borderStyle="round" paddingX={1}>
          <Text bold>Second brain</Text>
          <Text dimColor>THE FULL OVERVIEW</Text>
          <Text color={ACCENT}> {n(0)}──{n(1)}──{n(2)}</Text>
          <Text color={ACCENT}> │ ╲ │ ╱ │</Text>
          <Text color={ACCENT}> {n(3)}──{n(4)}──{n(5)}</Text>
          <Text color={ACCENT}> │ ╱ │ ╲ │</Text>
          <Text color={ACCENT}> {n(6)}──{n(7)}──{n(8)}</Text>
          <Text>
            Projects <Text bold color={ACCENT}>{stats.folders.length}</Text> <Text dimColor>folders touched</Text>
          </Text>
          <Text>
            Tasks <Text bold color={ACCENT}>{stats.tasks}</Text>{' '}
            <Text dimColor>{stats.tasksDone} done</Text>
          </Text>
          <Text>
            Notes <Text bold color={ACCENT}>{stats.notes.length}</Text> <Text dimColor>files written</Text>
          </Text>
        </Box>

        <Box flexDirection="column">
          <Text bold>Tool calls</Text>
          <Text dimColor>
            {stats.tools} total · {stats.done} finished
          </Text>
          {top.map(([tool, count]) => (
            <Text>
              {bar(count, peak, 14)} {count} <Text dimColor>{tool}</Text>
            </Text>
          ))}
        </Box>

        {Input && (
          <Input key="reply" placeholder="Reply to Claude…" submitLabel="send" onSubmit={() => {}} />
        )}
      </Box>
    )
  })
}
