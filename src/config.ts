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

// 配置项类型定义
export interface ConfigType {
  cxV3: Array<ConfigCxV3>;
  rwAPI: string;
  htmlTimeout: number;
  timeout: number;
  baAPI: string[];
  newsAPI: string;
  catAPI: string;
  slNews: string[];
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
    slNews: Schema.array(String).default([""]).description("{platform}:{channelId}"),
    newsAPI: Schema.string()
      .default("https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=700330&count=1")
      .description("新闻 API")
  }).description("SL新闻列表"),
  Schema.object({
    specialMsg: Schema.array(String).default([]).description("特殊消息"),
    reactionId: Schema.array(Number).default([]).description("回应表情 ID")
  }).description("特殊消息回应")
]).description("基础设置");
