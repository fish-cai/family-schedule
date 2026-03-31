import { useEffect } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useAuthStore } from "../../stores/auth";

export default function Index() {
  const { token, loading } = useAuthStore();

  useEffect(() => {
    if (!loading && token) {
      Taro.redirectTo({ url: "/pages/calendar/index" });
    }
  }, [token, loading]);

  return (
    <View style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
      <Text>加载中...</Text>
    </View>
  );
}
