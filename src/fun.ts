import os from 'os';
import fs from 'fs';
import ping from 'ping';
import path from 'path';
import { Context, FlatPick } from "koishi";
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
  return Math.round((usedMemory / totalMemory) * 100);
}

// 获取CPU使用率（异步函数）
async function getCpuUsage(): Promise<number> {
  const startUsage = process.cpuUsage();  // 初始CPU使用量

  // 等待1秒计算CPU使用率
  return new Promise<number>(resolve => {
    setTimeout(() => {
      const endUsage = process.cpuUsage(startUsage);
      const totalUsage = endUsage.user + endUsage.system;
      const percentage = totalUsage / (1000 * 1000);  // 转换为百分比
      resolve(Math.round(percentage * 100));
    }, 1000);
  });
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
  // 香港时区为 UTC+8（无夏令时）
  const hkOffset = 8 * 60; // 分钟偏移量
  const hkTime = new Date(now.getTime() + (hkOffset + now.getTimezoneOffset()) * 60000);

  return [
    hkTime.getFullYear(),
    (hkTime.getMonth() + 1).toString().padStart(2, '0'),
    hkTime.getDate().toString().padStart(2, '0')
  ].join('-') + ' ' + [
    hkTime.getHours().toString().padStart(2, '0'),
    hkTime.getMinutes().toString().padStart(2, '0'),
    hkTime.getSeconds().toString().padStart(2, '0')
  ].join(':');
}

// 增加了请求超时的 fetch
export async function fetchWithTimeout(url: string, options = {}, timeout: number = 5000, log: any):Promise<Response> {
  // 1. 创建 AbortController 实例
  const controller = new AbortController();

  // 2. 设置超时定时器
  const timeoutId = setTimeout(() => {
    controller.abort(); // 超时终止请求
  }, timeout);

  try {
    // 3. 发起请求并传入 signal
    const response = await fetch(url, {
      ...options,
      signal: controller.signal // 绑定终止信号
    });

    clearTimeout(timeoutId); // 请求成功，清除定时器
    // 返回状态
    log.info(`Fetch code: ${response.status}`);
    return response;
  } catch (error) {
    clearTimeout(timeoutId); // 确保定时器被清除
    // 报错
    log.error(error);
    log.error(`${error.name}: ${error.message}`);
    // 4. 区分超时错误和其他错误
    if (error.name === 'AbortError') {
      throw new Error("请求超时");
    } else {
      throw error; // 其他错误（如网络问题）
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
export function getMsgCount(array:FlatPick<Analytics.Message, "type" | "count">[]): Object {
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
