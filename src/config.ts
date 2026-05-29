import { Schema } from "koishi";

// 插件简介
export const name = "node-async-bot-all";
export const usage = "这是一个私有插件。";

// 查询 指令配置项
export interface ConfigCxV3 {
  id: string;
  server: Array<ConfigV3Server>;
}

interface ConfigV3Server {
  api: string;
  note: string;
  type: "mc" | "a2s" | null | undefined;
}

interface ConfigV2SteamNews {
  name: string;
  appUrl: string;
}

// 配置项类型定义
export interface ConfigType {
  cxV3: Array<ConfigCxV3>;
  rwAPI: string;
  htmlTimeout: number;
  timeout: number;
  baAPI: string[];
  newsAPI: Array<ConfigV2SteamNews>;
  catAPI: string;
  steamNews: string[];
  specialMsg: string[];
  reactionId: number[];
}

export interface botDataTables {
  id: string;
  data: string;
}

export interface botDataType {
  uptime: string;
  version: string;
}

// 配置项
export const Config: Schema<ConfigType> = Schema.intersect([
  Schema.object({
    timeout: Schema.number().default(8000).description("超时时间（毫秒）"),
    htmlTimeout: Schema.number().default(30000).description("HTML 超时时间（毫秒）")
  }).description("基础"),
  Schema.object({
    cxV3: Schema.array(
      Schema.object({
        id: Schema.string().description("查询 群"),
        server: Schema.array(
          Schema.object({
            api: Schema.string().description("查询 API | HOST"),
            note: Schema.string().description("查询 备注"),
            type: Schema.union(["mc", "a2s"]).description("查询 类型")
          })
        ).description("查询 服务器")
      })
    )
      .default([])
      .description("查询的群")
  }).description("查询"),
  Schema.object({
    rwAPI: Schema.string().default("https://api.tasaed.top/rw/").description("随机文本 API")
  }).description("随机文本"),
  Schema.object({
    baAPI: Schema.array(String)
      .default(["https://rba.kanostar.top/portrait"])
      .description("随机BA图 API")
  }).description("随机BA图"),
  Schema.object({
    catAPI: Schema.string()
      .default("https://api.thecatapi.com/v1/images/search")
      .description("随机猫猫图 API")
  }).description("随机猫猫图"),
  Schema.object({
    steamNews: Schema.array(String).default([""]).description("{platform}:{channelId}"),
    newsAPI: Schema.array(
      Schema.object({
        name: Schema.string().description("新闻抓取的 App 名称，随便写"),
        appUrl: Schema.string().description(
          "新闻抓取的 AppId URL，可加参数，如 3629270/?l=schinese"
        )
      })
    )
      .default([{ name: "SCP SL", appUrl: "700330/?l=schinese" }])
      .description("新闻抓取配置")
  }).description("Steam 新闻抓取列表"),
  Schema.object({
    specialMsg: Schema.array(String).default([]).description("特殊消息"),
    reactionId: Schema.array(Number).default([]).description("回应表情 ID")
  }).description("特殊消息回应")
]).description("基础设置");
