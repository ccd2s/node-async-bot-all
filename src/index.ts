import { Context } from 'koishi'
import {getHongKongTime,fetchWithTimeout} from './fun'

export const name = 'node-async-bot-all'

async function getServer(ctx: Context, session: any) {
  let msg = "";
  let dataError = "";
  let data = "";
  let error = "";
  ctx.logger.info("Got: "+session.text('.message', {
    platform: session.platform,
    selfId: session.selfId,
  }));
  const time = getHongKongTime();
  try {
    // 获取香港时区当前时间
    const response = await fetchWithTimeout('https://api.tasaed.top/get/minecraftServer/', {}, 8000); // 8秒超时
    if (response.ok) {
      data = await response.text();
      ctx.logger.info("Server data: "+data);
      data = JSON.parse(data);
      msg = `${time}\n【服务器当前人数】\n  ➣ ${data['version']}：${data['players']}\n进服指南请在群公告中查看。`;
      ctx.logger.info("Sent: "+msg)
    } else {
      dataError = await response.text();
      try {
        const vError = JSON.parse(dataError);
        error = vError['data'];
      } catch (e) {
        if(dataError.includes("CDN节点请求源服务器超时")){
          error = "请求超时";
        } else {
          error = "未知错误";
        }
      }
      ctx.logger.error(`Error fetching data: ${dataError}`);
      msg = `${time}\n查询失败：${error}\n请稍后重试`;
      ctx.logger.info("Sent: "+msg)
    }
  } catch (err) {
    ctx.logger.error(`Request error:  ${err.message}`);
    msg = `${time}\n查询失败：请求超时\n请稍后重试`;
    ctx.logger.info("Sent: "+msg)
  }
  return msg;
}

export function apply(ctx: Context) {
  ctx.command('cx')
    .action(({ session }) => {
      return getServer(ctx,session);
    });
}
