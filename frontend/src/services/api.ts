import Taro from "@tarojs/taro";
import type {
  TokenResponse,
  User,
  GroupResponse,
  GroupDetailResponse,
  GroupCreate,
  GroupUpdate,
  EventResponse,
  EventCreate,
  EventUpdate,
} from "../types";

const BASE_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8000"
    : "https://your-production-api.com";

interface RequestOptions {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  data?: Record<string, unknown>;
  needAuth?: boolean;
}

export async function request<T>(options: RequestOptions): Promise<T> {
  const { url, method = "GET", data, needAuth = true } = options;

  const header: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (needAuth) {
    const token = Taro.getStorageSync("access_token");
    if (token) {
      header["Authorization"] = `Bearer ${token}`;
    }
  }

  const response = await Taro.request({
    url: `${BASE_URL}${url}`,
    method,
    data,
    header,
  });

  if (response.statusCode === 401) {
    Taro.removeStorageSync("access_token");
    Taro.redirectTo({ url: "/pages/index/index" });
    throw new Error("登录已过期");
  }

  if (response.statusCode >= 400) {
    const detail = response.data?.detail || "请求失败";
    throw new Error(detail);
  }

  return response.data as T;
}

// Health
export async function healthCheck() {
  return request<{ status: string; service: string }>({
    url: "/health",
    needAuth: false,
  });
}

// Auth
export async function login(code: string): Promise<TokenResponse> {
  return request<TokenResponse>({
    url: "/api/users/login",
    method: "POST",
    data: { code },
    needAuth: false,
  });
}

export async function getMe(): Promise<User> {
  return request<User>({ url: "/api/users/me" });
}

// Groups
export async function getMyGroups(): Promise<GroupResponse[]> {
  return request<GroupResponse[]>({ url: "/api/groups" });
}

export async function createGroup(data: GroupCreate): Promise<GroupResponse> {
  return request<GroupResponse>({
    url: "/api/groups",
    method: "POST",
    data: data as unknown as Record<string, unknown>,
  });
}

export async function getGroupDetail(id: string): Promise<GroupDetailResponse> {
  return request<GroupDetailResponse>({ url: `/api/groups/${id}` });
}

export async function updateGroup(id: string, data: GroupUpdate): Promise<GroupResponse> {
  return request<GroupResponse>({
    url: `/api/groups/${id}`,
    method: "PUT",
    data: data as unknown as Record<string, unknown>,
  });
}

export async function deleteGroup(id: string): Promise<void> {
  await request<void>({ url: `/api/groups/${id}`, method: "DELETE" });
}

export async function joinGroupByCode(inviteCode: string): Promise<{ detail: string; group_id: string }> {
  return request<{ detail: string; group_id: string }>({
    url: "/api/groups/join",
    method: "POST",
    data: { invite_code: inviteCode },
  });
}

export async function removeMember(groupId: string, userId: string): Promise<void> {
  await request<void>({ url: `/api/groups/${groupId}/members/${userId}`, method: "DELETE" });
}

// Events
export async function createEvent(data: EventCreate): Promise<EventResponse> {
  return request<EventResponse>({
    url: "/api/events",
    method: "POST",
    data: data as unknown as Record<string, unknown>,
  });
}

export async function getEvents(
  start: string,
  end: string,
  groupId?: string
): Promise<EventResponse[]> {
  let url = `/api/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
  if (groupId) {
    url += `&group_id=${groupId}`;
  }
  return request<EventResponse[]>({ url });
}

export async function getEventDetail(id: string): Promise<EventResponse> {
  return request<EventResponse>({ url: `/api/events/${id}` });
}

export async function updateEvent(
  id: string,
  data: EventUpdate
): Promise<EventResponse> {
  return request<EventResponse>({
    url: `/api/events/${id}`,
    method: "PUT",
    data: data as unknown as Record<string, unknown>,
  });
}

export async function deleteEvent(id: string): Promise<void> {
  await request<void>({ url: `/api/events/${id}`, method: "DELETE" });
}
