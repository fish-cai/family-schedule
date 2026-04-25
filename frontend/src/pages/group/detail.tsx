import { useEffect, useState } from "react";
import { View, Text, Button } from "@tarojs/components";
import Taro, { useRouter, useShareAppMessage, useDidShow } from "@tarojs/taro";
import { getGroupDetail, getEvents } from "../../services/api";
import { useGroupStore } from "../../stores/group";
import { useAuthStore } from "../../stores/auth";
import type { GroupDetailResponse, EventResponse } from "../../types";
import "./detail.scss";

const ROLE_LABELS: Record<string, string> = {
  creator: "创建者",
  admin: "管理员",
  member: "成员",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDateKey(iso: string): string {
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${month}月${day}日 ${weekdays[d.getDay()]}`;
}

function groupEventsByDate(events: EventResponse[]): { date: string; events: EventResponse[] }[] {
  const map = new Map<string, EventResponse[]>();
  for (const e of events) {
    const key = formatDateKey(e.start_time);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return Array.from(map.entries()).map(([date, evts]) => ({ date, events: evts }));
}

export default function GroupDetailPage() {
  const router = useRouter();
  const groupId = router.params.id;
  const [group, setGroup] = useState<GroupDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [groupEvents, setGroupEvents] = useState<EventResponse[]>([]);
  const [activeTab, setActiveTab] = useState<"events" | "members">("events");
  const { deleteGroup, removeMember } = useGroupStore();
  const { user } = useAuthStore();

  const loadDetail = () => {
    if (!groupId) return;
    setLoading(true);
    getGroupDetail(groupId)
      .then(setGroup)
      .catch((e) => Taro.showToast({ title: e.message || "加载失败", icon: "none" }))
      .finally(() => setLoading(false));
  };

  const loadGroupEvents = () => {
    if (!groupId) return;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const end = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59).toISOString();
    getEvents(start, end, groupId).then(setGroupEvents).catch(() => {});
  };

  useEffect(() => { loadDetail(); loadGroupEvents(); }, [groupId]);
  useDidShow(() => { loadGroupEvents(); });

  useShareAppMessage(() => {
    if (!group) return { title: "共享日程", path: "/pages/index/index" };
    return {
      title: `邀请你加入「${group.name}」`,
      path: `/pages/index/index?join_group_id=${group.id}&invite_code=${group.invite_code}`,
    };
  });

  if (loading || !group) {
    return <View className="group-detail-page"><Text className="loading-text">加载中...</Text></View>;
  }

  const myRole = group.my_role;
  const isCreator = myRole === "creator";
  const isAdmin = myRole === "admin";
  const canEdit = isCreator || isAdmin;

  const handleCopyCode = () => { Taro.setClipboardData({ data: group.invite_code }); };
  const handleEdit = () => { Taro.navigateTo({ url: `/pages/group/create?id=${group.id}` }); };

  const handleRemoveMember = (userId: string, nickname: string) => {
    Taro.showModal({
      title: "移除成员",
      content: `确定移除「${nickname}」吗？`,
      confirmColor: "#FF4D4F",
      success: async (res) => {
        if (res.confirm) {
          try {
            await removeMember(group.id, userId);
            Taro.showToast({ title: "已移除", icon: "success" });
            loadDetail();
          } catch (e: any) {
            Taro.showToast({ title: e.message || "移除失败", icon: "none" });
          }
        }
      },
    });
  };

  const handleLeave = () => {
    if (!user) return;
    Taro.showModal({
      title: "退出日历组",
      content: `确定退出「${group.name}」吗？`,
      confirmColor: "#FF4D4F",
      success: async (res) => {
        if (res.confirm) {
          try {
            await removeMember(group.id, user.id);
            Taro.showToast({ title: "已退出", icon: "success" });
            setTimeout(() => Taro.switchTab({ url: "/pages/group/index" }), 500);
          } catch (e: any) {
            Taro.showToast({ title: e.message || "退出失败", icon: "none" });
          }
        }
      },
    });
  };

  const handleDissolve = () => {
    Taro.showModal({
      title: "解散日历组",
      content: `确定解散「${group.name}」吗？所有日程将被删除。`,
      confirmColor: "#FF4D4F",
      success: async (res) => {
        if (res.confirm) {
          try {
            await deleteGroup(group.id);
            Taro.showToast({ title: "已解散", icon: "success" });
            setTimeout(() => Taro.switchTab({ url: "/pages/group/index" }), 500);
          } catch (e: any) {
            Taro.showToast({ title: e.message || "解散失败", icon: "none" });
          }
        }
      },
    });
  };

  const canRemoveMember = (targetRole: string): boolean => {
    if (isCreator) return targetRole !== "creator";
    if (isAdmin) return targetRole === "member";
    return false;
  };

  const dateGroups = groupEventsByDate(groupEvents);

  const handleEventClick = (eventId: string) => {
    Taro.navigateTo({ url: `/pages/event/detail?id=${eventId}` });
  };

  const handleCreateEvent = () => {
    const dateStr = new Date().toISOString().slice(0, 10);
    Taro.navigateTo({ url: `/pages/event/create?date=${dateStr}` });
  };

  return (
    <View className="group-detail-page">
      {/* Header */}
      <View className="info-header">
        <View className="info-top">
          <View className="group-dot" style={{ backgroundColor: group.color }} />
          <Text className="group-title">{group.name}</Text>
          {canEdit && <Text className="edit-link" onClick={handleEdit}>编辑</Text>}
        </View>
        {group.description ? <Text className="group-desc">{group.description}</Text> : null}
      </View>

      {/* Tab Switcher */}
      <View className="tab-bar">
        <View
          className={`tab-item ${activeTab === "events" ? "active" : ""}`}
          onClick={() => setActiveTab("events")}
        >
          <Text className="tab-text">日程</Text>
          {groupEvents.length > 0 && (
            <View className="tab-badge"><Text className="tab-badge-text">{groupEvents.length}</Text></View>
          )}
        </View>
        <View
          className={`tab-item ${activeTab === "members" ? "active" : ""}`}
          onClick={() => setActiveTab("members")}
        >
          <Text className="tab-text">成员</Text>
          <View className="tab-badge"><Text className="tab-badge-text">{group.member_count}</Text></View>
        </View>
      </View>

      {/* Events Tab */}
      {activeTab === "events" && (
        <View className="events-tab">
          {dateGroups.length === 0 ? (
            <View className="empty-state">
              <Text className="empty-icon">📅</Text>
              <Text className="empty-text">暂无日程</Text>
              <View className="empty-btn" onClick={handleCreateEvent}>
                <Text className="empty-btn-text">创建第一个日程</Text>
              </View>
            </View>
          ) : (
            dateGroups.map((dg) => (
              <View key={dg.date} className="date-group">
                <Text className="date-group-title">{dg.date}</Text>
                {dg.events.map((event, idx) => (
                  <View
                    key={`${event.id}-${idx}`}
                    className="ge-card"
                    onClick={() => handleEventClick(event.id)}
                  >
                    <View className="ge-color-bar" style={{ backgroundColor: group.color }} />
                    <View className="ge-content">
                      <Text className="ge-title">{event.title}</Text>
                      <View className="ge-info">
                        <Text className="ge-time">
                          {event.is_all_day ? "全天" : formatTime(event.start_time) + (event.end_time ? " - " + formatTime(event.end_time) : "")}
                        </Text>
                        {event.location ? <Text className="ge-location"> · {event.location}</Text> : null}
                      </View>
                      {event.creator_nickname ? (
                        <Text className="ge-creator">{event.creator_nickname}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            ))
          )}
        </View>
      )}

      {/* Members Tab */}
      {activeTab === "members" && (
        <View className="members-tab">
          {/* Invite */}
          <View className="section">
            <Text className="section-title">邀请成员</Text>
            <View className="invite-row">
              <Text className="invite-label">邀请码</Text>
              <Text className="invite-code">{group.invite_code}</Text>
              <Text className="copy-btn" onClick={handleCopyCode}>复制</Text>
            </View>
            <Button className="share-btn" openType="share">分享给微信好友</Button>
          </View>

          {/* Member List */}
          <View className="section">
            <Text className="section-title">成员列表 ({group.member_count}/{group.max_members})</Text>
            {group.members.map((m) => (
              <View key={m.user_id} className="member-row">
                <View className="member-avatar-wrap">
                  <Text className="member-avatar-text">{(m.nickname || "?")[0]}</Text>
                </View>
                <View className="member-info">
                  <Text className="member-name">{m.nickname || "微信用户"}</Text>
                  <Text className="member-role">{ROLE_LABELS[m.role] || m.role}</Text>
                </View>
                {canRemoveMember(m.role) && (
                  <Text className="remove-btn" onClick={() => handleRemoveMember(m.user_id, m.nickname)}>移除</Text>
                )}
              </View>
            ))}
          </View>
        </View>
      )}

      <View className="bottom-actions">
        {!isCreator && <Text className="danger-btn" onClick={handleLeave}>退出日历组</Text>}
        {isCreator && <Text className="danger-btn" onClick={handleDissolve}>解散日历组</Text>}
      </View>
    </View>
  );
}
