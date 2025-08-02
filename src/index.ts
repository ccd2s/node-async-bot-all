import { Context,h } from 'koishi';
import {getHongKongTime, fetchWithTimeout, getSystemUsage, readInfoFile, getAudioPath, getAudioList} from './fun';
import SilkService from 'koishi-plugin-silk';
import fs from 'fs';

export const inject = ['silk'] as const;

// 扩展 Context 类型
declare module 'koishi' {
  interface Context {
    silk: SilkService;
  }
}

export const name = 'node-async-bot-all';

// 指令 cx
async function getServer(ctx: Context, session: any) {
  ctx.logger.info(`Got: {"command":"${session.text('.message')}","form":"${session.event.guild.id}","user":"${session.event.user.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message.id}"}`);
  // 设立必要变量
  let msg: object;
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
        msg = {
          "time": time,
          "players": data['players'],
          "version": data['version'],
          "success": 0
        };
        ctx.logger.info("Sent:");
        ctx.logger.info(msg);
      } else {
        // 请求错误
        dataError = await response.text();
        try {
          const vError = JSON.parse(dataError);
          error = vError['data'];
          // 服务器关闭
          if (error.includes("Connection refused")) {
            error = session.text('.close');
          }
        } catch (e) {
          // CDN超时或未知
          if(dataError.includes("CDN节点请求源服务器超时")){
            error = session.text('.timeout');
          } else {
            error = session.text('.unknown');
          }
        }
        ctx.logger.error(`Error fetching data: ${dataError}`);
        // 发送消息
        msg = {
          "time": time,
          "data": error,
          "success": 1
        }
        ctx.logger.info("Sent:");
        ctx.logger.info(msg);
      }
    } catch (err) {
      // 报错
      ctx.logger.error(`Request error:  ${err.message}`);
      // 发送消息
      msg = {
        "time": time,
        "data": session.text('.error'),
        "success": 1
      }
      ctx.logger.info("Sent:");
      ctx.logger.info(msg);
    }
  }
  else {
    // 群聊不在白名单中，发送消息
    msg = {
      "time": time,
      "success": 2
    };
    ctx.logger.info("Sent:");
    ctx.logger.info(msg);
  }
  return msg;
}

// 指令 Status
async function getStatus(ctx: Context, session: any) {
  ctx.logger.info(`Got: {"command":"${session.text('.message')}","form":"${session.event.guild.id}","user":"${session.event.user.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message.id}"}`);
  // 设立必要变量
  const time = getHongKongTime();
  let msg: object;
  const vMsg = await getSystemUsage();
  // 判断是否读取失败
  if (vMsg["success"]==1){
    ctx.logger.error(vMsg);
    msg = {
      "time" : time,
      "data" : vMsg["data"],
      "success" : 1
    };
  } else {
    msg = {
      "time" : time,
      "name": vMsg["name"],
      "cpu": vMsg["cpu"],
      "memory": vMsg["memory"],
      "success" : 0
    };
  }
  ctx.logger.info("Sent:");
  ctx.logger.info(msg);
  return msg;
}

// 指令 Random
async function getRandom(ctx: Context, session: any, min: number, max: number) {
  ctx.logger.info(`Got: {"command":"${session.text('.message')}","form":"${session.event.guild.id}","user":"${session.event.user.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message.id}"}`);
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
  ctx.logger.info("Sent:");
  ctx.logger.info(msg);
  return msg;
}

// 指令 Info
async function getInfo(ctx: Context, session: any) {
  ctx.logger.info(`Got: {"command":"${session.text('.message')}","form":"${session.event.guild.id}","user":"${session.event.user.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message.id}"}`);
  // 设立必要变量
  const time = getHongKongTime();
  let msg: object;
  let data = await readInfoFile();
  // 判断是否读取成功
  if (!data.includes("基沃托斯·工业革命")){
    ctx.logger.error("Error: "+data);
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
  ctx.logger.info("Sent:");
  ctx.logger.info(msg);
  return msg;
}

// 指令 RW
async function getRW(ctx: Context, session: any) {
  ctx.logger.info(`Got: {"command":"${session.text('.message')}","form":"${session.event.guild.id}","user":"${session.event.user.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message.id}"}`);
  // 设立必要变量
  let msg: object;
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
      msg = {
        "time" : time,
        "data" : data,
        "success" : 0
      };
      ctx.logger.info("Sent:");
      ctx.logger.info(msg);
    } else {
      // 请求失败
      data = await response.text();
      ctx.logger.error(`Error fetching data: ${data}`);
      msg = {
        "time" : time,
        "success" : 1
      };
      ctx.logger.info("Sent:");
      ctx.logger.info(msg);
    }
  } catch (err) {
    // 报错
    ctx.logger.error(`Request error:  ${err.message}`);
    msg = {
      "time" : time,
      "success" : 2
    };
    ctx.logger.info("Sent:");
    ctx.logger.info(msg);
  }
  return msg;
}

// C.A.S.S.I.E. 指令
async function getCASSIE(ctx: Context, session: any, name: string) {
  ctx.logger.info(`Got: {"command":"${session.text('.message')}","form":"${session.event.guild.id}","user":"${session.event.user.id}","timestamp":${session.event.timestamp},"messageId":"${session.event.message.id}"}`);
  // 设立必要变量
  let msg: object;
  const time = getHongKongTime();
  const list = await getAudioList();
  // 判断类型
  if (name == undefined) {
    // 列表
    msg = {
      "time" : time,
      "data" : list
        .map((fruit, index) => `${index + 1}. ${fruit}`) // 添加序号前缀
        .join('\n') // 用换行符连接
      ,
      "success" : 1
    };
    ctx.logger.info("Sent: .msg");
    ctx.logger.info(msg);
    return msg;
  } else if (list.includes(name)) {
    // 发送音频，先获取路径
    const fullPath = await getAudioPath(name);
    try {
      const fileBuffer = await fs.promises.readFile(fullPath);
      ctx.logger.info(fullPath);
      const bufferToSend = Buffer.from(fileBuffer);
      if (!ctx.silk.isSilk(fileBuffer)){
        msg = {
          "time" : time,
          "success" : 2
        };
        // 报错
        ctx.logger.error("发送失败：非 .slk 文件");
        ctx.logger.info("Sent: .failed");
        ctx.logger.info(msg);
      } else {
        const base64Data = bufferToSend.toString('base64');
        ctx.logger.info("Sent: A audio file.");
        msg = {
          "time" : time,
          "data" : base64Data,
          "success" : 0
        };
      }
      return msg;
    } catch (e) {
      msg = {
        "time" : time,
        "success" : 2
      };
      // 报错
      ctx.logger.error("发送失败：" + e.message);
      ctx.logger.info("Sent: .failed");
      ctx.logger.info(msg);
      return msg;
    }
  } else {
    // 未知音频
    msg = {
      "time" : time,
      "success" : 3
    };
    ctx.logger.info("Sent: .unknown");
    ctx.logger.info(msg);
    return msg;
  }
}

// Main
export function apply(ctx: Context) {
  ctx.i18n.define('zh-CN', require('./locales/zh-CN'));
  ctx.command('cx')
    .action(async ({ session }) => {
      const cx = await getServer(ctx, session);
      if (cx['success']==0) {
        return session.text('.msg',cx);
      } else if (cx['success']==1) {
        return session.text('.failed',cx);
      } else {
        return session.text('.forbidden',cx);
      }
    });
  ctx.command('status')
    .action(async ({ session }) => {
      const status = await getStatus(ctx, session);
      if (status['success']==0) {
        return session.text('.msg',status);
      } else {
        return session.text('.failed',status);
      }
    });
  ctx.command('random [最小数:number] [最大数:number]')
    .action(async ({ session },min,max) => {
      const random = await getRandom(ctx,session,min,max);
      return session.text('.msg',random);
    });
  ctx.command('info')
    .action(async ({ session }) => {
      const info = await getInfo(ctx,session);
      if (info['success']==0){
        return session.text('.msg',info);
      }
      else{
        return session.text('.failed',info);
      }
    });
  ctx.command('rw')
    .action(async ({ session }) => {
      const rw = await getRW(ctx,session);
      if (rw['success']==0){
        return session.text('.msg',rw);
      }
      else if (rw['success']==1){
        return session.text('.failed1',rw);
      }
      else{
        return session.text('.failed2',rw);
      }
    });
  ctx.command('cassie [名称:string]')
    .action(async ({ session },name) => {
      const cassie = await getCASSIE(ctx,session,name);
      if (cassie['success']==0){
        return h('audio', { src: `base64://${cassie['data']}` });
      } else if (cassie['success']==1){
        return [`${session.text('.msg',cassie)}`];
      } else if (cassie['success']==2){
        return session.text('.failed',cassie);
      } else {
        return session.text('.unknown',cassie);
      }
    });
/*
  ctx.command('e [名称:string]')
    .action(async ({ session },name) => {
      const fullPath = await getAudioPath(name);
      const fileBuffer = await fs.promises.readFile(fullPath);
      const wavInfo = ctx.silk.getWavFileInfo(fileBuffer);
      const encodeResult = await ctx.silk.encode(fileBuffer, wavInfo.fmt.sampleRate);
      try {
        await fs.promises.writeFile(fullPath + ".slk", encodeResult.data);
        const fileBuffer2 = await fs.promises.readFile(fullPath + ".slk");
        return ctx.silk.isSilk(fileBuffer2);
      } catch (e){
        return e.message;
      }
    });
*/
}
