import { Context, Schema } from 'koishi';
import {getServer, getStatus, getRandom, getInfo, getRW} from './commands';
import {version} from '../package.json';

export const inject = ['database'];

declare module 'koishi' {
  interface Tables {
    botData: botDataTables;
  }
}

interface botDataTables {
  id: string,
  data: string;
}

export const name = 'node-async-bot-all';
export const usage = '这是一个私有插件。';

export interface Config {
  cxV2Group:Array<string>,
  cxV2API:Array<string>,
  rwAPI:string,
  timeout:number;
}

export const Config: Schema<Config> =
  Schema.intersect([
    Schema.object({
      timeout: Schema.number().default(8000).description('超时时间（毫秒）')
    }).description('基础'),
    Schema.object({
      cxV2Group: Schema.array(String).description('查询 群，对应 API'),
      cxV2API: Schema.array(String).description('查询 API，对应 群')
    }).description('查询'),
    Schema.object({
      rwAPI: Schema.string().default('https://api.tasaed.top/rw/').description('随机文本 API')
    }).description('随机文本')
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
  // 指令注册
  ctx.command('cx')
    .action(async ({ session }) => {
      const cx = await getServer(ctx, session);
      if (cx['success']==0) {
        return session.text('.msg',cx);
      } else if (cx['success']==1) {
        return session.text('.failed',cx);
      } else if (cx['success']==2) {
        return session.text('.forbidden',cx);
      } else if (cx['success']==3) {
        return session.text('.msgNoPlayer',cx);
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
}
