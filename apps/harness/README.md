# pharmeazor — Eve Durable Agent

Uses eve@1.0 filesystem-first durable backend agents.
Agent directory: agent/agent.ts + instructions.md + tools/ + skills/ + channels/ + schedules/ + subagents/
Standalone diagnostic: from the repository root run bun run eve:dev
Integrated Next.js projects use the root bun run dev/build/start lifecycle.
Docs: node_modules/eve/docs/README.md

On hosted Vercel, agent/sandbox.ts retains Vercel Sandbox. Other hosts use the
catalog-pinned just-bash interpreter, which provides a virtual filesystem and shell
commands without host binaries or network isolation. Runtime auto-installation is
disabled: install:bootstrap owns
the dependency graph and missing dependencies fail with setup guidance.
