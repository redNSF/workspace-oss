-- Workspace OSS canonical schema
--
-- This migration is designed for a fresh Supabase project. The deployment is
-- treated as one organization; workspaces are access boundaries inside that
-- organization. Roles remain instance-wide for compatibility with the current UI.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Core tables
-- -----------------------------------------------------------------------------

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#8b5cf6',
  created_at timestamptz not null default now()
);

create table public.available_permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  category text not null
);

create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles(id) on delete cascade,
  permission text not null references public.available_permissions(key) on delete cascade,
  enabled boolean not null default false,
  unique (role_id, permission)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  activity_status text not null default 'active'
    check (activity_status in ('active', 'away', 'offline', 'dnd')),
  role text check (role is null or role = 'admin'),
  role_id uuid references public.roles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid references public.roles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table public.boards (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  description text,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  color text default '#8b5cf6',
  created_at timestamptz not null default now()
);

create table public.board_access (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  can_edit boolean not null default false,
  created_at timestamptz not null default now(),
  unique (board_id, user_id)
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  board_id uuid not null references public.boards(id) on delete cascade,
  position integer not null default 0,
  color text default '#8b5cf6',
  created_at timestamptz not null default now()
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 500),
  description text,
  group_id uuid not null references public.groups(id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table public.columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  type text not null check (type in ('status', 'person', 'date', 'text')),
  position integer not null default 0
);

create table public.cell_values (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  column_id uuid not null references public.columns(id) on delete cascade,
  value text,
  unique (item_id, column_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text check (role is null or role = 'admin'),
  role_id uuid references public.roles(id) on delete set null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'expired')),
  created_at timestamptz not null default now()
);

create unique index invitations_pending_email_workspace_idx
  on public.invitations (lower(email), workspace_id)
  where status = 'pending';

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  type text not null default 'system'
    check (type in ('assignment', 'comment', 'status_change', 'system')),
  read boolean not null default false,
  link text not null default '',
  created_at timestamptz not null default now()
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  item_id uuid references public.items(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.item_photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  url text not null,
  public_id text not null unique,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

create index profiles_role_id_idx on public.profiles(role_id);
create index workspace_members_user_id_idx on public.workspace_members(user_id);
create index boards_workspace_id_idx on public.boards(workspace_id);
create index board_access_user_id_idx on public.board_access(user_id);
create index groups_board_id_position_idx on public.groups(board_id, position);
create index items_group_id_position_idx on public.items(group_id, position);
create index columns_board_id_position_idx on public.columns(board_id, position);
create index cell_values_item_id_idx on public.cell_values(item_id);
create index comments_item_id_created_at_idx on public.comments(item_id, created_at);
create index notifications_user_id_created_at_idx on public.notifications(user_id, created_at desc);
create index activity_logs_board_id_created_at_idx on public.activity_logs(board_id, created_at desc);
create index item_photos_item_id_created_at_idx on public.item_photos(item_id, created_at);

-- -----------------------------------------------------------------------------
-- Reference data
-- -----------------------------------------------------------------------------

insert into public.available_permissions (key, label, category) values
  ('create_workspaces', 'Create workspaces', 'Workspaces'),
  ('create_boards', 'Create boards', 'Boards'),
  ('edit_boards', 'Edit boards', 'Boards'),
  ('delete_boards', 'Delete boards', 'Boards'),
  ('create_items', 'Create items', 'Items'),
  ('edit_items', 'Edit items', 'Items'),
  ('delete_items', 'Delete items', 'Items'),
  ('create_comments', 'Create comments', 'Comments'),
  ('delete_comments', 'Delete comments', 'Comments'),
  ('invite_members', 'Invite members', 'Members'),
  ('remove_members', 'Remove members', 'Members'),
  ('manage_roles', 'Manage roles', 'Administration')
on conflict (key) do update
set label = excluded.label, category = excluded.category;

insert into public.roles (name, color) values
  ('Admin', '#8b5cf6'),
  ('Member', '#3b82f6')
on conflict (name) do update set color = excluded.color;

insert into public.role_permissions (role_id, permission, enabled)
select r.id, p.key, true
from public.roles r
cross join public.available_permissions p
where r.name = 'Admin'
on conflict (role_id, permission) do update set enabled = true;

insert into public.role_permissions (role_id, permission, enabled)
select r.id, p.key, p.key in ('create_items', 'edit_items', 'create_comments')
from public.roles r
cross join public.available_permissions p
where r.name = 'Member'
on conflict (role_id, permission) do update set enabled = excluded.enabled;

-- -----------------------------------------------------------------------------
-- Helper functions
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger comments_set_updated_at
before update on public.comments
for each row execute function public.set_updated_at();

create or replace function public.is_instance_admin(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    left join public.roles r on r.id = p.role_id
    where p.id = p_user_id
      and (p.role = 'admin' or lower(r.name) = 'admin')
  );
$$;

create or replace function public.user_has_permission(p_user_id uuid, p_permission text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_instance_admin(p_user_id)
    or exists (
      select 1
      from public.profiles p
      join public.role_permissions rp on rp.role_id = p.role_id
      where p.id = p_user_id
        and rp.permission = p_permission
        and rp.enabled
    );
$$;

create or replace function public.is_workspace_member(p_workspace_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.workspaces w
    where w.id = p_workspace_id and w.owner_id = p_user_id
  ) or exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id and wm.user_id = p_user_id
  );
$$;

create or replace function public.users_share_workspace(p_left uuid, p_right uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select p_left = p_right or exists (
    select 1
    from public.workspace_members a
    join public.workspace_members b on b.workspace_id = a.workspace_id
    where a.user_id = p_left and b.user_id = p_right
  ) or exists (
    select 1 from public.workspaces w
    where (w.owner_id = p_left and public.is_workspace_member(w.id, p_right))
       or (w.owner_id = p_right and public.is_workspace_member(w.id, p_left))
  );
$$;

create or replace function public.user_has_board_access(p_board_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_instance_admin(p_user_id)
    or exists (
      select 1
      from public.boards b
      where b.id = p_board_id
        and public.is_workspace_member(b.workspace_id, p_user_id)
    )
    or exists (
      select 1 from public.board_access ba
      where ba.board_id = p_board_id and ba.user_id = p_user_id
    )
    or exists (
      select 1
      from public.groups g
      join public.items i on i.group_id = g.id
      join public.cell_values cv on cv.item_id = i.id
      join public.columns c on c.id = cv.column_id
      where g.board_id = p_board_id
        and c.type = 'person'
        and cv.value ilike '%' || p_user_id::text || '%'
    );
$$;

create or replace function public.user_can_edit_board(p_board_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_instance_admin(p_user_id)
    or exists (
      select 1
      from public.boards b
      join public.workspaces w on w.id = b.workspace_id
      where b.id = p_board_id and w.owner_id = p_user_id
    )
    or exists (
      select 1 from public.board_access ba
      where ba.board_id = p_board_id
        and ba.user_id = p_user_id
        and ba.can_edit
    )
    or (
      public.user_has_board_access(p_board_id, p_user_id)
      and public.user_has_permission(p_user_id, 'edit_items')
    );
$$;

create or replace function public.user_has_item_access(p_item_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.user_has_board_access(g.board_id, p_user_id)
  from public.items i
  join public.groups g on g.id = i.group_id
  where i.id = p_item_id;
$$;

-- -----------------------------------------------------------------------------
-- Auth and initialization triggers
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_first boolean;
  v_role_id uuid;
  v_legacy_role text;
  v_invitation public.invitations%rowtype;
begin
  select not exists (select 1 from public.profiles) into v_is_first;

  if v_is_first then
    select id into v_role_id from public.roles where lower(name) = 'admin' limit 1;
    v_legacy_role := 'admin';
  else
    select id into v_role_id from public.roles where lower(name) = 'member' limit 1;
    v_legacy_role := null;
  end if;

  select * into v_invitation
  from public.invitations
  where lower(email) = lower(new.email)
    and status = 'pending'
  order by created_at desc
  limit 1;

  if found then
    v_role_id := coalesce(v_invitation.role_id, v_role_id);
    if exists (select 1 from public.roles where id = v_role_id and lower(name) = 'admin') then
      v_legacy_role := 'admin';
    else
      v_legacy_role := null;
    end if;
  end if;

  insert into public.profiles (id, full_name, avatar_url, role, role_id)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    v_legacy_role,
    v_role_id
  )
  on conflict (id) do nothing;

  if v_invitation.id is not null then
    insert into public.workspace_members (workspace_id, user_id, role_id)
    values (v_invitation.workspace_id, new.id, v_role_id)
    on conflict (workspace_id, user_id)
    do update set role_id = excluded.role_id;

    update public.invitations
    set status = 'accepted'
    where id = v_invitation.id;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.handle_workspace_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role_id)
  select new.id, new.owner_id, p.role_id
  from public.profiles p
  where p.id = new.owner_id
  on conflict (workspace_id, user_id) do nothing;
  return new;
end;
$$;

create trigger on_workspace_created
after insert on public.workspaces
for each row execute function public.handle_workspace_created();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.roles enable row level security;
alter table public.available_permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.boards enable row level security;
alter table public.board_access enable row level security;
alter table public.groups enable row level security;
alter table public.items enable row level security;
alter table public.columns enable row level security;
alter table public.cell_values enable row level security;
alter table public.invitations enable row level security;
alter table public.comments enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_logs enable row level security;
alter table public.item_photos enable row level security;

create policy roles_read on public.roles
for select to authenticated using (true);
create policy roles_manage on public.roles
for all to authenticated
using (public.is_instance_admin(auth.uid()))
with check (public.is_instance_admin(auth.uid()));

create policy available_permissions_read on public.available_permissions
for select to authenticated using (true);
create policy available_permissions_manage on public.available_permissions
for all to authenticated
using (public.is_instance_admin(auth.uid()))
with check (public.is_instance_admin(auth.uid()));

create policy role_permissions_read on public.role_permissions
for select to authenticated using (true);
create policy role_permissions_manage on public.role_permissions
for all to authenticated
using (public.is_instance_admin(auth.uid()))
with check (public.is_instance_admin(auth.uid()));

create policy profiles_read on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or public.is_instance_admin(auth.uid())
  or public.users_share_workspace(auth.uid(), id)
);
create policy profiles_update_self on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy workspaces_read on public.workspaces
for select to authenticated
using (
  public.is_instance_admin(auth.uid())
  or public.is_workspace_member(id, auth.uid())
);
create policy workspaces_insert on public.workspaces
for insert to authenticated
with check (
  owner_id = auth.uid()
  and public.user_has_permission(auth.uid(), 'create_workspaces')
);
create policy workspaces_update on public.workspaces
for update to authenticated
using (owner_id = auth.uid() or public.is_instance_admin(auth.uid()))
with check (owner_id = auth.uid() or public.is_instance_admin(auth.uid()));
create policy workspaces_delete on public.workspaces
for delete to authenticated
using (owner_id = auth.uid() or public.is_instance_admin(auth.uid()));

create policy workspace_members_read on public.workspace_members
for select to authenticated
using (
  user_id = auth.uid()
  or public.is_instance_admin(auth.uid())
  or public.is_workspace_member(workspace_id, auth.uid())
);
create policy workspace_members_manage on public.workspace_members
for all to authenticated
using (
  public.is_instance_admin(auth.uid())
  or exists (
    select 1 from public.workspaces w
    where w.id = workspace_id and w.owner_id = auth.uid()
  )
)
with check (
  public.is_instance_admin(auth.uid())
  or exists (
    select 1 from public.workspaces w
    where w.id = workspace_id and w.owner_id = auth.uid()
  )
);

create policy boards_read on public.boards
for select to authenticated
using (public.user_has_board_access(id, auth.uid()));
create policy boards_insert on public.boards
for insert to authenticated
with check (
  public.is_workspace_member(workspace_id, auth.uid())
  and public.user_has_permission(auth.uid(), 'create_boards')
);
create policy boards_update on public.boards
for update to authenticated
using (public.user_can_edit_board(id, auth.uid()))
with check (public.user_can_edit_board(id, auth.uid()));
create policy boards_delete on public.boards
for delete to authenticated
using (
  public.is_instance_admin(auth.uid())
  or (
    public.user_can_edit_board(id, auth.uid())
    and public.user_has_permission(auth.uid(), 'delete_boards')
  )
);

create policy board_access_read on public.board_access
for select to authenticated
using (public.user_has_board_access(board_id, auth.uid()));
create policy board_access_manage on public.board_access
for all to authenticated
using (
  public.is_instance_admin(auth.uid())
  or exists (
    select 1
    from public.boards b
    join public.workspaces w on w.id = b.workspace_id
    where b.id = board_id and w.owner_id = auth.uid()
  )
)
with check (
  public.is_instance_admin(auth.uid())
  or exists (
    select 1
    from public.boards b
    join public.workspaces w on w.id = b.workspace_id
    where b.id = board_id and w.owner_id = auth.uid()
  )
);

create policy groups_read on public.groups
for select to authenticated
using (public.user_has_board_access(board_id, auth.uid()));
create policy groups_write on public.groups
for all to authenticated
using (public.user_can_edit_board(board_id, auth.uid()))
with check (public.user_can_edit_board(board_id, auth.uid()));

create policy items_read on public.items
for select to authenticated
using (public.user_has_item_access(id, auth.uid()));
create policy items_insert on public.items
for insert to authenticated
with check (
  exists (
    select 1 from public.groups g
    where g.id = group_id and public.user_can_edit_board(g.board_id, auth.uid())
  )
  and public.user_has_permission(auth.uid(), 'create_items')
);
create policy items_update on public.items
for update to authenticated
using (public.user_has_item_access(id, auth.uid()))
with check (public.user_has_item_access(id, auth.uid()));
create policy items_delete on public.items
for delete to authenticated
using (
  public.user_has_item_access(id, auth.uid())
  and public.user_has_permission(auth.uid(), 'delete_items')
);

create policy columns_read on public.columns
for select to authenticated
using (public.user_has_board_access(board_id, auth.uid()));
create policy columns_write on public.columns
for all to authenticated
using (public.user_can_edit_board(board_id, auth.uid()))
with check (public.user_can_edit_board(board_id, auth.uid()));

create policy cell_values_read on public.cell_values
for select to authenticated
using (public.user_has_item_access(item_id, auth.uid()));
create policy cell_values_write on public.cell_values
for all to authenticated
using (public.user_has_item_access(item_id, auth.uid()))
with check (public.user_has_item_access(item_id, auth.uid()));

create policy invitations_read on public.invitations
for select to authenticated
using (
  invited_by = auth.uid()
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.is_instance_admin(auth.uid())
  or exists (
    select 1 from public.workspaces w
    where w.id = workspace_id and w.owner_id = auth.uid()
  )
);
create policy invitations_insert on public.invitations
for insert to authenticated
with check (
  invited_by = auth.uid()
  and public.is_workspace_member(workspace_id, auth.uid())
  and public.user_has_permission(auth.uid(), 'invite_members')
);
create policy invitations_update on public.invitations
for update to authenticated
using (
  invited_by = auth.uid()
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.is_instance_admin(auth.uid())
)
with check (
  invited_by = auth.uid()
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.is_instance_admin(auth.uid())
);
create policy invitations_delete on public.invitations
for delete to authenticated
using (invited_by = auth.uid() or public.is_instance_admin(auth.uid()));

create policy comments_read on public.comments
for select to authenticated
using (public.user_has_item_access(item_id, auth.uid()));
create policy comments_insert on public.comments
for insert to authenticated
with check (
  user_id = auth.uid()
  and public.user_has_item_access(item_id, auth.uid())
  and public.user_has_permission(auth.uid(), 'create_comments')
);
create policy comments_update on public.comments
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
create policy comments_delete on public.comments
for delete to authenticated
using (
  user_id = auth.uid()
  or public.is_instance_admin(auth.uid())
  or public.user_has_permission(auth.uid(), 'delete_comments')
);

create policy notifications_own on public.notifications
for select to authenticated using (user_id = auth.uid());
create policy notifications_update_own on public.notifications
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
create policy notifications_insert on public.notifications
for insert to authenticated
with check (auth.uid() is not null);
create policy notifications_delete_own on public.notifications
for delete to authenticated using (user_id = auth.uid());

create policy activity_logs_read on public.activity_logs
for select to authenticated
using (public.user_has_board_access(board_id, auth.uid()));
create policy activity_logs_insert on public.activity_logs
for insert to authenticated
with check (
  user_id = auth.uid()
  and public.user_has_board_access(board_id, auth.uid())
);

create policy item_photos_read on public.item_photos
for select to authenticated
using (public.user_has_item_access(item_id, auth.uid()));
create policy item_photos_insert on public.item_photos
for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and public.user_has_item_access(item_id, auth.uid())
);
create policy item_photos_delete on public.item_photos
for delete to authenticated
using (
  uploaded_by = auth.uid()
  or public.is_instance_admin(auth.uid())
);

-- -----------------------------------------------------------------------------
-- API grants
-- -----------------------------------------------------------------------------

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.is_instance_admin(uuid) to authenticated;
grant execute on function public.user_has_permission(uuid, text) to authenticated;
grant execute on function public.is_workspace_member(uuid, uuid) to authenticated;
grant execute on function public.users_share_workspace(uuid, uuid) to authenticated;
grant execute on function public.user_has_board_access(uuid, uuid) to authenticated;
grant execute on function public.user_can_edit_board(uuid, uuid) to authenticated;
grant execute on function public.user_has_item_access(uuid, uuid) to authenticated;
