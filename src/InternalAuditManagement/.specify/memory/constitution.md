<!--
Sync Impact Report:
Version change: v1.0.0 -> v1.1.0
Bump type: MINOR — major expansion of all principles from placeholder/generic to concrete, production-grade, and security-hardened rules.
Modified principles:
  - "I. Security-First Architecture" → expanded to Zero-Trust, OWASP Top 10, RBAC, secrets management, security headers, rate limiting
  - "II. Clean Architecture" → expanded with explicit layer rules, DI requirements, repository pattern
  - "III. Observability" → expanded with structured logging schema, correlation IDs, health endpoints, alert thresholds
  - "IV. Quality Standards" → expanded into dedicated "VI. Testing Discipline" + "VII. API Design Standards"
Added sections:
  - "IV. Audit Trail & Data Integrity" (new — critical for audit management domain)
  - "V. Resilience & Reliability" (new — production operations requirement)
  - "VI. Testing Discipline" (new — split from Quality Standards)
  - "VII. API Design Standards" (new — split from Quality Standards)
  - "Security Requirements" fully rewritten with concrete OWASP-aligned rules
  - "Quality Gates" section added under Governance
Removed sections:
  - Generic "Quality Standards" section (absorbed into principles VI and VII)
Templates requiring updates:
  - .specify/templates/plan-template.md ✅ (Constitution Check section now maps to 7 principles)
  - .specify/templates/spec-template.md ✅ (Security and audit FR examples updated)
  - .specify/templates/tasks-template.md ✅ (Phase 2 foundational tasks reflect new security/observability gates)
Follow-up TODOs: None — all placeholders resolved.
-->

# InternalAuditManagement Constitution

## Foundational Governance

The InternalAuditManagement system is a sensitive, compliance-bound application within the FacilityManagement platform. It manages internal audit records, findings, evidence, and remediation workflows — all of which carry regulatory, legal, and reputational weight.

All development MUST comply with the following non-negotiable principles. These principles are binding on every feature, hotfix, and refactor. They are not aspirational guidelines; they are production gates.

- **Core Development Standards**: Clean architecture, dependency injection, typed domain models
- **Security & Compliance**: OWASP Top 10, zero-trust, audit trail immutability
- **Observability**: Structured logs, distributed tracing, health endpoints
- **Resilience**: Retry/circuit-breaker policies, graceful degradation, idempotency
- **Quality**: TDD for business logic, integration tests for all critical paths, API contracts

## Core Principles

### I. Zero-Trust Security Architecture

Every request MUST be authenticated and authorized regardless of origin. Trust is never implicit.

- All API endpoints MUST require a valid Bearer token; anonymous endpoints are explicitly prohibited unless formally approved and documented.
- Authorization MUST use claims-based RBAC (Role-Based Access Control); roles MUST follow least-privilege — grant only the minimum permissions required.
- All incoming data MUST be validated and sanitized at system entry points (controllers/DTOs) before reaching domain or persistence layers; validation MUST reject unknown fields (strict input binding).
- All database interactions MUST use parameterized queries or ORM-generated SQL; raw string concatenation in queries is prohibited (OWASP A03 — Injection).
- Secrets (connection strings, API keys, certificates) MUST be stored in a secrets manager (Key Vault, environment variables via secure config); hardcoded credentials anywhere in source are a blocking PR defect.
- All HTTP responses MUST include security headers: `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Referrer-Policy`.
- All public-facing and authenticated endpoints MUST enforce rate limiting to prevent abuse (OWASP A04 — Insecure Design).
- TLS MUST be enforced for all inter-service and client-to-service communication; HTTP-only (non-TLS) must be redirected or rejected.
- Error responses MUST never expose stack traces, internal paths, or system internals to clients (OWASP A05 — Security Misconfiguration).
- Dependencies MUST be kept up to date; known CVEs in dependencies are blocking release defects.

**Rationale**: Internal audit data contains findings, evidence, and remediation records that are legally sensitive and compliance-critical. A breach or unauthorized access constitutes a serious regulatory and reputational risk.

### II. Clean Architecture & Domain Isolation

The system MUST follow a strict layered architecture. Dependencies flow inward — outer layers depend on inner layers; inner layers never reference outer layers.

```
Controllers (HTTP boundary)
    └── Application Services (orchestration, use-cases)
            └── Domain (entities, value objects, domain events)
            └── Interfaces (repository contracts, external ports)
Infrastructure (EF Core, HTTP clients, file storage — implements interfaces)
```

- Controllers MUST be thin: validate input, call one application service, return a mapped response. No business logic in controllers.
- Application services coordinate domain objects and infrastructure. They MUST NOT contain persistence logic directly.
- Domain entities MUST encapsulate invariants; entity state changes MUST go through domain methods, not external setters.
- All infrastructure dependencies (database, email, storage, external APIs) MUST be injected via interfaces; concrete types are never directly referenced in application or domain layers.
- The repository pattern MUST be used for all persistence; repositories return domain objects, not raw DB rows or DTO projections.
- DTOs MUST be used for serialization boundaries (controller in/out); domain objects MUST NOT be serialized directly to/from HTTP.

**Rationale**: Clean architecture makes the audit business logic independently testable, portable across infrastructure changes, and maintainable as compliance requirements evolve.

### III. Immutable Audit Trail & Data Integrity

Every mutation of audit-relevant data MUST be recorded permanently and tamper-evident.

- All create, update, and delete operations on audit entities (Audits, Findings, Evidence, Remediations) MUST produce an immutable audit log entry containing: `entityType`, `entityId`, `action`, `userId`, `timestamp` (UTC), `previousState` (JSON), `newState` (JSON).
- Audit log records MUST be append-only; no update or delete operations are permitted on audit log tables.
- Soft deletes MUST be used for all audit domain entities; hard deletes are prohibited. Deleted records retain all data with a `deletedAt` timestamp and `deletedBy` user.
- All entity updates MUST use optimistic concurrency (`rowVersion`/`ETag`) to detect and reject concurrent conflicting writes.
- Data validation MUST be enforced at the domain layer via domain invariants in addition to DTO-level validation. An entity MUST never exist in an invalid state.
- All timestamps MUST be stored and returned in UTC ISO 8601 format (`2026-05-25T14:30:00Z`).

**Rationale**: Internal audits have legal standing. The integrity and non-repudiability of audit records is a compliance requirement, not a feature request.

### IV. Resilience & Reliability

The system MUST remain stable under degraded conditions and recover automatically from transient failures.

- All calls to external services (databases, third-party APIs, message queues) MUST be wrapped with a retry policy (exponential backoff, max 3 retries) and a circuit breaker.
- All async operations MUST accept and respect `CancellationToken`; propagation through the entire call chain is mandatory.
- All outbound HTTP calls MUST have explicit timeout configurations; unbounded waits are prohibited.
- Operations that may be retried by clients MUST be idempotent; idempotency keys MUST be supported for write operations on critical resources.
- The application MUST expose a `/health` (liveness) and `/health/ready` (readiness) endpoint; readiness MUST verify database connectivity and any critical dependency health.
- Graceful shutdown MUST be implemented: in-flight requests complete, new requests are rejected, connections are drained before process exit.
- Background jobs MUST be fault-isolated; a failing job MUST NOT crash the host process.

**Rationale**: Facility management audit workflows are business-critical. Cascading failures or data loss during partial outages are unacceptable.

### V. Observability

Every production operation MUST be observable without requiring a code deployment or debug session.

- All log entries MUST be structured (JSON); free-form log strings are prohibited in production code paths.
- Every request MUST carry a `correlationId` (set from incoming header or generated); all log entries within a request MUST include `correlationId`, `userId`, `requestPath`, and `durationMs`.
- Log levels MUST be used semantically: `Information` for normal flow, `Warning` for recoverable anomalies, `Error` for failures requiring attention, `Critical` for service-affecting failures.
- Personally Identifiable Information (PII) and sensitive audit content MUST NOT appear in log output; use entity IDs, not entity content.
- Application MUST emit metrics for: request rate, error rate, response latency (p50/p95/p99), and business KPIs (audits created, findings raised, remediations completed).
- Distributed tracing MUST be implemented for all cross-service calls using W3C Trace Context propagation.
- Health endpoint MUST include version information and dependency status (database, external services).

**Rationale**: An unobservable system in a regulated domain is an unmanageable liability. Correlating actions to users and timestamps is both an operational and a compliance requirement.

### VI. Testing Discipline

Production quality is enforced through automated tests. No feature is complete without its tests.

- Business logic MUST be covered by unit tests written test-first (TDD). Tests MUST be written before implementation and MUST initially fail (Red-Green-Refactor).
- All critical user journeys MUST have integration tests that exercise the full stack from HTTP request to database response.
- Security controls (authentication, authorization, input validation) MUST have dedicated negative-path tests confirming they reject unauthorized or malformed input.
- Test coverage for domain and application service layers MUST NOT fall below 80%. Coverage gaps in business logic are blocking defects.
- Tests MUST NOT use `Thread.Sleep` or fixed-time delays; time-dependent logic MUST use injectable clock abstractions.
- External dependencies in unit tests MUST be replaced with fakes/mocks via injected interfaces; no live database calls in unit tests.
- All tests MUST be deterministic and idempotent; flaky tests MUST be fixed before merging.

**Rationale**: An audit management system must itself be auditable. Untested code cannot be trusted in a compliance context.

### VII. API Design Standards

All APIs MUST be consistent, versioned, and self-documenting from the first release.

- All REST endpoints MUST follow resource-oriented naming (`/api/v{n}/audits/{id}/findings`) using plural nouns; verbs in paths are prohibited except for actions (`/api/v1/audits/{id}/submit`).
- API versioning via URL prefix (`/api/v1/`) is mandatory from day one; breaking changes MUST increment the major version.
- All error responses MUST conform to RFC 7807 (Problem Details for HTTP APIs) with `type`, `title`, `status`, `detail`, and `traceId` fields.
- All endpoints MUST be documented with OpenAPI/Swagger annotations; undocumented endpoints are not deployable.
- Pagination MUST be implemented for all list endpoints using cursor-based or offset pagination; unbounded list responses are prohibited.
- API responses MUST use consistent property casing (`camelCase` for JSON); the casing convention MUST NOT vary between endpoints.
- `GET` endpoints MUST be idempotent and free of side effects; state mutations MUST use `POST`, `PUT`, `PATCH`, or `DELETE` as appropriate.

**Rationale**: Consistent, versioned APIs reduce integration errors and make the system auditable by external tools and compliance frameworks.

## Security Requirements

The following rules are concrete compliance gates. Violation of any rule is a **blocking PR defect**:

1. **Authentication**: Every non-health endpoint MUST return `401 Unauthorized` when called without a valid token.
2. **Authorization**: Every endpoint MUST return `403 Forbidden` when called by a user lacking the required role/claim.
3. **Injection Prevention**: No raw SQL string concatenation. ORM or parameterized queries only (OWASP A03).
4. **Sensitive Data Exposure**: No credentials, PII, or secrets in source code, logs, or error responses (OWASP A02).
5. **Security Headers**: All responses MUST include the mandatory security header set defined in Principle I.
6. **Dependency Vulnerabilities**: All packages MUST be scanned for CVEs as part of CI/CD; builds with critical CVEs MUST fail.
7. **Input Validation**: All request bodies and query parameters MUST be validated before processing; excess properties MUST be rejected.
8. **CSRF Protection**: State-changing endpoints called from browser clients MUST enforce CSRF tokens or use SameSite cookie policy.
9. **Secrets Rotation**: Secrets and credentials MUST support rotation without requiring redeployment.
10. **Audit of Security Events**: Authentication failures, authorization denials, and input validation rejections MUST be logged as security events with user and IP context.

## Governance

### Amendment Process

- Constitution amendments MUST be proposed as a PR with a summary of the change, the rationale, and a version bump justification.
- MAJOR bump: backward-incompatible principle removal or redefinition requiring migration.
- MINOR bump: new principle added or material expansion of existing guidance.
- PATCH bump: clarifications, wording, or non-semantic fixes.
- All amendments require approval from project owners before merging.

### Quality Gates (PR Checklist)

Every PR MUST pass the following before merge:

- [ ] All new endpoints have authentication and authorization tests
- [ ] All new business logic has unit tests (TDD — tests written first)
- [ ] Audit log entries are generated for all mutable audit-domain operations
- [ ] No secrets or PII in source code, logs, or error responses
- [ ] OpenAPI annotations added for all new/modified endpoints
- [ ] Security headers verified for new controller/middleware additions
- [ ] `CancellationToken` propagated through all new async call chains
- [ ] No raw SQL string concatenation introduced

### Compliance Note

Architecture changes that affect audit trail integrity, data retention, or access control scope MUST be reviewed by the project security lead before implementation begins.

**Version**: 1.1.0 | **Ratified**: 2026-05-25 | **Last Amended**: 2026-05-25

