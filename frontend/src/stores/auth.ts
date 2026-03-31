import { create } from "zustand";
import Taro from "@tarojs/taro";
import type { User } from "../types";
import { login as apiLogin, getMe } from "../services/api";

interface AuthState {
  token: string | null;
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  loading: false,

  login: async () => {
    set({ loading: true });
    try {
      let code: string;
      if (process.env.TARO_ENV === "weapp") {
        const res = await Taro.login();
        code = res.code;
      } else {
        code = "dev_h5_user";
      }

      const tokenRes = await apiLogin(code);
      Taro.setStorageSync("access_token", tokenRes.access_token);

      const user = await getMe();
      set({ token: tokenRes.access_token, user, loading: false });
    } catch (e) {
      console.error("Login failed:", e);
      set({ loading: false });
    }
  },

  loadFromStorage: async () => {
    const token = Taro.getStorageSync("access_token");
    if (!token) return;

    set({ loading: true });
    try {
      const user = await getMe();
      set({ token, user, loading: false });
    } catch {
      Taro.removeStorageSync("access_token");
      set({ token: null, user: null, loading: false });
    }
  },

  logout: () => {
    Taro.removeStorageSync("access_token");
    set({ token: null, user: null });
  },
}));
