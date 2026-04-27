import { View, Text, Image, Input, Button } from "@tarojs/components";
import { useState, useCallback, useEffect } from "react";
import Taro from "@tarojs/taro";
import { useAuthStore } from "../../stores/auth";
import { updateProfile } from "../../services/api";
import "./index.scss";

export default function ProfilePage() {
  const { user, logout, setUser } = useAuthStore();
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");
  const [avatarInput, setAvatarInput] = useState("");
  const [nicknameFocus, setNicknameFocus] = useState(false);

  useEffect(() => {
    if (!user) return;
    setNicknameInput(user.nickname === "微信用户" ? "" : user.nickname || "");
    setAvatarInput(user.avatar || "");
  }, [user]);

  const handleUseWeChatNickname = useCallback(() => {
    setNicknameInput((name) => name === "微信用户" ? "" : name);
    setNicknameFocus(true);
  }, []);

  const handleChooseAvatar = useCallback((e: any) => {
    const avatarUrl = e.detail?.avatarUrl;
    if (avatarUrl) {
      setAvatarInput(avatarUrl);
    }
  }, []);

  const handleSaveProfile = useCallback(async () => {
    const payload: { nickname?: string; avatar?: string } = {};
    const nickname = nicknameInput.trim();

    if (nickname && nickname !== "微信用户" && nickname !== (user?.nickname || "")) {
      payload.nickname = nickname;
    }
    if (avatarInput && avatarInput !== (user?.avatar || "")) {
      payload.avatar = avatarInput;
    }

    if (!payload.nickname && !payload.avatar) {
      setShowProfileEditor(false);
      return;
    }

    try {
      const updated = await updateProfile(payload);
      setUser(updated);
      setShowProfileEditor(false);
      Taro.showToast({ title: "资料已更新", icon: "success" });
    } catch {
      Taro.showToast({ title: "更新失败", icon: "none" });
    }
  }, [nicknameInput, avatarInput, user, setUser]);

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

  const displayNickname = user?.nickname && user.nickname !== "微信用户" ? user.nickname : "";

  return (
    <View className="profile-page">
      <View className="user-section">
        <View className="avatar-placeholder">
          {(avatarInput || user?.avatar) ? (
            <Image className="avatar-img" src={avatarInput || user?.avatar || ""} />
          ) : (
            <Text className="avatar-text">{(displayNickname || "?")[0]}</Text>
          )}
        </View>
        <Text className="nickname" onClick={() => setShowProfileEditor(true)}>
          {displayNickname || "点击设置昵称"}
        </Text>
        <Text className="profile-edit-hint" onClick={() => setShowProfileEditor(true)}>
          点击编辑头像和昵称
        </Text>
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

      {showProfileEditor && (
        <View className="profile-editor-overlay" onClick={() => setShowProfileEditor(false)}>
          <View className="profile-editor-modal" onClick={(e) => e.stopPropagation()}>
            <Text className="profile-editor-title">完善个人资料</Text>
            <Text className="profile-editor-desc">建议使用微信头像和昵称，方便成员识别</Text>

            <View className="profile-editor-avatar-row">
              {(avatarInput || user?.avatar) ? (
                <Image className="profile-editor-avatar" src={avatarInput || user?.avatar || ""} />
              ) : (
                <View className="profile-editor-avatar profile-editor-avatar-empty">
                  <Text className="profile-editor-avatar-text">?</Text>
                </View>
              )}
              <View className="profile-editor-avatar-actions">
                {process.env.TARO_ENV === "weapp" ? (
                  <Button
                    className="profile-editor-btn profile-editor-btn-secondary"
                    openType="chooseAvatar"
                    onChooseAvatar={handleChooseAvatar}
                  >
                    选择微信头像
                  </Button>
                ) : null}
                {process.env.TARO_ENV === "weapp" ? (
                  <Button
                    className="profile-editor-btn profile-editor-btn-secondary"
                    onClick={handleUseWeChatNickname}
                  >
                    使用微信昵称
                  </Button>
                ) : (
                  <Button
                    className="profile-editor-btn profile-editor-btn-secondary"
                    onClick={() => Taro.showToast({ title: "请在微信小程序中使用", icon: "none" })}
                  >
                    使用微信昵称
                  </Button>
                )}
              </View>
            </View>

            <Input
              className="profile-editor-input"
              type="nickname"
              placeholder="点击选择微信昵称或手动输入"
              value={nicknameInput}
              focus={nicknameFocus}
              onInput={(e: any) => setNicknameInput(e.detail.value)}
              onBlur={() => setNicknameFocus(false)}
            />

            <View className="profile-editor-footer">
              <Button className="profile-editor-btn profile-editor-btn-ghost" onClick={() => setShowProfileEditor(false)}>
                取消
              </Button>
              <Button className="profile-editor-btn profile-editor-btn-primary" onClick={handleSaveProfile}>
                保存
              </Button>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
