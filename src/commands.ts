import { Context, Session, Time } from 'koishi';
import { getHongKongTime, fetchWithTimeout, getSystemUsage, readInfoFile, formatTimestampDiff, getMsgCount } from './fun';
import { ConfigCxV2 } from "./index";

// 指令 cx
export async function getServer(ctx: Context, session: Session):Promise<Object> {
  const log = ctx.logger('cx');
  log.info(`Got: {"form":"${session.event.guild?.id}","user":"${session.event.user?.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message?.id}"}`);
  // 设立必要变量
  let msg : object;
  let dataError : string;
  let data : string;
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
      count++;
      try {
        // 发送请求
        const response = await fetchWithTimeout(item, {}, ctx.config.timeout,log); // 8秒超时
        // 判断是否成功
        if (response.ok) {
          data = await response.text();
          log.info("Server data: "+data);
          // 格式化服务器返回的数据
          data = JSON.parse(data);
          if (data['list']==null) {
            // 无玩家
            const temp = {
              "count": count,
              "players": data['players'],
              "version": data['version'],
              "protocol": data['protocol']
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
              "protocol": data['protocol']
            };
            log.info(`Server ${count}:`);
            log.info(temp);
            list = list+"\n"+session.text('.list',temp);
          }
        } else {
          // 请求错误
          dataError = await response.text();
          try {
            const vError = JSON.parse(dataError);
            error = vError['data'];
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
          } catch (e) {
            // CDN超时或未知
            if(dataError.includes("CDN节点请求源服务器超时")){
              error = session.text('.timeout');
            } else {
              error = session.text('.unknown');
            }
          }
          log.error(`Error fetching data: ${dataError}`);
          // 发送消息
          const temp = {
            "count": count,
            "data": error
          };
          log.info(`Server ${count}:`);
          log.info(temp);
          list = list+"\n"+session.text('.listFailed',temp);
        }
      } catch (err) {
        // 报错
        log.error(`Request error:  ${err.message}`);
        // 发送消息
        const temp = {
          "count": count,
          "data": session.text('.error')
        };
        log.info(`Server ${count}:`);
        log.info(temp);
        list = list+"\n"+session.text('.listFailed',temp);
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
    const msgCount=getMsgCount(await ctx.database.get('analytics.message', {date:Time.getDateNumber()-1},['type','count']));
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
  let data : string;
  // 获取香港时区当前时间
  const time = getHongKongTime();
  try {
    // 发送请求
    const response = await fetchWithTimeout(ctx.config.rwAPI, {}, ctx.config.timeout,log); // 8秒超时
    // 判断是否成功
    if (response.ok) {
      data = await response.text();
      log.info("Server data: "+data);
      // 发送消息
      msg = {
        "time" : time,
        "data" : data,
        "success" : 0
      };
      log.info("Sent:");
      log.info(msg);
    } else {
      // 请求失败
      data = await response.text();
      log.error(`Error fetching data: ${data}`);
      msg = {
        "time" : time,
        "success" : 1
      };
      log.info("Sent:");
      log.info(msg);
    }
  } catch (err) {
    // 报错
    log.error(`Request error:  ${err.message}`);
    msg = {
      "time" : time,
      "success" : 2
    };
    log.info("Sent:");
    log.info(msg);
  }
  return msg;
}
