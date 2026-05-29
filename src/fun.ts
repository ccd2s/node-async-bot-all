// node
import os from "os";
import fs from "fs";
import path from "path";
// koishi and plugin
import { Context, FlatPick, Random, Time, sleep, HTTP, Logger } from "koishi";
import Analytics from "@koishijs/plugin-analytics";
// steam-server-query ^1.1.3
import { queryGameServerInfo } from "steam-server-query";
// feedsmith ^2.9.4
import { parseRssFeed } from "feedsmith";
// minecraft-server-util ^5.4.4
import { JavaStatusResponse, status } from "minecraft-server-util";

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
      success: true;
    }
  | { success: false; error: any };

// 获取系统名称
function getSystemName(): string {
  return os.type() + " " + os.release();
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
): Promise<{ version: string; koishiVersion: string; nodeVersion: string } | string> {
  try {
    const deps = await ctx.installer.getDeps();
    return {
      version: (await ctx.database.get("botData", "version"))[0].data,
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
export async function getMsgCount(ctx: Context): Promise<object> {
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

/** Random
 * @param type
 * 0:int 1:real 2:pick
 * @param data
 * @param data2
 */
export function random(type: number = 0, data: number | number[], data2?: number): number {
  const random = new Random(() => Math.random());
  switch (type) {
    case 0:
      if (typeof data != "number" || data2 == undefined) return 0;
      return random.int(data, data2);
    case 1:
      if (typeof data != "number" || data2 == undefined) return 0;
      return random.real(data, data2);
    case 2:
      if (typeof data != "object") return 0;
      return random.pick(data);
    default:
      return 0;
  }
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
    log?.info("Server Info:", playerResponse);
    return {
      players: playerResponse.players + "/" + playerResponse.maxPlayers,
      protocol: playerResponse.protocol,
      version: playerResponse.version,
      bots: playerResponse.bots,
      port: playerResponse.port as number,
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
): Promise<{ success: true; data: JavaStatusResponse } | { success: false; data: string }> {
  try {
    // ping
    const info = await status(host, port, { timeout: timeout as number });
    log.info(info);
    // 成功
    return {
      success: true,
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
