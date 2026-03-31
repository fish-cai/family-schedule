import { useEffect, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { getEventDetail } from "../../services/api";
import { useEventStore } from "../../stores/event";
import { useGroupStore } from "../../stores/group";
import type { EventResponse } from "../../types";
import "./detail.scss";

const VISIBILITY_LABELS: Record<string, string> = {
  public: "公开",
  busy: "仅显示忙碌",
  private: "私密",
};

function formatDateTime(iso: string, isAllDay: boolean): string {
  const d = new Date(iso);
  const date = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  if (isAllDay) return date;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${date} ${time}`;
}

export default function EventDetailPage() {
  const router = useRouter();
  const eventId = router.params.id;

  const [event, setEvent] = useState<EventResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const { deleteEvent } = useEventStore();
  const { groups } = useGroupStore();

  useEffect(() => {
    if (!eventId) return;
    setLoading(true);
    getEventDetail(eventId)
      .then(setEvent)
      .catch((e) => {
        Taro.showToast({ title: e.message || "加载失败", icon: "none" });
      })
      .finally(() => setLoading(false));
  }, [eventId]);

  if (loading || !event) {
    return (
      <View className="detail-page">
        <Text className="loading-text">加载中...</Text>
      </View>
    );
  }

  const groupName = event.group_id
    ? groups.find((g) => g.id === event.group_id)?.name || "日历组"
    : "个人";
  const groupColor = event.group_id
    ? groups.find((g) => g.id === event.group_id)?.color || "#4A90D9"
    : "#999";

  const handleEdit = () => {
    Taro.navigateTo({ url: `/pages/event/create?id=${event.id}` });
  };

  const handleDelete = () => {
    Taro.showModal({
      title: "确认删除",
      content: "确定要删除这条日程吗？",
      confirmColor: "#FF4D4F",
      success: async (res) => {
        if (res.confirm) {
          try {
            await deleteEvent(event.id);
            Taro.showToast({ title: "已删除", icon: "success" });
            setTimeout(() => Taro.navigateBack(), 500);
          } catch (e: any) {
            Taro.showToast({ title: e.message || "删除失败", icon: "none" });
          }
        }
      },
    });
  };

  return (
    <View className="detail-page">
      {/* Header with edit button */}
      <View className="detail-header">
        <Text className="detail-title">{event.title}</Text>
        <Text className="edit-btn" onClick={handleEdit}>编辑</Text>
      </View>

      <View className="detail-divider" />

      {/* Info rows */}
      <View className="info-section">
        <View className="info-row">
          <Text className="info-icon">📅</Text>
          <Text className="info-text">
            {formatDateTime(event.start_time, event.is_all_day)}
          </Text>
        </View>

        {event.end_time && (
          <View className="info-row">
            <Text className="info-icon">🕐</Text>
            <Text className="info-text">
              至 {formatDateTime(event.end_time, event.is_all_day)}
            </Text>
          </View>
        )}

        {event.location ? (
          <View className="info-row">
            <Text className="info-icon">📍</Text>
            <Text className="info-text">{event.location}</Text>
          </View>
        ) : null}

        <View className="info-row">
          <Text className="info-icon">📋</Text>
          <View className="group-badge" style={{ color: groupColor, backgroundColor: groupColor + "20" }}>
            <Text>{groupName}</Text>
          </View>
        </View>

        {event.group_id && (
          <View className="info-row">
            <Text className="info-icon">👁</Text>
            <Text className="info-text">{VISIBILITY_LABELS[event.visibility] || event.visibility}</Text>
          </View>
        )}

        {event.description ? (
          <View className="info-row">
            <Text className="info-icon">📝</Text>
            <Text className="info-text">{event.description}</Text>
          </View>
        ) : null}
      </View>

      <View className="detail-divider" />

      <View className="info-section">
        <View className="info-row">
          <Text className="info-label">创建者</Text>
          <Text className="info-text">{event.creator_nickname}</Text>
        </View>
      </View>

      {/* Delete button */}
      <View className="delete-section">
        <Text className="delete-btn" onClick={handleDelete}>
          删除日程
        </Text>
      </View>
    </View>
  );
}
