import { View, Text } from "@tarojs/components";
import { Solar } from "lunar-javascript";
import { useCalendarStore } from "../../stores/calendar";
import type { EventResponse } from "../../types";
import "./index.scss";

interface CalendarGridProps {
  events: EventResponse[];
  getGroupColor: (groupId: string | null) => string;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getMonthDays(year: number, month: number): Date[] {
  const days: Date[] = [];
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay(); // 0=Sun

  // Fill previous month
  for (let i = startOffset - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }

  // Current month
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(year, month, d));
  }

  // Fill next month to complete grid (6 rows)
  while (days.length < 42) {
    const last = days[days.length - 1];
    days.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1));
  }

  return days;
}

function getEventDotsForDate(
  date: Date,
  events: EventResponse[],
  getGroupColor: (groupId: string | null) => string
): string[] {
  const dayEvents = events.filter((e) => {
    const start = new Date(e.start_time);
    return isSameDay(start, date);
  });

  const seen = new Set<string>();
  const colors: string[] = [];
  for (const e of dayEvents) {
    const groupIds = e.visible_group_ids && e.visible_group_ids.length > 0
      ? e.visible_group_ids
      : e.group_id
        ? [e.group_id]
        : ["__personal__"];
    for (const groupId of groupIds) {
      const key = groupId || "__personal__";
      if (!seen.has(key) && colors.length < 3) {
        seen.add(key);
        colors.push(getGroupColor(groupId === "__personal__" ? null : groupId));
      }
    }
  }
  return colors;
}

function getLunarText(date: Date): { text: string; highlight: boolean } {
  const solar = Solar.fromDate(date);
  const lunar = solar.getLunar();

  // Check for jieqi (solar term)
  const jieQi = lunar.getCurrentJieQi();
  if (jieQi) {
    return { text: jieQi.getName(), highlight: true };
  }

  // Check for traditional festivals
  const festivals = lunar.getFestivals();
  if (festivals.length > 0) {
    return { text: festivals[0], highlight: true };
  }

  // First day of lunar month: show month name
  if (lunar.getDay() === 1) {
    return { text: lunar.getMonthInChinese() + "月", highlight: false };
  }

  // Regular day
  return { text: lunar.getDayInChinese(), highlight: false };
}

export default function CalendarGrid({ events, getGroupColor }: CalendarGridProps) {
  const { currentMonth, selectedDate, isExpanded, selectDate, toggleExpand } =
    useCalendarStore();

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const allDays = getMonthDays(year, month);
  const today = new Date();

  // Collapsed: show 2 rows containing selectedDate
  const selectedIndex = allDays.findIndex((d) => isSameDay(d, selectedDate));
  const selectedRow = Math.floor((selectedIndex >= 0 ? selectedIndex : 14) / 7);
  const startRow = selectedRow;
  const visibleDays = isExpanded
    ? allDays
    : allDays.slice(startRow * 7, (startRow + 2) * 7);

  return (
    <View className="calendar-grid">
      {/* Weekday headers */}
      <View className="weekday-row">
        {WEEKDAYS.map((w) => (
          <View key={w} className="weekday-cell">
            <Text className="weekday-text">{w}</Text>
          </View>
        ))}
      </View>

      {/* Day grid */}
      <View className="day-grid">
        {visibleDays.map((date, i) => {
          const isCurrentMonth = date.getMonth() === month;
          const isToday = isSameDay(date, today);
          const isSelected = isSameDay(date, selectedDate);
          const dots = getEventDotsForDate(date, events, getGroupColor);
          const lunar = getLunarText(date);

          return (
            <View
              key={i}
              className={`day-cell ${!isCurrentMonth ? "other-month" : ""} ${isSelected ? "selected" : ""}`}
              onClick={() => selectDate(new Date(date))}
            >
              <View className={`day-number ${isToday ? "today" : ""}`}>
                <Text>{date.getDate()}</Text>
              </View>
              <Text className={`lunar-text ${lunar.highlight ? "lunar-highlight" : ""}`}>
                {lunar.text}
              </Text>
              {dots.length > 0 && (
                <View className="dot-row">
                  {dots.map((color, di) => (
                    <View
                      key={di}
                      className="dot"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* Expand/collapse toggle */}
      <View className="toggle-bar" onClick={toggleExpand}>
        <View className={`toggle-arrow ${isExpanded ? "up" : "down"}`} />
      </View>
    </View>
  );
}
