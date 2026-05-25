# web_reader — LLM 使用指南

`web_reader` 是一个命令行工具，用于抓取新闻源、以 Markdown 格式读取网页，以及搜索参考资料。
通过 `npm link` 全局安装，可在任意目录运行。

参数推断运行模式：`-s` → 列表，`-q` → 查询，否则 → 详情。

---

## 使用方法论

### 什么时候用

以下情形应优先考虑调用 web_reader，而非依赖训练数据直接回答：

- **时间敏感**：用户提到"最新"、"最近"、"今天"、"现在"、"当前"等词，或询问可能在训练截止后发生变化的信息
- **持续变动的话题**：市场行情、政治动态、科技发布、突发事件——这类信息每天都在变
- **用户给出了 URL**：直接用 detail 模式读取，不要猜测内容
- **需要背景知识**：用户问某个概念、人物、事件的来龙去脉——Wikipedia 是最可靠的起点
- **需要多角度对比**：同一事件在官方媒体、独立媒体、中文视角、英文视角下叙述不同；单一来源不够

不适合用的情形：不需要实时信息的纯逻辑/计算/代码问题，或用户明确表示不想联网。

### 为什么用（而不是直接回答）

1. **实时性**：模型训练数据有截止日期，新闻每天更新；web_reader 拿到的是当下的数据
2. **可溯源**：每条结果都有 `url` 字段，可以让用户验证原文，而不是凭记忆给出无法核查的陈述
3. **多视角**：中英文、官方/独立、深度/快讯——不同来源的信息可以互相印证或对比

### 决策流程

拿到任务后，按以下顺序判断该走哪条路：

```
用户给了 URL？
  → 是：直接 detail 模式读取

用户要了解某个概念/人物/事件背景？
  → web_reader -q wiki <关键词>（英文话题）
  → web_reader -q zhwiki <关键词>（中文话题）
  → 找到词条后再 detail 读全文

用户要了解社区/从业者的看法？
  → web_reader -q reddit <关键词>

用户要获取当前新闻？
  → 选合适的预设或源（见下方来源选择指南）
  → list 模式获取列表，再按需 detail 读全文

需要读全文？
  → 先 list 拿 URL，再 pipe 到 detail：
    web_reader -s hn -n 10 | jq -r '.[].url' | web_reader
```

### 组合使用模式

**选源原则**：每种组合尽量少的来源，但尽量全面的视角。优先选详情链接确定可抓的来源。在条件允许下，同时满足：

- 至少一个中文来源 + 一个英文来源
- 至少一个独立媒体 + 一个官方/主流媒体

常见有效组合：

- **综合时事**：`-s bbc,nytimes,xinhua` — 英文独立（bbc）+ 中文独立（nytimes）+ 中文官方（xinhua），三者全文均可抓
- **科技动态**：`-s hn,ars,infoq` — 社区热度（hn，外链可抓）+ 英文深度（ars，全文可抓）+ 中文（infoq，全文可抓）
- **财经新闻**：`-s caixin,cnbc:markets` — 中文独立（caixin）+ 英文主流（cnbc），两者全文均可抓
- **深度研究**：先 `-q wiki` 建立背景，再 `-s` 拉当前新闻，最后 detail 读关键原文
- **多视角对比**：`-s nytimes,xinhua` — 同一中国话题，独立与官方叙述的最小对比组，两者全文均可抓

---

## 模式一：新闻列表（`-s`）

从新闻源获取文章列表，结果以 JSON 数组输出到 stdout。

```
web_reader -s <sources> [-n limit] [-o output.json]
```

**预设组合**（推荐）：
- `-s news` → bbc + nytimes + xinhua + thepaper  （综合新闻，中英文）
- `-s tech` → hn + ars + mittr + infoq           （科技新闻，中英文）
- `-s fin`  → caixin + yahoo + cnbc:markets       （财经新闻，中英文）

**单独数据源**（均通过 HTTP 访问）：
- `hn` Hacker News（英文）— notes 字段含赞数（score）和评论数，反映社区热度
- `bbc` BBC 新闻（英文）
- `nytimes` 纽约时报中文版（中文）— 全文可直接访问
- `xinhua` 新华社（中文）— 官方新闻通讯社
- `thepaper` 澎湃新闻（中文）— 国内突发新闻
- `caixin` 财新（中文）— 独立财经新闻
- `gnews` Google 新闻（英文）— 头条 + 分类话题；支持关键词搜索
- `cnbc` CNBC（英文）— 分类：top world markets tech finance us health politics intl ai
- `ars` Ars Technica（英文）— 深度科技报道，含 `summary` 字段
- `mittr` MIT 技术评论（英文）— 科技分析
- `theverge` The Verge AI 频道（英文）— 约 10 条
- `wiki` 维基百科当前事件（英文）— 人工整理的摘要，含 `summary` 字段
- `zhwiki` 中文维基百科新闻动态（中文）— 人工整理的摘要，含 `summary` 字段
- `reddit` Reddit（英文）— 分类：ml llm ai tech prog investing stocks worldnews
- `infoq` InfoQ 中国（中文）
- `techcrunch` TechCrunch（英文）
- `sina` 新浪新闻（中文）
- `people` 人民网（中文）
- `hf` HuggingFace Papers（英文）— 每日机器学习论文
- `csdn` CSDN（中文）
- `oschina` 开源中国（中文）
- `juejin` 稀土掘金（中文）
- `bsky` Bluesky（英文）— 分类：news/tech

**分类语法**：`source:category`，例如 `gnews:tech`、`cnbc:tech`、`reddit:ml`
- `gnews`：tech business science health sports entertainment world nation（默认：头条）
- `cnbc`：top world markets tech finance us health politics intl ai
- `mittr`：ai computing space biotech（默认：主 RSS）
- `xinhua`：politics world society finance tech mil legal health edu
- `reddit`：ml llm ai tech prog investing stocks worldnews
- `bsky`：news tech（默认：全部）

**输出格式**（JSON 数组）：
```json
[
  {
    "source": "hn",
    "title": "文章标题",
    "url": "https://...",
    "notes": "412 points · 187 comments",
    "published_at": "2026-05-12",
    "summary": "可选摘要"
  }
]
```

**`published_at` 字段说明**（ISO 8601 日期字符串）：
- ✅ 有此字段：nytimes、yahoo、mittr、cnbc、caixin、xinhua、reddit、ars、gnews（仅精确到月份）
- ❌ 列表模式下无此字段：bbc、thepaper（日期仅在文章详情页）
- ❌ 无此字段：hn、infoq、people、sina、techcrunch、theverge、csdn、oschina、juejin、hf、bsky

---

## 模式二：获取全文（详情模式）

将 URL 作为参数或通过 stdin 传入，结果以 Markdown 格式输出到 stdout。

```
web_reader <url1> [url2 ...]
web_reader -s hn -n 5 | jq -r '.[].url' | web_reader
web_reader <url> -o article.md
```

- 使用 Readability + Turndown 提取正文
- 过滤导航栏、广告、"阅读更多"等干扰内容
- 输出格式：`---\n# 标题\n\nMarkdown 正文\n`
- 多个 URL 之间以 `---` 分隔
- Reddit 链接帖子会跳转到外部文章（详情可用）；纯文字帖子的正文在 `summary` 字段
- 效果较好的来源：bbc、nytimes、ars、mittr、thepaper、caixin、xinhua、cnbc、infoq

---

## 模式三：搜索数据源（`-q`）

按关键词搜索参考来源，返回匹配文章的 JSON 列表。仅以下来源支持搜索，其余均不支持：

```
web_reader -q wiki <关键词...>
web_reader -q zhwiki <中文关键词...>
web_reader -q reddit <关键词...>
web_reader -q gnews <关键词...>
web_reader -q bsky <关键词...>
```

**可搜索的来源：**
- `wiki` — 英文维基百科全文搜索
- `zhwiki` — 中文维基百科全文搜索
- `reddit` — Reddit 全站搜索（按相关性排序）
- `gnews` — Google 新闻关键词搜索（无需 API key）
- `bsky` — Bluesky 帖子搜索
- `hf` — HuggingFace Papers 论文搜索（`/papers?q=query`，服务端渲染）

ars、mittr 等来源**不支持搜索**（搜索页面为 JavaScript 渲染，纯 HTTP 无法抓取结果）。

**典型用法：**
```bash
# 搜索维基百科词条，再读取全文
web_reader -q wiki attention mechanism | jq -r '.[0].url' | web_reader

# 搜索中文维基百科
web_reader -q zhwiki 注意力机制 | jq -r '.[0].url' | web_reader
```

---

## 参数说明

| 参数 | 缩写 | 默认值 | 说明 |
|------|-------|---------|-------------|
| `--sources` | `-s` | — | 数据源 ID、预设组合或 `all` |
| `--query`   | `-q` | — | 搜索来源；关键词作为位置参数传入 |
| `--limit`   | `-n` | `50` | 最大结果数 |
| `--out`     | `-o` | stdout | 输出到文件（JSON 或 Markdown） |
| `--concurrency` | `-c` | `2` | 并发数（列表模式） |
| `--loglevel` | `-l` | `warn` | debug\|info\|warn\|error |
| `--help`    | `-h` | — | 显示帮助 |

---

## MCP 工具（作为 MCP 服务器运行时）

以 `web_reader --mcp` 启动时，向 MCP 客户端暴露三个工具：

- **`list_news(sources, limit?)`** — 同 `-s` 模式，返回 JSON 字符串
- **`read_url(urls[])`** — 同详情模式，返回 Markdown 字符串
- **`search(source, query, limit?)`** — 同 `-q` 模式，返回 JSON 字符串

---

## 来源特性 — 如何选择

### 了解时事

| 需求 | 推荐来源 | 原因 |
|---|---|---|
| 全球新闻，立场中立 | `bbc` | 西方主流媒体，覆盖广，事实可靠，全文可抓 |
| 中国新闻，独立视角 | `nytimes` | 纽约时报中文版，全文可访问，编辑独立 |
| 中国官方立场 | `xinhua` | 官方通讯社，适合了解北京的表态，全文可抓 |
| 中国国内事件 | `thepaper` | 国内突发社会/调查新闻，全文可抓 |
| 整理摘要 | `wiki`、`zhwiki` | 人工编辑，事件有交叉引用，适合查"发生了什么" |

### 财经新闻

| 需求 | 推荐来源 | 原因 |
|---|---|---|
| 中国市场/企业，独立报道 | `caixin` | 中国最独立的财经媒体，调查深度强，全文可抓 |
| 中国官方经济政策 | `xinhua:finance` | 官方口径，政策解读权威 |
| 全球市场行情 | `yahoo` | Yahoo Finance RSS，市场数据全面，更新快，全文可抓 |
| 英文财经综合 | `cnbc:markets` | 市场板块专业，全文可抓 |
| 广泛财经新闻聚合 | `gnews:business` | 覆盖面广，可搜索，但链接跳转至原始发布方 |

### 科技话题

| 需求 | 推荐来源 | 原因 |
|---|---|---|
| 社区热度 | `hn` | notes 含赞数和评论数，反映技术社区当下关注点；文章外链可抓 |
| 技术准确性 | `ars` | 领域专家撰写，适合"X 究竟是怎么工作的"，含 summary，全文可抓 |
| 深度影响分析 | `mittr` | 科技政策、社会、伦理，比新闻更有深度，全文可抓 |
| AI/ML 最新论文 | `hf` | HuggingFace Papers，每日论文，支持关键词搜索，全文页（摘要）可抓 |
| 中国科技/开发者 | `infoq` | 国内企业和开发者社区，全文可抓 |
| 从业者观点 | `reddit:ml`、`reddit:llm` | 一线从业者讨论实际效果，支持搜索；外链帖可抓，/comments/ 需登录 |

### 详情模式（全文）：哪些可用

| 详情可靠 | 部分可用 | 效果不稳定 |
|---|---|---|
| bbc、nytimes、thepaper | hn（外链可抓，HN 讨论页不是文章）| sina、people（中文门户） |
| ars、mittr、theverge | reddit（外链帖可抓，/comments/ 需登录）| csdn、oschina、juejin |
| caixin、xinhua、infoq、cnbc | gnews（跳转原始发布方，因媒体而异）| |
| wiki、zhwiki、yahoo、hf | bsky（含外链的帖可抓，纯文字帖不是文章）| |

### 查询模式：何时用 `-q`

- `-q wiki` — 查询某个概念、人物、事件、技术的背景（英文）
- `-q zhwiki` — 同上，适用于中文话题，也覆盖中国政治/历史背景
- `-q reddit` — 了解社区对某话题的看法，适合"从业者怎么看 X"
- `-q gnews` — 快速搜索近期新闻报道
- `-q bsky` — 了解科技/AI 社区的实时讨论

### 立场坐标图

```
独立 ←————————————————————→ 官方
   nytimes · caixin · thepaper       xinhua · people

深度 ←——————————————————————→ 快讯
 mittr · wiki                  hn · thepaper · xinhua

英文 ←————————————————————→ 中文
 bbc · ars · gnews · hn   nytimes · caixin · thepaper · xinhua · zhwiki
```

---

## 各数据源评价

| 来源 | 评价 |
|---|---|
| `hn` | 技术社区的晴雨表。赞数（score）+ 评论数反映真实热度，但内容质量参差，需自行判断。文章是外链，质量取决于原始来源。 |
| `bbc` | 英文世界可信度最高的综合新闻之一。事实导向，立场中立，覆盖全球。全文可抓，是英文时事的首选基准。 |
| `techcrunch` | 科技创业报道为主，适合了解融资、产品发布、创投动态。深度不如 ars/mittr，但更新快，覆盖面广。 |
| `ars` | 技术深度报道的标杆。文章由工程师/科学家撰写，对技术细节有独到见解。含 summary，全文可抓，是英文技术类的最优先选择。 |
| `theverge` | AI 频道约 10 条，条目少但更新频繁，适合快速了解 AI 产品和行业动态。全文可抓。 |
| `mittr` | MIT 技术评论，专注科技对社会的深层影响——政策、伦理、未来预测。适合深度分析而非追新闻。全文可抓。 |
| `wiki` | 最可靠的背景资料来源。当前事件由人工编辑整理，有 summary，全文随时可抓，适合快速建立对某事件的基本认知。 |
| `zhwiki` | 中文维基百科新闻动态，覆盖中文话题的历史/政治/文化背景，支持搜索，全文可抓。中文话题背景查询的首选。 |
| `reddit` | 社区真实讨论的最好来源。ml/llm/tech 分类聚集大量从业者，支持搜索。外链帖全文可抓，/comments/ 页需登录。 |
| `yahoo` | Yahoo Finance RSS，市场行情、股票、宏观经济覆盖较全，更新快，全文可抓。适合财经类实时数据。 |
| `gnews` | Google 新闻聚合器，覆盖最广，支持关键词搜索，分类丰富。缺点：链接跳转至原始发布方，可抓性因媒体而异。 |
| `cnbc` | 美国主流财经媒体，市场/商业/宏观分类细致。全文可抓，适合英文财经报道。 |
| `nytimes` | 纽约时报中文版，独立于中国官方叙事，全文可直接抓取，是最佳的"中文 + 独立 + 全文可抓"三合一来源。 |
| `xinhua` | 新华社，理解中国官方立场的必备来源。分类丰富（politics/finance/tech 等），全文可抓。不代表事实，但代表官方口径。 |
| `thepaper` | 澎湃新闻，中国国内突发新闻和深度调查的重要来源。报道及时，部分独立于官方叙事，全文可抓。 |
| `caixin` | 财新，中国最独立的财经媒体。深度调查报道，对中国经济数据和企业事件的分析无可替代。全文可抓。 |
| `sina` | 新浪新闻，信息量大，但编辑立场普通，深度有限。GB2312 自动转码；详情页抓取效果不稳定。 |
| `infoq` | InfoQ 中国，企业级技术实践报道为主，偏工程师和架构师视角。全文可抓，适合了解国内技术社区的实际落地情况。 |
| `people` | 人民网，官方立场与 xinhua 类似，覆盖更广泛的国内政治/社会话题。详情页抓取效果不稳定。 |
| `hf` | HuggingFace Papers，每日 ML 论文精选，是跟踪 AI 学术前沿的最直接来源。支持关键词搜索，论文摘要页可抓。 |
| `csdn` | CSDN 博客平台，质量参差不齐，适合了解国内开发者社区的技术动态和流行工具趋势，而非深度技术参考。 |
| `oschina` | 开源中国，跟踪国内外开源软件动态的较好来源，覆盖开源社区新闻和项目发布。详情页抓取效果不稳定。 |
| `juejin` | 稀土掘金，前端/全栈开发者社区，技术文章质量较高。更多是经验分享而非新闻，适合了解开发者的实际问题和趋势。 |
| `bsky` | Bluesky，科技/AI 话题的新兴社区。包含外链的帖子可抓，纯文字帖为社区讨论。支持关键词搜索，反映英文 AI 社区的实时观点。 |

---

## 给 LLM 的使用说明

- **列表模式**是被动订阅：从数据源获取文章元数据流
- **详情模式**是主动获取：将列表输出的 URL 传入以获取完整可读文本
- **查询模式**用于参考查找；与详情模式结合可获取完整文章
- 所有输出均为 UTF-8；中文内容原生支持（新浪的 GB2312 自动解码）
- 错误输出到 stderr；stdout 始终为干净的 JSON 或 Markdown
- `wiki` 和 `zhwiki` 是最可靠的数据源：结构化，全文可访问
- `nytimes`（中文版）提供高质量全文；大多数其他来源在详情级别可能有付费墙
- Reddit 评论页（URL 含 `/comments/`）需要登录，会返回拦截页面
- 不确定选哪个来源时，`web_reader -s news` 可提供均衡的多角度起点
