import { create } from "zustand";

interface CalendarState {
  currentMonth: Date;
  selectedDate: Date;
  isExpanded: boolean;
  setMonth: (date: Date) => void;
  selectDate: (date: Date) => void;
  toggleExpand: () => void;
  goToToday: () => void;
}

export const useCalendarStore = create<CalendarState>((set) => ({
  currentMonth: new Date(),
  selectedDate: new Date(),
  isExpanded: false,

  setMonth: (date) => set({ currentMonth: date }),

  selectDate: (date) =>
    set({
      selectedDate: date,
      currentMonth: new Date(date.getFullYear(), date.getMonth(), 1),
    }),

  toggleExpand: () => set((s) => ({ isExpanded: !s.isExpanded })),

  goToToday: () => {
    const today = new Date();
    set({
      selectedDate: today,
      currentMonth: new Date(today.getFullYear(), today.getMonth(), 1),
    });
  },
}));
