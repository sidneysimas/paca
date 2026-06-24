# Security Policy

## Reporting a Vulnerability

**Do not open public GitHub issues for security vulnerabilities.**

To report a vulnerability privately:
1. Open a [GitHub Security Advisory](https://github.com/Paca-AI/paca/security/advisories/new) in the repository.
2. Include: the affected component, impact assessment, reproduction steps, and any suggested mitigation.

We will acknowledge the report within 5 business days and aim to provide an initial assessment within 10 business days.

## Scope

Security reports may cover:

- Authentication and authorization risks.
- Data exposure risks involving PostgreSQL, Valkey, or inter-service message flows.
- Unsafe AI agent actions or privilege escalation.
- WASM plugin sandbox escapes or capability bypasses.
- Supply chain or dependency risks.
- Deployment misconfiguration risks (Docker Compose, Caddy, environment variables).
- API injection risks (SQL injection, command injection, XSS).

## Supported Versions

We address security issues in the latest released version. Older versions are not actively maintained for security patches.

## Disclosure

We follow responsible disclosure: we ask that you give us reasonable time to patch a vulnerability before any public disclosure. We will credit reporters in release notes unless you prefer to remain anonymous.
