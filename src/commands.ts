// koishi and plugin
import { Context, Session, h, sleep, Logger } from "koishi";
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

// 猫猫图 API
interface APICat {
  [index: number]: {
    id: string;
    url: string;
    width: number;
    height: number;
  };
}

// 随机文本 API
interface APIRandomWord {
  data: string;
  success: boolean;
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
  async server(): Promise<number> {
    const { ctx, session, log, time, isQQ } = this;
    let msg: object;
    const index = ctx.config.cxV3.findIndex(
      (item: ConfigCxV3) => item.id === session.event.guild?.id
    );
    if (index !== -1) {
      const server = ctx.config.cxV3[index].server;
      if (server == undefined) {
        msg = {
          time: time,
          error: session.text(".failed") + session.text("noApi"),
          success: 2
        };
        log.warn("Sent:");
        log.warn(msg);
        await this.sendFailed(msg);
        return 1;
      }
      let count = 0;
      let list = "";
      for (const item of server) {
        const note = item.note;
        const type = item.type;
        const api = item.api;
        count++;
        if (type == "a2s") {
          const info = await fun.queryA2S(api, log);
          if (info.success) {
            log.debug(info);
            const temp = {
              count: count,
              players: info.players,
              version: info.version,
              list: info.bots,
              note: note ?? session.text("noop"),
              name: "A2S",
              ne: session.text(".ne-a2s")
            };
            log.info(`Server ${count}:`);
            log.info(temp);
            list = list + "\n" + session.text(isQQ ? ".list-md" : ".list", temp);
          } else {
            let err: string;
            if (
              info.error
                .toString()
                .includes(
                  "Timeout reached. Possible reasons: You are being rate limited; Timeout too short; Wrong server host configured"
                )
            ) {
              err = session.text(".timeout");
            } else {
              err = session.text("unknown");
            }
            const temp = {
              count: count,
              data: err,
              note: note,
              name: "A2S"
            };
            log.error(`Server ${count}:`);
            log.error(temp);
            list = list + "\n" + session.text(isQQ ? ".listFailed-md" : ".listFailed", temp);
          }
        } else {
          const host = api.split(":");
          const serverInfo = await fun.slpInfo(log, host[0], Number(host[1]), ctx.config.timeout);
          if (serverInfo.success) {
            log.debug(serverInfo);
            if (serverInfo.data.players.sample == null) {
              const temp = {
                count: count,
                players: serverInfo.data.players.online + "/" + serverInfo.data.players.max,
                version: serverInfo.data.version.name,
                note: note ?? session.text("noop"),
                ne: session.text(".ne-mc"),
                list: "[]",
                name: "MC"
              };
              log.info(`Server ${count}:`);
              log.info(temp);
              list = list + "\n" + session.text(isQQ ? ".list-md" : ".list", temp);
            } else {
              const temp = {
                count: count,
                players: serverInfo.data.players.online + "/" + serverInfo.data.players.max,
                version: serverInfo.data.version.name,
                list: serverInfo.data.players.sample.map((item) => item.name).join(", "),
                note: note ?? session.text("noop"),
                ne: session.text(".ne-mc"),
                name: "MC"
              };
              log.info(`Server ${count}:`);
              log.info(temp);
              list = list + "\n" + session.text(isQQ ? ".list-md" : ".list", temp);
            }
          } else {
            let err = serverInfo.data;
            if (
              err.includes("connect ECONNREFUSED") ||
              err.includes("Server is offline or unreachable")
            ) {
              err = session.text(".close");
            } else if (err.includes("connect EHOSTUNREACH")) {
              err = session.text(".host");
            } else if (err.includes("connect ETIMEDOUT")) {
              err = session.text(".timeout");
            } else if (err.includes("Ping payload did not match received payload")) {
              err = session.text(".fewData");
            } else if (err.includes("Expected server to send packet type")) {
              err = session.text(".fewData");
            } else if (err.includes("getaddrinfo")) {
              err = session.text(".dns");
            }
            const temp = {
              count: count,
              data: err,
              note: note,
              name: "MC"
            };
            log.error(`Server ${count}:`);
            log.error(temp);
            list = list + "\n" + session.text(isQQ ? ".listFailed-md" : ".listFailed", temp);
          }
        }
      }
      msg = {
        time: time,
        list: list,
        success: 0
      };
      await this.sendMsg(isQQ ? ".msg-md" : ".msg", msg);
      return 0;
    } else {
      msg = {
        time: time,
        error: session.text(".forbidden"),
        success: 1
      };
      log.info("Sent:");
      log.info(msg);
      await this.sendFailed(msg);
      return 1;
    }
  }

  // 指令 Status
  async status(botData: botDataType): Promise<object> {
    const { ctx, session, log, time } = this;
    let msg: object;
    const vMsg = await fun.getSystemUsage();
    if (vMsg.success == 1) {
      log.error(vMsg);
      msg = {
        time: time,
        data: vMsg.data,
        error: session.text(".error"),
        quote: h.quote(session.messageId),
        success: 1
      };
    } else {
      const msgCount = await fun.getMsgCount(ctx);
      msg = {
        time: time,
        name: vMsg.name,
        cpu: vMsg.cpu,
        memory: vMsg.memory,
        online: fun.formatTimestampDiff(
          Number((await ctx.database.get("botData", "uptime"))[0].data),
          Number(session.event.timestamp.toString().substring(0, 10))
        ),
        msgCount: `${msgCount.receive}/${msgCount.send}`,
        version: botData.version,
        success: 0
      };
    }
    log.debug("Sent:");
    log.debug(msg);
    return msg;
  }

  // 指令 Random
  async random(min: number, max: number): Promise<object> {
    const { log, time } = this;
    let msg: object;
    let data: string;
    if (min == undefined || max == undefined) {
      min = 0;
      max = 10000;
    }
    min = Math.ceil(min);
    max = Math.floor(max);
    data = Math.floor(Math.random() * (max - min + 1)) + min + `（${min},${max}）`;
    msg = {
      time: time,
      data: data,
      success: 0
    };
    log.debug("Sent:");
    log.debug(msg);
    return msg;
  }

  // 指令 Info
  async info(botData: botDataType): Promise<object> {
    const { ctx, session, log, time } = this;
    let msg: object;
    let data = await fun.readInfo(ctx);
    if (typeof data == "string") {
      log.error("Error:", data);
      msg = {
        time: time,
        data: data,
        error: session.text(".error"),
        quote: h.quote(session.messageId),
        success: 1
      };
    } else {
      msg = {
        time: time,
        ...data,
        version: botData.version,
        success: 0
      };
    }
    log.debug("Sent:");
    log.debug(msg);
    return msg;
  }

  // 指令 RW
  async randomWord(): Promise<object> {
    const { ctx, session, log, time } = this;
    let msg: object;
    if (ctx.config.rwAPI == undefined) {
      msg = {
        time: time,
        error: session.text("noApi"),
        quote: h.quote(session.messageId),
        success: 2
      };
      log.warn("Sent:");
      log.warn(msg);
      return msg;
    }
    const response = await fun.request<APIRandomWord>(
      ctx.config.rwAPI + "?format=json",
      ctx,
      { method: "GET", timeout: ctx.config.timeout },
      log
    );
    if (response.success) {
      log.debug(response.data);
      msg = {
        time: time,
        error: response.data.data,
        quote: h.quote(session.messageId),
        success: 0
      };
      log.debug("Sent:");
      log.debug(msg);
    } else {
      let err: string;
      if (!response.isError && response.isObj) {
        err = response.error["data"];
      } else if (response.isError) {
        err = response.error.message;
      } else {
        err = response.error;
      }
      msg = {
        time: time,
        error: err,
        quote: h.quote(session.messageId),
        success: 1
      };
      log.warn("Sent:");
      log.warn(msg);
    }
    return msg;
  }

  // 指令 BA
  async blueArchive(): Promise<number> {
    const { ctx, session, log } = this;
    if (ctx.config.baAPI == undefined) {
      await session.send(
        session.text(".msg", { quote: h.quote(session.messageId), image: session.text("noApi") })
      );
      return 1;
    }
    const ms = fun.random(0, 0, 1500);
    const link: string =
      fun.random(2, ctx.config.baAPI) + `?cacheBuster=${fun.random(1, 1, 2147483647)}`;
    log.debug(`Link: ${link}`);
    await sleep(ms);
    const status = await session.send(
      session.text(".msg", { quote: h.quote(session.messageId), image: h.image(link) })
    );
    if (!status)
      await session.send(
        session.text(".msg", { quote: h.quote(session.messageId), image: h.image(link) })
      );
    return 0;
  }

  // 指令 centerServerTest
  async centerServerTest(): Promise<number> {
    const { ctx, session, log, time } = this;
    let msg: { success: string; data: object };
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
    const response = await fun.request<MonitorStatusResponse>(
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
      msg = {
        data: { list: list, time: time },
        success: ".msg"
      };
      await this.sendMsg(".msg", msg.data);
      log.debug("Sent:");
      log.debug(msg);
      return 0;
    } else {
      let err: string;
      if (!response.isError && response.isObj) {
        err = response.error["data"];
      } else if (response.isError) {
        err = response.error.message;
      } else {
        err = response.error;
      }
      msg = {
        data: { error: "查看失败：" + err, time: time },
        success: ".failed"
      };
      await this.sendFailed(msg.data);
      log.warn("Sent:");
      log.warn(msg);
      return 1;
    }
  }

  // 指令 Cat
  async cat(): Promise<number> {
    const { ctx, session, log, time } = this;
    if (ctx.config.catAPI == undefined) {
      await session.send(
        session.text(".failed", {
          quote: h.quote(session.messageId),
          data: session.text("noApi"),
          time: time
        })
      );
      log.warn("未指定 API");
      return 1;
    }
    const response = await fun.request<APICat>(
      ctx.config.catAPI,
      ctx,
      { method: "GET", timeout: ctx.config.timeout },
      log
    );
    if (response.success) {
      log.debug(response.data);
      const msg = { quote: h.quote(session.messageId), image: h.image(response.data[0].url) };
      await session.send(session.text(".msg", msg));
      log.debug("Sent:");
      log.debug(response.data[0].url);
    } else {
      if (!response.isError) {
        const msg = {
          quote: h.quote(session.messageId),
          data: response.isObj
            ? "获取失败：" + response.error["error"]
            : "获取失败：" + response.error,
          time: time
        };
        await this.sendFailed(msg);
        log.warn("Sent:");
        log.warn(response.error);
      } else {
        const msg = {
          quote: h.quote(session.messageId),
          data: "获取失败：" + response.error?.message,
          time: time
        };
        await this.sendFailed(msg);
        log.warn("Sent:");
        log.warn(response.error);
      }
    }
    return 0;
  }

  // 定时任务 SL News（静态方法，无 session）
  static async getNewsMsg(
    ctx: Context,
    type: number
  ): Promise<{ success: boolean; data?: Buffer; msg: string }[]> {
    const log = ctx.logger("getNewsMsg");
    const results: { success: boolean; data?: Buffer; msg: string }[] = [];
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
        results.push({ success: false, msg: `请求 ${item.name} 新闻失败` });
        continue;
      }

      const parsed = await fun.parseNewsRssToHtml(response.data, log);
      if (parsed.error || !parsed.guid) {
        log.error(`解析失败: ${item.name}`, parsed.error);
        results.push({ success: false, msg: `解析 ${item.name} 新闻失败` });
        continue;
      }
      latestIds.push(parsed.guid);

      // 检查是否为最新新闻（非手动调用时）
      if (storedIds.includes(parsed.guid) && type != 1) {
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
          success: true,
          data: image,
          msg: `抓取到了新的 Steam 新闻！${item.name} - ${parsed.guid}`
        });
      } catch (err) {
        log.error(`${item.name} 图片渲染失败:`, err);
        results.push({ success: false, msg: `${item.name} 图片渲染失败` });
      } finally {
        if (page && !page.isClosed()) await page.close();
      }
    }

    // 更新最新新闻 ID
    if (type == 0 && latestIds.length > 0) {
      await ctx.database.upsert("botData", [{ id: "newsId", data: latestIds.join(",") }]);
    }

    return results;
  }
}
