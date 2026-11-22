# Frontend F6b: CopilotKit client, chat on the agent, audit gate

Ticket: RR-62 (umbrella RR-43). Repo: `restaurant-researcher-app`. Tier: non-trivial, specialist approval.
Status: approved by the specialist with required edits applied, 2026-11-22. Parent spec: F6a (merged as #59).

## TL;DR

- The assistant panel stops answering from `stub-responder.ts` and shows the agent's answers: a `CopilotKitProvider` around the page, `ChatPanel` on `useAgent`, a "connecting" state and one fixed error line. Text chat only; frontend tools and tool timings are F7.
- Two PRs: **F6b-1** (RR-62a) adds `@copilotkit/react-core`, replaces the global zod 4 override with a scoped one, and adds an audit gate that accepts exactly one advisory on exactly four packages and fails when the exception is no longer needed (touches `.github`, owner merge). **F6b-2** (RR-62b) is the client wiring, stub removal, seeded Fogo de Chão, tests, docs.
- Owner decision 585 "A" (accept the residual high GHSA-mrhx-c7xc-m3w5, narrowly, expiring) is implemented by the gate, not by an `|| true`.
- A Chromium test of the built app, on CI, proves the provider loads in a real browser; the sandbox cannot run it, so its red state is shown on the draft PR's CI.
- The one `useEffect` in the app (`chat-panel.tsx`, focus on open) is removed (event-handler focus).
- Owner actions: merge two PRs; dismiss the matching GitHub security alert with a reason (he decides). Cost: none (no Azure resource, no paid API). RR deploys stay on hold; after F6b the deployed web app would show the chat as unavailable until RR-36 sets `AGENT_URL`.

## Goal and non-goals

Goal: a person types in the chat, the web app's runtime route (F6a) runs the agent, and the answer shows in the existing panel; failures show one fixed line; nothing from the stub remains.

Non-goals: frontend tools (`show_places`, `open_place`) and tool-call timings from live events (F7, RR-44); agent-driven board updates; durable threads (conversations stay in memory, a reload starts a new thread); deploy and infra (RR-32 to RR-36); CopilotKit's own chat components and `styles.css`.

## Facts the design rests on (probe on RR-62, comment 11919; F6a docs)

- `@copilotkit/react-core` 1.85.0 (newest past the 14-day cooldown). `@copilotkit/react-core/v2` imports `@copilotkit/a2ui-renderer` at load; with a global zod 4 override the renderer throws `Cannot read properties of undefined (reading 'call')`, because `@a2ui/web_core` 0.15.0 (zod ^3.25.76) is one shared node under both the runtime and react-core and the renderer's own zod stays 3.
- Scoped config that works (probe: install, Node imports, `next build`, provider page served by the built standalone server): overrides `@copilotkit/runtime: { zod: 4.6.7 }` and `@a2ui/web_core: { zod: 3.25.76 }`, no direct `zod` dependency, plus the existing `iconv-lite`, `undici` 6.29.1 and `graphql-scalars` 2.0.1.
- With that config `npm audit --omit=dev --audit-level=high` exits 1: 6 high, all from one advisory, GHSA-mrhx-c7xc-m3w5 (zod `<4.6.6`), in the two zod 3.25.76 copies under `@a2ui/web_core` and `@copilotkit/a2ui-renderer`, propagating to `@copilotkit/core`, `@copilotkit/react-core` and `@copilotkit/web-inspector`. No fix exists: `@a2ui/web_core` latest is 0.15.0, react-core 1.89 and 1.90 depend on it, and the 2.0.0 rc line carries it too.
- The owner accepted the advisory narrowly (decision 585 A, on the ticket RR-62); F6b-2 carries a test that keeps the accepted condition true.
- `useAgent({ agentId })` returns `{ agent, isReady }`; `agent.messages` and `agent.isRunning` drive the UI; a user turn is `agent.addMessage({ id, role: "user", content })` then `copilotkit.runAgent({ agent })` (`useCopilotKit()`); the provider takes `runtimeUrl`, `useSingleEndpoint`, `agentId`, `onError`. `isReady` is false until the runtime `/info` call answers.
- The F6a route is POST only in single-route mode: the client must set `useSingleEndpoint`. It answers an agent failure inside the stream as `RUN_ERROR` with a fixed message; an expired Easy Auth session shows as a failed fetch (the browser follows the 302 to the login host).
- `@copilotkit/react-core/v2/index.css` has no `@font-face` and no remote URL (checked), but is global CSS from a library: F6b does not import `styles.css`; the CSS that `index.mjs` pulls in is checked by the existing layout specs (two-column board, phone layout).
- Existing code to reuse: `chat-model.ts` (`toChatItems`, `activeToolLine`), `ChatView` (has `running`, `activeTool`, `error`), the accessible names `Ask about a place…`, `chat-messages`, `Open chat`, `Close chat`.

## Design

### PR split

- **F6b-1 (RR-62a), dependencies and audit gate.** `frontend/package.json` and lockfile: add `@copilotkit/react-core` 1.85.0 exact; remove the direct `zod` dependency and the global `zod: "$zod"` override; add the two scoped overrides. New `scripts/audit-gate.mjs` (Node, no dependencies) and `scripts/tests/test-audit-gate.sh` with recorded audit JSON fixtures. `security.yml`: the weekly `npm-audit` job runs the gate instead of `npm audit --omit=dev --audit-level=high`. `ci-local.sh` and the `checks` job run the gate's test. Docs: `docs/development.md` (overrides bullet replaced, the exception explained), `AGENTS.md` (security line). Touches `.github`: owner merge. `react-core` is installed but unused in this PR (it says so).
- **F6b-2 (RR-62b), the client.** Provider, chat on the agent, stub removal, tests, docs. Planned after F6b-1 merges (the weekly audit must never be red between the two).

### The audit gate (F6b-1)

`audit-gate.mjs` reads the file named in its first argument. The weekly job writes `npm audit --omit=dev --json` to a file, ignores only npm's exit code (npm exits 1 on any finding), then runs the gate on the file. It fails closed: input that is not JSON, an `error` key (registry or network failure) or a report without `vulnerabilities` and `metadata` fails. It exits 0 only when all of these hold:

1. Every vulnerability with severity high or critical is accounted for by one exception entry kept in the script: advisory `GHSA-mrhx-c7xc-m3w5`, package `zod`, affected installed paths exactly `node_modules/@a2ui/web_core/node_modules/zod` and `node_modules/@copilotkit/a2ui-renderer/node_modules/zod`, and the propagated package names exactly `@a2ui/web_core`, `@copilotkit/a2ui-renderer`, `@copilotkit/core`, `@copilotkit/react-core`, `@copilotkit/web-inspector`.
2. Any other high or critical advisory, any other package carrying this advisory, and any other installed path of `zod` below 4.6.6 fail the gate with the name printed.
3. **The exception must still be needed.** If the advisory no longer appears at all, or appears on fewer packages or paths than listed, the gate fails with "exception no longer needed: remove it from scripts/audit-gate.mjs". So it cannot outlive the fix.
4. Moderate and lower findings do not fail (as today: `--audit-level=high`).

Tests (`test-audit-gate.sh`, offline: they pipe recorded audit JSON into the script and never call `npm` or the registry; fixtures come from a real run of the scoped config). The exception names the advisory, the package and the exact paths, so the same advisory on any other package or path still fails: the fixture with exactly the six findings passes; the same plus a seventh high (another package) fails; a fixture where the zod copies are gone (fixed) fails with the stale-exception message; a fixture with the advisory on an extra path fails; an empty audit report fails (exception no longer needed); a real npm error document (`ENOLOCK`) fails; an empty file fails. The weekly job step fails visibly as before; its alert is the signal.

The matching GitHub Dependabot alert for zod stays open until the owner dismisses it with a reason in the GitHub UI (his action).

### Client (F6b-2)

- `app/providers.tsx` (client component): `CopilotKitProvider` with `runtimeUrl="/api/copilotkit"`, `useSingleEndpoint`, `agentId={AGENT_ID}` (from `app/agent.ts`, the same constant the route uses), no `styles.css`. `app/layout.tsx` wraps `children` in it; the layout stays a server component.
- `ChatPanel` loses `onPlaceFound` and the stub. It uses `useAgent({ agentId: AGENT_ID })` and `useCopilotKit()`: items from `toChatItems(agent.messages)`, `running` from `agent.isRunning`, `activeTool` from `activeToolLine(agent.messages)`. Sending: add the user message, then `await copilotkit.runAgent({ agent })` in a try/catch; the catch and the provider's `onError` set one error state that `ChatView` shows. An empty or busy send is ignored as before.
- Error line: one fixed text for every failure (run error event, network error, 4xx or 5xx from the route): "The assistant is unavailable. If this keeps happening your session may have expired: reload the page." No server text is shown. It clears on the next send.
- `ChatView` gets `ready: boolean`: while false the status reads "● connecting", the input, send button and suggestion chips are disabled. Test first, with the existing tests unchanged.
- No third-party requests and no developer overlay: `react-core` brings `@copilotkit/web-inspector`. The provider sets the developer console and the inspector off explicitly (the plan names the exact prop from the package's types). The browser spec asserts that during page load and one chat turn every request goes to the app's own origin and that no inspector element is in the page.
- Tool timings are not wired (`toChatItems` keeps its optional `timings` parameter for F7).
- `useEffect` removal: the sheet opens through an event handler that does `flushSync(() => setOpen(true)); inputRef.current?.focus();`; the `useEffect` import goes. Covered by a component test (focus after open) and the existing phone spec (`chatInput` focused after "Open chat").
- `page.tsx`: `addPlace` and the `onPlaceFound` prop are removed; `SEED_IDS` gains `fogo-de-chao-bishopsgate` (third seeded card, `page.test.tsx` expects three).
- Deleted: `stub-responder.ts` and its test; the stub-driven cases in `chat-panel.test.tsx` are replaced.
- Conversations are in memory on the server and a reload starts a new thread; that is the documented behaviour (F6a).

### Tests (test first; each catches a bug no other test catches)

- Component, jsdom, real `CopilotKitProvider` with a `fetch` fake that speaks the single-route envelope (`info`, `agent/run` as an SSE stream): "connecting" until `info` answers; a typed message and a suggestion chip each produce the agent's answer in the panel; a run that streams the F6a `RUN_ERROR` shows the fixed error line and not the event text; a rejected `fetch` shows the same line (the expired-session case); an empty and a busy send do nothing; the user message appears once; accessible names unchanged; focus after open.
- `ChatView`: the `ready` states (new tests only; existing ones unchanged).
- `page.test.tsx`: three seeded cards; the search tests stay.
- Browser (CI, Chromium, built app, two fakes): the existing hydration test keeps its "no page error, no console error, no 4xx or 5xx response" assertions and now runs with the provider; a new `e2e/chat.spec.ts` at 1280 and 360 px sends a message and shows "You asked: ..." from the fake agent, and a "fail" message shows the fixed error line. The stub-driven flows in `app.spec.ts` and `mobile.spec.ts` move to the seeded Fogo de Chão card. These specs are the real-browser proof that the provider loads; the sandbox cannot run them, so the red state is the draft PR's CI run before the implementation commit is pushed (tests commit first).
- Planted bugs before the PR: drop `useSingleEndpoint` (the component tests fail on the 404 or 405 of the GET `/info`), show server text in the error line, skip the `ready` gate, forget to clear the error, import `styles.css` (layout specs), re-add a `useEffect`.
- Audit gate tests as above.

### Docs (F6b-2)

`README.md` (lines 16, 26, 27, 32: the diagram's "Stub responder" and "Demo place fixtures" nodes become the route and the agent; the prose says the chat talks to the agent through `/api/copilotkit`), `AGENTS.md` (frontend bullet: the chat no longer answers from fixtures; gotcha on the provider `agent` prop: both ends exist), `docs/development.md` (lines 3 and 61: the "Fogo de Chão" chat example goes; a local chat run needs the agent app on `AGENT_URL` and the principal headers injected by a forwarder on 127.0.0.1, as in the RR #50 run). `deployment/README.md` line 3 is rewritten by the RR-34 spec; F6b leaves it out of its list.

### Cleanup commit (PAIR-46, owner 572, aggressive removal)

In every file the PR edits, a separate commit deletes comments that restate the code, narrate a change or point at a ticket, and tests that duplicate another test. Known candidates: `chat-view.tsx` (the "Tools the agent can reach in this phase" comment and the component doc), `chat-panel.tsx` (the `toItems` doc and docs left by the stub), `page.tsx` (seed and rating comments), `chat-model.ts` doc blocks, `app.spec.ts` and `mobile.spec.ts` (step narration), `chat-model.test.ts`. A large cleanup in one file is reported to the coordinator and becomes its own ticket.

## Risks and open questions

1. **Audit exception shape (specialist).** The gate names exact paths and packages; a CopilotKit patch release that moves the zod copies changes the paths and the gate fails (intended: it makes a person look). Alternative: match on advisory plus package name only. Recommendation: exact paths, because it is what the owner's "narrowly" asks for.
2. **Hard expiry date (owner, optional).** The exception already fails when no longer needed. Question for the owner: "Should the exception also fail on a fixed date (for example 2027-02-22) so someone must re-confirm it even while the advisory still has no fix?" Recommendation: no.
3. **Dismissing the GitHub zod alert (owner).** "Do you dismiss the open zod alert in GitHub as tolerable risk, with the reason text from RR-62?" His action in the UI.
4. **Deployed behaviour (coordinator).** After F6b merges the deployed web app, if deployed, answers the chat as unavailable until `AGENT_URL` is set (RR-36). RR deploys are on hold; the PR says: do not deploy the web app until RR-36, as for F4.
5. **Provider call at page load.** The provider calls `/api/copilotkit` (`info`) when the page loads. It does not contact the agent app, so it does not wake it; the first message does (cold start 15 to 40 seconds, the "● working" status covers it). Verified in the F6a probe (`info` is answered by the web app's runtime).
6. **Library CSS and bundle size (builder).** `index.mjs` pulls `index.css` (95 KB, no fonts); the layout specs catch visual damage. If the CSS breaks the board, the fallback is the `react-core/v2/headless` entry (listed in the package exports); the plan's first task checks the built page.
7. **Sandbox limit (specialist).** Chromium cannot start in the sandbox, so the real-browser proof exists only on CI. The tests-first commit goes to the draft PR first so its red state is on record before the implementation commit.
8. **`useEffect` rule (specialist).** The lint rule and a repo-wide removal come from the PAIR-46 design; F6b removes the app's only call by hand now and adds no lint rule.

9. **Workflow files (coordinator).** F6b-1 edits `.github/workflows/ci.yml` (one step for the gate's test) and `security.yml` (the weekly job); the workspace rule says stories touching one repo's `ci.yml` never run in parallel, so the AGENTS.md rules job (R2) and F6b-1 must be sequenced. Owner merge.

Questions for the specialist: 1 (exception shape), 6 (headless fallback), 7 (CI-only red state). For the owner, through the coordinator: 2 and 3, both optional.
