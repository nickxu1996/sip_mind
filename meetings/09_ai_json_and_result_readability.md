# 09 AI JSON And Result Readability

Date: 2026-06-05

## 中文

### 目标

提升生成结果卡片可读性，并修复 AI 返回轻微破损 JSON 时直接失败的问题。

### 改动

- 放大生成结果卡片的饮品名、容量/热量、评分维度、简介、原料、做法和剩余原料字体。
- 修复后端提示词里的中文评分维度编码，避免乱码进入 AI prompt。
- JSON 解析器优先提取最外层 JSON object，避免误截内部数组。
- JSON 解析器增加常见问题修复：智能引号、尾逗号、数组字符串元素漏逗号。
- 当 AI 第一次返回无效 JSON 时，后续重试会追加更严格的 JSON-only 指令。
- 增加 provider 解析测试，覆盖漏逗号和尾逗号场景。

### 验证

- `npm test` 通过：6 个测试文件，31 个测试。
- `npm run build` 通过。

## English

### Goal

Improve recommendation-card readability and prevent small AI JSON formatting defects from immediately failing generation.

### Changes

- Increased font sizes for drink name, volume/calories, score dimensions, summary, ingredients, steps, and leftovers.
- Fixed Chinese score-dimension encoding in the backend prompt.
- JSON parsing now prefers the outer JSON object instead of accidentally extracting an inner array.
- JSON parsing now repairs common issues: smart quotes, trailing commas, and missing commas between adjacent string array elements.
- If the first AI response is invalid JSON, retries add a stricter JSON-only instruction.
- Added provider parsing tests for missing comma and trailing comma cases.

### Verification

- `npm test` passed: 6 test files, 31 tests.
- `npm run build` passed.
