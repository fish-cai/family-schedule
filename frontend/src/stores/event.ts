import { create } from "zustand";
import type { EventResponse, EventCreate, EventUpdate } from "../types";
import * as api from "../services/api";
import { track, TRACK } from "../services/analytics";

interface EventState {
  events: EventResponse[];
  loading: boolean;
  loadError: string | null;
  filterGroupId: string | null; // null = "全部", "personal" = 个人, uuid = 某个组
  setFilterGroupId: (id: string | null) => void;
  fetchEvents: (start: string, end: string, groupId?: string) => Promise<void>;
  createEvent: (data: EventCreate) => Promise<EventResponse>;
  updateEvent: (id: string, data: EventUpdate) => Promise<EventResponse>;
  deleteEvent: (id: string) => Promise<void>;
}

export const useEventStore = create<EventState>((set, get) => ({
  events: [],
  loading: false,
  loadError: null,
  filterGroupId: null,

  setFilterGroupId: (id) => set({ filterGroupId: id }),

  fetchEvents: async (start, end, groupId) => {
    set({ loading: true, loadError: null });
    try {
      const events = await api.getEvents(start, end, groupId || undefined);
      set({ events, loading: false, loadError: null });
    } catch (e: any) {
      console.error("Fetch events failed:", e);
      set({ loading: false, loadError: e?.message || "加载失败" });
    }
  },

  createEvent: async (data) => {
    const event = await api.createEvent(data);
    set((s) => ({ events: [...s.events, event] }));
    track(TRACK.EVENT_CREATE, {
      has_reminder: !!(data.remind_minutes && data.remind_minutes.length),
      group_count: data.visible_group_ids?.length || 0,
      is_recurring: !!data.repeat_rule,
    });
    return event;
  },

  updateEvent: async (id, data) => {
    const updated = await api.updateEvent(id, data);
    set((s) => ({
      events: s.events.map((e) => (e.id === id ? updated : e)),
    }));
    return updated;
  },

  deleteEvent: async (id) => {
    await api.deleteEvent(id);
    set((s) => ({ events: s.events.filter((e) => e.id !== id) }));
    track(TRACK.EVENT_DELETE);
  },
}));
