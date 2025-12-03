import { Context, Session, h, sleep } from 'koishi';
import * as fun from './fun';
import { Installer } from "@koishijs/plugin-market";
import { ConfigCxV2 } from "./index";
import Puppeteer from 'koishi-plugin-puppeteer';

declare module 'koishi' {
  interface Context {
    installer: Installer;
    puppeteer: Puppeteer;
  }
}

interface APICat {
  [index: number]: {
    id: string;
    url: string;
    width: number;
    height: number;
  };
}

interface APIMeme {
  data: {
    title: string;
    image: string;
  };
  success: boolean;
}

/*interface APIRandomWord {
  data: string;
  success: boolean;
}*/

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

// 指令 cx
export async function getServer(ctx: Context, session: Session):Promise<Object> {
  const log = ctx.logger('cx');
  log.debug(`Got: {"form":"${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
  // 设立必要变量
  let msg : object;
  let data : object;
  let error : string;
  // 获取香港时区当前时间
  const time = fun.getHongKongTime();
  const index = ctx.config.cxV2.findIndex((item:ConfigCxV2) => item.id === session.event.guild?.id);
  if (index !== -1){
    const api = ctx.config.cxV2[index]['api']
    if (api==undefined){
      // 未指定查询 API
      msg = {
        "time": time,
        "data": "未指定查询 API",
        "success": 2
      };
      log.info("Sent:");
      log.info(msg);
      return msg;
    }
    let count = 0;
    let list = "";
    for (const item of api) {
      const note = ctx.config.cxV2[index]['note'][count];
      count++;
      // 请求
      const response = await fun.getHttp(log,item,ctx.config.timeout);
      if (response.success) {
        // 成功
        data = response.data;
        if (data['list']==null) {
          // 无玩家
          const temp = {
            "count": count,
            "players": data['players'],
            "version": data['version'],
            "note": note ?? '无'
          };
          log.info(`Server ${count}:`);
          log.info(temp);
          list = list+"\n"+session.text('.listNoPlayer',temp);
        }
        else {
          // 有玩家
          const temp = {
            "count": count,
            "players": data['players'],
            "version": data['version'],
            "list": data['list']
              .join(', '),
            "note": note ?? '无'
          };
          log.info(`Server ${count}:`);
          log.info(temp);
          list = list+"\n"+session.text('.list',temp);
        }
      } else {
        // 失败
        if (response.error){
          // json 格式化失败
          data = response.data;
          // 发送消息
          const temp = {
            "count": count,
            "data": (data['name'] === 'AbortError') ? session.text('.error') : data['message'],
          };
          log.info(`Server ${count}:`);
          log.info(temp);
          list = list+"\n"+session.text('.listFailed',temp);
        } else {
          data = response.data;
          error = data['data'];
          // 服务器关闭
          if (error.includes("Connection refused")) {
            error = session.text('.close');
          } else if (error.includes("No route to host")) {
            error = session.text('.host');
          } else if (error.includes("Connection timed out")) {
            error = session.text('.timeout');
          } else if (error.includes("Server returned too few data")) {
            error = session.text('.fewData');
          } else if (error.includes("Server read timed out")) {
            error = session.text('.timeout2');
          }
          // 发送消息
          const temp = {
            "count": count,
            "data": error
          };
          log.info(`Server ${count}:`);
          log.info(temp);
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
  const log = ctx.logger('status');
  log.debug(`Got: {"form":"${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
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
  log.info("Sent:");
  log.info(msg);
  return msg;
}

// 指令 Random
export async function getRandom(ctx: Context, session: Session, min: number, max: number):Promise<Object> {
  const log = ctx.logger('random');
  log.debug(`Got: {"form":"${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
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
  log.info("Sent:");
  log.info(msg);
  return msg;
}

// 指令 Info
export async function getInfo(ctx: Context, session: Session):Promise<Object> {
  const log = ctx.logger('info');
  log.debug(`Got: {"form":"${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
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
  log.info("Sent:");
  log.info(msg);
  return msg;
}

// 指令 RW
export async function getRandomWord(ctx: Context, session: Session):Promise<Object> {
  const log = ctx.logger('rw');
  log.debug(`Got: {"form":"${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
  // 设立必要变量
  let msg: object;
  let data : object;
  // 获取香港时区当前时间
  const time = fun.getHongKongTime();
  if (ctx.config.rwAPI==undefined){
    // 未指定 API
    msg = {
      "time": time,
      "data": "未指定 API",
      "success": 2
    };
    log.info("Sent:");
    log.info(msg);
    return msg;
  }
  // 发送请求
  const response = await fun.getHttp(log,ctx.config.rwAPI+"?format=json",ctx.config.timeout);
  if (response.success) {
    data = response.data;
    // 发送消息
    msg = {
      "time" : time,
      "data" : data['data'],
      "success" : 0
    };
    log.info("Sent:");
    log.info(msg);
  } else {
    if (response.error){
      data = response.data;
      msg = {
        "time" : time,
        "data" : (data['name'] === 'AbortError') ? session.text('.error') : data['message'],
        "success" : 2
      };
      log.info("Sent:");
      log.info(msg);
    } else {
      data = response.data;
      msg = {
        "time" : time,
        "data" : data['data'],
        "success" : 1
      };
      log.info("Sent:");
      log.info(msg);
    }
  }
  return msg;
}

// 指令 BA
export async function getBlueArchive(ctx: Context, session: Session):Promise<Number> {
  // 日志
  const log = ctx.logger('ba');
  log.debug(`Got: {"form":"${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
  // 获取香港时区当前时间
  const time = fun.getHongKongTime();
  if (ctx.config.baAPI==undefined){
    // 未指定 API
    await session.send(session.text(".msg", {"quote" : h.quote(session.messageId), "image" : "未指定 API"}));
    return 1;
  }
  // 发送等待消息
  const vid = await session.send(session.text(".wait", {"quote" : h.quote(session.messageId), "time": time}));
  const ms = fun.random(0,0, 1500);
  const link: string = (fun.random(2,ctx.config.baAPI)) + `?cacheBuster=${fun.random(1,1,2147483647)}`;
  log.info(`Link: ${link}`);
  // 等待防止阈值限制
  await sleep(ms);
  await session.send(session.text(".msg", {"quote" : h.quote(session.messageId), "image" : h.image(link)}));
  // 撤回消息
  await session.bot.deleteMessage(<string>session.event.guild?.id, vid[0]);
  return 0;
}

// 指令 serverTest
export async function serverTest(ctx: Context, session: Session):Promise<Object> {
  // 日志
  const log = ctx.logger('serverTest');
  log.debug(`Got: {"form":"${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
  // 获取香港时区当前时间
  const time = fun.getHongKongTime();
  const host = ctx.config.serverPing[`${session.event.guild?.id}`];
  if (host==undefined) {
    return {
      "success": 1,
      "time": time
    };
  }
  const tmp = await fun.hostPing(host);
  log.info(tmp);
  if (!tmp.success){
    return {
      "success": 2,
      "time": time,
      "data": tmp.data,
    };
  }
  if (tmp.ip==undefined){
    return {
      "success": 2,
      "time": time,
      "data": "未知的主机 "+host,
    };
  }
  return {
    "success": 0,
    "time": time,
    "host": host,
    "ip": tmp.ip,
    "alive": (tmp.alive==true) ? "正常" : "异常",
    "packetLoss": tmp.packetLoss
  };
}

// 指令 Meme
export async function getMeme(ctx: Context, session: Session, count: number):Promise<Number> {
  const log = ctx.logger('getMeme');
  log.debug(`Got: {"form":"${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
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
  await session.send(session.text(msg["success"], msg));
  return 0;
}

// 指令 BA
export async function getCat(ctx: Context, session: Session):Promise<Number> {
  // 日志
  const log = ctx.logger('cat');
  log.debug(`Got: {"form":"${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
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
    // 发送消息
    await session.send(session.text(".msg", {"quote" : h.quote(session.messageId), "image" : h.image(response.data[0].url)}));
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
  await session.bot.deleteMessage(<string>session.event.guild?.id, vid[0]);
  return 0;
}

export async function getQQInfo(ctx: Context, session: Session, qq: string):Promise<number> {
  const log = ctx.logger('getQQInfo');
  log.debug(`Got: {"form":"${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
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
    log.info(response.data);
    const fullHtml = await fun.readUserCardFile(response.data);
    const page = await ctx.puppeteer.page();
    await page.setViewport({
      width: 450,
      height: 650,
      deviceScaleFactor: 2
    });
    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
    const image = await page.screenshot({ type: 'png', omitBackground: true });
    await session.send(session.text(".msg", {"quote" : h.quote(session.messageId), "image" : h.image(image,  'image/png')}));
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
