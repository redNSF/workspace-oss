# Security policy

## Supported versions

Workspace OSS is currently in early development. Security fixes are applied to the latest commit on `main`; no stable version line is supported yet.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability involving credentials, authentication, authorization, data exposure, or destructive actions.

Use GitHub's private vulnerability reporting feature for this repository when it is available. Include:

- the affected file, route, action, or database policy
- reproduction steps
- the expected and actual behavior
- the potential impact
- a suggested fix, if known

Do not include real credentials, production data, access tokens, private URLs, or user information in the report.

## Deployment responsibility

Self-hosters are responsible for:

- securing Supabase and Cloudinary credentials
- configuring TLS and authentication redirect URLs
- applying database migrations
- reviewing Row Level Security policies after local changes
- maintaining backups and testing restoration
- updating dependencies and the underlying infrastructure
- configuring SMTP and abuse controls

`SUPABASE_SERVICE_ROLE_KEY`, `CLOUDINARY_API_SECRET`, and similar privileged values must remain server-only.

## Dependency advisory policy

High and critical production dependency advisories block merge and release. CI
runs `npm audit --omit=dev --audit-level=high`; maintainers should upgrade or
override the affected dependency and regenerate the lockfile.

If an immediate fix does not exist, document the advisory, reachable impact,
mitigation, owner, and review date in a tracked security issue before releasing.
An exception without an owner and review date is not accepted.
