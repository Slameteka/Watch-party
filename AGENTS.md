# AGENTS.md — Rules for AI Coding Agents

These rules apply to every AI agent (Kiro, Copilot, Claude, Cursor, etc.) used by any team member in this repository. They match [CONTRIBUTING.md](CONTRIBUTING.md). If they conflict, CONTRIBUTING.md and the docs under `docs/` win, and the agent must point out the conflict.

> Product name is a working name ("Watch Party"), to be fixed on Monday 2026-11-02. Never hardcode the product name in identifiers; derive names from the Terraform variable `project_name` (placeholder `watchparty`).

## 1. Read First

Before planning or changing anything, read:

1. [docs/PROGRESS.md](docs/PROGRESS.md) — latest status, decisions, blockers.
2. The ADRs relevant to the task in [docs/adr/](docs/adr/README.md).
3. [docs/PRD-watch-party.md](docs/PRD-watch-party.md) — features (F-x.y), user stories and acceptance criteria (US-x.y), NFRs (NFR-x.y).
4. [docs/architecture.md](docs/architecture.md) — especially §3 "Angka Kunci" (single source of truth for limits, TTLs, rate limits, targets).
5. [docs/contracts/](docs/contracts/) — `openapi.yaml`, `ws-messages.md`, and `ws-messages.schema.json` (JSON Schema 2020-12 transcribed from `ws-messages.md`; keep both in sync) when touching any API, client, or handler.

Do not invent requirements. If something is missing or ambiguous, ask the user instead of guessing.

## 2. Language Rules

| What | Language |
|---|---|
| Documentation: `docs/`, README files, CONTRIBUTING, PR descriptions and template prose, ADR content | **Bahasa Indonesia** (simple, short sentences). Common English technical terms stay in English (deploy, rollback, WebSocket, idempotent, signed cookies). |
| Identifiers: functions, variables, classes, code files, Terraform resources/variables/outputs, bucket names, tags, branch names, JSON fields, WebSocket event types, error codes | **English** |
| Commit messages | **English**, Conventional Commits |
| Code comments | English |
| This file | English is allowed |

## 3. Stack and Versions

| Area | Use | Notes |
|---|---|---|
| Lambda runtime | Python, runtime `python3.14`, arm64 | Lambdas run **outside any VPC** |
| Backend libs | boto3, aws-lambda-powertools, pydantic v2, PyJWT, LiveKit Python server SDK | Manage with **uv** (`pyproject.toml` + `uv.lock`); lint/format with **ruff**; test with **pytest** |
| Frontend | React + Vite + TypeScript, hls.js, livekit-client, Zustand, Tailwind CSS | npm with `package-lock.json` |
| Node.js (FE build/tooling only) | **Node.js 26 LTS** (Active LTS since 2026-10-28) | Never Node.js 20 or any EOL/deprecated version. Check the current LTS before upgrading. |
| IaC | Terraform `>= 1.17`, provider `hashicorp/aws ~> 6.70` | S3 backend with `use_lockfile = true`; no DynamoDB lock table |
| Video chat | LiveKit OSS in Docker on one EC2 instance, Caddy for TLS | Pin the image tag; never `latest` |
| Media | Offline ffmpeg → HLS (360p/480p/720p/1080p) → S3 | No MediaConvert |
| CI | GitHub Actions with AWS OIDC | No AWS access keys in GitHub |

Do not pin package versions in docs; lockfiles hold exact versions. Verify volatile facts (runtime support, LTS status, pricing) against official sources before relying on them.

## 4. Repository Layout

```text
docs/                      PRD, architecture, ADRs, contracts, runbooks, PROGRESS
infra/terraform/modules/   network, dns, edge, auth, data, api, realtime, rtc, observability
infra/terraform/envs/prod/ root module (backend, providers, wiring)
backend/src/core/          shared models, token auth, DynamoDB repository, broadcast
backend/src/handlers/      rest_api, ws_authorizer, ws_connect, ws_disconnect, ws_message
backend/tests/
frontend/src/              app shell, player, sync, video, chat, reactions
media/scripts/             publish_media.py
```

Python and npm package names are product-neutral (`core`, `handlers`, `frontend`).

## 5. Design Rules (do not violate)

- **Sync is state-based**, not event relay. Server state: `{roomId, mediaId, status, positionSec, playbackRate, updatedAtServerMs, version}`. Use conditional writes on `version`; reject stale updates with `VERSION_CONFLICT`.
- Roles: `host`, `controller`, `viewer`. Only `host` and `controller` may send playback commands. Roles are read from DynamoDB on every protected action, never trusted from the token or the client.
- Auth: Cognito only identifies the host. Every participant uses a backend-issued **room token** (HS256, TTL 4 h). WebSocket auth uses the token in the `$connect` query string, validated by a Lambda REQUEST authorizer.
- Reconnect + resync (`session.resume` → `room.snapshot`) and heartbeat are core requirements, not extras.
- HLS is protected with **CloudFront signed cookies**, not signed URLs.
- JSON field naming: **camelCase** everywhere (REST and WebSocket). Time fields end with `Ms` (epoch ms), positions/durations end with `Sec`. Use pydantic camelCase aliases in Python.
- Numbers (limits, TTLs, rate limits, targets) come from `docs/architecture.md` §3. Do not introduce new magic numbers; if one is needed, add it there first.
- Validate all input at the boundary (pydantic, `extra="forbid"`). Render user text as text (no `dangerouslySetInnerHTML`).

## 6. Forbidden

Never add, suggest as default, or deploy:

- NAT Gateway (hard rule), ElastiCache/Redis, ALB/NLB, WAF on CloudFront, Lambda@Edge
- Amazon Chime SDK, AWS Elemental MediaConvert
- AWS Organizations, Control Tower, IAM Identity Center (they auto-upgrade the AWS Free plan to Paid)
- Socket.io, Express (or any web server) inside Lambda
- Lambdas inside a VPC
- EC2 instance types outside the Free plan list: t3.micro, t3.small, t4g.micro, t4g.small, c7i-flex.large, m7i-flex.large
- EOL or deprecated runtimes (including Node.js 20)
- AWS CDK or CloudFormation templates (we use Terraform)
- Secrets in code, `*.tfvars`, logs, docs, or commits. Secrets live only in SSM Parameter Store SecureString and are created via `docs/runbooks/bootstrap.md`.
- Manual (ClickOps) AWS changes outside the bootstrap runbook

If a task seems to need any of these, stop and ask the user. A new AWS service requires a Free plan availability check, a cost estimate, and an ADR.

## 7. Terraform Rules

- Names: `<project_name>-<env>-<component>`, from variables; never hardcode the product name or `prod`.
- Mandatory tags (provider `default_tags`): `Project`, `Env`, `Owner`, `ManagedBy = terraform`.
- One module per domain; each module has one owning role (architecture.md §12.5). Do not edit another role's module without that role's review.
- IAM least privilege: one role per Lambda, specific actions and resource ARNs. No `"Action": "*"` / `"Resource": "*"` unless AWS requires it, with a comment explaining why.
- Run `terraform fmt`, `terraform validate`, and `tflint` before proposing changes. Never run `terraform apply` or `destroy` unless the user explicitly asks.

## 8. Workflow Rules

- Follow the user's instructions on whether to edit files or only propose changes. Never commit, push, or open PRs unless asked.
- Trunk-based: short-lived branches named `<type>/<short-description>` (English, kebab-case).
- Conventional Commits in English: `feat(realtime): handle playback.command`.
- Keep changes small and scoped. No unrequested refactors.
- Before finishing, run the relevant checks: `ruff check`, `ruff format --check`, `pytest`, FE lint/build, `terraform fmt -check`/`validate`/`tflint`, and `gitleaks` when available. Report what you ran and the results.

## 9. Documentation Rules

- Update the related docs in the same change: architecture.md, ADRs, contracts, runbooks, component README.
- Add a short entry (Indonesian) to `docs/PROGRESS.md` for the day: done, decisions + reasons, blockers, next.
- Write a new ADR (from `docs/adr/0000-template.md`) for decisions that are hard to reverse, cross roles, or affect cost/security. Never edit an `Accepted` ADR's content; supersede it.
- The PRD is frozen after tag `prd-v1.0`. Do not edit it except through a change request (PR + ADR, approved by Product & Tech Lead and the affected role owner, changelog entry, new tag).
- Never modify `docs/archive/`.
- Label AWS facts as `verified (AWS docs)`, `verified (sumber pihak ketiga)`, `prior knowledge, unverified`, or `perlu dicek hari 1`, with a source link.
- Use existing IDs (F-x.y, US-x.y, NFR-x.y, R-x, OQ-x); do not create duplicates.
