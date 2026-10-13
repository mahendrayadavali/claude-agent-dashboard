import { expect, test } from 'claude-code/testing'

test('the dashboard pane draws agents and overview', async $ => {
  const tree = await $.ui.render({ component: 'Pane', requestId: 'agent-dashboard', surface: 'terminal', props: {} } as never)
  const text = JSON.stringify(tree)
  expect(text).toContain('Your agents')
  expect(text).toContain('Second brain')
  expect(text).toContain('AGENTS LIVE')
  expect(text).toContain('Reply to Claude')
})
