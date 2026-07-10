# Supabase setup

Workspace OSS currently uses Supabase for PostgreSQL, authentication, row-level security, and realtime subscriptions. Cloudinary is used separately for item photos.

## Security model

A deployment is treated as one organization. Workspaces are access boundaries inside that organization.

- The first account created in a fresh database becomes the instance administrator.
- Later accounts receive the default Member role unless they accept a pending invitation.
- Workspace owners are automatically inserted into `workspace_members`.
- Invited users are inserted into the invited workspace after account creation.
- Database access is enforced through Row Level Security policies.
- The service-role key is server-only and must never use a `NEXT_PUBLIC_` prefix.

Roles are currently instance-wide for compatibility with the existing interface. Workspace-specific role assignments are planned for a later migration.

## Local development

### Requirements

- Node.js 20 or newer
- Docker Desktop, Podman, OrbStack, or another Docker-compatible runtime
- Supabase CLI through `npx`

### Start Supabase

From the repository root:

```bash
npx supabase start
```

The CLI reads `supabase/config.toml`, applies files in `supabase/migrations`, and uses `supabase/seed.sql` when the database is reset.

To rebuild the local database from scratch:

```bash
npx supabase db reset
```

After startup, copy the local API URL, anon key, and service-role key shown by the CLI into `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key>
SUPABASE_SERVICE_ROLE_KEY=<local service-role key>
```

Then configure Cloudinary and start the app:

```bash
cp .env.example .env.local
npm install
npm run dev
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open the application, create the first account, and sign in. That first account receives the Admin role.

## Supabase Cloud

Create an empty Supabase project, then authenticate and link the CLI:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

Add the project URL, anon key, and service-role key to the deployment environment. Configure the authentication Site URL and redirect allow-list to include:

```text
https://your-domain.example/auth/callback
```

For local authentication against the hosted project, also allow:

```text
http://localhost:3000/auth/callback
```

Do not make schema changes directly in the hosted Table Editor after adopting migrations. Create a new migration locally and apply it through the CLI.

## Self-hosted Supabase

The same application environment variables work with a self-hosted Supabase endpoint. Apply `supabase/migrations/202607100001_initial_schema.sql` to the self-hosted PostgreSQL database and configure the public API URL and keys issued by that deployment.

The operator is responsible for database backups, upgrades, SMTP, TLS, monitoring, and secret rotation.

## Migration workflow

Create a migration:

```bash
npx supabase migration new describe_the_change
```

Apply and test locally:

```bash
npx supabase db reset
npm run check
```

Apply to the linked hosted project:

```bash
npx supabase db push
```

## Generated TypeScript types

The current `src/types/database.ts` file is hand-maintained. After the schema stabilizes, replace it with generated Supabase types:

```bash
npx supabase gen types typescript --local > src/types/supabase.ts
```

Do not include real user records, authentication exports, database dumps, or production credentials in migrations or seed files.
