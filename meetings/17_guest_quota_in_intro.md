# Guest Quota In Intro

Date: 2026-06-07

## Chinese

### 本轮目标

- 将“未登录用户每日可免费生成 10 次”移动到网页介绍板块。
- 放在网页介绍文字下一行。
- 字体和网页介绍保持一致。
- 从库存标题区域移除这句话。

### 修改结果

- 顶部介绍区域现在显示两行：第一行为网页介绍，第二行为未登录生成额度。
- 两行使用相同字体、颜色和行高。
- 库存标题区域不再显示未登录额度，减少标题行拥挤。

### 验证

- `npm test`
- `npm run build`
- 桌面截图检查。
- 移动端截图检查。

## English

### Goal

- Move the guest daily free-generation quota into the page intro block.
- Place it on the line below the intro text.
- Match the intro typography.
- Remove this text from the inventory heading area.

### Result

- The top intro area now shows two lines: intro text first, guest quota second.
- Both lines share the same typography, color, and line height.
- The inventory heading no longer shows the guest quota, reducing heading crowding.

### Verification

- `npm test`
- `npm run build`
- Desktop screenshot check.
- Mobile screenshot check.
