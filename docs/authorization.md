# Authorization model

Workspace OSS uses PostgreSQL Row Level Security (RLS) as the source of truth for
authorization. Server routes and user-interface controls must mirror database
capabilities, but they must never replace the RLS check.

## Current scope

Each installation currently represents one organization. Roles and permissions
are assigned to profiles across the installation. Workspaces add a second access
boundary through ownership and membership, and boards can grant access to an
individual profile.

The longer-term model will move role assignment onto workspace membership. Until
that migration is complete, changing a profile's role affects every workspace the
profile can access.

## Principals

- **Instance administrator:** the first account on a fresh installation. It has
  all permissions and can administer the installation.
- **Workspace owner:** the profile stored in `workspaces.owner_id`. Ownership
  grants access to every board in that workspace.
- **Workspace administrator:** not yet a distinct membership kind. The workspace
  owner is the workspace administrator in the current release.
- **Workspace member:** a profile with a `workspace_members` row. Membership
  grants workspace and board visibility; mutations also require the relevant
  role permission.
- **Guest / board viewer:** represented by a read-only `board_access` row. A
  guest can view that board but does not become a workspace member.
- **Board collaborator:** a profile with a `board_access` row. The row can be
  read-only or editable. Mutations still require the relevant role permission.
- **Item assignee:** a profile selected in a person cell. Assignment provides
  item and parent-board visibility while that assignment remains present, but
  does not grant board-edit capability.

A profile can belong to multiple workspaces. Workspace visibility is evaluated
independently for each membership, while the profile's current role permissions
remain installation-wide until workspace-scoped roles are implemented.

## Capability matrix

| Operation | Required access | Required permission |
| --- | --- | --- |
| View workspace | administrator, owner, or member | none |
| View board | administrator, workspace owner/member, board collaborator, or authorized item assignee | none |
| Manage board structure | administrator, workspace owner, or editable workspace/board member | `edit_boards` |
| Create item | editable board access | `create_items` |
| Edit item | editable board access | `edit_items` |
| Delete item | board/item access | `delete_items` |
| Create comment | item access | `create_comments` |
| Delete comment | comment author or item access | none for the author; otherwise `delete_comments` |
| Upload item photo | editable item access | `edit_items` through `user_can_edit_item` |
| Delete item photo | original uploader | none |
| Delete board | board access | `delete_boards` |
| Administer roles, members, or settings | administrator | corresponding administration permission |

## Canonical database helpers

Application code should prefer these SQL helpers instead of rebuilding access
rules in JavaScript:

- `is_admin()`
- `has_permission(permission_key)`
- `has_workspace_access(workspace_id)`
- `has_board_access(board_id)`
- `user_can_manage_board(board_id)`
- `user_can_edit_board(board_id)`
- `user_has_item_access(item_id)`
- `user_can_edit_item(item_id)`

Whenever a capability changes, update the helper and its RLS policies first,
then update server-side capability derivation and finally the interface. Add an
authorization test for the permitted and denied cases before release.

## Privileged server operations

The Supabase service-role key is only used after a normal authenticated client
has established the caller and the relevant resource access. Requests must not
accept a user ID, role, notification text, storage identifier, or other privileged
claim from the browser without resolving and validating it against database state.

Notification creation and Cloudinary metadata changes follow this pattern. A
service-role client is never a substitute for caller authorization.
