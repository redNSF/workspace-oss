-- Make administrator bootstrap deterministic and configure the tables used by
-- the application's realtime subscriptions.

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
  -- Serialize bootstrap selection so concurrent first signups cannot both
  -- observe an empty profiles table and become instance administrators.
  perform pg_advisory_xact_lock(927451);

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

-- Notifications are created only by contextual, authenticated server actions.
-- Prevent browser clients from manufacturing notification content directly.
drop policy if exists notifications_insert on public.notifications;

alter table public.notifications
add column if not exists source_key text;

create unique index if not exists notifications_user_source_key_idx
on public.notifications (user_id, source_key)
where source_key is not null;

-- Editing a board is granted by workspace membership plus the item-edit
-- permission, or by an explicit editable board grant. Merely viewing a board
-- through an assignment or a read-only board_access row must not imply edit
-- access.
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
      select 1
      from public.boards b
      where b.id = p_board_id
        and public.is_workspace_member(b.workspace_id, p_user_id)
        and public.user_has_permission(p_user_id, 'edit_items')
    )
    or exists (
      select 1
      from public.board_access ba
      where ba.board_id = p_board_id
        and ba.user_id = p_user_id
        and ba.can_edit
    );
$$;

-- Structural board changes follow the same editable-access boundary. A
-- read-only collaborator or item assignee must not be able to manage groups and
-- columns merely because their instance-wide role contains edit_boards.
create or replace function public.user_can_manage_board(p_board_id uuid, p_user_id uuid)
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
    or (
      public.user_has_permission(p_user_id, 'edit_boards')
      and (
        exists (
          select 1
          from public.boards b
          where b.id = p_board_id
            and public.is_workspace_member(b.workspace_id, p_user_id)
        )
        or exists (
          select 1
          from public.board_access ba
          where ba.board_id = p_board_id
            and ba.user_id = p_user_id
            and ba.can_edit
        )
      )
    );
$$;

-- Supabase creates this publication. Keep the migration safe for environments
-- where realtime has intentionally not been installed.
do $$
declare
  v_table text;
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    foreach v_table in array array[
      'profiles',
      'groups',
      'items',
      'cell_values',
      'notifications'
    ]
    loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = v_table
      ) then
        execute format(
          'alter publication supabase_realtime add table public.%I',
          v_table
        );
      end if;
    end loop;
  end if;
end;
$$;
