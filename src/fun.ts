import os from 'os';
import fs from 'fs';
import ping from 'ping';
import path from 'path';
import {Context, FlatPick, Random, Time} from "koishi";
import Analytics from "@koishijs/plugin-analytics";

// 获取系统名称
function getSystemName(): string {
  return os.type() + ' ' + os.release();
}

// 获取内存使用率
function getMemoryUsage(): number {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  return Math.round((usedMemory / totalMemory) * 10000) / 100;
}

// 获取CPU使用率（异步函数）
async function getCpuUsage(): Promise<number> {
  const cpus1 = os.cpus();

  // 等待 100ms 后再次采样
  await new Promise(resolve => setTimeout(resolve, 100));

  const cpus2 = os.cpus();

  let totalIdle = 0;
  let totalTick = 0;

  for (let i = 0; i < cpus1.length; i++) {
    const cpu1 = cpus1[i];
    const cpu2 = cpus2[i];

    // 计算第一次采样的总时间
    const idle1 = cpu1.times.idle;
    const total1 = Object.values(cpu1.times).reduce((acc, time) => acc + time, 0);

    // 计算第二次采样的总时间
    const idle2 = cpu2.times.idle;
    const total2 = Object.values(cpu2.times).reduce((acc, time) => acc + time, 0);

    // 计算差值
    const idleDiff = idle2 - idle1;
    const totalDiff = total2 - total1;

    totalIdle += idleDiff;
    totalTick += totalDiff;
  }

  // 计算使用率百分比
  const usage = 100 - (100 * totalIdle / totalTick);
  return Math.round(usage * 100) / 100; // 保留两位小数
}

// 系统信息主函数
export async function getSystemUsage():Promise<Object> {
  let info: object;
  try {
    info = {
      "name": getSystemName(),
      "cpu": await getCpuUsage()+"%",
      "memory": getMemoryUsage()+"%",
      "success": 0
    };
  } catch (error) {
    info = {
      "data": error.message,
      "success": 1
    };
  }
  return info;
}

// 获取香港时间
export function getHongKongTime(): string {
  const now = new Date();

  // 使用 Intl.DateTimeFormat 获取香港时区的时间
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(now);
  const dateObj: Record<string, string> = {};

  parts.forEach(part => {
    if (part.type !== 'literal') {
      dateObj[part.type] = part.value;
    }
  });

  // 构建格式化字符串
  return `${dateObj.year}-${dateObj.month}-${dateObj.day} ${dateObj.hour}:${dateObj.minute}:${dateObj.second}`;
}

// 增加了请求超时的 fetch
export async function fetchWithTimeout(url: string, options = {}, timeout: number = 5000, log: any):Promise<Response> {
  // 创建 AbortController 用于取消请求
  const controller = new AbortController();
  const { signal } = controller;

  // 合并 signal 到 options
  const fetchOptions: RequestInit = {
    ...options,
    signal,
  };

  // 创建超时 Promise
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {
    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);
    log.info(`Fetch code: ${response.status}`);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    // 报错
    log.error(error);
    log.error(`${error.name}: ${error.message}`);
    if (error.name === 'AbortError') {
      throw new Error(`请求超时。(${timeout}ms)`);
    } else {
      throw error;
    }
  }
}

// 读取信息文件
export async function readInfoFile(ctx: Context): Promise<string> {
  let info: string;
  try{
    const aPath = path.resolve(__dirname, '..')+path.sep+"res"+path.sep+"info.txt";
    info = await fs.promises.readFile(aPath, 'utf8');
    info = info.toString()
      .replace(
        "&version;",
        (await ctx.database.get("botData", "version"))[0].data
      );
  } catch (error) {
    info = error.message;
  }
  return info;
}

// 计算时间戳差值
export function formatTimestampDiff(start: number, end: number): string {
  // 获取绝对差值
  const diff = Math.abs(end - start);

  // 计算小时、分钟和秒
  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;

  return `${hours} 时 ${minutes} 分 ${seconds} 秒`;
}

// 计算收发消息数量
export async function getMsgCount(ctx: Context): Promise<Object> {
  const array = await ctx.database.get('analytics.message', {date:Time.getDateNumber()-1},['type','count']);
  ctx.logger.info(Time.getDateNumber()-1);
  let receive = 0;
  let send = 0;
  array.forEach((item:FlatPick<Analytics.Message, "type" | "count">) => {
    if(item.type=='receive'){
      receive=receive+item.count;
    }else {
      send=send+item.count;
    }
  });
  return {"receive":receive,"send":send};
}

// Ping
export async function hostPing(host:string):Promise<{success: boolean, data?: any, ip?: string, alive?: boolean, packetLoss?: string}> {
  try {
    const tmp = await ping.promise.probe(host, {
      timeout: 5,
    });
    return {
      "success":true,
      "ip":tmp.numeric_host,
      "alive":tmp.alive,
      "packetLoss":(tmp.packetLoss).toString()
    };
  } catch (error) {
    return {
      "success":false,
      "data":error.message
    };
  }
}

/** Random
 * @param type
 * 0:int 1:real 2:pick
 * @param data
 * @param data2
 */
export function random(type:number = 0,data:any,data2?:any):number {
  const random = new Random(() => Math.random());
  switch (type) {
    case 0:
      return random.int(data, data2);
    case 1:
      return random.real(data, data2);
    case 2:
      return random.pick(data);
    default:
      return 0;
  }
}

export async function getHttp(log:any,url:string,timeout:number): Promise<{ success: boolean,data:object,error?:boolean }> {
  let data : string;
  try {
    // 发送请求
    const response = await fetchWithTimeout(url, {}, timeout, log);
    // 判断是否成功
    if (response.ok) {
      data = await response.text();
      log.info("Server data: "+data);
      return {
        "data":JSON.parse(data),
        "success":true
      };
    } else {
      // 请求失败
      data = await response.text();
      log.error(`Error fetching data: ${data}`);
      data = JSON.parse(data);
      return {
        "data":JSON.parse(data),
        "error":false,
        "success":false
      };
    }
  } catch (err) {
    // 报错
    log.error(`Request error:  ${err.message}`);
    return {
      "data":{"name":err.name,"message":err.message},
      "error":true,
      "success":false
    };
  }
}
