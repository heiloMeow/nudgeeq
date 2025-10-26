// Shared types for the user editing flow pages.
export interface UserEditContext {
  tableId: string;
  seatId: string;
  name: string;
  avatarSrc: string;
  signals: string[];
}

export interface UserEditState extends Partial<UserEditContext> {
  tableId?: string;
  seatId?: string;
  name?: string;
  avatarSrc?: string;
  signals?: string[];
}

export interface LoadedRoleDetail {
  id: string;
  name: string;
  tableId?: string;
  seatId?: string | number;
  avatar?: string;
  signals?: string[];
}

