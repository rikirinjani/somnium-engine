# Somnium Studio — Deployment Status v0.1

**Date:** 2026-09-17  
**Status:** Deployed and verified

---

## Deployment

| Item | Value |
|---|---|
| **Server** | `Somnium` (Vultr) at `45.32.122.6` |
| **Domain** | `studio.somnium.my.id` |
| **HTTPS** | Active (Cloudflare Flexible SSL) |
| **Web server** | nginx 1.28.3 (Ubuntu) |
| **Deployment directory** | `/var/www/somnium-studio/` |
| **SSL termination** | Cloudflare (Flexible mode) |
| **Firewall** | UFW: 22, 80, 443 open |

---

## Application

| Item | Value |
|---|---|
| **Deployed build** | Local build from `C:\Users\think\Project_v2\Somnium Studio\dist\` |
| **Build status** | `npm run typecheck` ✓, `npm test` ✓ (5/5), `npm run build` ✓ |
| **Core dependency** | Somnium Core via `somnium-core` alias (bundled in client) |
| **Backend** | None — fully static, client-side only |

---

## Production smoke-test results

Playwright test `smoke-production.spec.ts` passed (1/1, 11.7s):

| Step | Result |
|---|---|
| HTTPS loads | ✓ |
| Studio shell loads | ✓ |
| Verrin demo loads | ✓ |
| Timeline works | ✓ |
| Event selection works | ✓ |
| RP-VERRIN-001 works | ✓ |
| What If? works | ✓ |
| negateEvent(ev/blight-begins) confirmed | ✓ |
| Core derivation executes in browser Worker | ✓ |
| WorldDiff renders | ✓ |
| Why? renders | ✓ |
| Alternate World renders | ✓ |
| No browser-console errors | ✓ |
| No requests to localhost | ✓ |
| No backend/API dependency | ✓ |

---

## Infrastructure

### Ports/firewall

| Port | Service | Status |
|---|---|---|
| 22 | SSH | Open (existing) |
| 80 | HTTP / Cloudflare redirect | Open (existing) |
| 443 | HTTPS (Cloudflare) | Open (existing) |

### Services added

- nginx site config: `/etc/nginx/sites-available/somnium-studio`
- Static files: `/var/www/somnium-studio/`

### Services intentionally NOT added

- No certbot (Cloudflare handles TLS)
- No Node.js server
- No Docker
- No database
- No backend API
- No process manager

---

## Rollback

**Mechanism:** Keep previous version in `/var/www/somnium-studio-prev/` before each deploy.

**Rollback steps:**
```bash
ssh root@45.32.122.6
rm -rf /var/www/somnium-studio
mv /var/www/somnium-studio-prev /var/www/somnium-studio
```

No nginx reload needed — files are served directly.

---

## Known issues

- **Cloudflare Flexible SSL:** Traffic between Cloudflare and origin is unencrypted (HTTP). This is acceptable for a static site with no sensitive data. For stricter security, upgrade to Full mode with an Origin Certificate.
- **No cache invalidation:** Static assets use `Cache-Control: public, immutable` with 1-year expiry. HTML is set to no-cache. Deploying a new version requires cache-busting via filename hashes (Vite handles this).
- **`api-proxy` site exists on port 80:** The existing `api-proxy` nginx config is a catch-all (`server_name _`). The new `somnium-studio` config matches `studio.somnium.my.id` specifically, so it takes precedence for that domain.

---

*End of deployment status. Somnium Studio vertical slice is live on the Internet.*
