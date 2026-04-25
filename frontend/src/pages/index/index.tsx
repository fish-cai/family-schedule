import { useEffect } from "react";
import { View, Text } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useAuthStore } from "../../stores/auth";
import { joinGroupByCode } from "../../services/api";
import "./index.scss";

export default function Index() {
  const { token, loading, login } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const handleReady = async () => {
      let currentToken = token;
      if (!currentToken) {
        await login();
        currentToken = useAuthStore.getState().token;
      }
      if (!currentToken) return;

      // Check for share landing params
      const joinGroupId = router.params.join_group_id;
      const inviteCode = router.params.invite_code;

      if (joinGroupId && inviteCode) {
        try {
          await joinGroupByCode(inviteCode);
          Taro.showToast({ title: "加入成功", icon: "success" });
          setTimeout(() => {
            Taro.navigateTo({ url: `/pages/group/detail?id=${joinGroupId}` });
          }, 500);
          return;
        } catch (e: any) {
          Taro.showToast({ title: e.message || "加入失败", icon: "none" });
        }
      }

      Taro.switchTab({ url: "/pages/calendar/index" });
    };

    handleReady();
  }, [token, loading]);

  return (
    <View className="loading-page">
      <Text className="loading-logo">📅</Text>
      <Text className="loading-title">共享日程</Text>
      <Text className="loading-subtitle">为共享而生的智能日程</Text>
    </View>
  );
}
