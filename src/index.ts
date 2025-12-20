import { Context, Dict, Schema, Session, h, sleep } from 'koishi';
import * as command from './commands';
import { } from "koishi-plugin-cron";
import { version } from '../package.json';

export const inject = ['database', 'installer', 'puppeteer', 'cron'];

export type HttpResponse<T> =
  | { success: true; data: T; }
  | { success: false; error: any; code?: number; isJson: boolean };

declare module 'koishi' {
  interface Tables {
    botData: botDataTables;
  }
  interface Events {
    // 方法名称对应自定义事件的名称
    // 方法签名对应事件的回调函数签名
    "node-async/news"(): void;
  }
}

interface botDataTables {
  id: string,
  data: string;
}

export const name = 'node-async-bot-all';
export const usage = '这是一个私有插件。';

export interface ConfigCxV3 {
  id: string,
  server: Array<ConfigV3Server>
}

export interface ConfigV3Server {
  api: string,
  note: string,
  type: "mc" | "a2s" | null | undefined
}

export interface Config {
  cxV3: Array<ConfigCxV3>,
  rwAPI:string,
  timeout:number,
  baAPI:string[],
  serverPing:Dict<string>,
  steamAPI:string,
  memesAPI:Dict<string>,
  catAPI:string,
  qqAPI:string,
  slNews:string[];
}

export const Config: Schema<Config> =
  Schema.intersect([
    Schema.object({
      timeout: Schema.number().default(8000).description('超时时间（毫秒）')
    }).description('基础'),
    Schema.object({
      cxV3: Schema.array(
        Schema.object({
          id: Schema.string().description('查询 群'),
          server: Schema.array(
            Schema.object({
              api: Schema.string().description('查询 API | HOST'),
              note: Schema.string().description('查询 备注'),
              type: Schema.union(["mc", "a2s"]).description('查询 类型')
            })
          ).description('查询 服务器')
        })
      ).default([]).description('查询的群')
    }).description('查询'),
    Schema.object({
      rwAPI: Schema.string().default('https://api.tasaed.top/rw/').description('随机文本 API')
    }).description('随机文本'),
    Schema.object({
      baAPI: Schema.array(String).default(['https://rba.kanostar.top/portrait']).description('随机BA图 API')
    }).description('随机BA图'),
    Schema.object({
      serverPing: Schema.dict(String).role('table').description('键：群号；值：Host')
    }).description('服之测测（Ping）'),
    Schema.object({
      steamAPI: Schema.string().default('https://api.tasaed.top/get/steamid/').description('转换 Steam ID API')
    }).description('转换 Steam ID'),
    Schema.object({
      memesAPI: Schema.dict(String).role('table').description('群友 meme API')
    }).description('群友 meme'),
    Schema.object({
      catAPI: Schema.string().default('https://api.thecatapi.com/v1/images/search').description('随机猫猫图 API')
    }).description('随机猫猫图'),
    Schema.object({
      qqAPI: Schema.string().default('https://uapis.cn/api/v1/social/qq/userinfo').description('获取 QQ 信息 API')
    }).description('获取 QQ 信息'),
    Schema.object({
      slNews: Schema.array(String).default(['']).description('{platform}:{channelId}')
    }).description('SL新闻列表')
  ]).description('基础设置');

// 插件注册
export function apply(ctx: Context) {
  // 国际化
  ctx.i18n.define('zh-CN', require('./locales/zh-CN'));
  // 应用启动
  ctx.on('ready', async () => {
    ctx.model.extend('botData', {
      // 向表中注入字符串
      id: 'string',
      data: 'string'
    });
    const date = new Date();
    await ctx.database.upsert('botData',  [
      { id: "uptime", data: (date.getTime()).toString().substring(0, 10) },
      { id: "version", data: version }
    ]);
  });
  ctx.command("slnews", "手动触发slnews发送到当前会话")
    .action(async ({session}) => {
      const outMsg = await command.getNewsMsg(ctx,1);
      if (outMsg.success) {
        if(outMsg.msg) session?.send(outMsg.msg);
        return h('image', { url: `data:image/jpg;base64,${outMsg.data}` });
      } else {
        if (outMsg.data=="") return "无可用新闻";
        return outMsg.data;
      }
    });
  ctx.cron('0 * * * *', async () => {
    ctx.emit("node-async/news");
  })
  ctx.cron('5 * * * *', async () => {
    ctx.emit("node-async/news");
  })
  ctx.on("node-async/news", async () => {
    const outMsg = await command.getNewsMsg(ctx,0);
    if (outMsg.success) {
      if(outMsg.msg) await ctx.broadcast(ctx.config.slNews, outMsg.msg);
      await sleep(100);
      await ctx.broadcast(ctx.config.slNews, h('image', { url: `data:image/jpg;base64,${outMsg.data}` }));
    } else {
      if (outMsg.data=="") return;
      await ctx.broadcast(ctx.config.slNews, outMsg.data);
    }
  });
  // 指令注册
  ctx.command('cxGame')
    .action(async ({ session }) => {
      const cx = await command.getServer(ctx, <Session>session);
      if (cx['success']==0) {
        return session?.text('.msg',cx);
      } else if (cx['success']==1) {
        return session?.text('.forbidden',cx);
      } else if (cx['success']==2) {
        return session?.text('.failed',cx);
      }
    });
  ctx.command('status')
    .alias('stats')
    .alias('状态')
    .action(async ({ session }) => {
      const status = await command.getStatus(ctx, <Session>session);
      if (status['success']==0) {
        return session?.text('.msg',status);
      } else {
        return session?.text('.failed',status);
      }
    });
  ctx.command('random [最小数:number] [最大数:number]')
    .alias('随机数')
    .action(async ({ session },min,max) => {
      const random = await command.getRandom(ctx,<Session>session,min,max);
      return session?.text('.msg',random);
    });
  ctx.command('info')
    .action(async ({ session }) => {
      const info = await command.getInfo(ctx,<Session>session);
      if (info['success']==0){
        return session?.text('.msg',info);
      }
      else{
        return session?.text('.failed',info);
      }
    });
  ctx.command('rw')
    .action(async ({ session }) => {
      const rw = await command.getRandomWord(ctx,<Session>session);
      if (rw['success']==0){
        return session?.text('.msg',rw);
      }
      else{
        return session?.text('.failed',rw);
      }
    });
  ctx.command('randomBA')
    .alias('随机ba图')
    .action(async ({ session }) => {
      await command.getBlueArchive(ctx, <Session>session);
    });
  ctx.command('serverTest')
    .alias('服之测测')
    .action(async ({ session }) => {
      const server = await command.serverTest(ctx, <Session>session);
      if (server['success']==0) {
        return session?.text('.msg',server);
      } else if (server['success']==1) {
        return session?.text('.forbidden',server);
      } else {
        return session?.text('.failed',server);
      }
    });
  ctx.command('meme [序号:posint]')
    .alias('memes')
    .action(async ({ session },count) => {
      await command.getMeme(ctx, <Session>session, count);
    });
  ctx.command('randomCat')
    .alias('随机猫猫图')
    .alias('随机猫猫')
    .action(async ({ session }) => {
      await command.getCat(ctx, <Session>session);
    });
  ctx.command('getQQInfo <QQ号:string>')
    .alias('获取QQ信息')
    .action(async ({ session }, qq) => {
      if (qq==undefined || isNaN(Number(qq))) return session?.text('.command') ;
      await command.getQQInfo(ctx, <Session>session, qq);
    });
  ctx.command('msg2img')
    .alias('消息转图')
    .alias('m')
    .action(async ({ session }) => {
      await command.getMsg(ctx, <Session>session);
    });
}
