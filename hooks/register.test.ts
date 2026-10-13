import { expect, mock, test } from 'claude-code/testing'

test('the dashboard pane draws agents and overview', async ($, on) => {
  mock.clock(on)
  const tree = await $.ui.render({ component: 'Pane', requestId: 'agent-dashboard', surface: 'terminal', props: {} } as never)
  const text = JSON.stringify(tree)
  expect(text).toContain('Your agents')
  expect(text).toContain('Second brain')
  expect(text).toContain('AGENTS LIVE')
  expect(text).toContain('Reply to Claude')
})

test('the pane shows uptime, failures and recent activity', async ($, on) => {
  mock.clock(on)
  const tree = await $.ui.render({ component: 'Pane', requestId: 'agent-dashboard', surface: 'terminal', props: {} } as never)
  const text = JSON.stringify(tree)
  expect(text).toContain('Recent activity')
  expect(text).toContain('no failures')
})

test('/dashboard help lists the subcommands', async ($, on) => {
  mock.clock(on)
  const out = await $.command.run({ command: 'dashboard', args: 'help' } as never)
  expect(JSON.stringify(out)).toContain('summary')
})

test('/dashboard summary reports the session', async ($, on) => {
  mock.clock(on)
  const out = await $.command.run({ command: 'dashboard', args: 'summary' } as never)
  expect(JSON.stringify(out)).toContain('tool calls')
})

test('the pane has a Tokenomics section and /dashboard tokens answers', async ($, on) => {
  mock.clock(on)
  const tree = await $.ui.render({ component: 'Pane', requestId: 'agent-dashboard', surface: 'terminal', props: {} } as never)
  expect(JSON.stringify(tree)).toContain('Tokenomics')
  const out = await $.command.run({ command: 'dashboard', args: 'tokens' } as never)
  expect(JSON.stringify(out)).toContain('Main session')
})
