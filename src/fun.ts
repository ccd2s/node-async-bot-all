import os from 'os';

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
  let info: string;
  try {
    info = `系统名称: ${getSystemName()}\nCPU使用率: ${await getCpuUsage()}%\n内存使用率: ${getMemoryUsage()}%`;
  } catch (error) {
    info = error.message;
  }
  return info;
}

// 获取香港时间
export function getHongKongTime(): string {
  const date = new Date();
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const partMap: Record<string, string> = {};

  parts.forEach(part => {
    partMap[part.type] = part.value;
  });

  return `${partMap.year}-${partMap.month}-${partMap.day} ${partMap.hour}:${partMap.minute}:${partMap.second}`;
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
