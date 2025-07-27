import { Context } from 'koishi'
import {getHongKongTime,fetchWithTimeout,getSystemUsage,readInfoFile} from './fun'
import i18n from "../res/i18n.yaml"

export const name = 'node-async-bot-all'

// 指令 cx
async function getServer(ctx: Context, session: any) {
  ctx.logger.info(`Got: {"command":"${session.text('.message')}","form":"${session.event.guild.id}","user":"${session.event.user.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message.id}"`);
  // 设立必要变量
  let msg: string;
  let dataError : string;
  let data : string;
  let error : string;
  // 获取香港时区当前时间
  const time = getHongKongTime();
  if (session.event.guild.id=="757729218" || session.event.guild.id=="1047732162"){
    try {
      // 发送请求
      const response = await fetchWithTimeout('https://api.tasaed.top/get/minecraftServer/', {}, 8000); // 8秒超时
      // 判断是否成功
      if (response.ok) {
        data = await response.text();
        ctx.logger.info("Server data: "+data);
        // 发送消息
        data = JSON.parse(data);
        msg = `${time}\n【${i18n.cx.players}】\n  ➣ ${data['version']}：${data['players']}\n${i18n.cx.notice}`;
        ctx.logger.info("Sent: "+msg)
      } else {
        dataError = await response.text();
        try {
          const vError = JSON.parse(dataError);
          error = vError['data'];
        } catch (e) {
          if(dataError.includes("CDN节点请求源服务器超时")){
            error = i18n.cx.timeout;
          } else {
            error = i18n.cx.unknown;
          }
        }
        ctx.logger.error(`Error fetching data: ${dataError}`);
        msg = `${time}\n${i18n.cx.failed}${error}\n${i18n.cx.later}`;
        ctx.logger.info("Sent: "+msg)
      }
    } catch (err) {
      // 报错
      ctx.logger.error(`Request error:  ${err.message}`);
      msg = `${time}\n${i18n.cx.failed}${i18n.cx.timeout}\n${i18n.cx.later}`;
      ctx.logger.info("Sent: "+msg)
    }
  }
  else {
    msg = `${time}\n${i18n.cx.forbidden}`;
    ctx.logger.info("Sent: "+msg)
  }
  return msg;
}
// 指令 Status
async function getStatus(ctx: Context, session: any) {
  ctx.logger.info(`Got: {"command":"${session.text('.message')}","form":"${session.event.guild.id}","user":"${session.event.user.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message.id}"`);
  // 设立必要变量
  const time = getHongKongTime();
  let msg: string;
  const vMsg = await getSystemUsage();
  // 判断是否读取失败
  if (!vMsg.includes("系统名称")){
    ctx.logger.error(vMsg);
    msg = `${time}\n${i18n.status.failed}`;
  } else {
    msg = `${time}\n`+vMsg;
  }
  ctx.logger.info("Sent: "+msg)
  return msg;
}
// 指令 Random
async function getRandom(ctx: Context, session: any, min: number, max: number) {
  ctx.logger.info(`Got: {"command":"${session.text('.message')}","form":"${session.event.guild.id}","user":"${session.event.user.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message.id}"`);
  // 设立必要变量
  const time = getHongKongTime();
  let msg: string;
  // 判断参数是否为空
  if (min==undefined || max==undefined) {
    min=0
    max=10000
  }
  // 生成随机数
  min = Math.ceil(min);
  max = Math.floor(max);
  msg = `${time}\n${i18n.random.sc}`+(Math.floor(Math.random() * (max - min + 1)) + min)+`（${min},${max}）`;
  ctx.logger.info("Sent: "+msg)
  return msg;
}
// 指令 Info
async function getInfo(ctx: Context, session: any) {
  ctx.logger.info(`Got: {"command":"${session.text('.message')}","form":"${session.event.guild.id}","user":"${session.event.user.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message.id}"`);
  // 设立必要变量
  const time = getHongKongTime();
  let msg = await readInfoFile();
  // 判断是否读取成功
  if (!msg.includes("基沃托斯·工业革命")){
    ctx.logger.error("Error: "+msg)
    msg = `${time}\n${i18n.info.failed}`;
  } else {
    msg = msg.replace("&time;",time);
  }
  ctx.logger.info("Sent: "+msg)
  return msg;
}
// 指令 cx
async function getRW(ctx: Context, session: any) {
  ctx.logger.info(`Got: {"command":"${session.text('.message')}","form":"${session.event.guild.id}","user":"${session.event.user.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message.id}"`);
  // 设立必要变量
  let msg: string;
  let data : string;
  // 获取香港时区当前时间
  const time = getHongKongTime();
  try {
    // 发送请求
    const response = await fetchWithTimeout('https://api.tasaed.top/rw/', {}, 8000); // 8秒超时
    // 判断是否成功
    if (response.ok) {
      data = await response.text();
      ctx.logger.info("Server data: "+data);
      // 发送消息
      msg = `${time}\n${data}`;
      ctx.logger.info("Sent: "+msg)
    } else {
      // 请求失败
      data = await response.text();
      ctx.logger.error(`Error fetching data: ${data}`);
      msg = `${time}\n${i18n.rw.failed1}`;
      ctx.logger.info("Sent: "+msg)
    }
  } catch (err) {
    // 报错
    ctx.logger.error(`Request error:  ${err.message}`);
    msg = `${time}\n${i18n.rw.failed2}`;
    ctx.logger.info("Sent: "+msg)
  }
  return msg;
}

// Main
export function apply(ctx: Context) {
  ctx.command('cx',"查询服务器当前人数。")
    .action(({ session }) => {
      return getServer(ctx,session);
    });
  ctx.command('status',"查询机器人状态。")
    .action(({ session }) => {
      return getStatus(ctx,session);
    })
  ctx.command('random [最小数:number] [最大数:number]',"随机数生成器。")
    .usage("缺少参数时默认生成 0-10000 的随机数。")
    .example('random 1 128 生成1到128范围的随机数')
    .action(({ session },min,max) => {
      return getRandom(ctx,session,min,max);
    })
  ctx.command('info',"机器人信息")
    .action(({ session }) => {
      return getInfo(ctx,session);
    })
  ctx.command('rw',"随机名言名句")
    .action(({ session }) => {
      return getRW(ctx,session);
    })
}
