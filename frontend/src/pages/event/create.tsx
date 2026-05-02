import { useEffect, useState } from "react";
import { View, Text, Input, Switch, Picker, Textarea } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEventStore } from "../../stores/event";
import { useGroupStore } from "../../stores/group";
import { getEventDetail } from "../../services/api";
import { REMIND_TEMPLATE_ID } from "../../config/wechat";
import { track, TRACK } from "../../services/analytics";
import type { EventCreate, EventUpdate } from "../../types";
import "./create.scss";

async function requestReminderSubscription(): Promise<void> {
  if (!REMIND_TEMPLATE_ID || process.env.TARO_ENV !== "weapp") return;
  try {
    const res: any = await Taro.requestSubscribeMessage({ tmplIds: [REMIND_TEMPLATE_ID] });
    const status = res?.[REMIND_TEMPLATE_ID];
    track(TRACK.REMINDER_SUBSCRIBE, { status });
  } catch {
    track(TRACK.REMINDER_SUBSCRIBE, { status: "rejected" });
  }
}

const PRESET_COLORS = ["#4A90D9", "#FF6B6B", "#52C41A", "#FAAD14", "#722ED1", "#EB2F96"];
const REMINDER_OPTIONS = [
  { value: 0, label: "不提醒" },
  { value: 5, label: "5 分钟前" },
  { value: 15, label: "15 分钟前" },
  { value: 30, label: "30 分钟前" },
  { value: 60, label: "1 小时前" },
];
const VISIBILITY_OPTIONS = [
  { value: "public", label: "公开" },
  { value: "busy", label: "仅显示忙碌" },
  { value: "private", label: "私密" },
];

function padZero(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
}

function toTimeStr(d: Date): string {
  return `${padZero(d.getHours())}:${padZero(d.getMinutes())}`;
}

function parseDateTime(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}:00`);
}

function getNextHourDate(base = new Date()): Date {
  const next = new Date(base);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return next;
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toDateStr(date);
}

function getAutoEnd(dateStr: string, timeStr: string, allDay: boolean): {
  endDate: string;
  endTime: string;
} {
  if (allDay) {
    return {
      endDate: addDays(dateStr, 1),
      endTime: "00:00",
    };
  }

  const end = parseDateTime(dateStr, timeStr);
  end.setHours(end.getHours() + 1);
  return {
    endDate: toDateStr(end),
    endTime: toTimeStr(end),
  };
}

function toISOWithTZ(dateStr: string, timeStr: string): string {
  return `${dateStr}T${timeStr}:00+08:00`;
}

function formatRepeatRule(rule: Record<string, any>): string {
  if (!rule || !rule.freq) return "";
  const dayMap: Record<string, string> = {
    MO: "一", TU: "二", WE: "三", TH: "四", FR: "五", SA: "六", SU: "日",
  };
  if (rule.freq === "daily") return "每天重复";
  if (rule.freq === "weekly" && rule.byday) {
    const days = rule.byday.map((d: string) => "周" + (dayMap[d] || d)).join("、");
    return `每周${days}重复`;
  }
  if (rule.freq === "monthly") return "每月重复";
  return "重复";
}

export default function EventCreatePage() {
  const router = useRouter();
  const eventId = router.params.id || null;
  const nextHour = getNextHourDate();
  const initialDate = router.params.date || toDateStr(nextHour);
  const isEdit = !!eventId;
  const aiResultParam = router.params.ai_result || null;

  const { createEvent, updateEvent } = useEventStore();
  const { groups, fetchGroups } = useGroupStore();

  const [title, setTitle] = useState("");
  const [isAllDay, setIsAllDay] = useState(false);
  const [startDate, setStartDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(toTimeStr(nextHour));
  const initialEnd = getAutoEnd(initialDate, toTimeStr(nextHour), false);
  const [endDate, setEndDate] = useState(initialEnd.endDate);
  const [endTime, setEndTime] = useState(initialEnd.endTime);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [visibleGroupIds, setVisibleGroupIds] = useState<string[]>([]);
  const [visibility, setVisibility] = useState("public");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [reminderMinutes, setReminderMinutes] = useState(0);
  const [saving, setSaving] = useState(false);
  const [repeatRule, setRepeatRule] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  useEffect(() => {
    if (isEdit && eventId) {
      Taro.setNavigationBarTitle({ title: "编辑日程" });
      getEventDetail(eventId).then((e) => {
        setTitle(e.title);
        setIsAllDay(e.is_all_day);
        const start = new Date(e.start_time);
        setStartDate(toDateStr(start));
        setStartTime(toTimeStr(start));
        if (e.end_time) {
          const end = new Date(e.end_time);
          setEndDate(toDateStr(end));
          setEndTime(toTimeStr(end));
        }
        setLocation(e.location);
        setDescription(e.description || "");
        setVisibleGroupIds(
          e.visible_group_ids?.length ? e.visible_group_ids : e.group_id ? [e.group_id] : []
        );
        setVisibility(e.visibility);
        if (e.color) setColor(e.color);
        if (e.remind_minutes && e.remind_minutes.length > 0) {
          setReminderMinutes(e.remind_minutes[0]);
        }
      });
    }
  }, [isEdit, eventId]);

  useEffect(() => {
    if (aiResultParam && !isEdit) {
      try {
        const result = JSON.parse(decodeURIComponent(aiResultParam));
        if (result.title) setTitle(result.title);
        if (result.is_all_day !== undefined) setIsAllDay(result.is_all_day);
        if (result.start_time) {
          const start = new Date(result.start_time);
          setStartDate(toDateStr(start));
          setStartTime(toTimeStr(start));
        }
        if (result.end_time) {
          const end = new Date(result.end_time);
          setEndDate(toDateStr(end));
          setEndTime(toTimeStr(end));
        }
        if (result.location) setLocation(result.location);
        if (result.description) setDescription(result.description);
        if (result.repeat_rule) setRepeatRule(result.repeat_rule);
      } catch (e) {
        console.error("Failed to parse ai_result:", e);
      }
    }
  }, [aiResultParam, isEdit]);

  useEffect(() => {
    if (isEdit) return;

    if (isAllDay) {
      setEndDate(addDays(startDate, 1));
      setEndTime("00:00");
      return;
    }

    const start = parseDateTime(startDate, startTime);
    const end = parseDateTime(endDate, endTime);
    if (start >= end) {
      const autoEnd = getAutoEnd(startDate, startTime, false);
      setEndDate(autoEnd.endDate);
      setEndTime(autoEnd.endTime);
    }
  }, [isAllDay, startDate, startTime, endDate, endTime, isEdit]);

  const visibilityIndex = VISIBILITY_OPTIONS.findIndex(
    (v) => v.value === visibility
  );

  const toggleVisibleGroup = (groupId: string) => {
    setVisibleGroupIds((current) => (
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId]
    ));
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Taro.showToast({ title: "请输入标题", icon: "none" });
      return;
    }

    const startISO = isAllDay
      ? `${startDate}T00:00:00+08:00`
      : toISOWithTZ(startDate, startTime);
    const endISO = isAllDay
      ? `${endDate}T00:00:00+08:00`
      : toISOWithTZ(endDate, endTime);

    if (new Date(endISO) < new Date(startISO)) {
      Taro.showToast({ title: "结束时间不能早于开始时间", icon: "none" });
      return;
    }

    if (reminderMinutes > 0) {
      await requestReminderSubscription();
    }

    setSaving(true);
    try {
      if (isEdit && eventId) {
        const data: EventUpdate = {
          title: title.trim(),
          description: description.trim(),
          is_all_day: isAllDay,
          start_time: startISO,
          end_time: endISO,
          location,
          color,
          visibility: visibleGroupIds.length > 0 ? (visibility as "public" | "busy" | "private") : undefined,
          visible_group_ids: visibleGroupIds,
          remind_minutes: reminderMinutes > 0 ? [reminderMinutes] : undefined,
        };
        await updateEvent(eventId, data);
        Taro.showToast({ title: "已更新", icon: "success" });
      } else {
        const data: EventCreate = {
          title: title.trim(),
          description: description.trim(),
          is_all_day: isAllDay,
          start_time: startISO,
          end_time: endISO,
          location,
          color,
          visible_group_ids: visibleGroupIds,
          visibility: visibleGroupIds.length > 0 ? (visibility as "public" | "busy" | "private") : "public",
          remind_minutes: reminderMinutes > 0 ? [reminderMinutes] : undefined,
          repeat_rule: repeatRule || undefined,
        };
        await createEvent(data);
        Taro.showToast({ title: "已创建", icon: "success" });
      }
      setTimeout(() => Taro.navigateBack(), 500);
    } catch (e: any) {
      Taro.showToast({ title: e.message || "保存失败", icon: "none" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="create-page">
      {/* Title */}
      <View className="form-section">
        <Input
          className="title-input"
          placeholder="日程标题"
          value={title}
          onInput={(e) => setTitle(e.detail.value)}
          maxlength={128}
        />
      </View>

      {/* All day toggle */}
      <View className="form-row">
        <Text className="form-label">全天</Text>
        <Switch checked={isAllDay} onChange={(e) => {
          const nextAllDay = e.detail.value;
          setIsAllDay(nextAllDay);
          const autoEnd = getAutoEnd(startDate, startTime, nextAllDay);
          setEndDate(autoEnd.endDate);
          setEndTime(autoEnd.endTime);
        }} color="#4A90D9" />
      </View>

      {/* Start */}
      <View className="form-row">
        <Text className="form-label">开始</Text>
        <View className="picker-group">
          <Picker mode="date" value={startDate} onChange={(e) => setStartDate(e.detail.value)}>
            <Text className="picker-value">{startDate}</Text>
          </Picker>
          {!isAllDay && (
            <Picker mode="time" value={startTime} onChange={(e) => setStartTime(e.detail.value)}>
              <Text className="picker-value">{startTime}</Text>
            </Picker>
          )}
        </View>
      </View>

      {/* End */}
      <View className="form-row">
        <Text className="form-label">结束</Text>
        <View className="picker-group">
          <Picker mode="date" value={endDate} onChange={(e) => setEndDate(e.detail.value)}>
            <Text className="picker-value">{endDate}</Text>
          </Picker>
          {!isAllDay && (
            <Picker mode="time" value={endTime} onChange={(e) => setEndTime(e.detail.value)}>
              <Text className="picker-value">{endTime}</Text>
            </Picker>
          )}
        </View>
      </View>

      {/* Location */}
      <View className="form-row">
        <Text className="form-label">地点</Text>
        <Input
          className="form-input"
          placeholder="可选"
          value={location}
          onInput={(e) => setLocation(e.detail.value)}
          maxlength={256}
        />
      </View>

      {/* Description */}
      <View className="form-section">
        <Textarea
          className="desc-input"
          placeholder="添加备注（可选）"
          value={description}
          onInput={(e) => setDescription(e.detail.value)}
          maxlength={1024}
          autoHeight
        />
      </View>

      {/* Visible groups */}
      <View className="form-section group-section">
        <View className="group-section-head">
          <Text className="form-label">可见日历组</Text>
          <Text className="group-hint">不勾选则仅自己可见，仍显示在全部和个人</Text>
        </View>
        <View className="group-chip-list">
          {groups.map((group) => {
            const active = visibleGroupIds.includes(group.id);
            return (
              <View
                key={group.id}
                className={`group-chip ${active ? "active" : ""}`}
                style={active ? { borderColor: group.color, color: group.color, backgroundColor: `${group.color}14` } : {}}
                onClick={() => toggleVisibleGroup(group.id)}
              >
                <View className="group-chip-dot" style={{ backgroundColor: group.color }} />
                <Text className="group-chip-text">{group.name}</Text>
              </View>
            );
          })}
          {groups.length === 0 && (
            <Text className="group-empty">暂无可选日历组</Text>
          )}
        </View>
      </View>

      {/* Visibility - only show when any group selected */}
      {visibleGroupIds.length > 0 && (
        <View className="form-row">
          <Text className="form-label">可见性</Text>
          <Picker
            mode="selector"
            range={VISIBILITY_OPTIONS.map((v) => v.label)}
            value={visibilityIndex >= 0 ? visibilityIndex : 0}
            onChange={(e) => {
              setVisibility(VISIBILITY_OPTIONS[Number(e.detail.value)].value);
            }}
          >
            <Text className="picker-value">
              {VISIBILITY_OPTIONS[visibilityIndex >= 0 ? visibilityIndex : 0].label}
            </Text>
          </Picker>
        </View>
      )}

      {/* Color */}
      <View className="form-row">
        <Text className="form-label">颜色</Text>
        <View className="color-picker">
          {PRESET_COLORS.map((c) => (
            <View
              key={c}
              className={`color-dot ${color === c ? "active" : ""}`}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </View>
      </View>

      {/* Repeat rule (from AI, read-only) */}
      {repeatRule && (
        <View className="form-row">
          <Text className="form-label">重复</Text>
          <Text className="repeat-text">{formatRepeatRule(repeatRule)}</Text>
        </View>
      )}

      {/* Reminder */}
      <View className="form-row">
        <Text className="form-label">提醒</Text>
        <Picker
          mode="selector"
          range={REMINDER_OPTIONS.map((r) => r.label)}
          value={REMINDER_OPTIONS.findIndex((r) => r.value === reminderMinutes)}
          onChange={(e) => {
            setReminderMinutes(REMINDER_OPTIONS[Number(e.detail.value)].value);
          }}
        >
          <Text className="picker-value">
            {REMINDER_OPTIONS.find((r) => r.value === reminderMinutes)?.label || "不提醒"}
          </Text>
        </Picker>
      </View>

      {/* Save button */}
      <View className="save-section">
        <View className={`save-btn ${saving ? "disabled" : ""}`} onClick={!saving ? handleSave : undefined}>
          <Text className="save-text">{saving ? "保存中..." : "保存"}</Text>
        </View>
      </View>
    </View>
  );
}
