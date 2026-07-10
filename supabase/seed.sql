-- Reference seed for local development.
-- Core reference rows are also created by the initial migration so hosted
-- deployments remain functional when seed files are not applied.

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
