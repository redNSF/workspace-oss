-- Tighten mutation privileges after the initial schema is installed.

-- Authenticated users may edit only their own presentation fields. Role fields
-- are managed by trusted server actions using the service-role client.
revoke update on table public.profiles from authenticated;
grant update (full_name, avatar_url, activity_status) on table public.profiles to authenticated;

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
      public.user_has_board_access(p_board_id, p_user_id)
      and public.user_has_permission(p_user_id, 'edit_boards')
    );
$$;

create or replace function public.user_can_edit_item(p_item_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.user_has_permission(p_user_id, 'edit_items')
    and public.user_can_edit_board(g.board_id, p_user_id)
  from public.items i
  join public.groups g on g.id = i.group_id
  where i.id = p_item_id;
$$;

grant execute on function public.user_can_manage_board(uuid, uuid) to authenticated;
grant execute on function public.user_can_edit_item(uuid, uuid) to authenticated;

drop policy if exists boards_update on public.boards;
create policy boards_update on public.boards
for update to authenticated
using (public.user_can_manage_board(id, auth.uid()))
with check (public.user_can_manage_board(id, auth.uid()));

drop policy if exists boards_delete on public.boards;
create policy boards_delete on public.boards
for delete to authenticated
using (
  public.user_has_board_access(id, auth.uid())
  and public.user_has_permission(auth.uid(), 'delete_boards')
);

drop policy if exists groups_write on public.groups;
create policy groups_write on public.groups
for all to authenticated
using (public.user_can_manage_board(board_id, auth.uid()))
with check (public.user_can_manage_board(board_id, auth.uid()));

drop policy if exists columns_write on public.columns;
create policy columns_write on public.columns
for all to authenticated
using (public.user_can_manage_board(board_id, auth.uid()))
with check (public.user_can_manage_board(board_id, auth.uid()));

drop policy if exists items_update on public.items;
create policy items_update on public.items
for update to authenticated
using (public.user_can_edit_item(id, auth.uid()))
with check (public.user_can_edit_item(id, auth.uid()));

drop policy if exists items_delete on public.items;
create policy items_delete on public.items
for delete to authenticated
using (
  public.user_has_item_access(id, auth.uid())
  and public.user_has_permission(auth.uid(), 'delete_items')
);

drop policy if exists cell_values_write on public.cell_values;
create policy cell_values_write on public.cell_values
for all to authenticated
using (public.user_can_edit_item(item_id, auth.uid()))
with check (public.user_can_edit_item(item_id, auth.uid()));

drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications
for insert to authenticated
with check (
  user_id = auth.uid()
  or public.users_share_workspace(auth.uid(), user_id)
);
