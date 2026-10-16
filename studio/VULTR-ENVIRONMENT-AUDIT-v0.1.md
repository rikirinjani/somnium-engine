# Somnium Studio Vultr Environment Audit v0.1

**Status:** Discovery-only audit. No Vultr resources modified or deployed.  
**Date:** 2026-09-17  
**Scope:** Inspect available Vultr environment and current Somnium Studio implementation state to inform future deployment design.

---

## 1. Purpose

Before any deployment, hosting, networking, database, CI/CD, or cloud architecture decisions are made, this document records:

1. The actual current state of the Somnium Studio implementation.
2. The Vultr resources currently accessible to the project.
3. What the current vertical slice actually requires.
4. The simplest viable deployment topology supported by both (1) and (2).
5. Blockers and unknowns that must be resolved before deploying.

This is a read-only audit. No resources were created, modified, deleted, restarted, resized, or reconfigured.

---

## 2. Audit timestamp

- Audit performed: 2026-09-17.
- Local machine public IP observed: `158.140.167.84`.
- Accessible Vultr instance: `PM-1` at `155.138.237.162`.
- No Vultr API access was available during this audit (see §13).

---

## 3. Studio baseline

### Repository / path

- Studio product-track directory: `C:\Users\think\Project_v2\Somnium Studio\`.
- The Studio directory is **not a git repository** (no `.git` present).
- It sits under the `Project_v2` working tree, which is a git repository with many untracked directories including `Somnium Studio/`.

### Current documents in the Studio directory

| File | Size | Purpose |
|---|---|---|
| `PRODUCT-CONTRACT-v0.1.md` | 36,468 bytes | Product definition and Core/Studio boundary. |
| `UX-SPEC-v0.1.md` | 26,346 bytes | User experience specification. |
| `ARCHITECTURE-v0.1.md` | 32,916 bytes | Software architecture. |
| `VERTICAL-SLICE-PLAN-v0.1.md` | 31,095 bytes | Implementation plan for the first end-to-end slice. |
| `qms/records/requirements/REQ-S001…S004*.md` | various | QMS requirement records. |

### Implementation status

**Critical finding:** The Studio directory contains **only planning documents**. There is **no implementation yet**.

- No `package.json`.
- No `src/` directory.
- No build command, no dev server command, no test command.
- No runtime dependencies installed.
- No environment variables or secrets configured for Studio.

### Planned runtime requirements (from `VERTICAL-SLICE-PLAN-v0.1.md`)

| Requirement | Planned value | Source |
|---|---|---|
| Platform | Web app (browser) | Architecture §12. |
| Frontend framework | React + TypeScript | Architecture §12. |
| Build tool | Vite | Architecture §12. |
| State management | Zustand or Jotai | Architecture §12. |
| Core execution | Web Worker, client-side | Architecture §3, §7; Vertical Slice Plan §7. |
| Persistence | Local JSON files (File System Access API or download/upload) | Architecture §5; Vertical Slice Plan §9. |
| Backend service | None for the vertical slice. | Product Contract §11; Architecture §13. |
| Database | None for the vertical slice. | Architecture §5. |
| LLM | Deferred; deterministic-only slice. | Vertical Slice Plan §10. |
| Env vars / secrets | None required for Core; only an optional LLM key later. | Product Contract §8. |

### Core/Studio boundary at this stage

The planned boundary is entirely **local / in-browser / Web Worker** for the vertical slice:

```text
Browser
  ↓
Studio React app
  ↓
Core Adapter
  ↓
Web Worker running Somnium Core
```

No server-side Core execution is required for the magic moment.

---

## 4. Vultr resource inventory

### Accessible instance: PM-1

Direct SSH access to the following instance was verified using key-based authentication.

| Property | Value |
|---|---|
| Hostname | `PM-1` |
| Public IPv4 | `155.138.237.162` |
| Instance ID | `17249fe2-9ec4-46b0-9df9-a7e7729e55dd` (from prior task file `TASK_009_VULTR_INFRA.md`) |
| Region | inferred `atl` (Atlanta) from metadata route / prior task file |
| vCPU | 4 |
| RAM | 30 GiB (29 GiB available) |
| Disk | 225 GB total, 185 GB free |
| OS | Ubuntu 26.04.1 LTS |
| Kernel | 7.0.0-30-generic |
| Architecture | x86_64 |
| Node.js | 22.23.2 (installed from NodeSource) |
| npm | bundled with Node.js 22 |
| Python | 3.14.4 |

### Other instances

The prior task file `TASK_009_VULTR_INFRA.md` mentions three additional active Vultr instances:

| Name | Plan | Region |
|---|---|---|
| `Somnium` | `voc-c-2c-4gb-50s-amd` | `sgp` |
| `RAG` | `voc-c-2c-4gb-50s-amd` | `sgp` |
| `EA` | `voc-c-2c-4gb-50s-amd` | `sgp` |

These were **not directly inspected** in this audit because:

- No Vultr API access was available (see §13).
- Their public IPs were not discovered.
- They are located in a different region (`sgp`) than `PM-1` (`atl`).

The existence and specs above are taken from `TASK_009_VULTR_INFRA.md` and are marked as **unverified by direct observation**.

### Instances explicitly NOT present

- No GPU instance was observed running.
- No load balancer was observed.
- No Kubernetes cluster was observed.

---

## 5. Network inventory

### PM-1 network configuration

| Property | Value |
|---|---|
| Public IPv4 | `155.138.237.162/23` |
| Gateway | `155.138.236.1` |
| DNS | `108.61.10.10`, `108.61.115.10`, plus IPv6 resolvers |
| Interface | `enp1s0` (Ethernet, MAC `56:00:06:ab:f7:8d`) |
| IPv6 | link-local only (`fe80::5400:6ff:feab:f78d/64`) |

### Firewall (UFW) on PM-1

| Status | Rule |
|---|---|
| Active | Default deny incoming, allow outgoing, routed disabled. |
| Allowed inbound | `22/tcp` (SSH) from Anywhere. |
| Blocked inbound | All other ports (HTTP/HTTPS not open). |

### Listening services on PM-1

| Port | Service | Bind address | Notes |
|---|---|---|---|
| 22 | `sshd` | `0.0.0.0` and `[::]` | SSH access. |
| 53 | `systemd-resolve` | `127.0.0.53`, `127.0.0.54` | Local DNS resolution. |
| 11434 | `ollama` | `127.0.0.1` | Local Ollama API (not exposed publicly). |
| 40149 | `llama-server` | `127.0.0.1` | Ollama model runtime (private). |

No web server, reverse proxy, or application port is publicly exposed.

### Local machine network context

- Local public IP: `158.140.167.84`.
- SSH to `155.138.237.162` succeeds without password (key-based).
- `~/.ssh/known_hosts` contains `155.138.237.162`.
- No Tailscale/VPN route to Vultr private network observed; communication is over public internet.

---

## 6. Runtime / container inventory

### Present on PM-1

| Runtime | Status |
|---|---|
| Node.js 22.23.2 | Installed. |
| Python 3.14.4 | Installed. |
| Ollama | Running locally (127.0.0.1:11434). |
| systemd-resolve | Running. |
| sshd | Running. |

### Absent on PM-1

| Runtime | Status |
|---|---|
| Docker | Not installed. |
| Podman | Not installed. |
| nginx | Not installed. |
| Apache | Only `apache2-utils` present; no server. |
| Caddy | Not installed. |
| Traefik | Not installed. |
| certbot | Not installed. |
| Kubernetes | Not present. |
| PM2 / process manager | Not observed. |

---

## 7. Domain / DNS / TLS findings

| Item | Finding |
|---|---|
| Domain name for Studio | None discovered. |
| DNS records | None discovered. |
| TLS certificate | None present. |
| certbot | Not installed. |
| `/etc/hosts` on PM-1 | Only localhost entries. |
| Local `hosts` file | Tailscale entries only; no Studio domain. |

No domain or TLS infrastructure is currently available for Somnium Studio.

---

## 8. Security observations

### Findings

| # | Observation | Severity |
|---|---|---|
| 1 | UFW default-deny incoming with only SSH open is a conservative posture. | Positive. |
| 2 | Ollama and llama-server bind only to `127.0.0.1`; not publicly exposed. | Positive. |
| 3 | SSH is exposed on `0.0.0.0:22`. This is standard but should ideally be restricted to known IPs. | Medium. |
| 4 | No web server ports (80/443) are open, so there are no public web services to attack. | Positive. |
| 5 | No `.env` files, API keys, or secrets were observed in the Somnium Studio directory. | Positive. |
| 6 | No production configuration accidentally containing development values was found (because no implementation exists). | N/A. |

### Not inspected

- SSH key strength and authorized_keys contents were not audited.
- OS patch level and unattended-upgrades status were not deeply inspected.
- Vultr account-level firewall groups, VPC, or API key permissions were not accessible.

---

## 9. Current Studio requirements

Because the Studio implementation does not yet exist, this section lists what the **vertical slice plan** requires from infrastructure.

### Required now

| Requirement | Why |
|---|---|
| A server or static host with Node.js 22+ to build the Studio app. | Vite + React + TypeScript build. |
| A way to serve the built static files over HTTPS. | Browser Web Workers and modern APIs prefer/ require secure context for some features; user trust requires HTTPS. |
| Open TCP 443 inbound on the serving host. | Required for HTTPS. |
| Open TCP 80 inbound for redirect/cert validation. | Required for Let's Encrypt HTTP-01 challenge. |
| A domain name or sub-domain. | Required for a usable HTTPS URL. |
| Client-side Web Worker support in browsers. | Core derivation runs in a Web Worker per Architecture §7. |

### Not required now

| Capability | Why not required |
|---|---|
| Backend API server | Core runs client-side; no server-side computation needed for the slice. |
| Database | Studio persistence is local JSON files. |
| Object/block storage | Static site is small; disk on the instance is sufficient. |
| Load balancer | Single instance is sufficient. |
| GPU | Core derivation is deterministic JavaScript, not GPU inference. |
| LLM service | Deferred in the vertical slice. |
| Server-side Core execution | Web Worker handles derivation locally. |
| CI/CD pipeline | Manual build/deploy is acceptable for the first slice. |
| Monitoring/logging beyond basic server health | Out of MVP slice scope. |

---

## 10. Observed vs required vs future infrastructure

### OBSERVED

- One accessible Vultr instance (`PM-1`) with Ubuntu 26.04, 4 vCPU, 30 GB RAM, 185 GB free.
- Node.js 22 installed on PM-1.
- SSH access to PM-1.
- UFW active, only SSH open.
- No web server, reverse proxy, or TLS present.
- No domain or DNS for Studio.
- No Studio implementation; only planning documents exist.

### REQUIRED BY CURRENT STUDIO

- A build environment (Node.js 22+, npm).
- A static file server (can be as simple as `npx serve` or a proper nginx/Caddy setup).
- HTTPS termination + domain.
- Inbound 80/443 opened on the host.
- Client-side Web Worker support (universal in modern browsers).

### POTENTIAL FUTURE INFRASTRUCTURE

| Future need | When it might become relevant |
|---|---|
| Object storage + CDN (Vultr Object Storage) | If Studio assets grow or global distribution is needed. |
| Backend API server | If collaboration, cloud sync, or server-side Core execution is added. |
| Database (SQLite/Postgres) | If multi-user projects, search, or analytics are added. |
| GPU instance | If LLM inference moves from optional third-party API to self-hosted. |
| CI/CD pipeline | If automated testing/deployment becomes necessary. |
| Load balancer / multiple instances | If traffic exceeds a single instance. |
| Container runtime (Docker/Podman) | If deployment complexity grows. |

None of these are required for the current vertical slice.

---

## 11. Simplest viable deployment topology

Given the actual implementation (none yet) and the actual environment (PM-1 with Node.js but no web server), the simplest viable topology for the first slice is:

```text
User browser
    ↓ HTTPS :443
PM-1 (Vultr)
    ├── Static file server (nginx or Caddy)
    ├── TLS certificate (Let's Encrypt via certbot or Caddy auto-TLS)
    └── Built Studio static files
            ↓
        React app + Core Adapter
            ↓
        Web Worker running Somnium Core
            ↓
        Local JSON persistence (browser File System Access API or download/upload)
```

### Why this topology

- Studio's Core runs in a Web Worker in the browser; no server-side Core is needed.
- The application is a static frontend; no Node server runtime is required after build.
- PM-1 already has Node.js, so building on PM-1 is feasible.
- The instance has ample disk and RAM for a small static site.

### What would be required to realize it

1. Implement Studio vertical slice (V0–V9 from `VERTICAL-SLICE-PLAN-v0.1.md`).
2. Install a web server + TLS solution on PM-1 (e.g., Caddy, which handles both).
3. Open UFW ports 80 and 443 on PM-1.
4. Point a domain/sub-domain at `155.138.237.162`.
5. Build the Studio app and place static files in the web server root.

---

## 12. Deployment blockers

| # | Blocker | Impact | Resolution owner |
|---|---|---|---|
| 1 | **Studio implementation does not exist.** | Deployment is impossible. | Studio implementation task. |
| 2 | **No web server or TLS on PM-1.** | Cannot serve HTTPS. | Deployment task (install Caddy/nginx + certbot). |
| 3 | **UFW blocks inbound 80/443.** | External users cannot reach a web service. | Deployment task (open ports). |
| 4 | **No domain or DNS for Studio.** | Cannot obtain a proper HTTPS certificate or give users a clean URL. | Product/infrastructure task (register/point domain). |
| 5 | **Vultr API access unavailable in this audit.** | Cannot programmatically inspect or provision other resources. | Whoever holds the Vultr API key must verify allowlist. |
| 6 | **Studio's Core browser-bundle compatibility not yet validated.** | Risk that Core cannot run in a browser/Web Worker. | V0 of implementation sequence. |
| 7 | **No CI/CD or automated deployment.** | Manual build/deploy for first slice. | Acceptable for MVP; defer automation. |

---

## 13. Unknowns requiring clarification

| # | Unknown | Why it matters |
|---|---|---|
| 1 | **Is a Vultr API key available and allowlisted for the current local IP (`158.140.167.84`)?** | Needed to inspect other instances (`Somnium`, `RAG`, `EA`) or provision new resources. |
| 2 | **What are the actual specs and IPs of `Somnium`, `RAG`, and `EA` instances?** | May affect whether the existing `Somnium` instance is intended for Studio deployment. |
| 3 | **Is there an existing domain or DNS zone intended for Somnium Studio?** | Affects TLS and URL design. |
| 4 | **Is the `Somnium` Vultr instance meant for Studio deployment, or is PM-1 the target?** | Affects build/deploy host choice. |
| 5 | **Does the user intend to implement Studio first, or to deploy the planning documents as-is?** | The implementation is a prerequisite. |
| 6 | **Are there existing Vultr firewall groups or VPCs that should be used?** | Affects network/security design. |
| 7 | **Is PM-1's SSH exposure restricted at the Vultr account firewall level?** | Affects hardening decisions. |

---

## 14. Recommended next task

The next task should be **implementation of the Somnium Studio vertical slice** (V0–V9 from `VERTICAL-SLICE-PLAN-v0.1.md`), **not deployment**.

Deployment is currently blocked because:

1. There is no Studio code to deploy.
2. Core browser/Web Worker compatibility has not been validated.
3. No domain/TLS is in place.

Once the slice is implemented and validated locally, the next infrastructure task would be:

> **Deploy the static Studio build to a Vultr instance with HTTPS and a domain.**

That task should use this audit to decide:

- Target host: likely `PM-1` (already has Node.js) or the existing `Somnium` instance if it is confirmed suitable.
- Web server/TLS: Caddy is recommended because it combines server + auto-TLS in one tool.
- Firewall: open 80/443 on the chosen host.
- Domain: obtain/register a domain or sub-domain and point its A record to the chosen IP.

---

## 15. Methodology and limitations

### What was inspected

- Local Studio directory listing and file contents.
- SSH-accessible Vultr instance `PM-1` (OS, hardware, network, firewall, processes, installed packages, listening ports).
- Local network context (public IP, SSH config, hosts file).
- Prior Vultr reconnaissance artifact (`pm1-vultr-recon-2026-09-16.pm1`) and prior task file (`TASK_009_VULTR_INFRA.md`).

### What was NOT inspected

- Vultr control plane / account dashboard (API key unavailable / not allowlisted).
- Other Vultr instances (`Somnium`, `RAG`, `EA`) directly.
- Vultr DNS, firewall groups, VPC, object storage, load balancers, Kubernetes.
- SSH keys, API keys, passwords, or any credential values.

### What was NOT done

- No Vultr resources were created, modified, deleted, restarted, resized, or reconfigured.
- No software was installed on PM-1.
- No secrets were exposed or recorded.

---

*End of audit. The environment is understood. The immediate blocker is the absence of Studio implementation, not the absence of Vultr resources.*
