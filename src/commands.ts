// koishi and plugin
import { Context, Session, h, sleep } from 'koishi';
import { Installer } from "@koishijs/plugin-market";
import Puppeteer from 'koishi-plugin-puppeteer';
// node-async-bot-all
import * as fun from './fun.ts';
import { ConfigCxV3 } from "./index.ts";

// 类型声明
declare module 'koishi' {
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

// Steam 新闻 API
export interface APINews {
  appnews: AppNews;
}

interface AppNews {
  appid: number;
  newsitems: NewsItem[];
  count: number;
}

interface NewsItem {
  gid: string;
  title: string;
  url: string;
  is_external_url: boolean;
  author: string;
  contents: string;
  feedlabel: string;
  // 时间戳(秒)
  date: number;
  feedname: string;
  feed_type: number;
  appid: number;
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

// 指令 cx
export async function getServer(ctx: Context, session: Session):Promise<number> {
  // logger
  const log = ctx.logger('cx');
  log.debug(`Got: {"form":"${session.platform}:${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
  // 设立必要变量
  let msg : object;
  // 获取香港时区当前时间
  const time = fun.getHongKongTime();
  const index = ctx.config.cxV3.findIndex((item:ConfigCxV3) => item.id === session.event.guild?.id);
  if (index !== -1){
    const server = ctx.config.cxV3[index].server
    if (server==undefined){
      // 未指定查询 API
      msg = {
        "time": time,
        "error": "查询失败："+session.text("noApi"),
        "success": 2
      };
      log.warn("Sent:");
      log.warn(msg);
      await session?.send(session?.bot.adapterName == "qq" ? h("qq:markdown", {
        content: session?.text('failed-md', msg)
      }) : session?.text('failed', msg));
      return 1;
    }
    // 设立必要变量
    let count = 0;
    let list = "";
    for (const item of server) {
      // 设立必要变量
      const note = item.note;
      const type = item.type;
      const api = item.api;
      count++;
      // 类型判断
      if (type == "a2s"){
        // a2s 服务器
        const info = await fun.queryA2S(api, log);
        if (info.success){
          log.debug(info);
          // 成功
          const temp = {
            "count": count,
            "players": info.players,
            "version": info.version,
            "list": info.bots,
            "note": note ?? session.text("noop"),
            "name": "A2S",
            "ne": "机器人"
          };
          log.info(`Server ${count}:`);
          log.info(temp);
          list = list+"\n"+session.text(session?.bot.adapterName == "qq" ? '.list-md' : '.list',temp);
        } else {
          // 失败
          let err:string;
          if ((info.error).toString().includes("Timeout reached. Possible reasons: You are being rate limited; Timeout too short; Wrong server host configured")){
            err = session.text(".timeout");
          } else {
            err = session.text("unknown");
          }
          const temp = {
            "count": count,
            "data": err,
            "note": note,
            "name": "A2S"
          };
          log.error(`Server ${count}:`);
          log.error(temp);
          list = list+"\n"+session.text(session?.bot.adapterName == "qq" ? '.listFailed-md' : '.listFailed',temp);
        }
      } else {
        // 默认 mc 服务器，请求
        const host = api.split(":");
        const serverInfo = await fun.slpInfo(log, host[0], Number(host[1]), ctx.config.timeout);
        if (serverInfo.success) {
          log.debug(serverInfo);
          // 成功
          if (serverInfo.data.players.sample==null) {
            // 无玩家
            const temp = {
              "count": count,
              "players": serverInfo.data.players.online + "/" + serverInfo.data.players.max,
              "version": serverInfo.data.version.name,
              "note": note ?? session.text("noop"),
              "ne": "玩家列表",
              "list": "[]",
              "name": "MC"
            };
            log.info(`Server ${count}:`);
            log.info(temp);
            list = list+"\n"+session.text(session?.bot.adapterName == "qq" ? '.list-md' : '.list',temp);
          }
          else {
            // 有玩家
            const temp = {
              "count": count,
              "players": serverInfo.data.players.online + "/" + serverInfo.data.players.max,
              "version": serverInfo.data.version.name,
              "list": serverInfo.data.players.sample
                .map(item => item.name)
                .join(', '),
              "note": note ?? session.text("noop"),
              "ne": "玩家列表",
              "name": "MC"
            };
            log.info(`Server ${count}:`);
            log.info(temp);
            list = list+"\n"+session.text(session?.bot.adapterName == "qq" ? '.list-md' : '.list',temp);
          }
        } else {
          // 失败
          let err = serverInfo.data;
          // 服务器关闭
          if (err.includes("connect ECONNREFUSED") || err.includes("Server is offline or unreachable")) {
            err = session.text('.close');
          } else if (err.includes("connect EHOSTUNREACH")) {
            err = session.text('.host');
          } else if (err.includes("connect ETIMEDOUT")) {
            err = session.text('.timeout');
          } else if (err.includes("Ping payload did not match received payload")) {
            err = session.text('.fewData');
          } else if (err.includes("Expected server to send packet type")) {
            err = session.text('.fewData');
          } else if (err.includes("getaddrinfo")) {
            err = session.text('.dns');
          }
          const temp = {
            "count": count,
            "data": err,
            "note": note,
            "name": "MC"
          };
          log.error(`Server ${count}:`);
          log.error(temp);
          list = list+"\n"+session.text(session?.bot.adapterName == "qq" ? '.listFailed-md' : '.listFailed',temp);
        }
      }
    }
    msg = {
      "time": time,
      "list": list,
      "success": 0
    };
    await session?.send(session?.bot.adapterName == "qq" ? h("qq:markdown", {
      content: session?.text('.msg-md', msg)
    }) : session?.text('.msg', msg));
    return 0;
  }
  else {
    // 群聊不在白名单中，发送消息
    msg = {
      "time": time,
      "error": "此指令不允许在本群使用。",
      "success": 1
    };
    log.info("Sent:");
    log.info(msg);
    await session?.send(session?.bot.adapterName == "qq" ? h("qq:markdown", {
      content: session?.text('failed-md', msg)
    }) : session?.text('failed', msg));
    return 1;
  }
}

// 指令 Status
export async function getStatus(ctx: Context, session: Session):Promise<Object> {
  // logger
  const log = ctx.logger('status');
  log.debug(`Got: {"form":"${session.platform}:${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
  // 设立必要变量
  const time = fun.getHongKongTime();
  let msg: object;
  const vMsg = await fun.getSystemUsage();
  // 判断是否读取失败
  if (vMsg["success"]==1){
    log.error(vMsg);
    msg = {
      "time" : time,
      "data" : vMsg["data"],
      "error" : "状态获取失败。",
      "quote" : h.quote(session.messageId),
      "success" : 1
    };
  } else {
    const msgCount= await fun.getMsgCount(ctx);
    msg = {
      "time" : time,
      "name": vMsg["name"],
      "cpu": vMsg["cpu"],
      "memory": vMsg["memory"],
      "online":
        fun.formatTimestampDiff(
          Number((await ctx.database.get("botData", "uptime"))[0].data),
          Number((session.event.timestamp).toString().substring(0, 10))
        ),
      "msgCount": `${msgCount['receive']}/${msgCount['send']}`,
      "version": (await ctx.database.get("botData", "version"))[0].data,
      "success" : 0
    };
  }
  log.debug("Sent:");
  log.debug(msg);
  return msg;
}

// 指令 Random
export async function getRandom(ctx: Context, session: Session, min: number, max: number):Promise<Object> {
  // logger
  const log = ctx.logger('random');
  log.debug(`Got: {"form":"${session.platform}:${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
  // 设立必要变量
  const time = fun.getHongKongTime();
  let msg: object;
  let data: string;
  // 判断参数是否为空
  if (min==undefined || max==undefined) {
    min=0
    max=10000
  }
  // 生成随机数
  min = Math.ceil(min);
  max = Math.floor(max);
  data = (Math.floor(Math.random() * (max - min + 1)) + min)+`（${min},${max}）`;
  msg = {
    "time" : time,
    "data" : data,
    "success" : 0
  }
  log.debug("Sent:");
  log.debug(msg);
  return msg;
}

// 指令 Info
export async function getInfo(ctx: Context, session: Session):Promise<Object> {
  // logger
  const log = ctx.logger('info');
  log.debug(`Got: {"form":"${session.platform}:${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
  // 设立必要变量
  const time = fun.getHongKongTime();
  let msg: object;
  let data = await fun.readInfo(ctx);
  // 判断是否读取成功
  if (typeof data == "string"){
    log.error("Error:", data);
    msg = {
      "time" : time,
      "data" : data,
      "error" : "读取信息失败。",
      "quote" : h.quote(session.messageId),
      "success" : 1
    };
  } else {
    msg = {
      "time" : time,
      ...data,
      "success" : 0
    };
  }
  log.debug("Sent:");
  log.debug(msg);
  return msg;
}

// 指令 RW
export async function getRandomWord(ctx: Context, session: Session):Promise<Object> {
  // logger
  const log = ctx.logger('rw');
  log.debug(`Got: {"form":"${session.platform}:${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
  // 设立必要变量
  let msg: object;
  // 获取香港时区当前时间
  const time = fun.getHongKongTime();
  if (ctx.config.rwAPI==undefined){
    // 未指定 API
    msg = {
      "time": time,
      "error": session.text("noApi"),
      "quote" : h.quote(session.messageId),
      "success": 2
    };
    log.warn("Sent:");
    log.warn(msg);
    return msg;
  }
  // 发送请求
  const response = await fun.request<APIRandomWord>(ctx.config.rwAPI+"?format=json", {}, ctx.config.timeout, log);
  if (response.success) {
    log.debug(response.data);
    // 发送消息
    msg = {
      "time" : time,
      "error" : response.data.data,
      "quote" : h.quote(session.messageId),
      "success" : 0
    };
    log.debug("Sent:");
    log.debug(msg);
  } else {
    let err: string;
    if (response.code) {
      err = (response.isJson) ? response.error['data'] : response.error;
    }
    else {
      err = response.error.message;
    }
    msg = {
      "time" : time,
      "error" : err,
      "quote" : h.quote(session.messageId),
      "success" : 1
    };
    log.warn("Sent:");
    log.warn(msg);
  }
  return msg;
}

// 指令 BA
export async function getBlueArchive(ctx: Context, session: Session):Promise<Number> {
  // 日志
  const log = ctx.logger('ba');
  log.debug(`Got: {"form":"${session.platform}:${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
  if (ctx.config.baAPI==undefined){
    // 未指定 API
    await session.send(session.text(".msg", {"quote" : h.quote(session.messageId), "image" : session.text("noApi")}));
    return 1;
  }
  const ms = fun.random(0,0, 1500);
  const link: string = (fun.random(2,ctx.config.baAPI)) + `?cacheBuster=${fun.random(1,1,2147483647)}`;
  log.debug(`Link: ${link}`);
  // 等待防止阈值限制
  await sleep(ms);
  const status = await session.send(session.text(".msg", {"quote" : h.quote(session.messageId), "image" : h.image(link)}));
  if (!status) await session.send(session.text(".msg", {"quote" : h.quote(session.messageId), "image" : h.image(link)}));
  return 0;
}

/**
 * 指令 centerServerTest
 * */
export async function centerServerTest(ctx: Context, session: Session):Promise<number> {
  // 日志
  const log = ctx.logger('centerServerTest');
  log.debug(`Got: {"form":"${session.platform}:${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
  // 获取香港时区当前时间
  const time = fun.getHongKongTime();
  let msg: { success: string, data: object };
  let list: string = "";
  const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  // 发送请求
  const response = await fun.request<MonitorStatusResponse>("https://status.scpslgame.com/api/status-page/heartbeat/nw", {}, ctx.config.timeout, log);
  if (response.success) {
    log.debug(response.data);
    for (const server of ctx.config.slTest) {
      const lastTime = response.data.heartbeatList[server.id].at(-1);
      if (lastTime) {
        const uptime24 = (response.data.uptimeList[server.id+"_24"] * 100).toFixed(2) + '%';
        const status = (lastTime?.status==1) ? session.text(".statusLive") : session.text(".statusDie")
        const testTime = timeFormatter.format(new Date(lastTime?.time.replace(' ', 'T') + 'Z'))
        list = list+"\n"+session.text(session?.bot.adapterName == "qq" ? ".list-md" :".list", {
          "name": server.name,
          "status": status,
          "uptime": uptime24,
          "time": testTime
        });
      } else {
        list = list+"\n"+session.text(session?.bot.adapterName == "qq" ? ".listFailed-md" : ".listFailed", {
          "name": server.name,
          "data": session.text(".dataFail")
        });
      }
    }
    msg = {
      "data" : {"list" : list, "time" : time},
      "success" : '.msg'
    }
    await session?.send(session?.bot.adapterName == "qq" ? h("qq:markdown", {
      content: session?.text('.msg-md', msg.data)
    }) : session?.text('.msg', msg.data));
    log.debug("Sent:");
    log.debug(msg);
    return 0;
  } else {
    let err: string;
    if (response.code) {
      err = (response.isJson) ? response.error['data'] : response.error;
    }
    else {
      err = response.error.message;
    }
    msg = {
      "data" : {"error":"查看失败："+err, "time" : time},
      "success" : '.failed'
    };
    await session?.send(session?.bot.adapterName == "qq" ? h("qq:markdown", {
      content: session?.text('failed-md', msg.data)
    }) : session?.text('failed', msg.data));
    log.warn("Sent:");
    log.warn(msg);
    return 1;
  }
}

// 指令 Cat
export async function getCat(ctx: Context, session: Session):Promise<Number> {
  // 日志
  const log = ctx.logger('cat');
  log.debug(`Got: {"form":"${session.platform}:${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
  // 获取香港时区当前时间
  const time = fun.getHongKongTime();
  if (ctx.config.catAPI==undefined){
    // 未指定 API
    await session.send(session.text(".failed", {"quote" : h.quote(session.messageId), "data" : "未指定 API", "time": time}));
    log.warn("未指定 API");
    return 1;
  }
  // 发送请求
  const response = await fun.request<APICat>(ctx.config.catAPI, {}, ctx.config.timeout, log);
  if (response.success) {
    log.debug(response.data);
    const msg = {"quote": h.quote(session.messageId), "image": h.image(response.data[0].url)};
    await session.send(session.text(".msg", msg));
    log.debug("Sent:");
    log.debug(response.data[0].url);
  } else {
    if (response.code) {
      const msg = {
        "quote": h.quote(session.messageId),
        'data': (response.isJson) ? "获取失败：" + response.error['error'] : "获取失败：" + response.error,
        "time": time
      };
      await session?.send(session?.bot.adapterName == "qq" ? h("qq:markdown", {
        content: session?.text('failed-md', msg)
      }) : session?.text('failed', msg));
      log.warn("Sent:");
      log.warn(response.error);
    } else {
      const msg = {"quote": h.quote(session.messageId), 'data': "获取失败：" + response.error.message, "time": time};
      await session?.send(session?.bot.adapterName == "qq" ? h("qq:markdown", {
        content: session?.text('failed-md', msg)
      }) : session?.text('failed', msg));
      log.warn("Sent:");
      log.warn(response.error);
    }
  }
  return 0;
}

// 定时任务 SL News
export async function getNewsMsg(ctx: Context, type: number):Promise<{success: boolean, data?: Buffer, msg: string}> {
  // logger
  const log = ctx.logger('getNewsMsg');
  // 请求 Steam API
  const response = await fun.request<APINews>(ctx.config.newsAPI, {}, ctx.config.timeout, log);
  if (response.success) {
    // 防止重复，如果主动调用就跳过检测
    if((await ctx.database.get("botData", "newsId"))[0]?.data==response.data.appnews.newsitems[0].gid&&type!=1){
      log.debug("无新闻");
      return {success: false, msg: "无可用新闻"};
    }
    const db = await ctx.database.get("botData", response.data.appnews.newsitems[0].gid);
    let html:string[] = [];
    if (db[0]){
      html[0] = db[0].data;
    } else {
      html = await fun.readNewsFile(response.data, log)
      if (html[1]) return {success: false, msg: `渲染图片失败`};
      await ctx.database.upsert('botData',  [
        { id: response.data.appnews.newsitems[0].gid, data: html[0] }
      ]);
    }
    log.debug(html);
    const page = await ctx.puppeteer.page();
    try {
      await page.setViewport({
        width: 800,
        height: 800,
        deviceScaleFactor: 2
      });
      await page.setContent(html[0], { timeout: ctx.config.htmlTimeout, waitUntil: 'networkidle0' });
      const { width, height } = await page.evaluate(() => ({
        width: document.body.scrollWidth,
        height: document.body.scrollHeight
      }));
      await page.setViewport({ width, height, deviceScaleFactor: 2 });
      // 截图
      const image = await page.screenshot({
        type: 'png',
        fullPage: true,
        omitBackground: true // 使得 CSS 中未定义的背景部分透明
      });
      // 写入数据库
      if(type==0) await ctx.database.upsert('botData',  [
        { id: "newsId", data: response.data.appnews.newsitems[0].gid }
      ]);
      return {success: true, data: image, msg: "NorthWood 发布了一个新闻（原文+机翻）："+response.data.appnews.newsitems[0].title};
    } catch(err) {
      log.error('图片渲染失败:', err);
      return {success: false, msg: "图片渲染失败"};
    } finally {
      if (page && !page.isClosed()) await page.close()
    }
  } else {
    return {success: false, msg: "请求 Steam API 失败"};
  }
}
