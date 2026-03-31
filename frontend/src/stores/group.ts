import { create } from "zustand";
import type { GroupResponse, GroupCreate, GroupUpdate } from "../types";
import * as api from "../services/api";

interface GroupState {
  groups: GroupResponse[];
  loading: boolean;
  fetchGroups: () => Promise<void>;
  getGroupColor: (groupId: string | null) => string;
  createGroup: (data: GroupCreate) => Promise<GroupResponse>;
  updateGroup: (id: string, data: GroupUpdate) => Promise<GroupResponse>;
  deleteGroup: (id: string) => Promise<void>;
  joinGroupByCode: (inviteCode: string) => Promise<string>;
  removeMember: (groupId: string, userId: string) => Promise<void>;
}

export const useGroupStore = create<GroupState>((set, get) => ({
  groups: [],
  loading: false,

  fetchGroups: async () => {
    set({ loading: true });
    try {
      const groups = await api.getMyGroups();
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

  createGroup: async (data) => {
    const group = await api.createGroup(data);
    set((s) => ({ groups: [...s.groups, group] }));
    return group;
  },

  updateGroup: async (id, data) => {
    const updated = await api.updateGroup(id, data);
    set((s) => ({
      groups: s.groups.map((g) => (g.id === id ? updated : g)),
    }));
    return updated;
  },

  deleteGroup: async (id) => {
    await api.deleteGroup(id);
    set((s) => ({ groups: s.groups.filter((g) => g.id !== id) }));
  },

  joinGroupByCode: async (inviteCode) => {
    const result = await api.joinGroupByCode(inviteCode);
    await get().fetchGroups();
    return result.group_id;
  },

  removeMember: async (groupId, userId) => {
    await api.removeMember(groupId, userId);
  },
}));
