import { useEffect, useState } from "react";
import { View, Text } from "@tarojs/components";
import { healthCheck } from "../../services/api";
import type { HealthResponse } from "../../types";
import "./index.scss";

export default function Index() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    healthCheck()
      .then(setHealth)
      .catch((err) => setError(err.message || "连接失败"));
  }, []);

  return (
    <View className="index">
      <Text>共享日程</Text>
      {health && <Text>后端状态: {health.status}</Text>}
      {error && <Text>连接错误: {error}</Text>}
    </View>
  );
}
