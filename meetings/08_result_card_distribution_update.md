# 08 Result Card Distribution Update

Date: 2026-06-05

## 中文

### 目标

按用户确认的效果图更新 Sip Mind 的顶部、编号和生成推荐卡片布局。

### 已确认需求

- 顶部品牌、说明和工具栏不再放在带边框的框内。
- 食品库属于库存区域，不单独编号。
- 页面编号恢复为：`1 库存`、`2 偏好`、`3 生成推荐`、`4 我的收藏`。
- 生成推荐卡片保持展开显示，不使用“查看详情”折叠入口。
- 推荐卡片固定宽度，不拉伸。
- 推荐栏一行最多 3 张卡片。
- 1 张卡片居中，2 张卡片均匀排列，3 张卡片左右边距一致并铺开。

### 验证

- 桌面截图检查：3 张推荐卡片同一行显示，左右边距一致。
- `npm run build` 通过。
- `npm test` 通过。

## English

### Goal

Update Sip Mind's header, section numbering, and recommendation-card layout according to the user-approved mockup.

### Confirmed Requirements

- The top brand, intro, and toolbar are no longer inside a bordered frame.
- The food library belongs to the inventory area and does not receive its own section number.
- Page numbering is restored to: `1 Inventory`, `2 Preferences`, `3 Generate`, `4 Favorites`.
- Recommendation cards stay expanded and do not use a "view details" collapsed entry.
- Recommendation cards keep a fixed width and do not stretch.
- The recommendation row shows at most 3 cards.
- One card is centered, two cards are evenly distributed, and three cards spread across the row with matching left and right margins.

### Verification

- Desktop screenshot checked: 3 recommendation cards stay on one row with balanced outer margins.
- `npm run build` passed.
- `npm test` passed.
