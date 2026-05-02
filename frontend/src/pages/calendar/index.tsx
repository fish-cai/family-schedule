import { useEffect, useCallback, useState } from "react";
import { View, Text, ScrollView, Input, Image, Button } from "@tarojs/components";
import Taro, { useDidShow, useShareAppMessage, useShareTimeline } from "@tarojs/taro";
import CalendarGrid from "../../components/calendar-grid";
import { useAuthStore } from "../../stores/auth";
import { useCalendarStore } from "../../stores/calendar";
import { useEventStore } from "../../stores/event";
import { useGroupStore } from "../../stores/group";
import { updateProfile } from "../../services/api";
import AiInput from "../../components/ai-input";
import shareCover from "../../assets/share-cover.png";
import { track, TRACK } from "../../services/analytics";
import "./index.scss";

const MONTH_NAMES = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

function formatDate(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  return `${month}月${day}日 · ${weekdays[date.getDay()]}`;
}

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function getVisibleGroupIds(event: { group_id: string | null; visible_group_ids: string[] }): string[] {
  if (event.visible_group_ids && event.visible_group_ids.length > 0) {
    return event.visible_group_ids;
  }
  return event.group_id ? [event.group_id] : [];
}

export default function CalendarPage() {
  const { currentMonth, selectedDate, setMonth, goToToday } = useCalendarStore();
  const { events, loading, loadError, fetchEvents, filterGroupId, setFilterGroupId } = useEventStore();
  const { groups, fetchGroups, getGroupColor } = useGroupStore();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [showFabMenu, setShowFabMenu] = useState(false);
  const [showAiInput, setShowAiInput] = useState(false);
  const [showNicknamePrompt, setShowNicknamePrompt] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");
  const [avatarInput, setAvatarInput] = useState("");
  const [nicknameFocus, setNicknameFocus] = useState(false);
  const [dismissProfilePrompt, setDismissProfilePrompt] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Prompt for profile completion on first login
  useEffect(() => {
    if (
      user &&
      (!user.nickname || user.nickname === "微信用户" || !user.avatar) &&
      !dismissProfilePrompt
    ) {
      setNicknameInput(user.nickname === "微信用户" ? "" : user.nickname || "");
      setAvatarInput(user.avatar || "");
      setShowNicknamePrompt(true);
    }
  }, [user, dismissProfilePrompt]);

  // Onboarding: drive new users to create their first group (the core action).
  // Skipped if profile prompt is showing, user already has a group, or already dismissed before.
  useEffect(() => {
    if (showNicknamePrompt) return;
    if (!user) return;
    if (groups.length > 0) return;
    if (Taro.getStorageSync("onboarding_completed")) return;
    setShowOnboarding(true);
  }, [user, groups.length, showNicknamePrompt]);

  const completeOnboarding = (navigateToCreate: boolean) => {
    Taro.setStorageSync("onboarding_completed", "1");
    setShowOnboarding(false);
    track(TRACK.ONBOARDING_NEXT, { action: navigateToCreate ? "create_group" : "skip" });
    if (navigateToCreate) {
      Taro.navigateTo({ url: "/pages/group/create" });
    }
  };

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

  const handleNicknameSave = async () => {
    const payload: { nickname?: string; avatar?: string } = {};
    const name = nicknameInput.trim();

    if (name && name !== "微信用户" && name !== (user?.nickname || "")) {
      payload.nickname = name;
    }
    if (avatarInput && avatarInput !== (user?.avatar || "")) {
      payload.avatar = avatarInput;
    }

    if (!payload.nickname && !payload.avatar) {
      setShowNicknamePrompt(false);
      setDismissProfilePrompt(true);
      return;
    }

    try {
      const updated = await updateProfile(payload);
      setUser(updated);
      setShowNicknamePrompt(false);
      setDismissProfilePrompt(true);
      Taro.showToast({ title: "设置成功", icon: "success" });
    } catch {
      Taro.showToast({ title: "设置失败", icon: "none" });
    }
  };

  const loadMonthEvents = useCallback(() => {
    if (!token) return;
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    // Load all dates visible on the calendar grid (including prev/next month fill)
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay(); // 0=Sun
    const gridStart = new Date(year, month, 1 - startOffset);
    const gridEnd = new Date(gridStart);
    gridEnd.setDate(gridEnd.getDate() + 42); // 6 rows * 7 days
    gridEnd.setSeconds(gridEnd.getSeconds() - 1);
    const start = gridStart.toISOString();
    const end = gridEnd.toISOString();
    // "personal" filter is handled client-side; pass group_id for specific group
    const apiGroupId = filterGroupId && filterGroupId !== "personal" ? filterGroupId : undefined;
    fetchEvents(start, end, apiGroupId);
  }, [currentMonth, fetchEvents, token, filterGroupId]);

  useEffect(() => {
    if (!token) return;
    fetchGroups();
  }, [fetchGroups, token]);

  useEffect(() => {
    loadMonthEvents();
  }, [loadMonthEvents]);

  useDidShow(() => {
    loadMonthEvents();
  });

  useShareAppMessage(() => {
    track(TRACK.SHARE_CLICK, { type: "app_message", source: "calendar" });
    return {
      title: "共享日程 · 全家共用一本日历",
      path: "/pages/index/index",
      imageUrl: shareCover,
    };
  });

  useShareTimeline(() => {
    track(TRACK.SHARE_CLICK, { type: "timeline", source: "calendar" });
    return { title: "共享日程 · 全家共用一本日历" };
  });

  // Filter events for display
  const displayEvents = filterGroupId === "personal"
    ? events.filter((e) => e.creator_id === user?.id)
    : events;

  // Filter events for selected date
  const dayEvents = displayEvents.filter((e) => {
    const start = new Date(e.start_time);
    return (
      start.getFullYear() === selectedDate.getFullYear() &&
      start.getMonth() === selectedDate.getMonth() &&
      start.getDate() === selectedDate.getDate()
    );
  });

  const prevMonth = () => {
    const m = currentMonth.getMonth();
    const y = currentMonth.getFullYear();
    setMonth(new Date(y, m - 1, 1));
  };

  const nextMonth = () => {
    const m = currentMonth.getMonth();
    const y = currentMonth.getFullYear();
    setMonth(new Date(y, m + 1, 1));
  };

  const getGroupName = (groupId: string | null): string | null => {
    if (!groupId) return null;
    const group = groups.find((g) => g.id === groupId);
    return group?.name || null;
  };

  const getEventGroupSummary = (event: { group_id: string | null; visible_group_ids: string[] }): {
    label: string;
    color: string;
  } | null => {
    const groupIds = getVisibleGroupIds(event);
    if (groupIds.length === 0) return null;

    const primaryGroupId = groupIds[0];
    const primaryName = getGroupName(primaryGroupId) || "日历组";
    return {
      label: groupIds.length > 1 ? `${primaryName} +${groupIds.length - 1}` : primaryName,
      color: getGroupColor(primaryGroupId),
    };
  };

  const handleEventClick = (eventId: string) => {
    Taro.navigateTo({ url: `/pages/event/detail?id=${eventId}` });
  };

  const handleCreate = () => {
    const dateStr = selectedDate.toISOString().slice(0, 10);
    Taro.navigateTo({ url: `/pages/event/create?date=${dateStr}` });
  };

  // Build filter tabs
  const filterTabs: { id: string | null; label: string; color?: string }[] = [
    { id: null, label: "全部" },
    { id: "personal", label: "个人" },
    ...groups.map((g) => ({ id: g.id, label: g.name, color: g.color })),
  ];

  return (
    <View className="calendar-page">
      {/* Filter Tabs */}
      <ScrollView scrollX className="filter-bar" enableFlex>
        {filterTabs.map((tab) => {
          const isActive = filterGroupId === tab.id;
          return (
            <View
              key={tab.id || "__all__"}
              className={`filter-tab ${isActive ? "active" : ""}`}
              style={isActive && tab.color ? { background: tab.color + "18", borderColor: tab.color } : {}}
              onClick={() => setFilterGroupId(tab.id)}
            >
              {tab.color && (
                <View className="filter-dot" style={{ backgroundColor: tab.color }} />
              )}
              <Text
                className="filter-text"
                style={isActive && tab.color ? { color: tab.color } : {}}
              >
                {tab.label}
              </Text>
            </View>
          );
        })}
      </ScrollView>

      {/* Header */}
      <View className="header">
        <View className="header-left">
          <Text className="month-label" onClick={prevMonth}>◀</Text>
          <Text className="month-title">
            {currentMonth.getFullYear()}年{MONTH_NAMES[currentMonth.getMonth()]}
          </Text>
          <Text className="month-label" onClick={nextMonth}>▶</Text>
        </View>
        <Text className="today-btn" onClick={goToToday}>
          今天
        </Text>
      </View>

      {/* Calendar Grid */}
      <CalendarGrid events={displayEvents} getGroupColor={getGroupColor} />

      {/* Divider */}
      <View className="divider" />

      {/* Day events */}
      <View className="events-section">
        <Text className="date-label">{formatDate(selectedDate)}</Text>

        {loading && <Text className="hint">加载中...</Text>}

        {!loading && loadError && (
          <View className="load-error">
            <Text className="load-error-text">{loadError}</Text>
            <Text className="load-error-retry" onClick={loadMonthEvents}>
              点击重试
            </Text>
          </View>
        )}

        {!loading && !loadError && dayEvents.length === 0 && (
          <Text className="hint">暂无日程</Text>
        )}

        {dayEvents.map((event, idx) => {
          const isBusy = event.title === "有安排";
          const groupSummary = getEventGroupSummary(event);
          const color = groupSummary?.color || getGroupColor(null);

          return (
            <View
              key={`${event.id}-${idx}`}
              className={`event-card ${isBusy ? "busy" : ""}`}
              style={{ borderLeftColor: color }}
              onClick={() => handleEventClick(event.id)}
            >
              <View className="event-main">
                <Text className="event-title">{event.title}</Text>
                <View className="event-meta">
                  <Text className="event-time">
                    {event.is_all_day
                      ? "全天"
                      : `${formatTime(event.start_time)}${event.end_time ? " - " + formatTime(event.end_time) : ""}`}
                  </Text>
                  {event.location ? (
                    <Text className="event-location"> · {event.location}</Text>
                  ) : null}
                </View>
              </View>
              {groupSummary && (
                <View className="group-tag" style={{ color, backgroundColor: color + "20" }}>
                  <Text>{groupSummary.label}</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* FAB Menu */}
      {showFabMenu && (
        <View className="fab-overlay" onClick={() => setShowFabMenu(false)}>
          <View className="fab-menu">
            <View className="fab-menu-item" onClick={(e) => { e.stopPropagation(); setShowFabMenu(false); handleCreate(); }}>
              <Text className="fab-menu-icon">✏️</Text>
              <Text className="fab-menu-label">手动创建</Text>
            </View>
            <View className="fab-menu-item" onClick={(e) => { e.stopPropagation(); setShowFabMenu(false); setShowAiInput(true); }}>
              <Text className="fab-menu-icon">✨</Text>
              <Text className="fab-menu-label">快速创建</Text>
            </View>
          </View>
        </View>
      )}

      {/* FAB Button */}
      <View className="fab" onClick={() => setShowFabMenu(!showFabMenu)}>
        <Text className="fab-icon">{showFabMenu ? "×" : "+"}</Text>
      </View>

      {/* AI Input */}
      <AiInput
        visible={showAiInput}
        selectedDate={selectedDate.toISOString().slice(0, 10)}
        onClose={() => setShowAiInput(false)}
      />

      {/* Onboarding for new users without any group */}
      {showOnboarding && (
        <View className="onboarding-overlay">
          <View className="onboarding-modal">
            <Text className="onboarding-emoji">🎉</Text>
            <Text className="onboarding-title">欢迎使用共享日程</Text>
            <Text className="onboarding-desc">
              想让全家用上共享日历，第一步是创建一个日历组
            </Text>

            <View className="onboarding-steps">
              <View className="onboarding-step">
                <Text className="onboarding-step-num">1</Text>
                <View className="onboarding-step-text">
                  <Text className="onboarding-step-title">创建日历组</Text>
                  <Text className="onboarding-step-sub">家庭、朋友、团队都可以建组</Text>
                </View>
              </View>
              <View className="onboarding-step">
                <Text className="onboarding-step-num">2</Text>
                <View className="onboarding-step-text">
                  <Text className="onboarding-step-title">邀请家人加入</Text>
                  <Text className="onboarding-step-sub">分享卡片或邀请码</Text>
                </View>
              </View>
              <View className="onboarding-step">
                <Text className="onboarding-step-num">3</Text>
                <View className="onboarding-step-text">
                  <Text className="onboarding-step-title">添加共享日程</Text>
                  <Text className="onboarding-step-sub">所有成员都能看到和提醒</Text>
                </View>
              </View>
            </View>

            <View className="onboarding-footer">
              <Button
                className="nickname-modal-btn nickname-modal-btn-ghost"
                onClick={() => completeOnboarding(false)}
              >
                稍后再说
              </Button>
              <Button
                className="nickname-modal-btn nickname-modal-btn-primary"
                onClick={() => completeOnboarding(true)}
              >
                创建日历组
              </Button>
            </View>
          </View>
        </View>
      )}

      {/* Nickname Prompt */}
      {showNicknamePrompt && (
        <View className="nickname-overlay">
          <View className="nickname-modal">
            <Text className="nickname-modal-title">完善个人资料</Text>
            <Text className="nickname-modal-desc">首次进入建议设置微信头像和昵称</Text>

            <View className="nickname-avatar-row">
              {avatarInput || user?.avatar ? (
                <Image className="nickname-avatar" src={avatarInput || user?.avatar || ""} />
              ) : (
                <View className="nickname-avatar nickname-avatar-empty">
                  <Text className="nickname-avatar-text">?</Text>
                </View>
              )}
              <View className="nickname-avatar-actions">
                {process.env.TARO_ENV === "weapp" ? (
                  <Button
                    className="nickname-action-btn"
                    openType="chooseAvatar"
                    onChooseAvatar={handleChooseAvatar}
                  >
                    选择微信头像
                  </Button>
                ) : null}
                {process.env.TARO_ENV === "weapp" ? (
                  <Button
                    className="nickname-action-btn"
                    onClick={handleUseWeChatNickname}
                  >
                    使用微信昵称
                  </Button>
                ) : (
                  <Button
                    className="nickname-action-btn"
                    onClick={() => Taro.showToast({ title: "请在微信小程序中使用", icon: "none" })}
                  >
                    使用微信昵称
                  </Button>
                )}
              </View>
            </View>

            <Input
              className="nickname-modal-input"
              type="nickname"
              placeholder="点击选择微信昵称或手动输入"
              value={nicknameInput}
              focus={nicknameFocus}
              onInput={(e: any) => setNicknameInput(e.detail.value)}
              onBlur={() => setNicknameFocus(false)}
              onConfirm={handleNicknameSave}
            />
            <View className="nickname-modal-footer">
              <Button
                className="nickname-modal-btn nickname-modal-btn-ghost"
                onClick={() => {
                  setShowNicknamePrompt(false);
                  setDismissProfilePrompt(true);
                }}
              >
                稍后设置
              </Button>
              <Button className="nickname-modal-btn nickname-modal-btn-primary" onClick={handleNicknameSave}>
                保存并继续
              </Button>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
