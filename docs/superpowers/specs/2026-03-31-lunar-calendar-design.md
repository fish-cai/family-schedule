# P0 收尾：农历显示设计

> 版本：v1.0 | 日期：2026-03-31

---

## 一、范围

在月历网格中每个日期下方显示农历信息（农历日期、节气、传统节日）。

### 包含

- 安装 `lunar-javascript` npm 包
- 月历网格日期下方显示农历小字
- 节气和传统节日优先显示并高亮

### 不包含

- 农历日期选择器
- 农历搜索
- 黄历信息

---

## 二、显示规则

每个日期格子下方显示一行农历文字，优先级：

1. **节气**（立春、清明、冬至等 24 节气）→ 红色文字
2. **传统节日**（春节、元宵、端午、中秋、重阳、除夕等）→ 红色文字
3. **农历日期**：
   - 每月初一 → 显示月份名（如"二月"、"闰四月"）
   - 其余日期 → 显示农历日（如"初二"、"十五"、"廿三"）
   - 灰色小字

---

## 三、技术方案

### 3.1 依赖

`lunar-javascript` — npm 包，提供 `Solar` 和 `Lunar` 类。

核心 API：
```typescript
import { Solar } from 'lunar-javascript';

const solar = Solar.fromDate(new Date(2026, 3, 15));
const lunar = solar.getLunar();

lunar.getDayInChinese();    // "十五"
lunar.getMonthInChinese();  // "三"
lunar.getJieQi();           // 节气名 或 null（库中方法名为 getCurrentJieQi）
lunar.getFestivals();       // 节日数组
```

### 3.2 改动文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/package.json` | 修改 | 安装 lunar-javascript |
| `frontend/src/components/calendar-grid/index.tsx` | 修改 | 添加农历计算和显示 |
| `frontend/src/components/calendar-grid/index.scss` | 修改 | 添加农历文字样式 |

### 3.3 实现逻辑

新增辅助函数 `getLunarText(date: Date): { text: string; highlight: boolean }`：

```
1. 转换为 Lunar 对象
2. 检查节气 → 有则返回 { text: 节气名, highlight: true }
3. 检查传统节日 → 有则返回 { text: 节日名, highlight: true }
4. 检查是否初一 → 是则返回 { text: X月, highlight: false }
5. 否则返回 { text: 农历日, highlight: false }
```

### 3.4 样式

- 农历文字：font-size 20px，颜色 #bbb
- 高亮（节气/节日）：颜色 #e74c3c
- 放在日期数字下方，行高紧凑
