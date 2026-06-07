# Quick Generate Scroll Target

Date: 2026-06-07

## Chinese

### 本轮目标

- 将移动端快速生成移动到库存栏上方。
- 点击快速生成时，使用快速生成配置触发生成推荐。
- 点击后自动滚动到偏好栏和生成推荐栏所在区域。

### 修改结果

- 移动端快速生成现在显示在库存卡片上方。
- 电脑端快速生成仍保留在库存标题行中间。
- 快速生成点击后会使用固定配置：无视库存、关闭节俭、开启独立饮品、数量 3。
- 点击后立即滚动到 `content-grid`，让偏好栏和生成推荐栏进入视野。

### 验证

- `npm test`
- `npm run build`
- 移动端截图确认快速生成位于库存栏上方。

## English

### Goal

- Move mobile quick generate above the inventory section.
- Trigger recommendation generation with the quick-generate preset.
- Automatically scroll to the preferences and recommendation area after clicking quick generate.

### Result

- Mobile quick generate now appears above the inventory card.
- Desktop quick generate remains centered in the inventory title row.
- Quick generate uses the fixed preset: ignore inventory, frugal off, independent drinks on, count 3.
- After clicking, the page scrolls to `content-grid`, bringing preferences and recommendations into view.

### Verification

- `npm test`
- `npm run build`
- Mobile screenshot confirmed quick generate appears above inventory.
