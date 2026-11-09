# nanoPlayer recommendation Worker

独立无账户 Worker。服务端不保存用户、设备标识、音乐库或生成歌单；最近播放、候选轮换、生成日期和推荐缓存都在播放器本地。IP 限流由 Cloudflare 平台处理，不是用户账户。

## 在另一台计算机部署

先安装根目录及 `website/` 的锁定依赖，使用 `website` 已锁定的 Wrangler。下列命令在仓库根目录执行；命令会明确区分本地校验与远端部署。

1. `node website/node_modules/wrangler/bin/wrangler.js login`：登录管理目标域名及 Workers 的 Cloudflare 账户。
2. `pnpm recommendations:deploy:check`：本地校验 Worker。
3. `pnpm recommendations:deploy`：发布独立 Worker，记录返回的 HTTPS 地址。这不会发布播放器或官网。
4. `node website/node_modules/wrangler/bin/wrangler.js secret put APP_TOKEN --config services/recommendations/wrangler.jsonc`：交互输入独立随机长令牌，供客户端验证。勿把真实值提交到源码。

部署配置将独立 Worker 绑定到 `recommendations.nanodo.cc`，关闭 workers.dev 和预览 URL。客户端 CSP 已允许该域名。部署后用 HTTPS 验证路由；若更换域名，构建前同步更新 `src-tauri/tauri.conf.json` 的 `connect-src`。

当前 `wrangler.jsonc` 通过文本变量 `MODEL_BASE_URL=https://api.aicodemirror.ai/v1` 和 `MODEL=gpt-6-astra` 选用 AICodeMirror Responses API。部署 Worker 后，在 Cloudflare **Workers & Pages → nanoplayer-recommendations → Settings → Variables and Secrets** 新增 `MODEL_API_KEY`（类型 Secret），填入供应商 API Key。也可在终端交互运行 `node website/node_modules/wrangler/bin/wrangler.js secret put MODEL_API_KEY --config services/recommendations/wrangler.jsonc`。模型 Key 只保存在 Worker。客户端用的 `APP_TOKEN` 是另一个独立随机令牌。

配置外部模型时，Worker 将请求里的歌曲编号、标题和艺术家转交给 AICodeMirror，并请求 `store: false`。已使用合成曲目通过线上推理。Worker 手动处理上游重定向并拒绝非 2xx 响应，避免将模型密钥转发至其他地址。若切回 Workers AI，移除 `MODEL_BASE_URL` 并将 `MODEL` 改为账户可用的 Workers AI 模型。

在**未跟踪的** `.env.local` 配置构建参数：

```dotenv
VITE_RECOMMENDATIONS_URL=https://your-worker-host/recommend
VITE_RECOMMENDATIONS_TOKEN=the-same-app-token
```

构建变量会内嵌进客户端，无法当成不可提取的秘密。GitHub 桌面构建也需要同名环境变量（已由 release.yml 从 Actions secrets 注入）；仅在本机设置不会影响远程安装包。当前仓库不保存真实 endpoint/token；未配置时只显示本地推荐，默认开启的推荐选项也不会发请求。

`ALLOWED_ORIGINS` 是逗号分隔的精确来源白名单；默认覆盖 Tauri 常见 origin 和本地 1420 端口。部署后应按桌面/Android/iOS 实际 WebView Origin 验证并收紧。允许无 Origin 的原生请求仍必须带令牌。CORS 不能作为身份认证。

## 调用与保护

- 仅 `POST /recommend`（JSON、Bearer 令牌）；每 IP 每分钟最多 5 次。客户端每次启动至多尝试一次，失败持久退避 6 小时。
- 输入流最大 16 KB，最多 12 首偏好种子、400 首候选，仅接受 `id/title/artist`，字段上限 100 UTF-16 字符。客户端发送更严的 12 KB 预算。
- 提示明确把元数据当作不可信数据。返回值含最多 60 字名称、160 字一句话描述和候选集中最多 12 个唯一整数编号；错误不返回内部细节，不记录请求正文，无存储绑定。
- 内嵌共享令牌只能阻挡无令牌调用，逆向后第三方可复用。IP 限流也不是全局账单上限；上线账户应设置 Workers AI 额度/用量告警并监控滥用。更强应用真实性校验需要后续 App Attest / Play Integrity 与平台验证，不在当前无账户共享令牌方案内。
- 密钥轮换需同步构建新客户端；当前单令牌不保证旧版本兼容。勿把模型供应商凭证放到客户端。

本地测试：`node --test services/recommendations/worker.test.mjs`。客户端设计、上下文分析、轮换与验收边界见 [推荐设计](../../docs/architecture/RECOMMENDATIONS.md)。
