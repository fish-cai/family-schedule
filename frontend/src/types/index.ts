export interface User {
  id: string;
  nickname: string;
  avatar: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface HealthResponse {
  status: string;
  service: string;
}

export interface GroupResponse {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  invite_code: string;
  max_members: number;
  member_count: number;
  my_role: string;
  created_at: string;
}

export interface EventResponse {
  id: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string | null;
  is_all_day: boolean;
  location: string;
  color: string;
  visibility: string;
  repeat_rule: Record<string, unknown> | null;
  group_id: string | null;
  visible_group_ids: string[];
  creator_id: string;
  creator_nickname: string;
  created_at: string;
  remind_minutes: number[];
}

export interface EventCreate {
  title: string;
  description?: string;
  start_time: string;
  end_time?: string | null;
  is_all_day?: boolean;
  location?: string;
  color?: string;
  visibility?: "public" | "busy" | "private";
  repeat_rule?: Record<string, unknown> | null;
  group_id?: string | null;
  visible_group_ids?: string[];
  remind_minutes?: number[];
}

export interface EventUpdate {
  title?: string;
  description?: string;
  start_time?: string;
  end_time?: string | null;
  is_all_day?: boolean;
  location?: string;
  color?: string;
  visibility?: "public" | "busy" | "private";
  repeat_rule?: Record<string, unknown> | null;
  visible_group_ids?: string[];
  remind_minutes?: number[];
}

export interface GroupCreate {
  name: string;
  icon?: string;
  color?: string;
  description?: string;
}

export interface GroupUpdate {
  name?: string;
  icon?: string;
  color?: string;
  description?: string;
}

export interface GroupMemberResponse {
  user_id: string;
  nickname: string;
  avatar: string;
  role: string;
}

export interface GroupDetailResponse extends GroupResponse {
  members: GroupMemberResponse[];
}

export interface ParseEventResponse {
  title: string;
  start_time: string;
  end_time: string | null;
  is_all_day: boolean;
  location: string;
  description: string;
  repeat_rule: {
    freq: "daily" | "weekly" | "monthly";
    interval: number;
    byday?: string[];
  } | null;
}
