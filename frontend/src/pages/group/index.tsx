import { useState } from "react";
import { View, Text, Input } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useGroupStore } from "../../stores/group";
import "./index.scss";

const ROLE_LABELS: Record<string, string> = {
  creator: "创建者",
  admin: "管理员",
  member: "成员",
};

export default function GroupListPage() {
  const { groups, loading, fetchGroups, joinGroupByCode } = useGroupStore();
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);

  useDidShow(() => {
    fetchGroups();
  });

  const handleJoin = async () => {
    if (!inviteCode.trim()) {
      Taro.showToast({ title: "请输入邀请码", icon: "none" });
      return;
    }
    setJoining(true);
    try {
      const groupId = await joinGroupByCode(inviteCode.trim());
      Taro.showToast({ title: "加入成功", icon: "success" });
      setShowJoinModal(false);
      setInviteCode("");
      setTimeout(() => {
        Taro.navigateTo({ url: `/pages/group/detail?id=${groupId}` });
      }, 500);
    } catch (e: any) {
      Taro.showToast({ title: e.message || "加入失败", icon: "none" });
    } finally {
      setJoining(false);
    }
  };

  return (
    <View className="group-list-page">
      <View className="action-bar">
        <View className="action-btn primary" onClick={() => Taro.navigateTo({ url: "/pages/group/create" })}>
          <Text className="action-text">+ 创建日历组</Text>
        </View>
        <View className="action-btn secondary" onClick={() => setShowJoinModal(true)}>
          <Text className="action-text-secondary">加入日历组</Text>
        </View>
      </View>

      {loading && <Text className="hint">加载中...</Text>}
      {!loading && groups.length === 0 && <Text className="hint">暂无日历组</Text>}

      {groups.map((group) => (
        <View key={group.id} className="group-card" onClick={() => Taro.navigateTo({ url: `/pages/group/detail?id=${group.id}` })}>
          <View className="group-color-dot" style={{ backgroundColor: group.color }} />
          <View className="group-info">
            <Text className="group-name">{group.name}</Text>
            <Text className="group-role">{ROLE_LABELS[group.my_role] || group.my_role}</Text>
          </View>
          <Text className="group-count">{group.member_count}人</Text>
        </View>
      ))}

      {showJoinModal && (
        <View className="modal-overlay" onClick={() => setShowJoinModal(false)}>
          <View className="modal-content" onClick={(e) => e.stopPropagation()}>
            <Text className="modal-title">加入日历组</Text>
            <Input className="modal-input" placeholder="输入邀请码" value={inviteCode} onInput={(e) => setInviteCode(e.detail.value)} maxlength={10} />
            <View className="modal-actions">
              <Text className="modal-cancel" onClick={() => setShowJoinModal(false)}>取消</Text>
              <Text className={`modal-confirm ${joining ? "disabled" : ""}`} onClick={!joining ? handleJoin : undefined}>
                {joining ? "加入中..." : "加入"}
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
