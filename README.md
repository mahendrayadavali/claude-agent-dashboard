# agent-dashboard

A small Claude Code mod that draws a live **Dashboard** pane: which agents are running, what they are doing, and an overview of your session. It is meant as a readable example of how to build a mod with a pane, a slash command, timers and shared state.

## What it shows

- **Agents live**: a count of running or queued agents, with a small chart of the last 24 seconds.
- **Your agents**: each agent's name, task and status (Thinking, Running, Queued, Done, Failed, Stopped), with a bar that fills as the agent makes tool calls. Finished agents stay listed (up to 20), and running ones are never dropped to make room.
- **Tokenomics**: tokens used this session and its cost in dollars, split between the main session and agents.
  - Each agent's total and the share read from cache.
  - Start-up cost: what each agent spends on its first request, reading instructions and context before doing any work. This is usually most of a short agent's tokens.
- **Second brain**: a node graph that lights up as you work, with three counts.
  - Projects: distinct folders you wrote to or edited.
  - Tasks: task-list items created, and how many are done.
  - Notes: distinct files written or edited.
- **Tool calls**: bars for your most-used tools, calls per minute, success rate and per-tool failure counts.
- **Recent activity**: the last few tool calls with their target (file, command or pattern); failures in red.
- **Session clock**: uptime in the header, plus a status-line entry (`◉ 2 live · 14 calls · 1 err`).
- **Toasts**: a notice when an agent finishes or fails.
- **Reply box**: text you type here is sent to Claude as a prompt.

The progress bars count tool calls. Claude does not report a true percentage.

## Install

In a terminal Claude Code session:

```
/plugin install agent-dashboard --marketplace mahendrayadavali/claude-agent-dashboard
```

Answer `y` to add the marketplace, then pick a scope. The mod is active at once. The command is a terminal one; the desktop app's Code tab does not run it.

To try it from a local copy instead:

```
claude --plugin-dir /path/to/claude-agent-dashboard
```

## Use

Slash commands: `/dashboard` opens the pane; `/dashboard summary` prints a session recap; `/dashboard tokens` lists tokens per agent; `/dashboard files` lists files written; `/dashboard reset` zeroes the counters; `/dashboard help` shows usage.

The pane opens when the session starts. Run `/dashboard` to open it again. If your screen has no room for a pane, the command says so and prints a one-line summary.

## How it works

Everything is in `hooks/register.tsx`.

| Piece | What it does |
| --- | --- |
| `on('session.start')` | Registers `/dashboard`, opens the pane, and starts a one-second timer with `$.clock.every` that reads `$.agent.list()`. |
| `atom`, `read`, `update` | Hold the agents, history and overview values. A write redraws whatever reads the value. |
| `on('tool.call')` | Counts each tool call, per tool and per agent, and tracks tasks and files. It lets the call continue with `next(e)`. |
| `on('ui.render', { component: 'Pane' })` | Draws the pane with `Box`, `Text` and `Input` from `$.ui.resolve(e)`. |
| `on('ui.input', { element: 'reply' })` | Sends the reply box text with `$.prompt.submit`. |
| `on('turn.step', async function* …)` | Watches every model request as it streams. After `yield* next(e)` it adds the request's `usage` to the main session or to the agent in `e.agentId`. |
| `on('command.run')` | Answers `/dashboard` and reports whether the pane was placed. |

`types/index.d.ts` declares the values the mod keeps, so tools can check every state key it names.

## Develop

```
claude plugin validate .
claude plugin test .
```

`hooks/register.test.ts` renders the pane and checks its headings.

## Limits

- Drawn for the terminal surface. Other surfaces may omit the reply box.
- Counts cover the current session only and restart when the session does.

## License

MIT
