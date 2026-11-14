---
name: web-reader
description: 使用 web_reader 获取新闻、搜索资料并读取网页正文。主要新闻源包括 BBC、纽约时报中文网、新华社、Hacker News 和 InfoQ 等；主要搜索供应商包括 Brave、Tavily、Exa 和 DuckDuckGo 等。网页正文返回 Markdown，新闻列表和搜索结果返回 JSON。
allowed-tools: Bash(web_reader:*)
---

# web_reader 命令行使用指南

获取新闻列表、搜索资料或读取给定 URL。列表与搜索返回 JSON，网页正文返回 **Markdown**。参数决定模式：`-s` 为列表，`-q` 为搜索，直接传 URL 或从 stdin 逐行读取 URL 为正文阅读。

## 新闻列表

```bash
web_reader -s news -n 5
web_reader -s tech -n 5
web_reader -s fin -o fin.json
web_reader -s hn,infoq -n 5
web_reader -s cnbc:markets,cnbc:tech -n 30
```

| 选择 | 来源 |
|---|---|
| `news` | BBC、纽约时报中文网、新华社、澎湃新闻 |
| `tech` | Hacker News、Ars Technica、MIT Technology Review、InfoQ |
| `fin` | 财新、Yahoo Finance、CNBC markets |

可用逗号组合源 ID，以 `source:category` 选择栏目；`-s all` 获取全部新闻源，不包含仅搜索的供应商。列表模式的 `-n` 是每源上限。来源和栏目见下表。

## 新闻源与特性

表中“支持搜索”表示有 `-q` 入口，不保证外部服务允许访问。未标注搜索的来源只提供新闻列表和正文读取；正文能否取得、是否完整仍取决于原站。

| ID / 来源 | 语言 | 内容与选用场景 | 功能与访问特点 | 选用评价 |
|---|---|---|---|---|
| `hn` Hacker News | 英文 | 技术社区热门文章与讨论 | `notes` 含评分和评论数；列表链接指向外部文章，正文取决于发布方 | 适合看技术社区关注度；高评分不等于内容正确，应阅读原文。 |
| `bbc` BBC News | 英文 | 国际综合新闻 | 可读取新闻正文 | 适合作为英文综合新闻起点，争议事件宜与其他来源交叉阅读。 |
| `techcrunch` TechCrunch | 英文 | 科技公司、创业、融资与产品动态 | 可读取新闻正文 | 适合跟踪融资、创业和产品发布，技术细节可再查专业资料。 |
| `ars` Ars Technica | 英文 | 科技报道与技术分析 | 含 `summary`，可读取正文 | 适合了解技术细节和背景，快速扫新闻时可先读摘要。 |
| `theverge` The Verge | 英文 | AI 产品与行业动态 | AI 版块 Atom feed，可读取正文 | 适合跟踪 AI 产品和消费科技动态；频道范围窄于综合科技新闻。 |
| `mittr` MIT Technology Review | 英文 | 科技研究、产业及社会影响 | 支持分类，可读取正文 | 适合研究科技对产业和社会的影响，可与快讯来源搭配。 |
| `wiki` Wikipedia 时事 | 英文 | 人工整理的事件摘要、百科背景 | 列表含 `summary`；支持百科搜索和词条正文读取 | 适合快速建立事件脉络，再沿引用查原始报道；百科整理不替代原始证据。 |
| `zhwiki` 中文维基百科新闻动态 | 中文 | 中文事件摘要、百科背景 | 列表含 `summary`；支持百科搜索和词条正文读取 | 适合中文背景检索，可与英文词条对照补充视角。 |
| `reddit` Reddit | 英文 | 技术、AI、投资等社区讨论 | 支持分类和搜索，但可能限流；讨论帖标注 `discussion`，讨论页可能返回 403，外链正文取决于发布方 | 适合寻找实践反馈和分歧观点；帖子不能代表整个行业，需辨别经验与事实。 |
| `yahoo` Yahoo Finance | 英文 | 市场、企业与财经新闻 | HTML 新闻列表，返回条数随页面变化 | 适合追踪财经报道；新闻列表不等于实时行情或结构化财务数据。 |
| `gnews` Google News | 英文 | 聚合新闻和按主题查找报道 | 支持分类、关键词搜索；部分文章链接依赖 JavaScript 跳转，需直接使用发布方 URL | 适合发现不同发布方的报道；同一事件可能重复，应核对原始来源。 |
| `cnbc` CNBC | 英文 | 市场、商业、宏观与财经新闻 | 支持分类，可读取正文 | 适合英文市场和商业资讯，可用栏目缩小范围。 |
| `nytimes` 纽约时报中文网 | 中文 | 国际、中国及社会新闻 | 使用中文站新闻源，可读取正文；不代表英文站访问权限 | 适合补充中文的国际媒体视角，不宜把单一媒体当作唯一依据。 |
| `xinhua` 新华社 | 中文 | 官方新闻、政策与综合资讯 | 支持分类，可读取正文 | 适合了解政策发布和官方表态，分析事件时可配合其他报道。 |
| `thepaper` 澎湃新闻 | 中文 | 国内社会事件与新闻报道 | 可读取正文 | 适合关注国内社会事件，可与全国性或国际来源对照。 |
| `caixin` 财新 | 中文 | 中国经济、企业与财经报道 | 可能只返回订阅预览，不保证全文完整 | 适合经济和企业议题；仅有预览时不能据此声称读过全文。 |
| `sina` 新浪新闻 | 中文 | 综合新闻与门户资讯 | 自动处理 GB2312 编码，可读取正文 | 适合广泛浏览门户新闻，应留意转载来源。 |
| `infoq` InfoQ 中文 | 中文 | 企业技术、架构与开发实践 | 可读取正文 | 适合工程实践和架构背景，具体技术结论可再核对文档。 |
| `people` 人民网 | 中文 | 官方新闻、政策与国内资讯 | 按首页顺序获取并排除明确隐藏区块，不保证按发布时间排序 | 适合关注官方政策报道；首页靠前不一定表示发布时间最新。 |
| `hf` HuggingFace Papers | 英文 | 每日机器学习论文 | 支持论文搜索；读取论文页面可取得摘要，不等于论文全文 | 适合发现 AI/ML 论文；精选热度不等于学术结论可靠，深入分析需读论文。 |
| `csdn` CSDN | 中文 | 开发者博客与技术文章 | 列表可读不代表正文可读；正文返回 521 时无法取得内容或发布时间 | 适合发现实操线索，文章质量和时效性需结合作者、版本判断。 |
| `oschina` 开源中国 | 中文 | 开源项目、软件与社区动态 | 通过 API 读取正文；外链跳转条目需直接读取原站 URL | 适合追踪开源生态与项目动态，版本信息宜核对项目原站。 |
| `juejin` 稀土掘金 | 中文 | 前端、全栈与开发经验 | 可读取技术文章正文 | 适合开发经验和问题排查，方案适用性取决于技术栈与版本。 |
| `bsky` Bluesky | 英文 | 新闻与科技社区帖子 | 支持分类和搜索；搜索可能返回 403，凭证不保证可用；外链正文取决于发布方，纯文字帖链接到社区页 | 适合追踪作者观点和讨论线索；帖子与其引用的报道应分开判断。 |
| `polymarket` Polymarket | 英文 | 热门预测市场 | 按成交量排序，详情为市场信息；不是新闻报道，市场结束时间不是新闻发布时间 | 适合观察市场预期；概率与成交量不代表事件已发生，也不是事实证据。 |

### 常用来源组合

| 目的 | 组合示例 | 选用思路 |
|---|---|---|
| 综合时事 | `-s bbc,nytimes,xinhua` | 对照英文国际报道、中文国际报道与官方消息 |
| 科技动态 | `-s hn,ars,infoq` | 兼顾社区关注、技术分析和中文工程实践 |
| 财经报道 | `-s caixin,cnbc:markets` | 对照中文经济报道与英文市场新闻，注意财新预览限制 |
| 事件背景 | `-q wiki` 或 `-q zhwiki`，再读取相关原文 | 用词条建立脉络，再核对引用来源 |
| 社区反馈 | `-s reddit:ml,reddit:llm` 或 `-s bsky:tech` | 获取讨论线索；访问受限时说明限制，不把帖子当作一致结论 |

分类用 `source:category` 指定，例如 `cnbc:markets`、`reddit:ml`：

| 来源 | 栏目 |
|---|---|
| `gnews` | `tech`、`business`、`science`、`health`、`sports`、`entertainment`、`world`、`nation`；默认头条 |
| `cnbc` | `top`、`world`、`markets`、`tech`、`finance`、`us`、`health`、`politics`、`intl`、`ai` |
| `mittr` | `ai`、`computing`、`space`、`biotech`；默认主 RSS |
| `xinhua` | `politics`、`world`、`society`、`finance`、`tech`、`mil`、`legal`、`health`、`edu` |
| `reddit` | `ml`、`llm`、`ai`、`tech`、`prog`、`investing`、`stocks`、`worldnews` |
| `bsky` | `news`、`tech`；默认全部 |

## 搜索

```bash
web_reader -q any "关键词" -n 5
web_reader -q exa "关键词" -n 5
web_reader -q all "关键词" -n 5
web_reader -q zhwiki "注意力机制" -n 3
web_reader -q gnews "open source LLM" -n 5
web_reader -q hf "diffusion" -n 5
```

- 通用网页搜索：`brave`、`tavily`、`exa`、`parallel`、`firecrawl`、`keenable`、`duckduckgo`、`searxng`。
- `any`：在启用且配置条件满足的通用供应商中随机选一家。网络故障、服务不可用或明确的额度不足可尝试其他候选；有效空结果直接返回。认证失败、访问拒绝、验证码和普通限流会报错，不继续切换。
- `all`：调用所有候选，按各自排名交错合并并按 URL 去重。重复项的 `contributors` 保留各供应商及原始排名。部分失败时保留成功结果并报告警告，全部失败时报错。
- 专项搜索需显式指定：`wiki` / `zhwiki` 搜索百科词条，`gnews` 搜索新闻，`hf` 搜索论文；`reddit` / `bsky` 搜索社区内容，可能受访问限制；`wolframalpha` 返回计算／知识答案。这些来源不参与 `any` / `all`。
- 搜索模式的 `-n` 是最终结果上限，不保证填满。Brave / Tavily 单次最多 20 条，Exa / Firecrawl / Keenable 最多请求 100 条；Parallel 由服务返回候选后本地截取。所有来源均不自动翻页；WolframAlpha 返回一个包含多个区块的答案。
- 单源保留上游顺序，不统一按时间排序；搜索不会自动读取结果页面的正文，也不会自动追加研究任务。
- DuckDuckGo、Exa、Parallel、Firecrawl、Keenable 可免 key 查询，公共额度仍可能限流。Brave、Tavily、WolframAlpha 和 SearXNG 需要已有的服务配置；无需在普通查询命令中携带凭证。
- `any` / `all` 不额外探测连通性，跳过缺少必需配置或禁用的来源，但可能使用已配置的收费服务。指定单一来源时，失败不会自动改用其他来源或认证方式。

## 网页正文

```bash
web_reader 'https://example.com/article' -o article.md
web_reader 'https://example.com/one' 'https://example.com/two' -o articles.md
web_reader -s hn -n 3 | jq -r '.[].url' | web_reader
web_reader -q wiki "attention mechanism" -n 1 | jq -r '.[].url' | web_reader
```

stdout 返回 Markdown 正文；多个 URL 的内容以 `---` 分隔。拿到列表或搜索结果后，按需读取其中的 URL，无需批量读取所有结果。

## 参数说明

| 短参数 | 长参数 | 默认值 | 用法 |
|---|---|---|---|
| `-s` | `--sources` | — | 逗号分隔的源 ID、预设 `news` / `tech` / `fin` 或 `all`；支持 `source:category` |
| `-q` | `--query` | — | 搜索来源 ID 或 `any` / `all`，关键词作为后续位置参数 |
| `-n` | `--limit` | `50` | 列表每源上限；搜索最终结果上限，不保证填满 |
| `-o` | `--out` | stdout | 将 JSON 或 Markdown 写入指定文件 |
| `-c` | `--concurrency` | `2` | 列表模式的来源并发数，不控制搜索或正文读取 |
| `-l` | `--loglevel` | `warn` | `debug` / `info` / `warn` / `error`；诊断写入 stderr |
| `-p` | `--profile` | `default` | 请求头预设：`default` / `chrome-win` / `firefox` / `mobile` / `curl`；不得用于规避访问限制 |
| — | `--config` | — | 使用用户提供的替代配置文件 |
| `-h` | `--help` | — | 查看命令帮助 |

关键词可加引号，也可由多个位置参数组成，如 `web_reader -q wiki transformer architecture`。直接传入多个 URL 可批量读取正文；使用 stdin 时每行一个 URL。

## 输出格式

输出使用 UTF-8，中文内容可直接阅读；源页面的 GB2312 / GBK 编码由工具处理。

| 模式 | 输出内容 |
|---|---|
| 新闻列表 | JSON 数组，条目含 `source`、`title`、`url`、`notes`，部分含 `summary` |
| 通用网页搜索 | JSON 数组，条目含 `kind: "web"`、`source`、`title`、`url`、`rank`，摘要存在时含 `summary`；`source` 是搜索供应商，非文章发布方；`rank` 是上游排名 |
| WolframAlpha | `kind: "answer"` 的答案条目，含 `answer` 和 `sections`；一个答案可有多个区块，不保证有 URL |
| 网页正文 | Markdown，以 `---` 分隔文章，带 `# 标题`；可直接阅读或用 `-o` 保存 |

`all` 合并后的重复 URL 以首条命中的内容为主，`contributors` 列出各命中供应商的 `source` 和原始 `rank`。

新闻列表及含 URL 的搜索结果提供 `first_seen_at`，并在可确认时提供 `published_at`；`occurred_at` 表示事件发生时间，`written_at` 表示撰稿时间，无明确依据时省略。四字段格式为 `YYYY-MM-DDTHH:mm:ss+08:00`（北京时间）；只有日期的信息不补零点，更新时间、转发时间不能当作原文发布时间。

首次观察按规范化 URL 持久保存，跨进程和重复抓取保持首次值；它只代表本机记录，不是全网首次发布时间，清除观察记录会重置历史。部分新闻列表需要额外请求文章元数据补发布时间，条数越多可能越慢；失败时仍返回条目并省略发布时间。搜索不会为此额外读取结果网页。

维基列表的 `event_date` 格式为 `YYYY-MM-DD`，表示门户对事件的日期归属，不是原新闻发布时间；日期依据不足时省略，搜索结果不提供该字段。

## 错误与访问限制

- 知识答案可能没有 URL，应读取 `answer`，不要直接送入正文管道。
- 诊断信息写入 stderr，stdout 保持 JSON 或 Markdown。缺少配置、禁用、网络故障、拒绝访问与限流均应明确报告，不作为有效空结果。某个来源缺少配置不影响其他来源。
- 列表可读不代表正文可读，成功提取也不保证全文完整。财新可能只返回预览；Google News 部分跳转链接需直接使用发布方 URL；社区外链取决于原站访问权限。
- 遇到登录、付费墙、验证码、403 或 429 时说明限制，不轮换代理、身份或端点绕过。403 不一定是缺少认证，429 不表示永久封禁。正文非成功响应会报错，不把拒绝页面当文章；搜索凭证不会传给结果页面。
