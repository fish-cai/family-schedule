import { View, Text, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useAuthStore } from "../../stores/auth";
import "./index.scss";

export default function ProfilePage() {
  const { user, logout } = useAuthStore();

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
        <Text className="nickname">{user?.nickname || "微信用户"}</Text>
      </View>

      <View className="menu-section">
        <View className="menu-item">
          <Text className="menu-label">关于共享日程</Text>
          <Text className="menu-arrow">›</Text>
        </View>
      </View>

      <View className="logout-section">
        <Text className="logout-btn" onClick={handleLogout}>退出登录</Text>
      </View>
    </View>
  );
}
