// koishi and plugin
import { Context, Session, h, Logger, Random } from "koishi";
import { Installer } from "@koishijs/plugin-market";
import Puppeteer from "koishi-plugin-puppeteer";
// node-async-bot-all
import * as fun from "./fun.ts";
import { botDataType, ConfigCxV3 } from "./config.ts";

// 类型声明
declare module "koishi" {
  // 上下文
  interface Context {
    installer: Installer;
    puppeteer: Puppeteer;
  }
}

// Uptime Kuma API
/** 单条心跳记录 */
interface Heartbeat {
  // 0 = down, 1 = up
  status: 0 | 1;
  // 时间字符串
  time: string;
  // 状态信息
  msg: string;
  // 延迟（ms），不可用时为 null
  ping: number | null;
}

/** 心跳列表：key 为 Monitor ID（字符串），value 为心跳数组 */
interface HeartbeatList {
  [monitorId: string]: Heartbeat[];
}

/** 在线率列表：key 格式如 "1_24"（MonitorID_小时数），value 为百分比 */
interface UptimeList {
  [periodKey: string]: number;
}

/** 接口整体返回结构 */
export interface MonitorStatusResponse {
  heartbeatList: HeartbeatList;
  uptimeList: UptimeList;
}

interface NewsResult {
  message: string;
  image?: Buffer;
}

// 指令处理类
export class CommandHandler {
  private ctx: Context;
  private session: Session;
  private log: Logger;
  private time: string;
  private readonly isQQ: boolean;

  constructor(ctx: Context, session: Session, loggerName: string) {
    this.ctx = ctx;
    this.session = session;
    this.log = ctx.logger(loggerName);
    this.time = fun.getHongKongTime();
    this.isQQ = session?.bot.adapterName == "qq";
    this.log.debug(
      `Got: {"form":"${session.platform}:${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`
    );
  }

  // 发送普通消息（自动判断 QQ markdown）
  private async sendMsg(msgKey: string, data: object): Promise<void> {
    await this.session?.send(
      this.isQQ
        ? h("qq:markdown", { content: this.session?.text(msgKey, data) })
        : this.session?.text(msgKey, data)
    );
  }

  // 发送失败消息
  private async sendFailed(data: object): Promise<void> {
    await this.sendMsg(this.isQQ ? "failed-md" : "failed", data);
  }

  // 指令 cx
  async server(): Promise<boolean> {
    const { ctx, session, log, time, isQQ } = this;
    const config = ctx.config.cxV3.find((item: ConfigCxV3) => item.id === session.event.guild?.id);
    if (!config) {
      const data = { time, error: session.text(".forbidden") };
      log.info("Sent:");
      log.info(data);
      await this.sendFailed(data);
      return false;
    }
    if (!config.server?.length) {
      const data = {
        time,
        error: session.text(".failed") + session.text("noApi")
      };
      log.warn("Sent:");
      log.warn(data);
      await this.sendFailed(data);
      return false;
    }

    const entries = await Promise.all(
      config.server.map(async ({ note, type, api }, index: number) => {
        const count = index + 1;
        if (type == "a2s") {
          const info = await fun.queryA2S(api, log);
          if (info.success) {
            const data = {
              count,
              players: info.players,
              version: info.version,
              list: info.bots,
              note: note ?? session.text("noop"),
              name: "A2S",
              ne: session.text(".ne-a2s")
            };
            log.debug(info);
            log.info(`Server ${count}:`);
            log.info(data);
            return session.text(isQQ ? ".list-md" : ".list", data);
          }

          const error = info.error.toString().includes("Timeout reached")
            ? session.text(".timeout")
            : session.text("unknown");
          const data = { count, data: error, note, name: "A2S" };
          log.error(`Server ${count}:`);
          log.error(data);
          return session.text(isQQ ? ".listFailed-md" : ".listFailed", data);
        }

        const separator = api.lastIndexOf(":");
        const host = separator === -1 ? api : api.slice(0, separator);
        const port = separator === -1 ? NaN : Number(api.slice(separator + 1));
        const serverInfo = await fun.slpInfo(log, host, port, ctx.config.timeout);
        if (serverInfo.success) {
          const data = {
            count,
            players: `${serverInfo.data.players.online}/${serverInfo.data.players.max}`,
            version: serverInfo.data.version.name,
            list: serverInfo.data.players.sample?.map((item) => item.name).join(", ") ?? "[]",
            note: note ?? session.text("noop"),
            ne: session.text(".ne-mc"),
            name: "MC"
          };
          log.debug(serverInfo);
          log.info(`Server ${count}:`);
          log.info(data);
          return session.text(isQQ ? ".list-md" : ".list", data);
        }

        let error = serverInfo.data;
        if (
          error.includes("connect ECONNREFUSED") ||
          error.includes("Server is offline or unreachable")
        ) {
          error = session.text(".close");
        } else if (error.includes("connect EHOSTUNREACH")) {
          error = session.text(".host");
        } else if (error.includes("connect ETIMEDOUT")) {
          error = session.text(".timeout");
        } else if (
          error.includes("Ping payload did not match received payload") ||
          error.includes("Expected server to send packet type")
        ) {
          error = session.text(".fewData");
        } else if (error.includes("getaddrinfo")) {
          error = session.text(".dns");
        }
        const data = { count, data: error, note, name: "MC" };
        log.error(`Server ${count}:`);
        log.error(data);
        return session.text(isQQ ? ".listFailed-md" : ".listFailed", data);
      })
    );

    await this.sendMsg(isQQ ? ".msg-md" : ".msg", {
      time,
      list: entries.map((entry) => `\n${entry}`).join("")
    });
    return true;
  }

  // 指令 Status
  async status(botData: botDataType): Promise<boolean> {
    const { ctx, session, log, time } = this;
    const vMsg = await fun.getSystemUsage();
    if (vMsg.success == 1) {
      log.error(vMsg);
      const data = {
        time,
        data: vMsg.data,
        error: session.text(".error"),
        quote: h.quote(session.messageId)
      };
      log.debug("Sent:");
      log.debug(data);
      await this.sendFailed(data);
      return false;
    }
    const msgCount = await fun.getMsgCount(ctx);
    const data = {
      time,
      name: vMsg.name,
      cpu: vMsg.cpu,
      memory: vMsg.memory,
      online: fun.formatTimestampDiff(
        Number(botData.uptime),
        Number(session.event.timestamp.toString().substring(0, 10))
      ),
      msgCount: `${msgCount.receive}/${msgCount.send}`,
      version: botData.version,
      koishiVersion: botData.koishiVersion,
      implName: botData.impl.impl_name,
      implVersion: botData.impl.impl_version,
      qqProtocolType: botData.impl.qq_protocol_type,
      qqProtocolVersion: botData.impl.qq_protocol_version
    };
    log.debug("Sent:");
    log.debug(data);
    await this.sendMsg(this.isQQ ? ".msg-md" : ".msg", data);
    return true;
  }

  // 指令 Random
  async random(min?: number, max?: number): Promise<boolean> {
    const { log, time } = this;
    if (min == undefined || max == undefined) {
      min = min ?? 0;
      max = 10000;
    }
    min = Math.ceil(min);
    max = Math.floor(max);
    const data = {
      time,
      data: new Random(() => Math.random()).int(min, max) + `（${min},${max}）`
    };
    log.debug("Sent:");
    log.debug(data);
    await this.sendMsg(this.isQQ ? ".msg-md" : ".msg", data);
    return true;
  }

  // 指令 Info
  async info(botData: botDataType): Promise<boolean> {
    const { log, time } = this;
    const data = {
      time,
      nodeVersion: botData.nodeVersion,
      koishiVersion: botData.koishiVersion,
      implName: botData.impl.impl_name,
      implVersion: botData.impl.impl_version,
      qqProtocolType: botData.impl.qq_protocol_type,
      qqProtocolVersion: botData.impl.qq_protocol_version,
      version: botData.version
    };
    log.debug("Sent:");
    log.debug(data);
    await this.sendMsg(this.isQQ ? ".msg-md" : ".msg", data);
    return true;
  }

  // 指令 centerServerTest
  async centerServerTest(): Promise<boolean> {
    const { ctx, session, log, time } = this;
    let list: string = "";
    const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
    const response = await fun.request<MonitorStatusResponse, { data: string }>(
      "https://status.scpslgame.com/api/status-page/heartbeat/nw",
      ctx,
      { method: "GET", timeout: ctx.config.timeout },
      log
    );
    if (response.success) {
      log.debug(response.data);
      for (const server of ctx.config.slTest) {
        const lastTime = response.data.heartbeatList[server.id].at(-1);
        if (lastTime) {
          const uptime24 = (response.data.uptimeList[server.id + "_24"] * 100).toFixed(2) + "%";
          const status =
            lastTime?.status == 1 ? session.text(".statusLive") : session.text(".statusDie");
          const testTime = timeFormatter.format(new Date(lastTime?.time.replace(" ", "T") + "Z"));
          list =
            list +
            "\n" +
            session.text(this.isQQ ? ".list-md" : ".list", {
              name: server.name,
              status: status,
              uptime: uptime24,
              time: testTime
            });
        } else {
          list =
            list +
            "\n" +
            session.text(this.isQQ ? ".listFailed-md" : ".listFailed", {
              name: server.name,
              data: session.text(".dataFail")
            });
        }
      }
      const data = { list, time };
      await this.sendMsg(this.isQQ ? ".msg-md" : ".msg", data);
      log.debug("Sent:");
      log.debug(data);
      return true;
    } else {
      let err: string;
      if (!response.isError && response.isObj) {
        err = response.error.data;
      } else if (response.isError) {
        err = response.error.message;
      } else {
        err = response.error;
      }
      const data = { error: "查看失败：" + err, time };
      await this.sendFailed(data);
      log.warn("Sent:");
      log.warn(data);
      return false;
    }
  }

  static async handleCatMessage(
    session: Session,
    botData: botDataType
  ): Promise<void> {
    const match = session.content?.match(/^#([a-zA-Z0-9]+)cat$/);
    if (!match) return;

    const system = await fun.getSystemUsage();
    await session.send(
      session.text("cat", {
        name: match[1].charAt(0).toUpperCase() + match[1].slice(1),
        time: fun.formatTimestampDiff(
          Number(botData.uptime),
          Number(session.event.timestamp.toString().substring(0, 10))
        ),
        version: botData.version,
        platform: system.success == 1 ? "未知" : system.name,
        koishiVersion: botData.koishiVersion,
        implName: botData.impl.impl_name,
        implVersion: botData.impl.impl_version,
        qqProtocolType: botData.impl.qq_protocol_type,
        qqProtocolVersion: botData.impl.qq_protocol_version
      })
    );
  }

  static async sendNews(ctx: Context, session: Session): Promise<void> {
    const results = await this.getNews(ctx, true);
    for (const result of results) {
      await session.send(
        result.image ? `${result.message}\n${h.image(result.image, "image/png")}` : result.message
      );
    }
  }

  static async broadcastNews(ctx: Context): Promise<void> {
    const results = await this.getNews(ctx, false);
    for (const result of results) {
      if (!result.image) continue;
      await ctx.broadcast(
        ctx.config.steamNews,
        `${result.message}\n${h.image(result.image, "image/png")}`
      );
    }
  }

  // 定时任务 SL News（静态方法，无 session）
  private static async getNews(ctx: Context, manual: boolean): Promise<NewsResult[]> {
    const log = ctx.logger("getNewsMsg");
    const results: NewsResult[] = [];
    const latestIds: string[] = [];
    const storedIds = (await ctx.database.get("botData", "newsId"))[0]?.data?.split(",") ?? [];

    for (const item of ctx.config.newsAPI) {
      const rssUrl = `https://store.steampowered.com/feeds/news/app/${item.appUrl}`;
      log.info(`获取新闻: ${item.name} -> ${rssUrl}`);

      const response = await fun.request<string>(
        rssUrl,
        ctx,
        { method: "GET", timeout: ctx.config.timeout },
        log
      );
      if (!response.success) {
        log.error(`请求失败: ${item.name}`);
        results.push({ message: `请求 ${item.name} 新闻失败` });
        continue;
      }

      const parsed = await fun.parseNewsRssToHtml(response.data, log);
      if (parsed.error || !parsed.guid) {
        log.error(`解析失败: ${item.name}`, parsed.error);
        results.push({ message: `解析 ${item.name} 新闻失败` });
        continue;
      }
      latestIds.push(parsed.guid);

      // 检查是否为最新新闻（非手动调用时）
      if (storedIds.includes(parsed.guid) && !manual) {
        log.debug(`无新闻更新: ${item.name}`);
        continue;
      }

      // 获取或渲染 HTML
      const db = await ctx.database.get("botData", parsed.guid);
      let html: string;
      if (db[0]) {
        html = db[0].data;
      } else {
        html = parsed.data!;
        await ctx.database.upsert("botData", [{ id: parsed.guid, data: html }]);
      }

      // Puppeteer 渲染图片
      const page = await ctx.puppeteer.page();
      try {
        await page.setViewport({
          width: 800,
          height: 800,
          deviceScaleFactor: 2
        });
        await page.setContent(html, {
          timeout: ctx.config.htmlTimeout,
          waitUntil: "networkidle0"
        });
        const { width, height } = await page.evaluate(() => ({
          width: document.body.scrollWidth,
          height: document.body.scrollHeight
        }));
        await page.setViewport({ width, height, deviceScaleFactor: 2 });
        const image = await page.screenshot({
          type: "png",
          fullPage: true,
          omitBackground: true
        });
        results.push({
          image,
          message: `抓取到了新的 Steam 新闻！${item.name} - ${parsed.guid}`
        });
      } catch (err) {
        log.error(`${item.name} 图片渲染失败:`, err);
        results.push({ message: `${item.name} 图片渲染失败` });
      } finally {
        if (page && !page.isClosed()) await page.close();
      }
    }

    // 更新最新新闻 ID
    if (!manual && latestIds.length > 0) {
      await ctx.database.upsert("botData", [{ id: "newsId", data: latestIds.join(",") }]);
    }

    return results;
  }
}
