import { Context, Session, h, sleep } from 'koishi';
import {
  formatTimestampDiff,
  getHongKongTime,
  getMsgCount,
  getSystemUsage,
  hostPing,
  readInfoFile,
  random,
  getHttp
} from './fun';
import { Installer } from "@koishijs/plugin-market";
import { ConfigCxV2 } from "./index";

declare module 'koishi' {
  interface Context {
    installer: Installer;
  }
}

// 指令 cx
export async function getServer(ctx: Context, session: Session):Promise<Object> {
  const log = ctx.logger('cx');
  log.info(`Got: {"form":"${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
  // 设立必要变量
  let msg : object;
  let data : object;
  let error : string;
  // 获取香港时区当前时间
  const time = getHongKongTime();
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
      const response = await getHttp(log,item,ctx.config.timeout);
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
  log.info(`Got: {"form":"${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
  // 设立必要变量
  const time = getHongKongTime();
  let msg: object;
  const vMsg = await getSystemUsage();
  // 判断是否读取失败
  if (vMsg["success"]==1){
    log.error(vMsg);
    msg = {
      "time" : time,
      "data" : vMsg["data"],
      "success" : 1
    };
  } else {
    const msgCount= await getMsgCount(ctx);
    msg = {
      "time" : time,
      "name": vMsg["name"],
      "cpu": vMsg["cpu"],
      "memory": vMsg["memory"],
      "online":
        formatTimestampDiff(
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
  log.info(`Got: {"form":"${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
  // 设立必要变量
  const time = getHongKongTime();
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
  log.info(`Got: {"form":"${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
  // 设立必要变量
  const time = getHongKongTime();
  let msg: object;
  let data = await readInfoFile(ctx);
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
export async function getRW(ctx: Context, session: Session):Promise<Object> {
  const log = ctx.logger('rw');
  log.info(`Got: {"form":"${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
  // 设立必要变量
  let msg: object;
  let data : object;
  // 获取香港时区当前时间
  const time = getHongKongTime();
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
  const response = await getHttp(log,ctx.config.rwAPI+"?format=json",ctx.config.timeout);
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
export async function getBA(ctx: Context, session: Session):Promise<Number> {
  // 日志
  const log = ctx.logger('ba');
  log.info(`Got: {"form":"${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
  // 获取香港时区当前时间
  const time = getHongKongTime();
  if (ctx.config.rwAPI==undefined){
    // 未指定 API
    await session.send(session.text(".msg", {"quote" : h.quote(session.messageId), "image" : "未指定 API"}));
    return 1;
  }
  // 发送等待消息
  const vid = await session.send(session.text(".wait", {"quote" : h.quote(session.messageId), "time": time}));
  const ms = random(0,0, 1500);
  const link: string = (random(2,ctx.config.baAPI)) + `?cacheBuster=${random(1,1,2147483647)}`;
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
  log.info(`Got: {"form":"${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
  // 获取香港时区当前时间
  const time = getHongKongTime();
  const host = ctx.config.serverPing[`${session.event.guild?.id}`];
  if (host==undefined) {
    return {
      "success": 1,
      "time": time
    };
  }
  const tmp = await hostPing(host);
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

// 指令 SteamId
export async function getSteam(ctx: Context, session: Session, id:number):Promise<Object> {
  const log = ctx.logger('steamId');
  log.info(`Got: {"form":"${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
  // 设立必要变量
  let msg: object;
  let data : object;
  // 获取香港时区当前时间
  const time = getHongKongTime();
  // 发送请求
  const response = await getHttp(log,ctx.config.steamAPI+`?format=json&id=${id}`,ctx.config.timeout);
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
        "data" : (data['name'] === 'AbortError') ? session.text('.command') : data['message'],
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

// 指令 Meme
export async function getMeme(ctx: Context, session: Session, count: number):Promise<Object> {
  const log = ctx.logger('getMeme');
  log.info(`Got: {"form":"${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
  // 设立必要变量
  let msg: object;
  let data : object;
  // 获取香港时区当前时间
  const time = getHongKongTime();
  const api = ctx.config.memesAPI[`${session.event.guild?.id}`]
  if(api==undefined){
    // 发送消息
    msg = {
      "time" : time,
      "quote" : h.quote(session.messageId),
      "success" : 2
    };
    log.info("Sent:");
    log.info(msg);
    return msg;
  }
  // 发送请求
  const response = (count) ? await getHttp(log,api+`&type=1&count=${count}`,ctx.config.timeout) : await getHttp(log,api,ctx.config.timeout);
  if (response.success) {
    data = response.data;
    // 发送消息
    msg = {
      "time" : time,
      "title" : data['data']['title'],
      "image" : h.image(data['data']['image']),
      "quote" : h.quote(session.messageId),
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
        "quote" : h.quote(session.messageId),
        "success" : 1
      };
      log.info("Sent:");
      log.info(msg);
    } else {
      data = response.data;
      msg = {
        "time" : time,
        "data" : data['data'],
        "quote" : h.quote(session.messageId),
        "success" : 1
      };
      log.info("Sent:");
      log.info(msg);
    }
  }
  return msg;
}
