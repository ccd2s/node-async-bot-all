// koishi and plugin
import { Context, Dict, Schema, Session, h } from 'koishi';
import { } from "koishi-plugin-cron";
// node-async-bot-all
import * as command from './commands.ts';
import { version } from '../package.json';

// 在上下文中注入
export const inject = ['database', 'installer', 'puppeteer', 'cron'];

// // 类型声明
declare module 'koishi' {
  // 数据库定义
  interface Tables {
    botData: botDataTables;
  }
  // 事件定义
  interface Events {
    // 方法名称对应自定义事件的名称
    // 方法签名对应事件的回调函数签名
    "node-async/news"(): void;
  }
}

// 数据库类型
interface botDataTables {
  id: string,
  data: string;
}

// 插件简介
export const name = 'node-async-bot-all';
export const usage = '这是一个私有插件。';

// 查询 指令配置项
export interface ConfigCxV3 {
  id: string,
  server: Array<ConfigV3Server>
}

interface ConfigV3Server {
  api: string,
  note: string,
  type: "mc" | "a2s" | null | undefined
}

// 测试中心服务器配置项
interface CenterServerConfig {
  id: string,
  name: string
}

// 配置项类型定义
export interface Config {
  cxV3: Array<ConfigCxV3>,
  rwAPI:string,
  timeout:number,
  baAPI:string[],
  slTest:CenterServerConfig[],
  steamAPI:string,
  newsAPI:string,
  memesAPI:Dict<string>,
  catAPI:string,
  qqAPI:string,
  slNews:string[];
}

/// 配置项
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
      slNews: Schema.array(String).default(['']).description('{platform}:{channelId}'),
      newsAPI: Schema.string().default('https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=700330&count=1').description('新闻 API')
    }).description('SL新闻列表'),
    Schema.object({
      slTest: Schema.array(Schema.object({
        id: Schema.string().description('服务器 ID'),
        name: Schema.string().description('服务器 名称')
      })).default([{"id": "1", "name": "中心 鲁贝 1"}, {"id": "19", "name": "中心 斯特拉斯堡 1"}, {"id": "3", "name": "Steam 认证 API"}]).description('测试中心服务器')
    }).description('测试中心服务器'),
  ]).description('基础设置');

// 插件注册
export function apply(ctx: Context) {
  // 国际化
  ctx.i18n.define('zh-CN', require('./locales/zh-CN'));
  // 应用启动
  ctx.on('ready', async () => {
    // 数据库表
    ctx.model.extend('botData', {
      // 向表中注入字符串
      id: 'string',
      data: 'string'
    });
    // 更新表里面的数据
    const date = new Date();
    await ctx.database.upsert('botData',  [
      { id: "uptime", data: (date.getTime()).toString().substring(0, 10) },
      { id: "version", data: version }
    ]);
  });
  // sl 新闻 定时任务与指令
  ctx.command("slnews")
    .action(async () => {
      const log = ctx.logger("slnews");
      const outMsg = await command.getNewsMsg(ctx,1);
      if (outMsg.data) {
        return `${outMsg.msg}\n${h.image(outMsg.data, 'image/png')}`;
      } else {
        log.warn(outMsg);
        return outMsg.msg;
      }
    });
  // 每小时0分
  ctx.cron('0 * * * *', async () => {
    ctx.emit("node-async/news");
  })
  // 每小时30分
  ctx.cron('30 * * * *', async () => {
    // 触发事件
    ctx.emit("node-async/news");
  })
  // 事件监听
  ctx.on("node-async/news", async () => {
    // 获取新闻
    const outMsg = await command.getNewsMsg(ctx,0);
    if (outMsg.data) {
      // 发现新的新闻！
      await ctx.broadcast(ctx.config.slNews, `${outMsg.msg}\n${h.image(outMsg.data, 'image/png')}`);
    } else {
      // 啥新的新闻没有或者 boom
      if (outMsg.msg=="无可用新闻") return;
      await ctx.broadcast(ctx.config.slNews, outMsg.msg);
    }
  });
  // 指令注册
  ctx.command('cxGame')
    .action(async ({ session }) => {
      const cx = await command.getServer(ctx, session as Session);
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
      const status = await command.getStatus(ctx, session as Session);
      if (status['success']==0) {
        return session?.text('.msg',status);
      } else {
        return session?.text('.failed',status);
      }
    });
  ctx.command('random [最小数:number] [最大数:number]')
    .alias('随机数')
    .action(async ({ session },min,max) => {
      const random = await command.getRandom(ctx,session as Session,min,max);
      return session?.text('.msg',random);
    });
  ctx.command('info')
    .action(async ({ session }) => {
      const info = await command.getInfo(ctx,session as Session);
      if (info['success']==0){
        return session?.text('.msg',info);
      }
      else{
        return session?.text('.failed',info);
      }
    });
  ctx.command('rw')
    .action(async ({ session }) => {
      const rw = await command.getRandomWord(ctx,session as Session);
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
      await command.getBlueArchive(ctx, session as Session);
    });
  ctx.command('centerServerTest')
    .alias('测测中心服务器')
    .action(async ({ session }) => {
      const msg = await command.centerServerTest(ctx, session as Session);
      return session?.text(msg.success, msg.data);
    });
  ctx.command('meme [序号:posint]')
    .alias('memes')
    .action(async ({ session },count) => {
      await command.getMeme(ctx, session as Session, count);
    });
  ctx.command('randomCat')
    .alias('随机猫猫图')
    .alias('随机猫猫')
    .action(async ({ session }) => {
      await command.getCat(ctx, session as Session);
    });
  ctx.command('getQQInfo <QQ号:string>')
    .alias('获取QQ信息')
    .action(async ({ session }, qq) => {
      if (qq==undefined || isNaN(Number(qq))) return session?.text('.command') ;
      await command.getQQInfo(ctx, session as Session, qq);
    });
  ctx.command('msg2img')
    .alias('消息转图')
    .alias('m')
    .action(async ({ session }) => {
      await command.getMsg(ctx, session as Session);
    });
}
