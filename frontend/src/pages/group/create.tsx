import { useEffect, useState } from "react";
import { View, Text, Input, Textarea } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useGroupStore } from "../../stores/group";
import { getGroupDetail } from "../../services/api";
import "./create.scss";

const PRESET_COLORS = ["#4A90D9", "#FF6B6B", "#52C41A", "#FAAD14", "#722ED1", "#EB2F96"];
const PRESET_ICONS = [
  { value: "family", label: "家庭" },
  { value: "friends", label: "朋友" },
  { value: "work", label: "工作" },
  { value: "sport", label: "运动" },
  { value: "study", label: "学习" },
  { value: "other", label: "其他" },
];

export default function GroupCreatePage() {
  const router = useRouter();
  const groupId = router.params.id || null;
  const isEdit = !!groupId;
  const { createGroup, updateGroup } = useGroupStore();

  const [name, setName] = useState("");
  const [icon, setIcon] = useState("family");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEdit && groupId) {
      Taro.setNavigationBarTitle({ title: "编辑日历组" });
      getGroupDetail(groupId).then((g) => {
        setName(g.name);
        if (g.icon) setIcon(g.icon);
        if (g.color) setColor(g.color);
        setDescription(g.description);
      });
    }
  }, [isEdit, groupId]);

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
      <View className="form-section">
        <Input className="name-input" placeholder="日历组名称" value={name} onInput={(e) => setName(e.detail.value)} maxlength={64} />
      </View>
      <View className="form-row-label"><Text className="section-label">图标</Text></View>
      <View className="icon-picker">
        {PRESET_ICONS.map((ic) => (
          <View key={ic.value} className={`icon-item ${icon === ic.value ? "active" : ""}`} onClick={() => setIcon(ic.value)}>
            <Text className="icon-text">{ic.label}</Text>
          </View>
        ))}
      </View>
      <View className="form-row-label"><Text className="section-label">颜色</Text></View>
      <View className="color-row">
        {PRESET_COLORS.map((c) => (
          <View key={c} className={`color-dot ${color === c ? "active" : ""}`} style={{ backgroundColor: c }} onClick={() => setColor(c)} />
        ))}
      </View>
      <View className="form-section">
        <Textarea className="desc-input" placeholder="描述（可选）" value={description} onInput={(e) => setDescription(e.detail.value)} maxlength={256} autoHeight />
      </View>
      <View className="save-section">
        <View className={`save-btn ${saving ? "disabled" : ""}`} onClick={!saving ? handleSave : undefined}>
          <Text className="save-text">{saving ? "保存中..." : "保存"}</Text>
        </View>
      </View>
    </View>
  );
}
