import { View, Text, Image, Input } from "@tarojs/components";
import { useState, useCallback } from "react";
import Taro from "@tarojs/taro";
import { useAuthStore } from "../../stores/auth";
import { updateProfile } from "../../services/api";
import "./index.scss";

export default function ProfilePage() {
  const { user, logout, setUser } = useAuthStore();
  const [editingNickname, setEditingNickname] = useState(false);

  const handleNicknameChange = useCallback(
    async (e) => {
      const newNickname = e.detail.value?.trim();
      setEditingNickname(false);
      if (newNickname && newNickname !== user?.nickname) {
        try {
          const updated = await updateProfile({ nickname: newNickname });
          setUser(updated);
          Taro.showToast({ title: "昵称已更新", icon: "success" });
        } catch {
          Taro.showToast({ title: "更新失败", icon: "none" });
        }
      }
    },
    [user, setUser]
  );

  const handleLogout = () => {
    Taro.showModal({
      title: "退出登录",
      content: "确定要退出登录吗？",
      success: (res) => {
        if (res.confirm) {
          logout();
          Taro.redirectTo({ url: "/pages/index/index" });
        }
      },
    });
  };

  return (
    <View className="profile-page">
      <View className="user-section">
        <View className="avatar-placeholder">
          {user?.avatar ? (
            <Image className="avatar-img" src={user.avatar} />
          ) : (
            <Text className="avatar-text">{(user?.nickname || "?")[0]}</Text>
          )}
        </View>
        <Text className="nickname" onClick={() => setEditingNickname(true)}>
          {editingNickname ? "" : (user?.nickname || "点击设置昵称")}
        </Text>
        {editingNickname && (
          <Input
            className="nickname-input"
            type="nickname"
            placeholder="请输入昵称"
            focus
            onConfirm={handleNicknameChange}
            onBlur={handleNicknameChange}
          />
        )}
      </View>

      <View className="menu-section">
        <View className="menu-item" onClick={() => {
          Taro.showModal({
            title: "共享日程",
            content: "版本 1.0.0\n\n为共享而生的智能日程管理工具。\n支持家庭、朋友、团队共享日历，AI 智能创建日程。",
            showCancel: false,
            confirmText: "知道了",
          });
        }}>
          <Text className="menu-label">关于共享日程</Text>
          <Text className="menu-arrow">›</Text>
        </View>
        <View className="menu-item" onClick={() => Taro.navigateTo({ url: "/pages/legal/agreement" })}>
          <Text className="menu-label">用户协议</Text>
          <Text className="menu-arrow">›</Text>
        </View>
        <View className="menu-item" onClick={() => Taro.navigateTo({ url: "/pages/legal/privacy" })}>
          <Text className="menu-label">隐私政策</Text>
          <Text className="menu-arrow">›</Text>
        </View>
      </View>

      <View className="logout-section">
        <Text className="logout-btn" onClick={handleLogout}>退出登录</Text>
      </View>
    </View>
  );
}
