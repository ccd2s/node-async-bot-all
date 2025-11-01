import { Context, Schema, Session } from 'koishi';
import {getServer, getStatus, getRandom, getInfo, getRW, getBA, serverTest} from './commands';
import { version } from '../package.json';

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

export interface ConfigCxV2 {
  id: string,
  api: Array<string>,
  note: Array<string>
}

export interface Config {
  cxV2: Array<ConfigCxV2>,
  rwAPI:string,
  timeout:number,
  baAPI:string[];
}

export const Config: Schema<Config> =
  Schema.intersect([
    Schema.object({
      timeout: Schema.number().default(8000).description('超时时间（毫秒）')
    }).description('基础'),
    Schema.object({
      cxV2: Schema.array(
        Schema.object({
          id: Schema.string().required().description('查询 群'),
          api: Schema.array(String).description('查询 API'),
          note: Schema.array(String).description('查询 备注')
        })
      ).default([]).description('查询的 API 和 群')
    }).description('查询'),
    Schema.object({
      rwAPI: Schema.string().default('https://api.tasaed.top/rw/').description('随机文本 API')
    }).description('随机文本'),
    Schema.object({
      baAPI: Schema.array(String).default(['https://rba.kanostar.top/portrait']).description('随机BA图 API')
    }).description('随机BA图'),
    Schema.object({
      serverPing: Schema.dict(String).role('table').description('键：群号；值：Host')
    }).description('服之测测（Ping）')
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
  ctx.command('cxMc')
    .action(async ({ session }) => {
      const cx = await getServer(ctx, <Session>session);
      if (cx['success']==0) {
        return session?.text('.msg',cx);
      } else if (cx['success']==1) {
        return session?.text('.forbidden',cx);
      } else if (cx['success']==2) {
        return session?.text('.failed',cx);
      }
    });
  ctx.command('status')
    .action(async ({ session }) => {
      const status = await getStatus(ctx, <Session>session);
      if (status['success']==0) {
        return session?.text('.msg',status);
      } else {
        return session?.text('.failed',status);
      }
    });
  ctx.command('random [最小数:number] [最大数:number]')
    .alias('随机数')
    .action(async ({ session },min,max) => {
      const random = await getRandom(ctx,<Session>session,min,max);
      return session?.text('.msg',random);
    });
  ctx.command('info')
    .action(async ({ session }) => {
      const info = await getInfo(ctx,<Session>session);
      if (info['success']==0){
        return session?.text('.msg',info);
      }
      else{
        return session?.text('.failed',info);
      }
    });
  ctx.command('rw')
    .action(async ({ session }) => {
      const rw = await getRW(ctx,<Session>session);
      if (rw['success']==0){
        return session?.text('.msg',rw);
      }
      else if (rw['success']==1){
        return session?.text('.failed1',rw);
      }
      else{
        return session?.text('.failed2',rw);
      }
    });
  ctx.command('randomBA')
    .alias('随机ba图')
    .action(async ({ session }) => {
      await getBA(ctx, <Session>session);
    });
  ctx.command('serverTest')
    .alias('服之测测')
    .action(async ({ session }) => {
      const server = await serverTest(ctx, <Session>session);
      if (server['success']==0) {
        return session?.text('.msg',server);
      } else if (server['success']==1) {
        return session?.text('.forbidden',server);
      } else {
        return session?.text('.failed',server);
      }
    });
}
