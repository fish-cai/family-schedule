import { useState } from "react";
import { View, Text, Input } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { parseEvent } from "../../services/api";
import "./index.scss";

interface AiInputProps {
  visible: boolean;
  selectedDate: string;
  onClose: () => void;
}

export default function AiInput({ visible, selectedDate, onClose }: AiInputProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  if (!visible) return null;

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      Taro.showToast({ title: "请输入日程描述", icon: "none" });
      return;
    }

    setLoading(true);
    try {
      const result = await parseEvent(trimmed);
      const encoded = encodeURIComponent(JSON.stringify(result));
      onClose();
      setText("");
      Taro.navigateTo({
        url: `/pages/event/create?date=${selectedDate}&ai_result=${encoded}`,
      });
    } catch (e: any) {
      Taro.showToast({ title: e.message || "解析失败，请重试", icon: "none" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="ai-overlay" onClick={onClose}>
      <View className="ai-panel" onClick={(e) => e.stopPropagation()}>
        <View className="ai-header">
          <Text className="ai-title">快速创建</Text>
          <Text className="ai-close" onClick={onClose}>×</Text>
        </View>
        {loading ? (
          <View className="ai-loading">
            <View className="ai-loading-dots">
              <View className="ai-loading-dot" />
              <View className="ai-loading-dot" />
              <View className="ai-loading-dot" />
            </View>
            <Text className="ai-loading-text">正在解析日程...</Text>
          </View>
        ) : (
          <>
            <View className="ai-body">
              <Input
                className="ai-input"
                placeholder='描述你的日程，如"明天下午3点开会"'
                value={text}
                onInput={(e) => setText(e.detail.value)}
                maxlength={500}
                confirmType="send"
                onConfirm={handleSend}
              />
              <View
                className={`ai-send ${!text.trim() ? "disabled" : ""}`}
                onClick={text.trim() ? handleSend : undefined}
              >
                <Text className="ai-send-text">发送</Text>
              </View>
            </View>
            <Text className="ai-hint">
              支持自然语言，如"每周三下午3点接小明放学"、"下周五全天团建"
            </Text>
          </>
        )}
      </View>
    </View>
  );
}
