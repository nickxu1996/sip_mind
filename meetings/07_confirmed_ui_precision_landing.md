# 07 Confirmed UI Precision Landing

Date: 2026-06-05

## 中文

### 会议目标

把用户已确认的 Sip Mind 效果图精确落地，而不是只做相似的白色界面。

### 优化简报

当前项目已经具备库存、食品库、偏好、生成推荐、收藏、登录、设置和公网部署能力。问题集中在 UI 落地不够贴近确认图：视觉密度、分栏比例、边框颜色、控件形态、推荐结果卡片和收藏栏都仍然偏旧。

### 专家结论

产品顾问：功能不需要新增，核心目标是让同一套功能呈现为高级饮品工作台。不要改变生成、库存、食品库、收藏的业务逻辑。

前端专家：需要把当前 CSS 覆盖层改成明确的设计系统，并对少量 JSX 结构做必要调整。重点是食品库编号、分类行的信息结构、推荐卡片四列布局、收藏列表信息层级。

UI/UX 顾问：确认图的主色是近白背景和极细灰线，黑色按钮只用于主操作，强调色非常克制。当前实现的背景、阴影、卡片比例和空白面积与确认图不一致，必须重做为更扁、更轻、更精密的界面。

QA 专家：验收标准必须包含桌面截图和移动端截图。桌面至少检查 1440px 宽度下推荐区一行四张卡；移动端检查单列主结构和结果两列小卡不挤压。

DevOps 专家：公网部署路径已确认。本轮完成后应自动运行测试、构建、推送 GitHub 并部署 Vultr。

### 设计规格

- 页面背景：`#fbfaf8` 到 `#f6f3ee` 的近白底，不使用明显渐变球或厚重阴影。
- 主面板：`#ffffff`，边框 `#e8e3da`，圆角 8px，阴影极轻 `0 14px 34px rgba(34, 29, 24, 0.035)`。
- 文字：主文字 `#111111`，次级文字 `#6f6a62`，说明文字 `#8a847a`。
- 强调色：编号和少量提示使用 `#0f766e`，按钮和主文字使用 `#111111`，温暖提示使用 `#8a3d16`。
- 顶部：左侧品牌小尺寸，中央说明文字，右侧操作按钮。整体高度约 64px。
- 库存/食品库：同一个大面板内双栏，库存约 49%，食品库约 51%，中间细分割线。
- 分类行：左侧图标、分类名、数量圆点，右侧物品 chips，最右小加号。
- 食品库：分类名左列，chips 右列，搜索栏在右上方。
- 推荐区：下方三列布局，偏好约 280px，中间自适应，收藏约 300px。中间推荐卡片一行四张窄竖卡。
- 推荐卡：顶部收藏标记，艺术编号，名称居中，容量和热量小字，标签小胶囊，分数区紧凑，原料/做法/剩余原料分区。
- 收藏栏：列表式，每项含缩略图占位、名称、标签、容量热量、大评分和星标。

### 用户决策

无需新的用户决策。用户已确认设计方向，本轮应直接落地。

### 下一步

按上述规格改造 `src/App.tsx` 和 `src/styles.css`，截图验收后部署公网。

## English

### Meeting Goal

Land the user-approved Sip Mind mockup precisely instead of producing only a generally similar white UI.

### Optimization Brief

The project already has inventory, food library, preferences, AI recommendation generation, favorites, authentication, settings, and public deployment. The remaining issue is UI fidelity: density, column ratio, border colors, controls, recommendation cards, and the favorites rail still feel older than the approved mockup.

### Expert Conclusions

Product advisor: no new feature is needed. The goal is to present the existing functionality as a premium drink workbench without changing business behavior.

Frontend expert: replace the current generic CSS override with a concrete design system and make small JSX adjustments where needed. Focus on food-library numbering, category row structure, four-column recommendation cards, and favorite list hierarchy.

UI/UX advisor: the approved image uses near-white surfaces, hairline borders, restrained black primary actions, and very limited accent color. The current implementation diverges in background, shadow, card ratio, and whitespace, so it needs a precision pass.

QA expert: acceptance must include desktop and mobile screenshots. Desktop should show four recommendation cards per row at 1440px. Mobile should keep a single main column and two compact result cards per row.

DevOps expert: the public deployment path is confirmed. After this round passes checks, push to GitHub and deploy to Vultr automatically.

### Design Spec

- Page background: near-white `#fbfaf8` to `#f6f3ee`, without visible decorative blobs or heavy shadows.
- User correction: the approved background canvas should be white, so the final background canvas is `#ffffff`.
- Main panels: `#ffffff`, border `#e8e3da`, 8px radius, very light shadow `0 14px 34px rgba(34, 29, 24, 0.035)`.
- Text: primary `#111111`, secondary `#6f6a62`, helper `#8a847a`.
- Accent: section numbers and minor hints `#0f766e`, primary buttons and main text `#111111`, warm hints `#8a3d16`.
- Header: compact brand at left, intro centered, controls aligned right, about 64px tall.
- Inventory/Food Library: one large split panel, inventory about 49%, food library about 51%, with a thin vertical divider.
- Category rows: icon, category name, count bubble, item chips, and a small add control at the far right.
- Food library: category label column with chips on the right and search on the top right.
- Recommendation area: lower three-column layout, preferences about 280px, center flexible, favorites about 300px. Center cards show four narrow vertical cards per row.
- Recommendation distribution: card width stays fixed. One card is centered, two cards are evenly distributed, and three or four cards spread across the row without stretching each card.
- Recommendation card: top favorite marker, artistic number, centered name, compact volume/calories, small tags, compact score block, ingredients, steps, and leftovers.
- Favorites rail: list rows with thumbnail placeholders, name, tags, volume/calories, large score, and star action.

### User Decision

No new user decision is needed. The user already approved the visual direction.

### Next Step

Update `src/App.tsx` and `src/styles.css`, verify with screenshots, then deploy publicly.
