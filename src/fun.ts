import os from 'os';
import {version} from '../package.json';

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

// 主函数
export async function getSystemUsage() {
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
export async function fetchWithTimeout(url: string, options = {}, timeout = 5000) {
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
    return response;
  } catch (error) {
    clearTimeout(timeoutId); // 确保定时器被清除

    // 4. 区分超时错误和其他错误
    if (error.name === 'AbortError') {
      throw new Error("请求超时");
    } else {
      throw error; // 其他错误（如网络问题）
    }
  }
}
// 读取信息文件
export async function readInfoFile(): Promise<string> {
  const fs = require('node:fs/promises');
  const path = require('path');
  let info: string;
  try{
    const aPath = path.resolve(__dirname, '..')+path.sep+"res"+path.sep+"info.txt";
    info = await fs.readFile(aPath, 'utf8');
    info = info.toString()
      .replace("&version;",version);
  } catch (e) {
    info = e.message;
  }
  return info;
}
