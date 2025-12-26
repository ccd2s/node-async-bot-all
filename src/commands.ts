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

// Meme API
interface APIMeme {
  data: {
    title: string;
    image: string;
  };
  success: boolean;
}

// 随机文本 API
interface APIRandomWord {
  data: string;
  success: boolean;
}

/**
 * QQ 用户 API
 * */
export interface APIUserInfo {
  qq: string;
  nickname: string;
  long_nick: string;
  avatar_url: string;
  age: number;
  sex: string;
  qid: string;
  qq_level: number;
  location: string;
  email: string;
  is_vip: boolean;
  vip_level: number;
  reg_time: string;
  last_updated: string;
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
export async function getServer(ctx: Context, session: Session):Promise<Object> {
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
        "data": session.text("noApi"),
        "success": 2
      };
      log.warn("Sent:");
      log.warn(msg);
      return msg;
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
          // 成功
          const temp = {
            "count": count,
            "players": info.players,
            "version": info.version,
            "bots": info.bots,
            "note": note ?? session.text("noop")
          };
          log.info(`Server ${count}:`);
          log.info(temp);
          list = list+"\n"+session.text('.listA2S',temp);
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
            "note": note
          };
          log.error(`Server ${count}:`);
          log.error(temp);
          list = list+"\n"+session.text('.listFailedA2S',temp);
        }
      } else {
        // 默认 mc 服务器，请求
        const host = api.split(":");
        const serverInfo = await fun.slpInfo(log, host[0], Number(host[1]), ctx.config.timeout);
        if (serverInfo.success) {
          // 成功
          if (serverInfo.data.players.sample==null) {
            // 无玩家
            const temp = {
              "count": count,
              "players": serverInfo.data.players.online + "/" + serverInfo.data.players.max,
              "version": serverInfo.data.version.name,
              "note": note ?? session.text("noop")
            };
            log.info(`Server ${count}:`);
            log.info(temp);
            list = list+"\n"+session.text('.listNoPlayer',temp);
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
              "note": note ?? session.text("noop")
            };
            log.info(`Server ${count}:`);
            log.info(temp);
            list = list+"\n"+session.text('.list',temp);
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
            "note": note
          };
          log.error(`Server ${count}:`);
          log.error(temp);
          list = list+"\n"+session.text('.listFailed',temp);
        }
      }
    }
    msg = {
      "time": time,
      "list": list,
      "success": 0
    };
  }
  else {
    // 群聊不在白名单中，发送消息
    msg = {
      "time": time,
      "success": 1
    };
    log.info("Sent:");
    log.info(msg);
  }
  return msg;
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
  let data = await fun.readInfoFile(ctx);
  // 判断是否读取成功
  if (!data.includes("&time;")){
    log.error("Error: "+data);
    msg = {
      "time" : time,
      "data" : data,
      "success" : 1
    };
  } else {
    data = data.replace("&time;",time);
    msg = {
      "time" : time,
      "data" : data,
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
      "data": session.text("noApi"),
      "success": 2
    };
    log.warn("Sent:");
    log.warn(msg);
    return msg;
  }
  // 发送请求
  const response = await fun.request<APIRandomWord>(ctx.config.rwAPI+"?format=json", {}, ctx.config.timeout, log);
  if (response.success) {
    // 发送消息
    msg = {
      "time" : time,
      "data" : response.data.data,
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
      "data" : err,
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
  // 获取香港时区当前时间
  const time = fun.getHongKongTime();
  if (ctx.config.baAPI==undefined){
    // 未指定 API
    await session.send(session.text(".msg", {"quote" : h.quote(session.messageId), "image" : session.text("noApi")}));
    return 1;
  }
  // 发送等待消息
  const vid = await session.send(session.text(".wait", {"quote" : h.quote(session.messageId), "time": time}));
  const ms = fun.random(0,0, 1500);
  const link: string = (fun.random(2,ctx.config.baAPI)) + `?cacheBuster=${fun.random(1,1,2147483647)}`;
  log.info(`Link: ${link}`);
  // 等待防止阈值限制
  await sleep(ms);
  const status = await session.send(session.text(".msg", {"quote" : h.quote(session.messageId), "image" : h.image(link)}));
  if (!status) await session.send(session.text(".msg", {"quote" : h.quote(session.messageId), "image" : h.image(link)}));
  // 撤回消息
  await session.bot.deleteMessage(session.event.guild?.id as string, vid[0]);
  return 0;
}

/**
 * 指令 centerServerTest
 * */
export async function centerServerTest(ctx: Context, session: Session):Promise<{ success: string, data: object }> {
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
    for (const server of ctx.config.slTest) {
      const lastTime = response.data.heartbeatList[server.id].at(-1);
      if (lastTime) {
        const uptime24 = (response.data.uptimeList[server.id+"_24"] * 100).toFixed(2) + '%';
        const status = (lastTime?.status==1) ? session.text(".statusLive") : session.text(".statusDie")
        const testTime = timeFormatter.format(new Date(lastTime?.time.replace(' ', 'T') + 'Z'))
        list = list+"\n"+session.text(".list", {
          "name": server.name,
          "status": status,
          "uptime": uptime24,
          "time": testTime
        });
      } else {
        list = list+"\n"+session.text(".listFailed", {
          "name": server.name,
          "data": session.text(".dataFail")
        });
      }
    }
    msg = {
      "data" : {"list" : list, "time" : time},
      "success" : '.msg'
    }
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
      "data" : {"data":err, "time" : time},
      "success" : '.failed'
    };
    log.warn("Sent:");
    log.warn(msg);
  }
  return msg;
}

// 指令 Meme
export async function getMeme(ctx: Context, session: Session, count: number):Promise<Number> {
  // logger
  const log = ctx.logger('getMeme');
  log.debug(`Got: {"form":"${session.platform}:${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
  // 设立必要变量
  let msg: object;
  // 获取香港时区当前时间
  const time = fun.getHongKongTime();
  if(ctx.config.memesAPI[`${session.event.guild?.id}`]==undefined){
    // 发送消息
    msg = {
      "time" : time,
      "quote" : h.quote(session.messageId),
      "success" : '.forbidden'
    };
    log.warn("Sent:");
    log.warn(msg);
    await session.send(session.text(msg["success"], msg));
    return 0;
  }
  const api = (count) ? ctx.config.memesAPI[`${session.event.guild?.id}`] + `&type=1&count=${count}` : ctx.config.memesAPI[`${session.event.guild?.id}`];
  // 发送请求
  const response = await fun.request<APIMeme>(api, {}, ctx.config.timeout, log);
  if (response.success) {
    // 发送消息
    msg = {
      "time" : time,
      "title" : response.data.data.title,
      "image" : h.image(response.data.data.image),
      "quote" : h.quote(session.messageId),
      "success" : '.msg'
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
      "data" : err,
      "quote" : h.quote(session.messageId),
      "success" : '.failed'
    };
    log.warn("Sent:");
    log.warn(msg);
  }
  // 如果未成功则尝试重发
  const status = await session.send(session.text(msg["success"], msg));
  if (!status) await session.send(session.text(msg["success"], msg));
  return 0;
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
    return 1;
  }
  // 发送等待消息
  const vid = await session.send(session.text(".wait", {"quote" : h.quote(session.messageId), "time": time}));
  // 发送请求
  const response = await fun.request<APICat>(ctx.config.catAPI, {}, ctx.config.timeout, log);
  if (response.success) {
    log.debug(response.data);
    // 发送消息 如果未成功则尝试重发
    const status = await session.send(session.text(".msg", {"quote" : h.quote(session.messageId), "image" : h.image(response.data[0].url)}));
    if (!status) await session.send(session.text(".msg", {"quote" : h.quote(session.messageId), "image" : h.image(response.data[0].url)}));
    log.debug("Sent:");
    log.debug(response.data[0].url);
  } else {
    if (response.code){
      await session.send(session.text(".failed", {"quote" : h.quote(session.messageId), 'data' : (response.isJson) ? response.error['error'] : response.error, "time": time}));
      log.warn("Sent:");
      log.warn(response.error);
    }
    else {
      await session.send(session.text(".failed", {"quote" : h.quote(session.messageId), 'data' : response.error.message, "time": time}));
      log.warn("Sent:");
      log.warn(response.error);
    }
  }
  // 撤回消息
  await session.bot.deleteMessage(session.event.guild?.id as string, vid[0]);
  return 0;
}

// 指令 获取 qq 信息
export async function getQQInfo(ctx: Context, session: Session, qq: string):Promise<number> {
  // logger
  const log = ctx.logger('getQQInfo');
  log.debug(`Got: {"form":"${session.platform}:${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
  // 获取香港时区当前时间
  const time = fun.getHongKongTime();
  if (ctx.config.qqAPI==undefined){
    // 未指定 API
    await session.send(session.text(".failed", {"quote" : h.quote(session.messageId), "data" : "未指定 API", "time": time}));
    return 1;
  }
  // 发送请求
  const response = await fun.request<APIUserInfo>(ctx.config.qqAPI+`?qq=${qq}`, {}, ctx.config.timeout, log);
  if (response.success) {
    const fullHtml = await fun.readUserCardFile(response.data);
    const page = await ctx.puppeteer.page();
    try {
      await page.setViewport({
        width: 450,
        height: 650,
        deviceScaleFactor: 2
      });
      await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
      const { width, height } = await page.evaluate(() => ({
        width: document.body.scrollWidth,
        height: document.body.scrollHeight
      }));
      await page.setViewport({ width, height, deviceScaleFactor: 2 });
      const image = await page.screenshot({ type: 'png', omitBackground: true });
      await session.send(session.text(".msg", {"quote" : h.quote(session.messageId), "image" : h.image(image,  'image/png')}));
    } catch(err) {
      await session.send(session.text(".failed", {"quote" : h.quote(session.messageId), "time" : time, "data":"图片渲染失败"}));
      log.error('图片渲染失败:', err);
      return 1;
    } finally {
      if (page && !page.isClosed()) await page.close()
    }
    log.debug("Sent: Image");
  } else {
    if (response.code){
      await session.send(session.text(".failed", {"quote" : h.quote(session.messageId), "data" : (response.isJson) ? response.error['error'] : response.error, "time": time}));
      log.warn("Sent:");
      log.warn(response.error);
    }
    else {
      await session.send(session.text(".failed", {"quote" : h.quote(session.messageId), "data" : response.error.message, "time": time}));
      log.warn("Sent:");
      log.warn(response.error);
    }
  }
  return 0;
}

// 指令 消息转图
export async function getMsg(ctx: Context, session: Session):Promise<number> {
  // logger
  const log = ctx.logger('getQQInfo');
  log.debug(`Got: {"form":"${session.platform}:${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
  // 获取香港时区当前时间
  const time = fun.getHongKongTime();
  // 未引用时退出
  if (!session.quote || !session.quote.user) {
    await session.send(session.text(".null"));
    log.warn('未引用任何信息');
    return 1;
  }
  // 禁止套娃！
  if (session.quote.user.id==session.event.selfId) {
    await session.send(session.text(".matroska", {"quote" : h.quote(session.messageId)}));
    return 1;
  }
  // 获取用户信息
  const user = await session.bot.getUser(session.quote.user.id, session.channelId);
  // 消息内容 支持图片
  const msg:string = session.quote.content as string;
  // 如果获取失败
  if (!user.name || !user.avatar) {
    await session.send(session.text(".failed", {"quote" : h.quote(session.messageId), "time" : time, "data" : "获取用户信息失败。"}));
    log.error('获取用户信息失败');
    return 1;
  }
  const page = await ctx.puppeteer.page();
  const html = await fun.readUserMsgFile(user.name, user.avatar, msg);
  try {
    await page.setViewport({
      width: 450,
      height: 1,
      deviceScaleFactor: 2
    });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const { width, height } = await page.evaluate(() => ({
      width: document.body.scrollWidth + 50,
      height: document.body.scrollHeight
    }));
    await page.setViewport({ width, height, deviceScaleFactor: 2 });
    // 选定元素截图
    const element = await page.$('#target-element');
    if (element) {
      const image = await element.screenshot({
        type: 'png',
        omitBackground: true // 使得 CSS 中未定义的背景部分透明
      });
      await session.send(session.text(".msg", {"quote" : h.quote(session.messageId), "image" : h.image(image,  'image/png')}));
      log.debug("Sent: Image");
    } else {
      await session.send(session.text(".failed", {"quote" : h.quote(session.messageId), "time" : time, "data" : "未找到目标元素。"}));
      log.error('未找到目标元素');
      return 1;
    }
  } catch(err) {
    await session.send(session.text(".failed", {"quote" : h.quote(session.messageId), "time" : time, "data":"图片渲染失败"}));
    log.error('图片渲染失败:', err);
    return 1;
  } finally {
    if (page && !page.isClosed()) await page.close()
  }
  return 0;
}

// 定时任务 SL News
export async function getNewsMsg(ctx: Context,type:number):Promise<{success: boolean, data?: Buffer, msg: string}> {
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
    const page = await ctx.puppeteer.page();
    try {
      await page.setViewport({
        width: 800,
        height: 800,
        deviceScaleFactor: 2
      });
      await page.setContent(html[0], { waitUntil: 'networkidle0' });
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
