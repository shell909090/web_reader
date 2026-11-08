# 信息源访问复核（2026-11-08）

范围：剩余 SRC-002/004/005/006/007；北京时间约23:21–23:27。使用当前项目的普通 HTTP 请求、现有请求头和重试机制，不使用浏览器登录、代理轮换、验证码处理、付费墙绕过或端点切换。原始输出保存在 `/tmp/web-reader-access-review/`，下列记录保留可复核结论，不依赖临时文件长期存在。

## 列表、搜索与正文分开判断

| 来源 | 列表 | 搜索 | 正文与结论 |
|---|---|---|---|
| CSDN | 首页200，5条 | 无此功能 | 两篇正文均521，无内容；列表中的5篇发布时间元数据请求也均521。列表可用，正文和受阻文章发布时间不可用。 |
| Reddit | worldnews RSS 200；technology/MachineLearning RSS 429，返回的5条来自可用feed，并输出两条警告 | search.rss 429 | 讨论页403；一个United24外链成功提取1256字符Markdown。应标为部分可用，429不是永久封禁证明。 |
| Bluesky | 默认7个作者feed均200，返回5条；tech单独返回3条 | 当前public.api.bsky.app端点403 | 两条旧NYT短链均正确跳转后403；一个The Verge外链200并提取2232字符Markdown。外链可读性取决于原站，不是短链解析故障。 |

字符数包含CLI Markdown标题，仅用于确认返回了内容，不证明与发布方完整全文一致。此次未出现同一失败样本恢复成功的情况，未触发“恢复后追加两次”的规则；不同URL/栏目成功不算失败样本恢复。遇到429后不连续重试，也不切换身份。

## 命令与代表样本

- `web_reader -s csdn -n 5 -l debug`；正文分别读取 `https://blog.csdn.net/coderroad/article/details/157735374`、`https://blog.csdn.net/coderroad/article/details/149722641`。两篇退出码3、正文为空。
- `web_reader -s reddit -n 5 -l debug`；`web_reader -q reddit "artificial intelligence" -n 3`。列表退出0但有429警告；搜索失败。默认feed是worldnews、technology、MachineLearning。
- Reddit讨论页：`https://www.reddit.com/r/worldnews/comments/1xqpalp/rworldnews_live_thread_russian_invasion_of/`，403。列表确实包含讨论帖，原README“全部为外链帖”不成立；实现以notes中的`(discussion)`区分，外链条目可带`reddit_url`。
- 可读Reddit外链：`https://united24media.com/war-in-ukraine/putin-seizes-three-more-japan-tobacco-businesses-bringing-takeover-to-37-billion-24169`。
- `web_reader -s bsky -n 5 -l debug`；`web_reader -s bsky:tech -n 3 -l debug`；`web_reader -q bsky "artificial intelligence" -n 3`。
- NYT短链：`https://nyti.ms/3WjsqLp`、`https://nyti.ms/4BVqitE`，301经过trib.al再到nytimes.com，最终403。此限制针对这些英文站点样本，不能据此宣布独立的纽约时报中文网插件不可用。
- 可读Bluesky外链：`https://www.theverge.com/tech/1029526/chatbots-might-be-coming-to-apples-homeview`。

## 本地错误反馈修正

此次发现Reddit讨论页403的拒绝说明长度足以通过正文提取器，CLI曾返回退出0和394字符。现已在通用CLI/MCP正文入口检查HTTP状态：非2xx明确报错，包含最终URL，不提取拒绝页。实测该Reddit页面和NYT短链均退出3、正文为空，并显示HTTP403。

Bluesky搜索原先将401/403一概解释为缺少认证，现改为报告实际状态及当前端点拒绝访问，认证仅为可能原因。本次无BSKY凭证，未测试登录路径，不保证凭证可解决该端点403。先前另一端点匿名成功的观察不等于当前插件可用，也不作为绕过拒绝的方案。

不把站点限制改造成持续突破访问控制的开发任务。CSDN正文、Reddit受限feed/搜索、Bluesky当前搜索和NYT受阻外链已在双语README明确说明；可用列表和可读发布方文章继续提供。财新完整性未知和Google News跳转限制保持原有说明，本次未重测。
