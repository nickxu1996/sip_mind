# Mobile Result And Inventory UI Fixes

Date: 2026-06-07

## Chinese

### 本轮目标

- 修复推荐卡片简介被截断的问题。
- 修复温度、咖啡因、酒精标签互相覆盖的问题。
- 优化移动端顶部标题、简介、设置栏。
- 将库存栏和食品库高度限制为约 8 行。
- 优化移动端添加食品栏，并为桌面端增加回车添加。

### 修改结果

- 推荐卡片的简介段落完整显示，不再使用截断效果。
- 温度、咖啡因、酒精改为三列网格，标签内部文字使用省略保护，避免覆盖相邻文字。
- 移动端顶部重新加回边框，网站简介放在网站标题右侧，设置栏单独放到下一行。
- 库存栏和食品库增加最大高度和滚动。
- 移动端添加食品栏拆为两行：食物名称和单份容量一行，添加按钮独占下一行。
- 桌面端在食物名称或单份容量输入框按 Enter 可以添加食品。

### 验证

- `npm test`
- `npm run build`
- 移动端截图检查。
- 使用临时卡片 HTML 验证简介完整和三标签同一行不覆盖。

### 未执行事项

- 移动端“生成推荐”入口位置还未改动，等待 Nixey 确认方案。

## English

### Goal

- Fix truncated recommendation summaries.
- Fix overlapping temperature, caffeine, and alcohol tags.
- Improve the mobile header, intro, and settings bar.
- Limit inventory and food library height to about eight rows.
- Improve the mobile add-food form and add Enter-to-add on desktop.

### Result

- Recommendation summaries now display fully.
- Temperature, caffeine, and alcohol use a three-column tag grid with ellipsis protection.
- The mobile header is framed again, with the intro placed beside the brand and settings controls on the next row.
- Inventory and food library sections now have max height and scrolling.
- The mobile add-food form uses two rows: food name and serving size on the first row, add button on the second row.
- Desktop users can press Enter in either add-food input to add the item.

### Verification

- `npm test`
- `npm run build`
- Mobile screenshot check.
- Temporary card HTML check for full summary and non-overlapping tag layout.

### Not Implemented Yet

- The mobile generate-entry placement has not been changed yet. It is waiting for Nixey's decision.
