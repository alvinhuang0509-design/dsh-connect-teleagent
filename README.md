# dsh-connect-teleagent

[![npm](https://img.shields.io/npm/v/dsh-connect-teleagent.svg)](https://www.npmjs.com/package/dsh-connect-teleagent)
[![license](https://img.shields.io/npm/l/dsh-connect-teleagent.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/dsh-connect-teleagent.svg)](https://nodejs.org)

DeepSeek Harness 独立插件：把 **中国电信天翼 AI「星辰超级智能体」** 接进 DSH，使用**已修正的 v1 云网关签名**（两轮 HMAC-SHA256），带积分/每日签到与输入框内账号条。

| | |
|---|---|
| 仓库 | <https://github.com/alvinhuang0509-design/dsh-connect-teleagent> |
| 问题反馈 | <https://github.com/alvinhuang0509-design/dsh-connect-teleagent/issues> |
| npm | <https://www.npmjs.com/package/dsh-connect-teleagent> |
| 许可证 | MIT |

## 为什么需要这个插件

`dsh-codearts-auth` 的 TeleAgent 推理请求会失败：

```
teleagent: HTTP 401 — code=40104 unsupported sign version
→ DSH 把它归为 AUTH，界面显示「API 密钥无效」
```

「API 密钥无效」是误导性文案（`dsh-client-ui-trajectory` 里 `if (errorCode === "AUTH") return "API 密钥无效"` 的硬编码）。真实原因是**签名协议错了**，与密钥、积分、登录都无关：

| | 旧插件（错误） | 本插件（正确） |
|---|---|---|
| 签名版本头 | `local-v1` | **`v1`** |
| HMAC 密钥 | 本地随机 `sign_key`（从不在服务端注册） | **登录 JWT 的第 3 段（签名段）** |
| 轮数 / 编码 | 单轮 / base64url | **两轮嵌套 / 小写 hex** |
| `X-SA-*` 与 `X-SuperAgent-*` | 两组都发、同一个随机密钥 | **只发 `X-Superagent-*`（云网关只验这组）** |
| 时间戳 | 毫秒（X-SA）/ 秒混用 | **秒（10 位）** |
| 请求体 | 不参与签名 | **SHA256(body 原始字节) 参与第二轮签名** |

`local-v1` + 随机 `sessionKey` 其实是官方 App **本机内核**（`127.0.0.1:4397`）的鉴权，原插件误把它发给了云网关。2026-11 云原生网关开始真正验签，于是全量 40104。

### 正确的 v1 算法

```
K        = X-Token 去掉 "<tenant>:" 后的 JWT 第 3 段
m1       = ["superagent-auth-v1", token, installId, tsSec, nonce].join("/")   # 斜杠
sig1     = hex(HMAC_SHA256(K, m1))
bodyHash = hex(SHA256(实际发送的请求体原始字节))
m2       = ["superagent-auth-v1", METHOD, signPath, tsSec, nonce,
            appVersion, bodyHash].join("\n")                                  # 换行
sig2     = hex(HMAC_SHA256(sig1, m2))   => X-Superagent-Signature
```

- `signPath = /superCowork/sapi/api/v1/chat/completions`
- 头里版本是 `v1`，消息里的方案常量是 `superagent-auth-v1`（**两个不同的字符串**）
- 第一轮 `/`、第二轮 `\n`，分隔符不同是最大的坑
- `ts` 用秒；毫秒会回 `40103 时间不同步`
- body 必须**只序列化一次**，签名与发送用同一份字节（网关会重算 bodyHash）

参考：[liao96312/teleagent-proxy](https://github.com/liao96312/teleagent-proxy) 的 `docs/signature-algorithms.md` / `scripts/teleagent-shim.js`。本插件已在 2026-11-04 用真实账号**单次**签名请求验证 HTTP 200，且本地 mock 网关做了独立的逐字节验签集成测试。

## 安装

本插件与 `dsh-codearts-auth` 的 provider id 都是 `teleagent`，**同时启用会冲突**，装本插件前请先卸载它。

```sh
DSH="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"

# 从 npm 安装
"$DSH" plugin --profile desktop add dsh-connect-teleagent

# 或从源码目录安装（开发）
"$DSH" plugin --profile desktop install /path/to/dsh-connect-teleagent

# 安装后重启 DeepSeek Harness
```

### 关于构建：本包**无需在安装时构建**

`lib/client.js`（客户端面板）是**预构建并随包发布**的，因此本包**没有** `prepare` / `install` / `postinstall` 脚本。

这一点是刻意的：`dsh-codearts-auth` 当初装不上，正是因为它的 `prepare` 会调用 `pnpm`，而 Desktop CLI 的 PATH 里没有 `pnpm`：

```
[ERR_PNPM_PREPARE_PACKAGE] ... `pnpm install` spawn ENOENT
sh: pnpm: command not found
```

⇒ 从 git 或 npm 安装本插件时，**不需要 pnpm、不需要 allowBuilds 放行**。

> 只有在你要修改 `plugin-src/client/index.js` 时才需要本地重建：
> `npm i` 后执行 `npm run build:client`（devDependency 里只有 esbuild）。

## 凭据：装好即用，无需重新登录

本插件**复用** `dsh-codearts-auth` 已写入 `~/.dsh/.credentials.yaml` 的凭据：

- `TELEAGENT_ACCOUNT_<HEX>`（账号池条目，从 `~/.dsh/jet-hub/state.json` 里挑 `enabled` 的 teleagent 账号）
- `TELEAGENT_ACCESS_TOKEN`（默认 ref，回退）
- `TELEAGENT_DEVICE_ID`（12 位 hex 设备标识）

新签名还需要一个稳定的 **`installId`**（UUID）。旧凭据里没有，插件会在首次使用时生成并持久化到 `TELEAGENT_INSTALL_ID`，之后复用。也可以点面板里的「修复凭据」手动补齐。

> ⚠️ 一旦 `installId` 生成，请勿删除 `TELEAGENT_INSTALL_ID` 引用：改变设备身份会提高风控命中率。

## 用法

- **输入框工具行、模型名左侧的账号条**（`conversation.input.right`，与 `conversation.input.model` 同一行、渲染在它之前）：只在当前会话选中 `teleagent` 模型时出现，显示 `● 16,034.51 · AlvinH`；点开是账号面板（优先向上弹出，空间不足则向下）——账号名 +「当前选用」、积分余额、套餐、今日签到 / 每日可领 / 累计天数与积分、活动标题、「一键刷新」与最近刷新时间。切到其它 provider 时自动隐藏，且**不发任何请求**（120s 轮询，仅在可见时拉取）。

> **1.0.1 修复**：`conversation.input.right` 是 `scope: 'session'` 的 list slot，宿主可能对同一个 inject 工厂执行多次（每个活跃会话一次）。原先直接在工厂里 `register`，导致同一个账号条被注册 N 份——表现为输入框里并排出现三个 `· TeleAgent`。现在注册走 `registerOnce()`，按 id 去重，重复调用只返回既有 disposer。
- **设置 → TeleAgent**：查看登录状态/有效期、打开官方登录页、粘贴回调 URL/token 登录、修复凭据、查询积分余额、查签到状态、一键领取积分、查看模型列表。
- **斜杠命令**（headless 也可用）：
  - `/teleagent status` — 登录状态
  - `/teleagent login [回调URL或token]` — 不带参数则显示官方登录页
  - `/teleagent repair` — 补齐 installId / deviceId
  - `/teleagent balance` / `checkin` / `claim` / `user`
- **模型选择器**：选 `teleagent` provider 下的模型即可。

## 与旧插件的差异

| 能力 | 说明 |
|---|---|
| 推理 | ✅ v1 签名，OpenAI 兼容 SSE，工具调用、system、max_tokens、temperature、stop |
| 登录 | ✅ 复用现有凭据 + 手动粘贴回调/token（不做 CDP 浏览器自动登录） |
| 积分/签到 | ✅ 余额（`data.current_points_balance`）、每日可领/累计天数/累计积分/今日是否已领、一键领取（GET `checkTask`） |
| 多账号池 | ⚠️ 只使用 `jet-hub/state.json` 里启用的那一个账号（不做换号） |
| 模型目录 | 静态表 `chat-nano` 轻量 / `chat-lite` 智能 / `chat-pro` 旗舰（官方客户端档位 ID；网关不提供模型列表端点，三档共享 100K 上下文 / 16384 输出） |
| 客户端 | 独立 11 KB 面板（旧插件是覆盖 15 个 provider 的 313 KB 单体 bundle） |
| RPC | 独立 `/api/teleagent-connect`（旧插件是 234 KB 单体 `jet-hub-rpc.js`） |

## 代码结构

```
lib/product.js       常量、端点、回退模型表
lib/sign.js          ★ v1 两轮 HMAC 签名 + 完整对齐的头集合
lib/credentials.js   凭据解析/复用、installId 补齐
lib/callback.js      回调 URL / token 解析（无依赖）
lib/service.js       user_info / 积分 / 签到 / 登录
lib/adapter.js       LLM 适配器（ctx.llm.registerAdapter）
lib/rpc.js           精简设置面板 RPC
lib/index.js         apply()：注册 provider / 面板 / 命令
lib/{openai-compat,sse,message-shape,model-queue}.js
                     从原插件原样复制的通用 SSE / 工具调用解析（与 provider 无关）
plugin-src/client/   React 设置面板源码
scripts/build-client.mjs  esbuild 打包
tests/sign.test.mjs  离线单元测试
```

## ⚠️ 风控警告（必读）

TeleAgent 网关有服务端风控，且**封禁是账号级的**：一旦被封，官方 App 也一起用不了。

- `40105 疑似攻击` → `40109 current user is banned`
- 头号触发因素：**对生产网关做签名爆破 / 大量错误签名试探**
- 本插件签名一次算对，**不做任何试探性请求**；也请不要改动签名逻辑反复试
- 降低风险：串行、人类节奏、控制用量、固定 deviceId/installId、别并发、别当压测机
- 若出现 `40105`：立即停止一切请求，等待解封（常见 24h～7d），不要重试

背景取证：[ban-risk.md](https://github.com/liao96312/teleagent-proxy/blob/master/docs/ban-risk.md)。

> 本项目仅用于在自己账号、自己机器上做协议研究和小量使用。把它当日常主力通道刷量，被封是概率问题。

## 测试

```sh
npm test        # 全部 4 组离线测试
```

| 测试 | 覆盖 |
|---|---|
| `tests/sign.test.mjs` | v1 两轮 HMAC、分隔符、bodyHash、头集合、UUIDv7、凭据/回调解析 |
| `tests/apply.test.mjs` | `apply()` 不抛错、命令 handler 形状、RPC 路由注册、`login.submit` |
| `tests/credits.test.mjs` | 用真实抓包报文断言积分/签到字段、模型档位、领取走 GET |
| `tests/client.test.mjs` | 客户端 bundle 的 slot 注册位置与 provider 门控（`next` 优先） |

```sh
npm run build:client   # 修改 plugin-src/client 后重建 lib/client.js
```

## 发布（维护者）

```sh
npm login --auth-type=web   # 首次：登录 npm 账号 alvinhuang0509-design
npm whoami                  # 确认已登录

npm test                    # 先跑测试
npm pack --dry-run          # 检查发布内容（不含 tests/plugin-src/scripts/node_modules）
npm publish                 # 发布到 npmjs
```

发布后：

```sh
npm view dsh-connect-teleagent version   # 确认版本
```

> 若启用了两步验证（2FA），`npm publish` 会提示输入一次性验证码；
> 也可用 `npm publish --otp=<6位码>`。带 `--access public` 仅对 scope 包必需，
> 本包无 scope，默认即 public。

发布前检查清单：

- [x] `private` 已移除
- [x] `license: MIT` + `LICENSE` 文件
- [x] `repository` / `homepage` / `bugs` / `author` 已填
- [x] `keywords` 已填（便于市场检索）
- [x] `.gitignore` / `.npmignore` 已就位（`node_modules`、`tests`、`plugin-src`、`scripts` 不发布）
- [x] `lib/client.js` 预构建随包发布，**无 `prepare` 脚本**
- [x] `exports` 全部指向真实文件
- [x] 测试用相对路径，不绑定本机目录

## License

MIT © [alvinhuang0509-design](https://github.com/alvinhuang0509-design)
