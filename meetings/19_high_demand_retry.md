# 19. High Demand Retry

## 中文

- 对 AI 返回的 `high demand` 错误增加后台自动重试。
- 首次遇到高需求错误后等待 3 秒再提交，最多重试 3 次。
- 如果 3 次重试后仍然是高需求错误，才停止生成并向用户显示简化后的错误提示。
- 保留其他临时错误和 JSON 修复错误的短重试逻辑。
- 已补充测试确认高需求错误的重试次数和等待时间。

## English

- Added automatic backend retries for AI `high demand` errors.
- After the first high-demand failure, the backend waits 3 seconds before retrying, up to 3 retries.
- If all 3 retries still hit high demand, generation stops and the simplified user-facing error is returned.
- Existing short retry behavior for other transient and JSON repair errors is preserved.
- Added a test for high-demand retry count and delay.
