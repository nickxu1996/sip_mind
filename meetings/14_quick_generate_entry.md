# Quick Generate Entry

Date: 2026-06-07

## Chinese

### 功能简述

- 在桌面端和移动端增加快速生成入口。
- 桌面端快速生成放在添加食品栏左侧。
- 移动端快速生成放在库存卡片下方、偏好卡片上方。

### 生成规则

点击快速生成时使用独立的固定规则，不改动用户偏好面板中的当前选择：

- 开启无视库存。
- 关闭节俭模式。
- 开启独立饮品。
- 推荐数量为 3。
- 清空必选库存限制。

### 验证

- `npm test`
- `npm run build`
- 桌面截图检查快速生成位于添加食品栏左侧。
- 移动端截图检查快速生成位于库存和偏好之间。

## English

### Feature

- Added quick-generate entries on desktop and mobile.
- Desktop quick generate appears to the left of the add-food form.
- Mobile quick generate appears between the inventory card and preferences card.

### Generation Rules

Quick generate uses an independent fixed request profile without changing the current visible preference panel:

- Ignore inventory is enabled.
- Frugal mode is disabled.
- Independent drinks is enabled.
- Recommendation count is 3.
- Required inventory constraints are cleared.

### Verification

- `npm test`
- `npm run build`
- Desktop screenshot confirmed the quick-generate button beside the add-food form.
- Mobile screenshot confirmed the quick-generate button between inventory and preferences.
