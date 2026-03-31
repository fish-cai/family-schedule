import { create } from "zustand";
import type { GroupResponse } from "../types";
import { getMyGroups } from "../services/api";

interface GroupState {
  groups: GroupResponse[];
  loading: boolean;
  fetchGroups: () => Promise<void>;
  getGroupColor: (groupId: string | null) => string;
}

export const useGroupStore = create<GroupState>((set, get) => ({
  groups: [],
  loading: false,

  fetchGroups: async () => {
    set({ loading: true });
    try {
      const groups = await getMyGroups();
      set({ groups, loading: false });
    } catch (e) {
      console.error("Fetch groups failed:", e);
      set({ loading: false });
    }
  },

  getGroupColor: (groupId) => {
    if (!groupId) return "#999999";
    const group = get().groups.find((g) => g.id === groupId);
    return group?.color || "#4A90D9";
  },
}));
