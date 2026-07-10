# Workspace OSS

A self-hostable collaborative workspace for boards, groups, items, custom columns, comments, notifications, roles, and team workflows.

> **Project status:** early development. The core application works, but the public setup and migration layer is still being hardened before a stable release.

## Features

- Multiple workspaces and boards
- Table and Kanban-style item views
- Status, person, date, and text columns
- Drag-and-drop ordering
- Comments, activity logs, notifications, and item photos
- Custom roles and permissions
- Supabase authentication, PostgreSQL, RLS, and realtime
- Cloudinary-backed image uploads
- Configurable application name, description, logo, and upload folder

## Stack

- Next.js 16 and React 19
- TypeScript and Tailwind CSS
- Supabase
- Cloudinary
- dnd-kit, Framer Motion, Zustand, and shadcn components

## Requirements

- Node.js 20 or newer
- npm
- A Supabase project, either local, hosted, or self-hosted
- A Cloudinary account for item photos

## Quick start

Clone the repository and install dependencies:

```bash
git clone https://github.com/redNSF/workspace-oss.git
cd workspace-oss
npm install
```

Create your local environment file:

```bash
cp .env.example .env.local
```

PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Configure these values:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_FOLDER=workspace
NEXT_PUBLIC_APP_NAME=Workspace
NEXT_PUBLIC_APP_DESCRIPTION=A collaborative work management platform
```

Apply the database migration. For local Supabase:

```bash
npx supabase start
npx supabase db reset
```

For a linked Supabase Cloud project:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

Start the application:

```bash
npm run dev
```

The first account created in a fresh database becomes the instance administrator.

See [docs/supabase.md](docs/supabase.md) for the complete database, authentication, hosted, and self-hosted setup.

## Validation

```bash
npm run lint
npm run typecheck
npm run build
```

Or run all checks:

```bash
npm run check
```

Pull requests run the same checks through GitHub Actions.

## Security model

Each deployment is currently treated as one organization. Workspaces are access boundaries within that organization, while roles remain instance-wide for compatibility with the current interface.

- Row Level Security protects application tables.
- Privileged Supabase access is server-only.
- Workspace membership controls workspace and board visibility.
- Upload routes require authentication and an appropriate application permission.
- Cloudinary deletion verifies ownership through the `item_photos` table.

Do not expose `SUPABASE_SERVICE_ROLE_KEY` or any Cloudinary secret to the browser.

For vulnerability reports, see [SECURITY.md](SECURITY.md).

## Roadmap

- Validate the canonical migration against a fresh local Supabase instance
- Add automated RLS tests
- Move roles from instance-wide assignments to workspace-specific assignments
- Add configurable storage providers
- Introduce database and authentication provider interfaces
- Improve installation and deployment automation
- Prepare the first stable release

## Contributing

The repository is still settling into its open-source structure. Issues and pull requests are welcome, but avoid large provider rewrites until the current Supabase baseline and test suite are stable.

## License

Workspace OSS is available under the [MIT License](LICENSE).
