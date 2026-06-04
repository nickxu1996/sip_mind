import "dotenv/config";
import { App } from "@slack/bolt";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const {
  SLACK_BOT_TOKEN,
  SLACK_APP_TOKEN,
  SLACK_ALLOWED_CHANNEL_IDS = "",
  SLACK_ALLOWED_USER_IDS = "",
  CODEX_WORKDIR = process.cwd(),
  CODEX_COMMAND = "codex",
  CODEX_TIMEOUT_MS = "900000",
  CODEX_SANDBOX = "workspace-write",
  CODEX_APPROVAL_POLICY = "never",
} = process.env;

if (!SLACK_BOT_TOKEN || !SLACK_APP_TOKEN) {
  console.error("Missing SLACK_BOT_TOKEN or SLACK_APP_TOKEN.");
  process.exit(1);
}

const allowedChannels = csvSet(SLACK_ALLOWED_CHANNEL_IDS);
const allowedUsers = csvSet(SLACK_ALLOWED_USER_IDS);
const timeoutMs = Number.parseInt(CODEX_TIMEOUT_MS, 10);
let activeTask = null;

const app = new App({
  token: SLACK_BOT_TOKEN,
  appToken: SLACK_APP_TOKEN,
  socketMode: true,
});

app.event("app_mention", async ({ event, say, client }) => {
  console.log(`Received app mention from ${event.user} in ${event.channel}`);
  if (!isAllowed(event)) {
    await say("这个频道或用户没有授权使用这台电脑上的 Codex。");
    return;
  }

  const text = stripBotMentions(event.text);
  await runAndReply({ text, say, client, channel: event.channel, threadTs: event.ts });
});

app.message(async ({ message, say, client }) => {
  if (message.subtype || message.bot_id || message.channel_type !== "im" || !message.text) {
    return;
  }

  console.log(`Received direct message from ${message.user} in ${message.channel}`);
  if (!isAllowed(message)) {
    await say("这个用户没有授权使用这台电脑上的 Codex。");
    return;
  }

  await runAndReply({ text: message.text.trim(), say, client, channel: message.channel, threadTs: message.ts });
});

await app.start();
const auth = await app.client.auth.test();
console.log(`Connected to Slack as ${auth.user || auth.bot_id || "bot"} in team ${auth.team || "unknown"}`);
console.log(`Slack Codex bridge is running in ${CODEX_WORKDIR}`);

function csvSet(value) {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return new Set(items);
}

function isAllowed(event) {
  const channelOk = allowedChannels.size === 0 || allowedChannels.has(event.channel);
  const userOk = allowedUsers.size === 0 || allowedUsers.has(event.user);
  return channelOk && userOk;
}

function stripBotMentions(text = "") {
  return text.replace(/<@[^>]+>/g, "").trim();
}

async function runAndReply({ text, say, client, channel, threadTs }) {
  if (!text) {
    await say({ text: "发给我一个任务，比如：`@Nixey Codex Remote 检查测试是否通过`。", thread_ts: threadTs });
    return;
  }

  if (activeTask) {
    await say({ text: "Codex 正在处理上一条任务，稍等它完成后再发下一条。", thread_ts: threadTs });
    return;
  }

  activeTask = { channel, threadTs, startedAt: Date.now() };
  await say({ text: "收到。我正在让这台电脑上的 Codex 处理。", thread_ts: threadTs });

  try {
    const result = await runCodex(text);
    await postLongMessage(client, channel, threadTs, result || "Codex 已完成，但没有返回文字结果。");
  } catch (error) {
    await postLongMessage(client, channel, threadTs, `Codex 运行失败：\n\`\`\`\n${String(error.message || error)}\n\`\`\``);
  } finally {
    activeTask = null;
  }
}

async function runCodex(prompt) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "slack-codex-"));
  const outputPath = path.join(tempDir, "last-message.txt");

  const args = [
    "exec",
    "--cd",
    CODEX_WORKDIR,
    "--sandbox",
    CODEX_SANDBOX,
    "--ask-for-approval",
    CODEX_APPROVAL_POLICY,
    "--output-last-message",
    outputPath,
    prompt,
  ];

  try {
    const fallbackOutput = await runProcess(CODEX_COMMAND, args, timeoutMs);
    const lastMessage = await readFile(outputPath, "utf8").catch(() => "");
    return (lastMessage || fallbackOutput).trim();
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function runProcess(command, args, timeout) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: CODEX_WORKDIR,
      shell: process.platform === "win32",
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`任务超过 ${timeout}ms，已停止。`));
    }, timeout);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || stdout || `codex exited with code ${code}`));
      }
    });
  });
}

async function postLongMessage(client, channel, threadTs, text) {
  const chunks = chunkText(text, 3500);
  for (const chunk of chunks) {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: chunk,
    });
  }
}

function chunkText(text, maxLength) {
  if (text.length <= maxLength) return [text];

  const chunks = [];
  let remaining = text;
  while (remaining.length > maxLength) {
    const splitAt = remaining.lastIndexOf("\n", maxLength);
    const end = splitAt > 500 ? splitAt : maxLength;
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
