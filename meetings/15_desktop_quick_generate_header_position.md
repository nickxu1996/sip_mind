# Desktop Quick Generate Header Position

Date: 2026-06-07

## Chinese

### 本轮目标

- 将电脑端快速生成从添加食品栏左侧移动到库存标题行中间。
- 不增加新的标题行。
- 避免库存标题、快速生成、清空按钮互相覆盖。
- 移动端保持原来的快速生成位置。

### 修改结果

- 库存标题行在桌面端改为三列布局：左侧库存标题和未登录额度，中间快速生成，右侧清空。
- 桌面端添加食品栏恢复为只包含食物名称、单份容量、添加按钮。
- 修复未登录额度早期绝对定位导致的文字贴合/覆盖风险。
- 移动端继续在库存卡片下方显示快速生成。

### 验证

- `npm run build`
- `npm test`
- 桌面截图检查标题行无覆盖。
- 移动端截图检查快速生成位置未被影响。

## English

### Goal

- Move desktop quick generate from the left side of the add-food form to the center of the inventory title row.
- Do not add a new title row.
- Avoid overlap between the inventory title, quick-generate button, and clear action.
- Keep the mobile quick-generate placement unchanged.

### Result

- The desktop inventory heading now uses three columns: inventory title and guest quota on the left, quick generate in the center, clear action on the right.
- The desktop add-food row now contains only food name, serving size, and add.
- Fixed early absolute positioning on the guest quota text that could create text crowding or overlap.
- Mobile still shows quick generate below the inventory card.

### Verification

- `npm run build`
- `npm test`
- Desktop screenshot checked for no title-row overlap.
- Mobile screenshot checked that quick-generate placement is unchanged.
