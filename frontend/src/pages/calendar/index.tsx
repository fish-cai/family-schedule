import { useEffect, useCallback, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import CalendarGrid from "../../components/calendar-grid";
import { useCalendarStore } from "../../stores/calendar";
import { useEventStore } from "../../stores/event";
import { useGroupStore } from "../../stores/group";
import AiInput from "../../components/ai-input";
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

export default function CalendarPage() {
  const { currentMonth, selectedDate, setMonth, goToToday } = useCalendarStore();
  const { events, loading, fetchEvents } = useEventStore();
  const { groups, fetchGroups, getGroupColor } = useGroupStore();

  const [showFabMenu, setShowFabMenu] = useState(false);
  const [showAiInput, setShowAiInput] = useState(false);

  const loadMonthEvents = useCallback(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const start = new Date(year, month, 1).toISOString();
    const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
    fetchEvents(start, end);
  }, [currentMonth, fetchEvents]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  useEffect(() => {
    loadMonthEvents();
  }, [loadMonthEvents]);

  // Reload when returning from create/edit
  useDidShow(() => {
    loadMonthEvents();
  });

  // Filter events for selected date
  const dayEvents = events.filter((e) => {
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

  const handleEventClick = (eventId: string) => {
    Taro.navigateTo({ url: `/pages/event/detail?id=${eventId}` });
  };

  const handleCreate = () => {
    const dateStr = selectedDate.toISOString().slice(0, 10);
    Taro.navigateTo({ url: `/pages/event/create?date=${dateStr}` });
  };

  return (
    <View className="calendar-page">
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
      <CalendarGrid events={events} getGroupColor={getGroupColor} />

      {/* Divider */}
      <View className="divider" />

      {/* Day events */}
      <View className="events-section">
        <Text className="date-label">{formatDate(selectedDate)}</Text>

        {loading && <Text className="hint">加载中...</Text>}

        {!loading && dayEvents.length === 0 && (
          <Text className="hint">暂无日程</Text>
        )}

        {dayEvents.map((event) => {
          const isBusy = event.title === "有安排";
          const groupName = getGroupName(event.group_id);
          const color = getGroupColor(event.group_id);

          return (
            <View
              key={event.id}
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
              {groupName && (
                <View className="group-tag" style={{ color, backgroundColor: color + "20" }}>
                  <Text>{groupName}</Text>
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
              <Text className="fab-menu-icon">🤖</Text>
              <Text className="fab-menu-label">AI 创建</Text>
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
    </View>
  );
}
