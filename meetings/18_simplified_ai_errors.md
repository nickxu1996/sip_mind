# 18. Simplified AI Error Messages

## 中文

- 将 AI 供应商返回的原始长错误简化为用户可读的短提示。
- Gemini 高需求错误会显示为：`Currently experiencing high demand. Please try again later.`
- 页面不再额外拼接 `Error:` 前缀，避免用户看到冗长的供应商错误、接口地址或 JSON 解析细节。
- 已为错误简化函数和推荐接口补充测试，覆盖高需求错误与无效 JSON 错误。

## English

- Simplified raw AI provider errors into short, user-facing messages.
- Gemini high-demand errors now display as: `Currently experiencing high demand. Please try again later.`
- The UI no longer prepends an extra `Error:` prefix, so users do not see provider internals, endpoint URLs, or JSON parser details.
- Added tests for the simplifier and the recommendation route, covering high-demand and invalid JSON failures.
