import { Context } from 'koishi'
import {getHongKongTime,fetchWithTimeout,getSystemUsage,readInfoFile} from './fun'

export const name = 'node-async-bot-all'

// 指令 cx
async function getServer(ctx: Context, session: any) {
  ctx.logger.info("Got: "+session.text('.message', {
    platform: session.platform,
    selfId: session.selfId,
  }));
  // 设立必要变量
  let msg: string;
  let dataError : string;
  let data : string;
  let error : string;
  // 获取香港时区当前时间
  const time = getHongKongTime();
  try {
    // 发送请求
    const response = await fetchWithTimeout('https://api.tasaed.top/get/minecraftServer/', {}, 8000); // 8秒超时
    // 判断是否成功
    if (response.ok) {
      data = await response.text();
      ctx.logger.info("Server data: "+data);
      // 发送消息
      data = JSON.parse(data);
      msg = `${time}\n【服务器当前人数】\n  ➣ ${data['version']}：${data['players']}\n进服指南请在群公告中查看。`;
      ctx.logger.info("Sent: "+msg)
    } else {
      dataError = await response.text();
      try {
        const vError = JSON.parse(dataError);
        error = vError['data'];
      } catch (e) {
        if(dataError.includes("CDN节点请求源服务器超时")){
          error = "请求超时";
        } else {
          error = "未知错误";
        }
      }
      ctx.logger.error(`Error fetching data: ${dataError}`);
      msg = `${time}\n查询失败：${error}\n请稍后重试`;
      ctx.logger.info("Sent: "+msg)
    }
  } catch (err) {
    // 报错
    ctx.logger.error(`Request error:  ${err.message}`);
    msg = `${time}\n查询失败：请求超时\n请稍后重试`;
    ctx.logger.info("Sent: "+msg)
  }
  return msg;
}
// 指令 Status
async function getStatus(ctx: Context, session: any) {
  ctx.logger.info("Got: "+session.text('.message', {
    platform: session.platform,
    selfId: session.selfId,
  }));
  // 设立必要变量
  const time = getHongKongTime();
  let msg: string;
  const vMsg = await getSystemUsage();
  // 判断是否读取失败
  if (!vMsg.includes("系统名称")){
    ctx.logger.error(vMsg);
    msg = `${time}\n状态获取失败。`;
  } else {
    msg = `${time}\n`+vMsg;
  }
  ctx.logger.info("Sent: "+msg)
  return msg;
}
// 指令 Random
async function getRandom(ctx: Context, session: any, min: number, max: number) {
  ctx.logger.info("Got: "+session.text('.message', {
    platform: session.platform,
    selfId: session.selfId,
  }));
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
  msg = `${time}\n生成的随机数：`+(Math.floor(Math.random() * (max - min + 1)) + min)+`（${min},${max}）`;
  ctx.logger.info("Sent: "+msg)
  return msg;
}
// 指令 Info
async function getInfo(ctx: Context, session: any) {
  ctx.logger.info("Got: "+session.text('.message', {
    platform: session.platform,
    selfId: session.selfId,
  }));
  // 设立必要变量
  const time = getHongKongTime();
  let msg = await readInfoFile();
  // 判断是否读取成功
  if (!msg.includes("基沃托斯·工业革命")){
    ctx.logger.error("Error: "+msg)
    msg = `${time}\n读取信息失败`;
  } else {
    msg = msg.replace("&time;",time);
  }
  ctx.logger.info("Sent: "+msg)
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
  ctx.command('random [最小数:number] [最大数:number]',"随机数生成器，缺少参数时默认生成 0-10000 的随机数。")
    .action(({ session },min,max) => {
      return getRandom(ctx,session,min,max);
    })
  ctx.command('info',"机器人信息")
    .action(({ session }) => {
      return getInfo(ctx,session);
    })
}
