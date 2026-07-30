# Workspace OSS development roadmap

This roadmap describes the work required to move Workspace OSS from its current
early-development state to a secure, dependable, self-hostable 1.0 release. It
is ordered by dependency and risk: security and correctness come before new
feature breadth.

The roadmap is not a calendar commitment. Estimates are relative and assume one
engineer familiar with the codebase:

- **S**: focused change, normally a few days or less
- **M**: multi-part change, normally around one to two weeks
- **L**: milestone-sized change, normally several weeks
- **XL**: should be split into multiple tracked projects

## Current baseline

The application already provides:

- Supabase email/password authentication
- Workspaces, boards, groups, and items
- Table and Kanban views
- Status, person, date, and text data
- Drag-and-drop ordering
- Comments, activity UI, notifications, and item photos
- Custom roles and permissions
- Global search, inbox, profile settings, and themes
- Row Level Security policies and migration-based schema setup
- CI checks for linting, TypeScript, and production builds

The main remaining challenge is not adding another large surface area. It is
making access control, database behavior, server actions, and the UI agree under
real multi-user conditions.

## Release sequence

| Release | Goal | Required outcome |
| --- | --- | --- |
| `0.1.x` Secure alpha | Remove known critical risks | Safe fresh installs, secured privileged actions, patched runtime dependencies |
| `0.2.x` Tested alpha | Establish trustworthy authorization | Automated RLS coverage and one canonical access model |
| `0.3.x` Workflow alpha | Make existing features reliable | Correct activity, realtime, roles, invitations, uploads, and mutation feedback |
| `0.5.0` Private beta | Complete workspace administration | Workspace-scoped membership and roles, ownership and lifecycle controls |
| `0.7.0` Public beta | Improve collaboration and usability | Reliable notifications, board configuration, accessibility, mobile support |
| `0.9.0` Release candidate | Make operation predictable | Deployment automation, observability, backup guidance, upgrade testing |
| `1.0.0` Stable | Publish a supportable open-source release | Stable schema, documented compatibility, release process, no known release blockers |

---

## Milestone 0 — Secure the current alpha

**Target release:** `0.1.x`  
**Objective:** close known privilege, dependency, and installation risks before
inviting external deployments.

### Security-critical work

- [ ] **SEC-001 — Apply the complete migration chain everywhere** (**S**)
  - Change the self-hosted instructions to apply all migrations rather than
    only the initial schema.
  - Add a single canonical command or consolidated deployment procedure.
  - Add a startup or diagnostic check that detects a missing hardening migration.
  - **Acceptance:** a user following any documented installation path cannot
    update `profiles.role` or `profiles.role_id` through the authenticated API.

- [x] **SEC-002 — Secure notification creation** (**S**)
  - Authenticate every notification server-action invocation.
  - Derive the actor from the session instead of accepting it from the client.
  - Verify that the actor and recipient share the relevant workspace or item.
  - Validate notification type, text lengths, and internal link format.
  - Remove service-role use where RLS can enforce the operation safely.
  - **Acceptance:** anonymous users and unrelated workspace members cannot create
    notifications for arbitrary accounts.

- [x] **SEC-003 — Upgrade vulnerable production dependencies** (**S**)
  - Upgrade Next.js to a patched stable version and refresh the lockfile.
  - Resolve the PostCSS and Sharp advisories pulled through the framework.
  - Add a production dependency audit to CI.
  - Document the policy for high and critical advisories.
  - **Acceptance:** `npm audit --omit=dev` has no unresolved high or critical
    findings, or each exception has a documented risk decision.

- [x] **SEC-004 — Make first-admin initialization race-safe** (**M**)
  - Serialize first-user administrator selection with an advisory lock or an
    explicit instance bootstrap record.
  - Provide a recovery procedure for an instance with no administrator.
  - Consider an operator-provided bootstrap token for exposed installations.
  - **Acceptance:** concurrent signups can never produce multiple unintended
    bootstrap administrators.

- [ ] **SEC-005 — Validate privileged server boundaries** (**M**)
  - Inventory all server actions and API routes that use the service-role key.
  - Require authentication, permission checks, input validation, and audit logs.
  - Add negative tests for anonymous and insufficiently privileged callers.
  - **Acceptance:** every service-role operation has a documented authorization
    path and an automated denial test.

### Installation safeguards

- [ ] **OPS-001 — Add environment validation** (**S**)
  - Validate required environment variables at server startup.
  - Distinguish browser-safe variables from secrets.
  - Produce actionable errors for missing Supabase or Cloudinary configuration.
  - **Acceptance:** a misconfigured deployment fails clearly before serving a
    partially working application.

- [ ] **OPS-002 — Add an installation smoke test** (**M**)
  - Start a fresh local Supabase project.
  - Apply migrations and seed data.
  - Create an administrator and verify login, workspace creation, and board load.
  - Run this workflow in CI when feasible.
  - **Acceptance:** the documented quick start is exercised automatically from
    an empty database.

### Milestone 0 exit gate

- All P0 security findings are fixed.
- Fresh local, hosted, and self-hosted setup paths apply equivalent schema state.
- Production dependencies have no unreviewed high or critical advisory.
- Privileged actions have authentication and authorization tests.

---

## Milestone 1 — Define and test the authorization model

**Target release:** `0.2.x`  
**Objective:** establish a single, explicit access model used by PostgreSQL,
server code, and the user interface.

### Access model design

- [x] **AUTHZ-001 — Write the authorization specification** (**M**)
  - Define instance administrator, workspace owner, workspace administrator,
    member, guest, board editor, board viewer, and item assignee semantics.
  - Define whether assignment grants board visibility and for how long.
  - Define which permissions are instance-, workspace-, board-, and item-scoped.
  - Define expected behavior when a user belongs to multiple workspaces.
  - **Acceptance:** every protected resource and mutation maps to a documented
    actor/capability rule.

- [ ] **AUTHZ-002 — Replace duplicated permission logic** (**L**)
  - Create canonical SQL helper functions for access decisions.
  - Expose safe read-only capability queries to the application.
  - Remove manual access reimplementations from board and dashboard pages.
  - Ensure server actions use the same concepts and terminology.
  - **Acceptance:** workspace members see exactly the boards allowed by RLS, and
    the UI does not independently contradict that decision.

- [ ] **AUTHZ-003 — Align UI capabilities with backend rules** (**L**)
  - Return a capability object for the current workspace or board.
  - Disable or hide mutations the user cannot perform.
  - Keep the backend authoritative even when UI controls are hidden.
  - Show a clear message when access changes during an open session.
  - **Acceptance:** read-only users cannot enter misleading edit flows, while
    authorized custom roles can reach every capability granted to them.

- [ ] **AUTHZ-004 — Make permission-cache invalidation reliable** (**M**)
  - Refresh permissions when role assignments or role permissions change.
  - Clear cached state on logout and account changes.
  - Handle realtime disconnection and fallback refetching.
  - **Acceptance:** revoking a permission takes effect in an active session
    without requiring a full browser reload.

### Automated authorization tests

- [ ] **TEST-001 — Build a Supabase integration-test harness** (**L**)
  - Reset a disposable local database for each suite.
  - Create deterministic users, workspaces, boards, and role assignments.
  - Exercise PostgREST with real user JWTs rather than testing SQL alone.
  - Make tests runnable locally and in CI.

- [ ] **TEST-002 — Add RLS read matrix tests** (**L**)
  - Cover profiles, workspaces, memberships, boards, groups, items, columns,
    cell values, comments, notifications, activity, and photos.
  - Test unrelated users, former members, explicit guests, and assignees.

- [ ] **TEST-003 — Add RLS mutation matrix tests** (**L**)
  - Cover create, update, delete, reorder, share, invite, assign, comment, upload,
    and role-management operations.
  - Verify both allowed and denied cases.

- [ ] **TEST-004 — Add server-action and API authorization tests** (**M**)
  - Test anonymous requests, expired sessions, insufficient roles, invalid IDs,
    cross-workspace targets, and malformed payloads.

### Milestone 1 exit gate

- The authorization specification is committed and treated as canonical.
- Database, server, and UI behavior match for every supported role.
- RLS and privileged endpoint tests run in CI.
- Workspace membership no longer leads to visible-but-inaccessible boards.

---

## Milestone 2 — Repair and harden existing workflows

**Target release:** `0.3.x`  
**Objective:** make the current feature set behave consistently before adding
new product capabilities.

### Activity and audit trail

- [x] **ACT-001 — Correct the activity table mismatch** (**S**)
  - Standardize all code and types on `activity_logs`.
  - Add a regression test that creates and reads an activity entry.

- [ ] **ACT-002 — Centralize activity recording** (**M**)
  - Replace scattered client calls with a typed server or database interface.
  - Record normalized event keys alongside human-readable presentation.
  - Capture actor, workspace, board, item, old value, and new value as applicable.
  - Prevent clients from impersonating another activity actor.

- [ ] **ACT-003 — Complete activity coverage** (**M**)
  - Record board, group, item, column, assignment, status, date, comment, sharing,
    membership, role, and photo events.
  - Add pagination and realtime refresh to activity feeds.

### Realtime reliability

- [x] **RT-001 — Configure publications in migrations** (**S**)
  - Add required tables to the `supabase_realtime` publication idempotently.
  - Document any hosted Supabase settings that cannot be migrated.

- [ ] **RT-002 — Scope realtime subscriptions** (**M**)
  - Avoid subscribing to every item or cell-value change in the instance.
  - Filter changes by the active board where supported.
  - Reconcile moved and deleted records without stale client state.

- [ ] **RT-003 — Add reconnect and conflict behavior** (**M**)
  - Refetch authoritative data after reconnect.
  - Define optimistic-update rollback behavior.
  - Prevent duplicate rows caused by local updates plus realtime echoes.

### Mutation correctness and feedback

- [ ] **DATA-001 — Make board initialization transactional** (**M**)
  - Create a database function or server transaction that inserts a board and
    its default columns exactly once.
  - Add constraints preventing duplicate required columns.
  - Remove database mutations from board-page rendering.

- [ ] **DATA-002 — Replace race-prone cell upserts** (**M**)
  - Make RLS-compatible atomic upserts possible.
  - Add concurrency tests for simultaneous status, assignee, and date changes.

- [ ] **DATA-003 — Make ordering robust** (**M**)
  - Handle concurrent item and group reordering.
  - Normalize positions when gaps or duplicates appear.
  - Support moving items between groups without transient disappearance.

- [ ] **UX-001 — Standardize mutation states** (**M**)
  - Provide loading, success, error, and retry behavior for every mutation.
  - Roll back failed optimistic changes.
  - Replace silent console errors with user-facing messages and structured logs.

### Roles and member actions

- [ ] **ROLE-001 — Repair role CRUD** (**M**)
  - Move privileged role writes to authorized server operations or safe SQL RPCs.
  - Remove the blocked client-side profile update from role deletion.
  - Protect built-in roles from accidental deletion or unsafe renaming.

- [ ] **ROLE-002 — Align custom-role UI and policy behavior** (**M**)
  - Allow users with the documented management capability to reach the correct UI.
  - Ensure the database recognizes the same capability or explicitly reserve role
    administration for instance administrators.

- [ ] **ROLE-003 — Make member removal non-destructive** (**M**)
  - Separate removing a workspace membership from deleting an authentication user.
  - Reserve account deletion for explicit instance administration.
  - Make multi-step account deletion recoverable and auditable.

### Upload lifecycle

- [ ] **FILE-001 — Bind uploads to authorized items** (**M**)
  - Include the target item in the upload request.
  - Verify item access and upload permission before accepting bytes.
  - Add size, type, and image-decoding validation.

- [ ] **FILE-002 — Make upload and deletion cleanup reliable** (**M**)
  - Delete Cloudinary assets when the database insert fails.
  - Check upstream delete responses before deleting database metadata.
  - Add a scheduled orphan-reconciliation tool.

- [ ] **FILE-003 — Add rate and quota controls** (**M**)
  - Rate-limit upload and delete endpoints.
  - Add configurable per-file, per-user, and per-instance limits.

### Milestone 2 exit gate

- Existing board, activity, notification, role, and photo workflows pass end-to-end tests.
- Realtime works after a fresh documented installation.
- No primary mutation fails only in the console.
- Concurrent initialization and cell updates do not create duplicate records.

---

## Milestone 3 — Complete workspace and identity administration

**Target release:** `0.5.0` private beta  
**Objective:** make workspaces true tenancy and administration boundaries.

### Workspace-scoped membership and roles

- [ ] **WS-001 — Move role assignments into workspace membership** (**XL**)
  - Make `workspace_members.role_id` the primary role assignment.
  - Remove instance-wide role behavior from normal workspace authorization.
  - Keep a separate instance-administrator capability for deployment operators.
  - Define migration behavior for existing profile roles.

- [ ] **WS-002 — Build workspace member administration** (**L**)
  - List members of the selected workspace only.
  - Invite, change role, suspend, and remove membership.
  - Show pending, accepted, expired, and cancelled invitations.
  - Prevent removal of the last workspace owner.

- [ ] **WS-003 — Add workspace ownership controls** (**M**)
  - Transfer ownership safely.
  - Support multiple owners if the product model permits it.
  - Record ownership changes in the audit trail.

- [ ] **WS-004 — Add workspace lifecycle controls** (**M**)
  - Rename, archive, restore, export, and delete workspaces.
  - Require confirmation and appropriate retention behavior.
  - Define what happens to active invitations and Cloudinary assets.

### Invitation delivery

- [ ] **INV-001 — Send invitation emails** (**L**)
  - Add a configurable email provider interface.
  - Send signed, expiring invitation links.
  - Avoid revealing whether unrelated addresses already have accounts.

- [ ] **INV-002 — Complete invitation lifecycle** (**M**)
  - Resend, revoke, expire, and accept invitations.
  - Handle existing accounts, new accounts, changed email addresses, and multiple
    invitations to different workspaces.
  - Add rate limits and abuse protection.

### User account controls

- [ ] **ID-001 — Add account security settings** (**M**)
  - Change password, review active sessions, sign out other sessions, and delete account.
  - Document behavior for externally managed authentication deployments.

- [ ] **ID-002 — Add administrator recovery tools** (**M**)
  - Provide CLI or documented SQL procedures for promoting an administrator,
    disabling a compromised account, and repairing an orphaned profile.

### Milestone 3 exit gate

- A user can belong to multiple workspaces with different roles in each.
- Removing a workspace member does not delete their account.
- Invitations are delivered, expire, and are auditable.
- Workspace ownership and deletion have safe, tested workflows.

---

## Milestone 4 — Complete core work-management capabilities

**Target release:** `0.7.0` public beta  
**Objective:** round out the product experience without weakening the tested core.

### Board configuration

- [ ] **BOARD-001 — Add board lifecycle management** (**M**)
  - Duplicate, archive, restore, move, and permanently delete boards.
  - Preserve or intentionally reset access and assignments when duplicating.

- [ ] **BOARD-002 — Add explicit board visibility modes** (**L**)
  - Workspace-visible, restricted, and private board modes.
  - Board-specific viewers and editors with clear inheritance rules.

- [ ] **BOARD-003 — Complete column management** (**L**)
  - Create, rename, reorder, configure, and delete columns.
  - Confirm destructive type changes and data loss.
  - Add reusable status labels and colors instead of hardcoded values.

- [ ] **BOARD-004 — Add saved views** (**L**)
  - Filters, sorting, grouping, hidden columns, and per-user saved views.
  - Shareable workspace views where authorized.

### Item capabilities

- [ ] **ITEM-001 — Support cross-group and cross-board movement** (**M**)
  - Preserve compatible cell values.
  - Clearly handle destination boards with different column schemas.

- [ ] **ITEM-002 — Add bulk operations** (**L**)
  - Multi-select, assign, set status/date, move, archive, and delete.
  - Enforce permissions for every selected item.

- [ ] **ITEM-003 — Add subitems or checklists** (**L**)
  - Choose one initial model and define progress behavior.
  - Include it in search, activity, and permissions.

- [ ] **ITEM-004 — Expand column types** (**XL**)
  - Priority, number, checkbox, link, email, phone, files, and relation columns.
  - Define validation, filtering, sorting, import/export, and migration behavior
    for each type before implementation.

- [ ] **ITEM-005 — Add archive and recovery** (**M**)
  - Soft-delete or archive items and groups.
  - Provide retention and permanent deletion rules.

### Search and discovery

- [ ] **SEARCH-001 — Improve global search** (**M**)
  - Add pagination, ranking, workspace filters, recent searches, and keyboard control.
  - Ensure search respects RLS under every membership state.

- [ ] **SEARCH-002 — Add board filtering and quick navigation** (**M**)
  - Filter by assignee, status, date, creator, and text.
  - Support deep links that restore the active view state.

### Import and export

- [ ] **PORT-001 — Add CSV import and export** (**L**)
  - Preview column mapping and validation errors before import.
  - Export only data visible to the caller.

- [ ] **PORT-002 — Add workspace backup export** (**L**)
  - Define a versioned portable format for boards, items, comments, and metadata.
  - Avoid including secrets or unintended personal data.

### Milestone 4 exit gate

- Teams can configure boards without database or code changes.
- Common item management tasks work in bulk and across groups.
- Search, filters, imports, and exports preserve authorization boundaries.
- Destructive operations have recovery paths.

---

## Milestone 5 — Collaboration, notifications, and user experience

**Target release:** `0.7.x` to `0.8.x`  
**Objective:** make daily multi-user operation polished, accessible, and predictable.

### Comments and notifications

- [ ] **COLLAB-001 — Add mentions and watchers** (**L**)
  - Mention users in comments and descriptions.
  - Watch or unwatch items and boards.
  - Validate that mentioned recipients can access the linked resource.

- [ ] **COLLAB-002 — Add notification preferences** (**L**)
  - In-app and email channel preferences.
  - Per-event and digest controls.
  - Quiet hours and unsubscribe behavior.

- [ ] **COLLAB-003 — Make the inbox complete** (**M**)
  - Pagination, filters, unread grouping, mark-all-read, deletion, and deep links.
  - Remove or redirect duplicate placeholder inbox routes.

- [ ] **COLLAB-004 — Add delivery reliability** (**M**)
  - Queue email and external notification delivery.
  - Retry transient failures and record permanent failures.
  - Prevent duplicate notifications with idempotency keys.

### Accessibility and responsive design

- [ ] **A11Y-001 — Complete keyboard navigation** (**L**)
  - Boards, menus, modals, date picker, Kanban, search, and item panels.
  - Provide non-drag alternatives for reordering.

- [ ] **A11Y-002 — Complete semantic and screen-reader support** (**L**)
  - Focus management, labels, live regions, error association, and contrast.
  - Add automated accessibility checks and a manual test checklist.

- [ ] **RESP-001 — Build mobile and tablet layouts** (**L**)
  - Responsive navigation, board scrolling, item editing, settings, and inbox.
  - Define the minimum supported viewport.

- [ ] **UX-002 — Finish theme and visual-state coverage** (**M**)
  - Verify every screen in both themes.
  - Standardize skeletons, empty states, destructive confirmations, and toasts.

### Performance

- [ ] **PERF-001 — Add query pagination and limits** (**L**)
  - Avoid loading entire boards, profile lists, or activity histories at once.
  - Add indexes based on measured query plans.

- [ ] **PERF-002 — Virtualize large boards** (**L**)
  - Render large item sets efficiently in table and Kanban views.
  - Preserve keyboard and accessibility behavior.

- [ ] **PERF-003 — Define performance budgets** (**M**)
  - Track page load, interaction latency, query count, and bundle size.
  - Add representative large-board fixtures to performance testing.

### Milestone 5 exit gate

- Core workflows are usable with keyboard and assistive technology.
- Supported mobile and tablet layouts are documented and tested.
- Notifications are configurable, reliable, and cannot link users to inaccessible data.
- Large representative boards remain responsive.

---

## Milestone 6 — Architecture and maintainability

**Target release:** completed before `1.0.0`  
**Objective:** make continued development safe for maintainers and contributors.

### Application structure

- [ ] **ARCH-001 — Split oversized components** (**XL**)
  - Extract board queries, mutations, realtime synchronization, item editing,
    settings sections, and activity presentation into focused modules.
  - Keep permission checks close to mutation boundaries.

- [ ] **ARCH-002 — Introduce typed repositories or service interfaces** (**L**)
  - Centralize Supabase queries instead of scattering table names across components.
  - Return typed domain results and normalized errors.
  - Avoid building speculative provider abstractions until behavior is tested.

- [ ] **ARCH-003 — Generate database types** (**M**)
  - Generate Supabase types from the canonical schema.
  - Add a CI check that generated types are current.
  - Remove broad `any` usage in board, dashboard, and activity code.

- [ ] **ARCH-004 — Standardize validation** (**M**)
  - Share schemas for forms, server actions, API routes, and database boundaries.
  - Validate UUIDs, text lengths, enums, URLs, and serialized cell values.

### Test pyramid

- [ ] **TEST-005 — Add unit tests for domain behavior** (**M**)
  - Date ranges, permission mapping, status behavior, sanitization, ordering, and
    notification construction.

- [ ] **TEST-006 — Add component tests** (**L**)
  - Permission states, mutation rollback, dialogs, search, item editing, and inbox.

- [ ] **TEST-007 — Add browser end-to-end tests** (**L**)
  - Administrator onboarding, invitation acceptance, collaborative board editing,
    role changes, comments, notifications, uploads, and account removal.

- [ ] **TEST-008 — Add migration upgrade tests** (**L**)
  - Test fresh installation and upgrades from each supported release baseline.
  - Verify data preservation and rollback or recovery guidance.

### Developer experience

- [ ] **DX-001 — Add local fixture tooling** (**M**)
  - Seed representative workspaces, roles, boards, and large datasets.
  - Never include real user data or credentials.

- [ ] **DX-002 — Add contributor documentation** (**M**)
  - Architecture overview, data model, authorization specification, test guide,
    migration guide, style conventions, and pull-request expectations.

- [ ] **DX-003 — Strengthen CI** (**M**)
  - Lint with zero warnings, typecheck, unit tests, RLS tests, browser smoke tests,
    build, audit, generated-type check, and migration validation.

### Milestone 6 exit gate

- Critical behavior is no longer concentrated in several 800–975-line components.
- Database access is typed and centrally discoverable.
- Fresh and upgrade migrations are tested.
- CI exercises behavior, authorization, and deployment—not only compilation.

---

## Milestone 7 — Operations and the stable release

**Target release:** `0.9.0` release candidate followed by `1.0.0`  
**Objective:** make Workspace OSS supportable for operators and contributors.

### Deployment and configuration

- [ ] **DEPLOY-001 — Provide a containerized deployment** (**L**)
  - Application image, health check, non-root runtime, documented volumes and secrets.
  - Pin and document supported Node.js and platform versions.

- [ ] **DEPLOY-002 — Add guided deployment paths** (**L**)
  - Vercel plus Supabase Cloud.
  - Containerized app plus hosted Supabase.
  - Fully self-hosted application and Supabase.
  - Document reverse proxy, TLS, SMTP, storage, and redirect configuration.

- [ ] **DEPLOY-003 — Add configuration diagnostics** (**M**)
  - Administrator-visible health page for database, auth, realtime, email, and storage.
  - Never reveal secret values.

### Reliability and observability

- [ ] **OBS-001 — Add structured server logging** (**M**)
  - Correlation IDs, actor IDs where safe, operation names, and sanitized errors.
  - Avoid logging tokens, passwords, invitation secrets, or sensitive content.

- [ ] **OBS-002 — Add health and readiness endpoints** (**S**)
  - Separate process health from dependency readiness.

- [ ] **OBS-003 — Add optional error monitoring** (**M**)
  - Provider-neutral interface and documented privacy implications.

- [ ] **OPS-003 — Document backup and recovery** (**M**)
  - PostgreSQL backups, authentication data, Cloudinary assets, restore testing,
    disaster recovery, and secret rotation.

- [ ] **OPS-004 — Define support and compatibility policy** (**M**)
  - Supported browsers, Node versions, Supabase versions, PostgreSQL versions,
    deployment shapes, and upgrade window.

### Open-source release readiness

- [ ] **OSS-001 — Establish release automation** (**M**)
  - Semantic versioning, changelog generation, tags, release notes, and artifacts.

- [ ] **OSS-002 — Add governance and contribution files** (**M**)
  - `CONTRIBUTING.md`, code of conduct, issue templates, pull-request template,
    maintainer expectations, and decision process.

- [ ] **OSS-003 — Complete user and administrator documentation** (**L**)
  - Installation, configuration, upgrades, backup, permissions, workspace setup,
    board usage, troubleshooting, and security hardening.

- [ ] **OSS-004 — Run a release-candidate audit** (**L**)
  - Threat model review, dependency audit, RLS review, accessibility audit,
    performance test, migration rehearsal, and backup/restore rehearsal.

### Stable 1.0 exit gate

- No unresolved P0 or P1 defects.
- No unreviewed high or critical production dependency advisories.
- Authorization, migrations, backup restoration, and primary workflows have
  automated coverage.
- Deployment and upgrade instructions have been followed successfully on clean systems.
- Accessibility and supported-browser checks pass.
- Compatibility and security-support policies are published.

---

## Post-1.0 opportunities

These should not delay the stable release unless community demand changes priorities:

- Automation recipes and event-triggered actions
- Board and workspace templates
- Webhooks and personal access tokens
- Slack, Teams, email, calendar, and source-control integrations
- Timeline, calendar, workload, and chart views
- Dashboards and reporting
- Form-based item intake
- Public or guest share links
- Database and authentication provider interfaces
- Configurable S3-compatible and local storage providers
- Internationalization and right-to-left layouts
- Desktop or progressive web application packaging
- Plugin or extension system

Each post-1.0 feature should begin with a permission model, data-retention model,
API contract, and migration plan rather than being implemented only at the UI layer.

## Cross-cutting definition of done

A roadmap item is complete only when all applicable conditions are met:

- Behavior and failure cases are documented.
- Authorization is enforced by the backend and represented accurately in the UI.
- Inputs are validated at the trust boundary.
- Database changes are delivered through an idempotent migration.
- Allowed and denied cases have automated tests.
- Loading, empty, error, retry, and success states are handled.
- Accessibility and keyboard interaction are considered.
- Structured errors contain enough context to diagnose failures without exposing secrets.
- User-facing documentation is updated.
- Lint, typecheck, tests, build, audit, and migration checks pass.

## Recommended issue order

When converting this roadmap into tracker issues, use this initial sequence:

1. `SEC-001`, `SEC-002`, and `SEC-003`
2. `ACT-001` and `RT-001`
3. `AUTHZ-001` and `TEST-001`
4. `AUTHZ-002`, `TEST-002`, and `TEST-003`
5. `AUTHZ-003`, `ROLE-001`, and `ROLE-002`
6. `DATA-001`, `DATA-002`, and `UX-001`
7. `FILE-001`, `FILE-002`, and `TEST-004`
8. Workspace-scoped membership and invitation delivery
9. Product-completeness, accessibility, performance, and operational milestones

New feature work should not bypass this order unless it addresses a production
incident or an explicitly accepted project priority.
