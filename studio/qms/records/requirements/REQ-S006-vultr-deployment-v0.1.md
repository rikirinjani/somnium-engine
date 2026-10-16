# REQ-S006 — Vultr Deployment v0.1

**Requirement:** Deploy the Somnium Studio vertical slice to a Vultr instance with HTTPS and a domain.

**Status:** Fulfilled  
**Date:** 2026-09-17

---

## Requirement statement

Deploy the working Somnium Studio vertical slice to the Internet using the simplest viable production architecture. The deployment must demonstrate the full counterfactual derivation journey end-to-end using the real deployed application.

## Acceptance criteria

| ID | Criterion | Status |
|---|---|---|
| D1 | HTTPS loads | ✓ |
| D2 | Studio shell loads | ✓ |
| D3 | Verrin demo loads | ✓ |
| D4 | Canon view works | ✓ |
| D5 | Timeline works | ✓ |
| D6 | Event selection works | ✓ |
| D7 | RP-VERRIN-001 works | ✓ |
| D8 | What If? works | ✓ |
| D9 | negateEvent(ev/blight-begins) can be confirmed | ✓ |
| D10 | Core derivation executes inside the browser Worker | ✓ |
| D11 | WorldDiff renders | ✓ |
| D12 | Why? renders | ✓ |
| D13 | Alternate World renders | ✓ |
| D14 | No browser-console errors occur | ✓ |
| D15 | No requests are unexpectedly made to localhost | ✓ |
| D16 | No backend/API dependency exists | ✓ |
| D17 | Refreshing relevant application routes works | ✓ |

## Deployment artifacts

- `DEPLOYMENT-STATUS-v0.1.md` — full deployment record
- `smoke-production.spec.ts` — automated production smoke test
- nginx config: `/etc/nginx/sites-available/somnium-studio`
- Static files: `/var/www/somnium-studio/`

## Verification evidence

- Playwright production smoke test: 1/1 passed (11.7s)
- Full counterfactual journey: Verrin Demo → Timeline → Event → What If? → negateEvent → Confirm & Derive → WorldDiff → Why? → World
- No console errors, no page errors
- HTTPS active via Cloudflare Flexible SSL

## Notes

- Domain `studio.somnium.my.id` was registered during this task
- Cloudflare handles TLS termination (Flexible mode)
- nginx serves static files only; no server-side processing
- Rollback mechanism: `/var/www/somnium-studio-prev/`
