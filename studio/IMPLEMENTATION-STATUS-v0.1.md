# Somnium Studio — Implementation Status v0.1

## Scope

First working vertical slice (V0–V9) of Somnium Studio: a React + TypeScript + Vite UI that consumes the Somnium Core public API, derives counterfactual worlds in a Web Worker, and presents the resulting canon, timeline, diff, causal evidence, and alternate-world views.

## Environment

- **Runtime:** Browser (Chromium/Playwright for manual smoke test).
- **Build:** Vite production build served locally on `http://127.0.0.1:4184/` via `serve-static.mjs`.
- **Core coupling:** Somnium Core is consumed through the `somnium-core` alias only; Core and Vultr were not modified.

## Completed checks

| Check | Command / step | Result |
|---|---|---|
| Static type check | `npm run typecheck` | Pass |
| Unit + smoke tests | `npx vitest run src/app/studio-smoke.test.ts` | 5/5 pass |
| Production build | `npm run build` | Pass |
| Static server restart | `node serve-static.mjs dist 4184` | Up |
| Manual browser smoke test | `playwright test smoke-manual.spec.ts` | Pass |

## Manual smoke-test journey

The Playwright production smoke test completed the full journey:

1. Load Verrin Demo (project header shows “Verrin Demo”).
2. Default tab after load is **Timeline**.
3. Select **The Blight Begins** event.
4. Click **What if The Blight Begins changed?**.
5. Confirm `negateEvent` intervention targeting `ev/blight-begins`.
6. Click **Confirm & Derive**.
7. Diff view appears with **WorldDiff** and status changes.
8. Click **Why?** on a changed node; **Why?** tab shows causal grounding.
9. Switch to **World** tab and confirm alternate world view.
10. No browser console errors or page errors.

## Defects found and fixed during this session

### D001 — Worker message contract mismatch

**Symptom:** Production build hung on “Loading…”. Footer showed:

```text
Error: Error: Cannot read properties of undefined (reading 'canon')
```

**Root cause:** `src/core-adapter/adapter.ts` sent the derive request as a flat object:

```text
{ type: 'derive', id, canon, interventions, rp }
```

`src/core-adapter/worker.ts` expected the structured protocol:

```text
{ type: 'derive', id, payload: { canon, interventions, rp } }
```

Because `event.data.payload` was `undefined`, `payload.canon` threw.

**Fix:** Updated `adapter.ts` to construct and post the exact `CoreWorkerRequest` shape:

```text
{
  type: 'derive',
  id,
  payload: { canon, interventions, rp }
}
```

Also changed `DeriveInput` in `types.ts` to alias `CoreWorkerRequest` so the adapter and worker share one protocol definition.

**Regression test:** Added `src/app/studio-smoke.test.ts` test case `posts a Worker request matching the CoreWorkerRequest contract` that mocks `globalThis.Worker`, captures the posted message, and asserts `type`, `id`, `payload.canon`, `payload.interventions`, and `payload.rp`.

## Files changed

- `src/core-adapter/adapter.ts`
- `src/core-adapter/types.ts`
- `src/app/studio-smoke.test.ts`
- `smoke-manual.spec.ts`

## Remaining work

- Vultr deployment is the next task after this clean result.
- No further feature development is authorized under this status record.

## Verification artifacts

- TypeScript: no errors.
- Vitest smoke tests: 5/5 pass.
- Vite production build: success.
- Playwright manual smoke: 1/1 pass, no console/page errors.
