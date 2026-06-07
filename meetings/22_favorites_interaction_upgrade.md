# 22. Favorites Interaction Upgrade

## 中文

- 收藏改为即时显示：点击收藏后先在右侧收藏栏出现，再后台保存。
- 重复收藏同一饮品内容时不再新增，只显示快速提示：`该饮品已收藏！`
- 增加同步收藏指纹缓存，防止连续快速点击造成重复收藏。
- 同名但内容不同的收藏会按 `V1`、`V2` 等版本号显示。
- 收藏项右侧增加删除按钮，每次删除前都会确认。
- 点击收藏项可以打开详情弹窗，不影响当前生成推荐页面。
- 收藏详情支持用户编辑名称、简介、原料和做法，并保存回服务器。
- 后端增加收藏指纹去重保险，并补充存储层测试。

## English

- Favorites now appear immediately in the right panel before the background save finishes.
- Re-saving the same drink content no longer inserts another favorite and shows a quick duplicate toast.
- Added a synchronous favorite signature cache to prevent rapid double-click duplicates.
- Favorites with the same name but different content display version labels such as `V1` and `V2`.
- Added a right-side delete button with confirmation for every deletion.
- Clicking a favorite opens a detail modal without changing the current recommendation results.
- Favorite details can be edited by the user: name, summary, ingredients, and steps.
- Added backend favorite signature deduplication and a storage-layer test.
