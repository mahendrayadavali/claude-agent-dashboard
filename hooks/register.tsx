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
    errors: 0,
    errorsByTool: {},
    startedAt: 0,
    recent: [],
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
const base = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path

const elapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : m > 0 ? `${m}m ${s % 60}s` : `${s}s`
}

// A short human label for what a tool call is acting on.
const target = (args: Record<string, unknown>) => {
  for (const k of ['file_path', 'command', 'pattern', 'url', 'description', 'path']) {
    const v = args[k]
    if (typeof v === 'string' && v) return (k === 'file_path' || k === 'path' ? base(v) : v).replace(/\s+/g, ' ').slice(0, 40)
  }
  return ''
}

const HELP = 'Usage: /dashboard [open | summary | files | reset | help]'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'dashboard',
      description: 'Open the agent dashboard pane (summary, files, reset)',
    })
    void $.ui.open({ id: PANE, title: 'Dashboard' })
    const t0 = await $.clock.now()
    await update($, overview, o => (o.startedAt ? o : { ...o, startedAt: t0 }))

    const seen = new Map<string, string>()
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
      // Toast when an agent changes to a finished state.
      for (const a of list) {
        const prev = seen.get(a.id)
        seen.set(a.id, a.status)
        if (prev && prev !== a.status) {
          const name = a.name ?? a.type
          if (a.status === 'completed') $.ui.toast(`✓ ${name} finished`)
          else if (a.status === 'failed') $.ui.toast(`✗ ${name} failed`)
        }
      }
      const live = list.filter(a => LIVE.includes(a.status)).length
      await update($, history, h => [...h, live].slice(-24))

      // Status line: live agents, calls, errors.
      const stats = await read($, overview)
      $.ui.status(
        live || stats.tools
          ? `◉ ${live} live · ${stats.tools} calls${stats.errors ? ` · ${stats.errors} err` : ''}`
          : undefined,
      )
    })

    return next(e)
  })

  on('command.run', { command: 'dashboard' }, async ($, e) => {
    const sub = e.args.trim().toLowerCase()
    const stats = await read($, overview)
    const now = await $.clock.now()
    const upMs = stats.startedAt ? now - stats.startedAt : 0

    if (sub === 'help') return { text: HELP }

    if (sub === 'reset') {
      await update($, overview, o => ({
        ...o,
        tools: 0,
        done: 0,
        byTool: {},
        perAgent: {},
        tasks: 0,
        tasksDone: 0,
        notes: [],
        folders: [],
        errors: 0,
        errorsByTool: {},
        recent: [],
        startedAt: now,
      }))
      await update($, history, () => [])
      return { text: 'Dashboard counters reset.' }
    }

    if (sub === 'files') {
      return {
        text: stats.notes.length
          ? `Files written (${stats.notes.length}):\n${stats.notes.slice(-20).map(f => `  ${f}`).join('\n')}`
          : 'No files written yet this session.',
      }
    }

    if (sub === 'summary') {
      const top = Object.entries(stats.byTool)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([t, c]) => `${t} ${c}`)
        .join(', ')
      const rate = upMs > 60000 ? ` (${(stats.tools / (upMs / 60000)).toFixed(1)}/min)` : ''
      return {
        text: [
          `Session ${elapsed(upMs)} · ${stats.tools} tool calls${rate} · ${stats.errors} errors`,
          `Tasks ${stats.tasksDone}/${stats.tasks} done · ${stats.notes.length} files written · ${stats.folders.length} folders`,
          top ? `Top tools: ${top}` : 'No tool calls yet.',
        ].join('\n'),
      }
    }

    const opened = await $.ui.open({ id: PANE, title: 'Dashboard' })
    const live = (await $.agent.list()).filter(a => LIVE.includes(a.status)).length
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
    const label = `${e.tool} ${target(args)}`.trim()
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
      recent: [...o.recent, label].slice(-8),
    }))
    const ran = await next(e)
    const failed = Boolean((ran as { isError?: boolean; deny?: string }).isError || (ran as { deny?: string }).deny)
    await update($, overview, o => ({
      ...o,
      done: o.done + 1,
      errors: failed ? o.errors + 1 : o.errors,
      errorsByTool: failed ? { ...o.errorsByTool, [e.tool]: (o.errorsByTool[e.tool] ?? 0) + 1 } : o.errorsByTool,
      recent: failed ? [...o.recent.slice(0, -1), `✗ ${label}`] : o.recent,
    }))

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
    const now = await $.clock.now()
    const upMs = stats.startedAt ? now - stats.startedAt : 0
    const live = list.filter(a => LIVE.includes(a.status)).length
    const total = stats.tasks + stats.notes.length + stats.folders.length
    const lit = Math.min(9, Math.ceil(total / 2))
    const n = (i: number) => (i < lit ? '●' : '○')
    const top = Object.entries(stats.byTool)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
    const peak = top[0]?.[1] ?? 0
    const okRate = stats.done ? Math.round(((stats.done - stats.errors) / stats.done) * 100) : 100
    const perMin = upMs > 60000 ? (stats.tools / (upMs / 60000)).toFixed(1) : String(stats.tools)
    const taskPct = stats.tasks ? Math.round((stats.tasksDone / stats.tasks) * 100) : 0

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold color={ACCENT}>
            ✺ Dashboard
          </Text>
          <Text dimColor>RIGHT INSIDE CLAUDE CODE · UP {elapsed(upMs)}</Text>
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
            <Text dimColor>{stats.tasksDone} done{stats.tasks ? ` · ${taskPct}%` : ''}</Text>
          </Text>
          <Text>
            Notes <Text bold color={ACCENT}>{stats.notes.length}</Text> <Text dimColor>files written</Text>
          </Text>
          {stats.notes.slice(-3).map(f => (
            <Text dimColor>{'  '}· {base(f)}</Text>
          ))}
        </Box>

        <Box flexDirection="column">
          <Text bold>Tool calls</Text>
          <Text dimColor>
            {stats.tools} total · {stats.done} finished · {perMin}
            {upMs > 60000 ? '/min' : ''}
          </Text>
          <Text color={stats.errors ? 'red' : 'green'}>
            {stats.errors ? `✗ ${stats.errors} failed` : '✓ no failures'} <Text dimColor>· {okRate}% ok</Text>
          </Text>
          {top.map(([tool, count]) => (
            <Text>
              {bar(count, peak, 14)} {count} <Text dimColor>{tool}</Text>
              {stats.errorsByTool[tool] ? <Text color="red"> ✗{stats.errorsByTool[tool]}</Text> : null}
            </Text>
          ))}
        </Box>

        <Box flexDirection="column">
          <Text bold>Recent activity</Text>
          {stats.recent.length === 0 && <Text dimColor>Nothing yet.</Text>}
          {stats.recent
            .slice(-5)
            .reverse()
            .map(r => (
              <Text color={r.startsWith('✗') ? 'red' : undefined} dimColor={!r.startsWith('✗')}>
                {r.startsWith('✗') ? r : `· ${r}`}
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
