# Submission screenshot checklist

Use a 1440 × 900 desktop viewport, consistent browser zoom and the same selected agent. Capture the production build to avoid development controls. Keep secrets and personal caller details outside the frame.

| # | Screenshot | Page and exact state |
|---|---|---|
| 1 | Assembler landing/create | `/` at the top, Guided selected, hero and Built on AssemblyAI visible. |
| 2 | Starter Workflows | `/`, scroll to Starter Workflows; show all six cards and Start from scratch. Select Auto Repair and include its editable intent below if space permits. |
| 3 | Blueprint Review | `/` after Build blueprint; scroll to Blueprint ready, Agent and Data. Keep Advanced JSON closed. Local assembly works without AssemblyAI connectivity. |
| 4 | Data + Tools | `/agents/{id}/blueprint#data`, saved blueprint agent selected; capture fields, then `#tools` with real configuration/connection-required labels. Two frames are appropriate. |
| 5 | Rules + Workflow | `/agents/{id}/blueprint#rules`, readable rules and ordered workflow; keep technical rule details closed. |
| 6 | Agent Studio dashboard | `/dashboard`, select the same existing agent; show its highlighted sidebar entry, business name, configuration and actual analytics. |
| 7 | Calls / tool logs (optional) | `/dashboard#calls-leads` for actual calls; `/agents/{id}/blueprint#activity` for actual tool results and records. Skip when empty, or explicitly show the empty state. |

## Connectivity fallback

If AssemblyAI is unavailable, capture creation, starter workflows and locally assembled Blueprint Review. Capture Studio only when it has real saved data. Do not fabricate successful calls, records or connection states.

## Final capture check

- No credentials, refresh tokens, authorization headers or private caller details.
- No raw JSON as the main view.
- No claim that configuration means a successful test.
- Screenshots 4–5 require a saved agent Blueprint; screenshot 3 can show a locally assembled, uncreated Blueprint.
- Keep only the chosen submission images; temporary QA captures are unnecessary.
