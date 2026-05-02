import { request } from "./api";

export const TRACK = {
  APP_OPEN: "app_open",
  LOGIN_SUCCESS: "login_success",
  EVENT_CREATE: "event_create",
  EVENT_DELETE: "event_delete",
  GROUP_CREATE: "group_create",
  GROUP_JOIN: "group_join",
  SHARE_CLICK: "share_click",
  REMINDER_SUBSCRIBE: "reminder_subscribe",
  ONBOARDING_NEXT: "onboarding_next",
  QUICK_CREATE_USED: "quick_create_used",
} as const;

export type TrackName = (typeof TRACK)[keyof typeof TRACK];

export async function track(name: TrackName, properties?: Record<string, unknown>): Promise<void> {
  try {
    await request<{ ok: boolean }>({
      url: "/api/analytics/track",
      method: "POST",
      data: { name, properties },
    });
  } catch {
    // silent fail — analytics never block UX
  }
}
