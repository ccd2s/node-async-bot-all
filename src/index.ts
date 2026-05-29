// koishi and plugin
import { Context, Session, h, Command } from "koishi";
// node-async-bot-all
import { CommandHandler } from "./commands.ts";
import * as fun from "./fun.ts";
import { botDataTables, botDataType } from "./config.ts";
import { version } from "../package.json";

// 在上下文中注入
export const inject = ["database", "installer", "puppeteer", "cron"];

// 类型声明
declare module "koishi" {
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
  interface Context {
    cron: (expression: string, callback: () => void) => void;
  }
}

// 数据库类型

export { Config, name, usage } from "./config.ts";

// 插件注册
export function apply(ctx: Context) {
  // 国际化
  ctx.i18n.define("zh-CN", require("./locales/zh-CN"));
  // 应用启动
  ctx.on("ready", async () => {
    const naBot = new NodeAsyncBot();
    await naBot.init(ctx);
    await naBot.registerNews();
    await naBot.registerCommand();
  });
}

export class NodeAsyncBot {
  private _ctx: Context | undefined;
  private _botData: botDataType | undefined;
  private _na: Command | undefined;
  private _registeredNews = false;
  private _registeredCommand = false;

  public get ctx(): Context {
    if (!this._ctx) throw new Error("未初始化");
    return this._ctx;
  }

  private set ctx(value: Context) {
    this._ctx = value;
  }

  public get botData(): botDataType {
    if (!this._botData) throw new Error("未初始化");
    return this._botData;
  }

  private set botData(value: botDataType) {
    this._botData = value;
  }

  public get na(): Command {
    if (!this._na) throw new Error("未初始化");
    return this._na;
  }

  private set na(value: Command) {
    this._na = value;
  }

  public async init(ct: Context): Promise<void> {
    this.ctx = ct;
    const date = new Date();
    this.botData = {
      version,
      uptime: date.getTime().toString().substring(0, 10)
    };
    // 数据库表
    this.ctx.model.extend("botData", {
      // 向表中注入字符串
      id: "string",
      data: "string"
    });
    // 更新表里面的数据
    await this.ctx.database.upsert("botData", [
      { id: "uptime", data: this.botData.uptime },
      { id: "version", data: this.botData.version }
    ]);
    this.na = this.ctx.command("na");
  }

  // reaction 辅助方法
  private async startReaction(session: Session): Promise<void> {
    if (session.bot.createReaction)
      await session.bot.createReaction(
        session.channelId as string,
        session.messageId as string,
        `face|424`
      );
  }

  private async endReaction(session: Session): Promise<void> {
    if (session.bot.deleteReaction)
      await session.bot.deleteReaction(
        session.channelId as string,
        session.messageId as string,
        `face|424`
      );
    if (session.bot.createReaction)
      await session.bot.createReaction(
        session.channelId as string,
        session.messageId as string,
        `face|144`
      );
  }

  private async endReactionFailed(session: Session): Promise<void> {
    if (session.bot.deleteReaction)
      await session.bot.deleteReaction(
        session.channelId as string,
        session.messageId as string,
        `face|424`
      );
    if (session.bot.createReaction)
      await session.bot.createReaction(
        session.channelId as string,
        session.messageId as string,
        `face|38`
      );
  }

  // 执行指令的通用流程：reaction + 命令执行
  private async execCommand(
    session: Session,
    loggerName: string,
    fn: (handler: CommandHandler) => Promise<number | void>
  ): Promise<void> {
    const handler = new CommandHandler(this.ctx, session, loggerName);
    await this.startReaction(session);
    const result = await fn(handler);
    if (result === 0 || result === undefined) {
      await this.endReaction(session);
    } else {
      await this.endReactionFailed(session);
    }
  }

  public async registerNews(): Promise<void> {
    if (this._registeredNews) return;
    this._registeredNews = true;
    // sl 新闻 定时任务与指令
    this.na.subcommand("steamNews").action(async ({ session }) => {
      const log = this.ctx.logger("steamNews");
      const results = await CommandHandler.getNewsMsg(this.ctx, 1);
      for (const outMsg of results) {
        if (outMsg.data) {
          await (session as Session)?.send(`${outMsg.msg}\n${h.image(outMsg.data, "image/png")}`);
        } else {
          log.error(outMsg);
          await (session as Session)?.send(outMsg.msg);
        }
      }
    });
    // 每小时0分
    this.ctx.cron("0 * * * *", async () => {
      this.ctx.emit("node-async/news");
    });
    // 每小时30分
    this.ctx.cron("30 * * * *", async () => {
      // 触发事件
      this.ctx.emit("node-async/news");
    });
    // 事件监听
    this.ctx.on("node-async/news", async () => {
      // 获取新闻
      const results = await CommandHandler.getNewsMsg(this.ctx, 0);
      if (results.length === 0) return;
      for (const outMsg of results) {
        if (outMsg.data) {
          // 发现新的新闻！
          await this.ctx.broadcast(
            this.ctx.config.steamNews,
            `${outMsg.msg}\n${h.image(outMsg.data, "image/png")}`
          );
        } else {
          // 请求失败
          await this.ctx.broadcast(this.ctx.config.steamNews, outMsg.msg);
        }
      }
    });
    this.ctx.on("message", async (session) => {
      if (session.bot.createReaction) {
        for (const content of this.ctx.config.specialMsg) {
          if (session.content === content) {
            await session.bot.createReaction(
              session.channelId as string,
              session.messageId as string,
              `face|${String(fun.random(2, this.ctx.config.reactionId))}`
            );
          }
        }
      }
    });
  }

  public async registerCommand(): Promise<void> {
    if (this._registeredCommand) return;
    this._registeredCommand = true;
    this.na.subcommand("cxGame").action(async ({ session }) => {
      await this.execCommand(session as Session, "cx", (handler) => handler.server());
    });
    this.na
      .subcommand("status")
      .alias("stats")
      .alias("状态")
      .action(async ({ session }) => {
        await this.execCommand(session as Session, "status", async (handler) => {
          const status = await handler.status();
          await session?.send(
            session?.bot.adapterName == "qq"
              ? h("qq:markdown", {
                  content: session?.text(status["success"] == 0 ? ".msg-md" : "failed-md", status)
                })
              : session?.text(status["success"] == 0 ? ".msg" : "failed", status)
          );
          return status["success"] == 0 ? 0 : 1;
        });
      });
    this.na
      .subcommand("random [最小数:number] [最大数:number]")
      .alias("随机数")
      .action(async ({ session }, min, max) => {
        await this.execCommand(session as Session, "random", async (handler) => {
          const random = await handler.random(min, max);
          await session?.send(
            session?.bot.adapterName == "qq"
              ? h("qq:markdown", {
                  content: session?.text(".msg-md", random)
                })
              : session?.text(".msg", random)
          );
        });
      });
    this.na.subcommand("info").action(async ({ session }) => {
      await this.execCommand(session as Session, "info", async (handler) => {
        const info = await handler.info();
        await session?.send(
          session?.bot.adapterName == "qq"
            ? h("qq:markdown", {
                content: session?.text(info["success"] == 0 ? ".msg-md" : "failed-md", info)
              })
            : session?.text(info["success"] == 0 ? ".msg" : "failed", info)
        );
        return info["success"] == 0 ? 0 : 1;
      });
    });
    this.na.subcommand("rw").action(async ({ session }) => {
      await this.execCommand(session as Session, "rw", async (handler) => {
        const rw = await handler.randomWord();
        await session?.send(
          session?.bot.adapterName == "qq"
            ? h("qq:markdown", {
                content: session?.text(rw["success"] == 0 ? "failed-md" : "failed-md", rw)
              })
            : session?.text(rw["success"] == 0 ? "failed" : "failed", rw)
        );
        return rw["success"] == 0 ? 0 : 1;
      });
    });
    this.na
      .subcommand("randomBA")
      .alias("随机ba图")
      .action(async ({ session }) => {
        await this.execCommand(session as Session, "ba", (handler) => handler.blueArchive());
      });
    // this.na
    //   .subcommand('centerServerTest')
    //   .alias('测测中心服务器')
    //   .action(async ({ session }) => {
    //     await this.execCommand(session as Session, 'centerServerTest', (handler) => handler.centerServerTest());
    //   });
    this.na
      .subcommand("randomCat")
      .alias("随机猫猫图")
      .alias("随机猫猫")
      .action(async ({ session }) => {
        await this.execCommand(session as Session, "cat", (handler) => handler.cat());
      });
  }
}
