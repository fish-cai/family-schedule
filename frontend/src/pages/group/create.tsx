import { useEffect, useState } from "react";
import { View, Text, Input, Textarea } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useGroupStore } from "../../stores/group";
import { getGroupDetail } from "../../services/api";
import "./create.scss";

const PRESET_COLORS = [
  "#4A6CFA", "#FF6B6B", "#52C41A", "#FAAD14", "#722ED1", "#EB2F96",
  "#13C2C2", "#FA8C16", "#2F54EB", "#F5222D",
];
const DEFAULT_TAGS = ["家庭", "工作", "朋友", "运动", "学习"];

export default function GroupCreatePage() {
  const router = useRouter();
  const groupId = router.params.id || null;
  const isEdit = !!groupId;
  const { createGroup, updateGroup } = useGroupStore();

  const [name, setName] = useState("");
  const [icon, setIcon] = useState("家庭");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const [tags, setTags] = useState<string[]>(DEFAULT_TAGS);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (isEdit && groupId) {
      Taro.setNavigationBarTitle({ title: "编辑日历组" });
      getGroupDetail(groupId).then((g) => {
        setName(g.name);
        if (g.icon) {
          setIcon(g.icon);
          if (!tags.includes(g.icon)) {
            setTags((prev) => [...prev, g.icon]);
          }
        }
        if (g.color) setColor(g.color);
        setDescription(g.description);
      });
    }
  }, [isEdit, groupId]);

  const handleAddTag = () => {
    const val = tagInput.trim();
    if (!val) return;
    if (tags.includes(val)) {
      setIcon(val);
      setTagInput("");
      return;
    }
    setTags((prev) => [...prev, val]);
    setIcon(val);
    setTagInput("");
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Taro.showToast({ title: "请输入名称", icon: "none" });
      return;
    }
    setSaving(true);
    try {
      if (isEdit && groupId) {
        await updateGroup(groupId, { name: name.trim(), icon, color, description });
        Taro.showToast({ title: "已更新", icon: "success" });
        setTimeout(() => Taro.navigateBack(), 500);
      } else {
        const group = await createGroup({ name: name.trim(), icon, color, description });
        Taro.showToast({ title: "已创建", icon: "success" });
        setTimeout(() => Taro.redirectTo({ url: `/pages/group/detail?id=${group.id}` }), 500);
      }
    } catch (e: any) {
      Taro.showToast({ title: e.message || "保存失败", icon: "none" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="group-create-page">
      {/* Name */}
      <View className="section-card">
        <Text className="field-label">日历组名称</Text>
        <Input
          className="name-input"
          placeholder="例如：我的家庭"
          value={name}
          onInput={(e) => setName(e.detail.value)}
          maxlength={64}
        />
      </View>

      {/* Tags */}
      <View className="section-card">
        <Text className="field-label">分组标签</Text>
        <View className="tag-list">
          {tags.map((t) => (
            <View
              key={t}
              className={`tag-item ${icon === t ? "active" : ""}`}
              onClick={() => setIcon(t)}
            >
              <Text className="tag-text">{t}</Text>
            </View>
          ))}
        </View>
        <View className="tag-input-row">
          <Input
            className="tag-input"
            placeholder="自定义标签"
            value={tagInput}
            onInput={(e) => setTagInput(e.detail.value)}
            maxlength={20}
            confirmType="done"
            onConfirm={handleAddTag}
          />
          <View
            className={`tag-add-btn ${!tagInput.trim() ? "disabled" : ""}`}
            onClick={tagInput.trim() ? handleAddTag : undefined}
          >
            <Text className="tag-add-text">+</Text>
          </View>
        </View>
      </View>

      {/* Color */}
      <View className="section-card">
        <Text className="field-label">颜色</Text>
        <View className="color-grid">
          {PRESET_COLORS.map((c) => (
            <View
              key={c}
              className={`color-item ${color === c ? "active" : ""}`}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
            >
              {color === c && <Text className="color-check">✓</Text>}
            </View>
          ))}
        </View>
      </View>

      {/* Description */}
      <View className="section-card">
        <Text className="field-label">描述</Text>
        <Textarea
          className="desc-input"
          placeholder="简单描述一下这个日历组（可选）"
          value={description}
          onInput={(e) => setDescription(e.detail.value)}
          maxlength={256}
          autoHeight
        />
      </View>

      {/* Save */}
      <View className="save-section">
        <View
          className={`save-btn ${saving || !name.trim() ? "disabled" : ""}`}
          onClick={!saving && name.trim() ? handleSave : undefined}
        >
          <Text className="save-text">{saving ? "保存中..." : isEdit ? "保存修改" : "创建日历组"}</Text>
        </View>
      </View>
    </View>
  );
}
