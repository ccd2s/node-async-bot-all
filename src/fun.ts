// node
import os from "os";
import fs from "fs";
import path from "path";
// koishi and plugin
import { Context, FlatPick, Time, sleep, HTTP, Logger } from "koishi";
import Analytics from "@koishijs/plugin-analytics";
// steam-server-query ^1.1.3
import { queryGameServerInfo } from "steam-server-query";
// feedsmith ^2.9.4
import { parseRssFeed } from "feedsmith";
// minecraft-server-util ^5.4.4
import {
  JavaStatusResponse,
  status,
  statusBedrock,
  BedrockStatusResponse
} from "minecraft-server-util";
import { Servers } from "./commands.ts";

/**
 * HTTP 请求类型
 */
export type HttpResponse<T, E> =
  | { success: true; data: T }
  | { success: false; error: string; code: number; isObj: false; isError: false }
  | { success: false; error: E; code: number; isObj: true; isError: false }
  | { success: false; error: { name: string; message: string }; isError: true };

// A2S 类型
export type serverInfo =
  | {
      players: string;
      protocol: number;
      version: string;
      bots: number;
      port: number;
      name: string;
      success: true;
    }
  | { success: false; error: any };

// 获取系统名称
function getSystemName(): string {
  return os.type() + " " + os.release() + " (" + os.arch() + ")";
}

// 获取内存使用率
function getMemoryUsage(): string {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const percentage = Math.round((usedMemory / totalMemory) * 10000) / 100;
  const memory = `${(usedMemory / 1024 ** 3).toFixed(2)}GB / ${(totalMemory / 1024 ** 3).toFixed(2)}GB`;
  return `${percentage}%（${memory}）`;
}

// 获取CPU使用率（异步函数）
async function getCpuUsage(): Promise<string> {
  const cpus1 = os.cpus();

  // 等待 100ms 后再次采样
  await sleep(100);

  const cpus2 = os.cpus();

  let totalIdle = 0;
  let totalTick = 0;

  for (let i = 0; i < cpus1.length; i++) {
    const cpu1 = cpus1[i];
    const cpu2 = cpus2[i];

    // 计算第一次采样的总时间
    const idle1 = cpu1.times.idle;
    const total1 = Object.values(cpu1.times).reduce((acc, time) => acc + time, 0);

    // 计算第二次采样的总时间
    const idle2 = cpu2.times.idle;
    const total2 = Object.values(cpu2.times).reduce((acc, time) => acc + time, 0);

    // 计算差值
    const idleDiff = idle2 - idle1;
    const totalDiff = total2 - total1;

    totalIdle += idleDiff;
    totalTick += totalDiff;
  }

  // 计算使用率百分比
  const usage = 100 - (100 * totalIdle) / totalTick;
  return `${Math.round(usage * 100) / 100}%`;
}

/**
 * 系统信息主函数
 * */
export async function getSystemUsage(): Promise<
  { name: string; cpu: string; memory: string; success: 0 } | { data: string; success: 1 }
> {
  try {
    return {
      name: getSystemName(),
      cpu: await getCpuUsage(),
      memory: getMemoryUsage(),
      success: 0
    };
  } catch (error) {
    return {
      data: error.message,
      success: 1
    };
  }
}

/**
 * 获取香港时间
 * @returns 如："2025-12-21 12:49:59"
 * */
export function getHongKongTime(): string {
  const now = new Date();

  // 使用 Intl.DateTimeFormat 获取香港时区的时间
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const parts = formatter.formatToParts(now);
  const dateObj: Record<string, string> = {};

  parts.forEach((part) => {
    if (part.type !== "literal") {
      dateObj[part.type] = part.value;
    }
  });

  // 构建格式化字符串
  return `${dateObj.year}-${dateObj.month}-${dateObj.day} ${dateObj.hour}:${dateObj.minute}:${dateObj.second}`;
}

// 读取信息文件
export async function readInfo(
  ctx: Context
): Promise<{ koishiVersion: string; nodeVersion: string } | string> {
  try {
    const deps = await ctx.installer.getDeps();
    return {
      koishiVersion: deps.koishi.resolved as string,
      nodeVersion: process.versions.node
    };
  } catch (error) {
    return error?.message ?? "Unknown error";
  }
}

// 计算时间戳差值
export function formatTimestampDiff(start: number, end: number): string {
  // 获取绝对差值
  const diff = Math.abs(end - start);

  // 计算小时、分钟和秒
  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;

  return `${hours} 时 ${minutes} 分 ${seconds} 秒`;
}

// 计算收发消息数量
export async function getMsgCount(ctx: Context): Promise<{ receive: number; send: number }> {
  // 从数据库中获取
  const array = await ctx.database.get("analytics.message", { date: Time.getDateNumber() - 1 }, [
    "type",
    "count"
  ]);
  // 变量初始化
  let receive = 0;
  let send = 0;
  array.forEach((item: FlatPick<Analytics.Message, "type" | "count">) => {
    if (item.type == "receive") {
      // 收
      receive = receive + item.count;
    } else {
      // 发
      send = send + item.count;
    }
  });
  return { receive: receive, send: send };
}

/**
 * HTTP 请求
 * @param url 请求地址
 * @param ctx {Context}
 * @param options fetch 选项 (method, headers, body 等)
 * @param logger 日志
 */
export async function request<T = any, E = any>(
  url: string,
  ctx: Context,
  options: HTTP.RequestConfig = { method: "GET", timeout: 8000 },
  logger?: Logger
): Promise<HttpResponse<T, E>> {
  const log: Logger = logger ?? ctx.logger("http");

  try {
    const response = await ctx.http(url, options);

    let responseData: unknown;
    let isObj: boolean;
    const text = await response.data;
    try {
      responseData = JSON.parse(text);
      isObj = true;
    } catch {
      responseData = text; // 如果不是 JSON，就返回纯文本
      isObj = false;
    }

    // 处理 HTTP 错误状态 (如 404, 500)
    if (response.status !== 200) {
      log.error(`HTTP Error ${response.status}: ${url}`, responseData);
      return isObj
        ? {
            success: false,
            code: response.status,
            error: responseData as E,
            isObj: true,
            isError: false
          }
        : {
            success: false,
            code: response.status,
            error: (responseData as string) ?? `HTTP ${response.status}`,
            isObj: false,
            isError: false
          };
    }

    log.info(`HTTP ${response.status}: ${url}`);
    // 请求成功
    return {
      success: true,
      data: responseData as T
    };
  } catch (error: any) {
    // 处理网络错误或超时
    const { name, message } =
      error instanceof Error ? error : { name: "UnknownError", message: "unknown message" };

    const isTimeout = name === "TimeoutError" || name === "AbortError";
    const errorMessage = isTimeout ? `请求超时。(${options?.timeout}ms)` : message;

    log.error(url);
    log.error(`Request Failed:`, error);
    return {
      success: false,
      error: { name, message: errorMessage },
      isError: true
    };
  }
}

// A2S
export async function queryA2S(host: string, log: Logger): Promise<serverInfo> {
  try {
    // 查询
    const playerResponse = await queryGameServerInfo(host);
    log?.debug("Server Info:", playerResponse);
    return {
      players: playerResponse.players + " / " + playerResponse.maxPlayers,
      protocol: playerResponse.protocol,
      version: playerResponse.version,
      bots: playerResponse.bots,
      port: playerResponse.port as number,
      name: playerResponse.name,
      success: true
    };
  } catch (e) {
    // 错误
    log?.error("A2S Error:", e);
    return {
      error: e,
      success: false
    };
  }
}

// 解析 Steam 新闻并输出 Html
export async function parseNewsRssToHtml(
  rss: string,
  log: Logger,
  count?: number
): Promise<{ data?: string; guid?: string; error?: any }> {
  try {
    const aPath = path.resolve(__dirname, "..") + path.sep + "res" + path.sep + "steamNews.html";
    let html = await fs.promises.readFile(aPath, "utf8");

    const content = parseRssFeed(rss);
    if (!content?.items) return { error: new Error("响应不正确") };

    const item = content.items[count ?? 0];
    if (!item || !item.guid) return { error: new Error("文章不存在") };

    if (item.enclosures && item.enclosures[0] && item.enclosures[0].url)
      html = html
        .replace("<!--!", "")
        .replace("!!-->", "")
        .replace("{imgUrl}", item.enclosures[0].url);

    return {
      data: html
        .replace("{date}", new Date(item.pubDate ?? 0).toLocaleString())
        .replace("{title}", item.title ?? "无")
        .replace("{content}", item.description ?? "无"),
      guid: item.guid?.value
    };
  } catch (error) {
    log.error(error);
    log.error(error.message);
    return { error };
  }
}

/**
 * Minecraft SLP
 */
export async function slpInfo(
  log: Logger,
  host: string,
  port: number,
  timeout?: number
): Promise<
  { success: true; type: "java"; data: JavaStatusResponse } | { success: false; data: string }
> {
  try {
    // ping
    const info = await status(host, port, { timeout: timeout as number });
    log.debug(info);
    // 成功
    return {
      success: true,
      type: "java",
      data: info
    };
  } catch (error) {
    // 失败！
    log.error(error);
    return {
      success: false,
      data: error.message
    };
  }
}

/**
 * Minecraft Bedrock Ping
 */
export async function bedrockPing(
  log: Logger,
  host: string,
  port: number,
  timeout?: number
): Promise<
  { success: true; type: "bedrock"; data: BedrockStatusResponse } | { success: false; data: string }
> {
  try {
    // ping
    const info = await statusBedrock(host, port, { timeout: timeout as number });
    log.debug(info);
    // 成功
    return {
      success: true,
      type: "bedrock",
      data: info
    };
  } catch (error) {
    // 失败！
    log.error(error);
    return {
      success: false,
      data: error.message
    };
  }
}

export function getServerCardHtml(servers: Servers[], time: string): string {
  return `<!DOCTYPE html>
        <html lang="zh-CN">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Game Server List - Material Design 3</title>
          <style>
          /* CSS Reset & MD3 Base */
          *, *::before, *::after {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }

          :root {
            /* MD3 色彩系统 */
            --md-sys-color-primary: #006874;
            --md-sys-color-on-primary: #ffffff;
            --md-sys-color-primary-container: #97f0ff;
            --md-sys-color-on-primary-container: #001f24;
            --md-sys-color-surface: #fbfcfe;
            --md-sys-color-surface-dim: #dbdbdd;
            --md-sys-color-surface-container-lowest: #ffffff;
            --md-sys-color-surface-container-low: #f5f6f8;
            --md-sys-color-surface-container: #eff0f3;
            --md-sys-color-surface-container-high: #e9eaee;
            --md-sys-color-surface-container-highest: #e3e5e9;
            --md-sys-color-on-surface: #191c1e;
            --md-sys-color-on-surface-variant: #3f484a;
            --md-sys-color-outline: #6f797a;
            --md-sys-color-outline-variant: #bfc8ca;
            --md-sys-color-error: #ba1a1a;
            --md-sys-color-error-container: #ffdad6;
            --md-sys-color-on-error-container: #410002;

            /* MD3 形状与圆角 */
            --md-shape-corner-small: 8px;
            --md-shape-corner-medium: 12px;
            --md-shape-corner-large: 16px;
            --md-shape-corner-extra-large: 24px;
            --md-shape-corner-full: 9999px;

            /* MD3 字体 */
            --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
          }

          body {
            font-family: var(--font-family), system-ui;
            background-color: var(--md-sys-color-surface-container-low);
            color: var(--md-sys-color-on-surface);
            padding: 32px;
            min-height: 100vh;
            -webkit-font-smoothing: antialiased;
          }

          /* 顶部标题栏 */
          .header {
            max-width: 1400px;
            margin: 0 auto 28px;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }

          .header-title {
            font-size: 26px;
            font-weight: 700;
            letter-spacing: -0.5px;
            color: var(--md-sys-color-on-surface);
          }

          .header-badge {
            font-size: 13px;
            font-weight: 600;
            padding: 6px 16px;
            background-color: var(--md-sys-color-primary-container);
            color: var(--md-sys-color-on-primary-container);
            border-radius: var(--md-shape-corner-full);
          }

          /* 网格容器 */
          .server-grid {
            max-width: 1400px;
            margin: 0 auto;
            display: grid;
            grid-template-columns: repeat(${servers.length == 1 ? "1" : "auto-fill"}, minmax(360px, 1fr));
            gap: 20px;
          }

          /* MD3 卡片主体 */
          .server-card {
            background-color: var(--md-sys-color-surface-container-lowest);
            border: 1px solid var(--md-sys-color-outline-variant);
            border-radius: var(--md-shape-corner-extra-large);
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            position: relative;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0,0,0,0.03);
            transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.2s cubic-bezier(0.2, 0, 0, 1);
          }

          .server-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(0,0,0,0.06);
          }

          .server-card.offline {
            background-color: var(--md-sys-color-surface-container-low);
            border-color: rgba(0, 0, 0, 0.05);
            opacity: 0.85;
          }

          /* 卡片头部信息 */
          .card-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
          }

          .server-info-main {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }

          .server-name {
            font-size: 18px;
            font-weight: 700;
            line-height: 1.3;
            color: var(--md-sys-color-on-surface);
          }

          .server-ip-container {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background-color: var(--md-sys-color-surface-container);
            padding: 3px 8px;
            border-radius: var(--md-shape-corner-small);
            width: fit-content;
            margin-top: 2px;
          }

          .server-ip {
            font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
            font-size: 12px;
            font-weight: 600;
            color: var(--md-sys-color-on-surface-variant);
          }

          .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 5px 12px;
            border-radius: var(--md-shape-corner-full);
            font-size: 12px;
            font-weight: 600;
            white-space: nowrap;
            flex-shrink: 0;
          }

          .status-badge.online {
            background-color: var(--md-sys-color-primary-container);
            color: var(--md-sys-color-on-primary-container);
          }

          .status-badge.offline {
            background-color: var(--md-sys-color-error-container);
            color: var(--md-sys-color-on-error-container);
          }

          .status-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background-color: currentColor;
          }

          /* 关键指标栏 (强调人数) */
          .metrics-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
          }

          .metric-version {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 13px;
            color: var(--md-sys-color-on-surface-variant);
            background-color: var(--md-sys-color-surface-container);
            padding: 8px 12px;
            border-radius: var(--md-shape-corner-medium);
          }

          .metric-version svg {
            width: 16px;
            height: 16px;
            fill: var(--md-sys-color-outline);
          }

          /* 人数核心高亮组件 */
          .metric-players-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 6px 14px;
            border-radius: var(--md-shape-corner-medium);
            background-color: var(--md-sys-color-primary-container);
            color: var(--md-sys-color-on-primary-container);
          }

          .metric-players-badge svg {
            width: 18px;
            height: 18px;
            fill: currentColor;
          }

          .metric-players-badge .players-count {
            font-size: 16px;
            font-weight: 800;
            letter-spacing: 1px;
            font-family: ui-monospace, SFMono-Regular, "Segoe UI", sans-serif;
          }

          /* MD3 细分隔线 */
          .divider {
            height: 1px;
            background-color: var(--md-sys-color-surface-container-high);
            border: none;
            margin: 0;
          }

          /* 玩家列表区域 */
          .players-section {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-top: auto;
          }

          .players-label {
            font-size: 11px;
            font-weight: 700;
            color: var(--md-sys-color-outline);
            text-transform: uppercase;
            letter-spacing: 1px;
          }

          .players-chips {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            max-height: 96px;
            overflow-y: auto;
          }

          .player-chip {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background-color: var(--md-sys-color-surface-container);
            border: 1px solid var(--md-sys-color-outline-variant);
            color: var(--md-sys-color-on-surface);
            font-size: 12px;
            font-weight: 500;
            padding: 3px 8px 3px 4px;
            border-radius: var(--md-shape-corner-small);
          }

          .player-avatar {
            width: 18px;
            height: 18px;
            border-radius: 4px;
            background-color: var(--md-sys-color-primary);
            color: var(--md-sys-color-on-primary);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            font-weight: 700;
          }

          /* 缺省/离线占位状态 */
          .empty-placeholder {
            font-size: 12px;
            color: var(--md-sys-color-outline);
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 0;
          }

          .empty-placeholder svg {
            width: 16px;
            height: 16px;
            fill: currentColor;
          }
        </style>
      </head>
      <body>

        <header class="header">
          <div class="header-title">服务器状态</div>
          <div class="header-badge" id="theme-indicator">${time}</div>
        </header>

        <main class="server-grid" id="server-grid">
          ${servers
            .map((srv) => {
              let playersHtml: string;
              if (!srv.list || srv.list.length === 0) {
                playersHtml = srv.motd
                  ? `<div class="empty-placeholder">
                ${srv.motd}
              </div>`
                  : `<div class="empty-placeholder">
                <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"/></svg>
                暂无在线玩家信息
              </div>`;
              } else {
                playersHtml =
                  `<div class="players-chips">` +
                  srv.list
                    .map(
                      (item) => `
                  <div class="player-chip">
                    <div class="player-avatar">${item.charAt(0).toUpperCase()}</div>
                    <span>${item}</span>
                  </div>
                `
                    )
                    .join("") +
                  `</div>`;
              }

              return `
              <div class="server-card ${srv.status}">
                <div class="card-header">
                  <div class="server-info-main">
                    <div class="server-name">${srv.name}</div>
                    <div class="server-ip-container">
                      <span class="server-ip">${srv.ip}</span>
                    </div>
                  </div>
                  <div class="status-badge ${srv.status}">
                    <span class="status-dot"></span>
                    <span>${srv.online}</span>
                  </div>
                </div>

                <!-- 强化后的指标栏 -->
                <div class="metrics-bar">
                  <div class="metric-version">
                    <svg viewBox="0 0 24 24"><path d="M12 2l-5.5 9h11L12 2zm0 3.84L13.93 9h-3.86L12 5.84zM17.5 13c-2.49 0-4.5 2.01-4.5 4.5s2.01 4.5 4.5 4.5 4.5-2.01 4.5-4.5-2.01-4.5-4.5-4.5zm0 7c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5zM3 21.5h8v-8H3v8zm2-6h4v4H5v-4z"/></svg>
                    <span>${srv.version}</span>
                  </div>

                  <!-- 核心高亮：在线人数 -->
                  <div class="metric-players-badge" title="当前在线玩家 / 最大容量">
                    <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
                    <span class="players-count">${srv.players}</span>
                  </div>
                </div>

                <div class="divider"></div>

                <div class="players-section">
                  <div class="players-label">${srv.list.length == 0 && srv.motd ? "服务器信息" : "在线玩家"}</div>
                  ${playersHtml}
                </div>
              </div>
            `;
            })
            .join("")}
        </main>
        <script>
          ${CX_JS}
        </script>
        </body>
        </html>`;
}

const CX_JS = `
(function generateMD3Palette() {
    // 每次刷新生成 0 - 360 的随机色相 (Hue)
    const hue = Math.floor(Math.random() * 360);

    const colors = {
      '--md-sys-color-primary': \`hsl(\${hue}, 60%, 38%)\`,
      '--md-sys-color-on-primary': '#ffffff',
      '--md-sys-color-primary-container': \`hsl(\${hue}, 70%, 90%)\`,
      '--md-sys-color-on-primary-container': \`hsl(\${hue}, 80%, 15%)\`,

      '--md-sys-color-surface': \`hsl(\${hue}, 15%, 98%)\`,
      '--md-sys-color-surface-container-lowest': \`hsl(\${hue}, 98%, 98%)\`,
      '--md-sys-color-surface-container-low': \`hsl(\${hue}, 16%, 96%)\`,
      '--md-sys-color-surface-container': \`hsl(\${hue}, 14%, 93%)\`,
      '--md-sys-color-surface-container-high': \`hsl(\${hue}, 14%, 89%)\`,
      '--md-sys-color-surface-container-highest': \`hsl(\${hue}, 14%, 85%)\`,

      '--md-sys-color-on-surface': \`hsl(\${hue}, 15%, 12%)\`,
      '--md-sys-color-on-surface-variant': \`hsl(\${hue}, 10%, 38%)\`,
      '--md-sys-color-outline': \`hsl(\${hue}, 10%, 60%)\`,
      '--md-sys-color-outline-variant': \`hsl(\${hue}, 15%, 85%)\`,

      '--md-sys-color-error': '#ba1a1a',
      '--md-sys-color-error-container': '#ffdad6',
      '--md-sys-color-on-error-container': '#410002'
    };

    const root = document.documentElement;
    for (const [property, val] of Object.entries(colors)) {
      root.style.setProperty(property, val);
    }
  })();
`;
