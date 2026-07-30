/** Legacy string role — still used in UI fallbacks */
export type UserRole = "admin";

export interface Role {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface AvailablePermission {
  id: string;
  key: string;           // e.g. "create_boards"
  label: string;         // e.g. "Create Boards"
  category: string;      // e.g. "Boards"
}

export interface RolePermission {
  id: string;
  role_id: string;
  permission: string;
  enabled: boolean;
}

export interface Invitation {
  id: string;
  email: string;
  role: UserRole | null;
  role_id?: string | null;
  workspace_id: string;
  invited_by: string;
  status: "pending" | "accepted" | "expired";
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  activity_status?: "active" | "away" | "offline" | "dnd" | null;
  updated_at: string | null;
  /** Legacy string role — kept for gradual migration */
  role: UserRole | null;
  /** FK → roles.id (custom role system) */
  role_id: string | null;
  email?: string | null;
  /** Joined role object when fetched with select("*, roles(*)") */
  roles?: Role | null;
}

export interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

export interface Board {
  id: string;
  name: string;
  description?: string | null;
  workspace_id: string;
  color: string | null;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  board_id: string;
  position: number;
  color: string | null;
  created_at: string;
}

export interface Item {
  id: string;
  name: string;
  description?: string | null;
  group_id: string;
  position: number;
  created_at: string;
  created_by: string | null;
}

export interface Column {
  id: string;
  board_id: string;
  title: string;
  type: "status" | "person" | "date" | "text";
  position: number;
}

export interface CellValue {
  id: string;
  item_id: string;
  column_id: string;
  value: string | null;
}

export interface BoardAccess {
  id: string;
  board_id: string;
  user_id: string;
  can_edit: boolean;
  created_at: string;
}

export interface WorkspaceWithBoards extends Workspace {
  boards: Board[];
}

export interface Comment {
  id: string;
  item_id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at?: string | null;
  profiles?: {
    full_name: string | null;
  } | null;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: "assignment" | "comment" | "status_change" | "system";
  read: boolean;
  link: string;
  source_key?: string | null;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  board_id: string;
  item_id: string | null;
  user_id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
  profiles?: {
    full_name: string | null;
  } | null;
}

export interface ItemPhoto {
  id: string;
  item_id: string;
  url: string;
  public_id: string;
  uploaded_by: string | null;
  created_at: string;
}
