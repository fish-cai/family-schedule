import { create } from "zustand";
import type { EventResponse, EventCreate, EventUpdate } from "../types";
import * as api from "../services/api";

interface EventState {
  events: EventResponse[];
  loading: boolean;
  fetchEvents: (start: string, end: string) => Promise<void>;
  createEvent: (data: EventCreate) => Promise<EventResponse>;
  updateEvent: (id: string, data: EventUpdate) => Promise<EventResponse>;
  deleteEvent: (id: string) => Promise<void>;
}

export const useEventStore = create<EventState>((set) => ({
  events: [],
  loading: false,

  fetchEvents: async (start, end) => {
    set({ loading: true });
    try {
      const events = await api.getEvents(start, end);
      set({ events, loading: false });
    } catch (e) {
      console.error("Fetch events failed:", e);
      set({ loading: false });
    }
  },

  createEvent: async (data) => {
    const event = await api.createEvent(data);
    set((s) => ({ events: [...s.events, event] }));
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
  },
}));
