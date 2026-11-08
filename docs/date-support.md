# 新闻时间支持与验证

验证日期：2026-11-08。本轮完成用户指定的23个源日期任务；“完成”包括有依据的时间提取和明确不支持/暂不可得的边界，不代表每个源每条新闻都有四个时间。

- 四字段：`occurred_at`、`written_at`、`published_at`、`first_seen_at`，均采用 `YYYY-MM-DDTHH:mm:ss+08:00`。事件时间和撰稿时间在本轮样本中无明确证据，省略。
- 首次观察覆盖CLI/MCP列表、搜索的所有有效条目，持久化到本机SQLite；跨进程、跨来源同规范化URL保持一致。
- 列表日期不足时按源补取文章元数据，原站拒绝访问、解析失败、仅日精度、无已知时区或元数据冲突时不伪造时间。字段缺失不影响已有新闻返回。
- 国内发布源新浪、人民网、财新、开源中国、新华网采用本地北京时间策略；这是一份明确的来源时区配置，不根据运行机器时区推测。其他源必须带偏移或提供Unix时间。
- 维基旧 `event_date` 暂留兼容，日期精度不提升为 `occurred_at`。其迁移不包含在本轮23项中。

## 逐源结论

统计为每源最多2条列表样本，数字表示具有 `published_at` 的条目数/有效列表条目数，不是长期保证。

| 任务 | 源 | 样本 | 实现及边界 |
|---|---|---|---|
| DATE-002 | `bbc` | 2/2 | 文章 JSON-LD 的 datePublished；不使用 modified_time |
| DATE-003 | `techcrunch` | 2/2 | article:published_time / JSON-LD |
| DATE-004 | `sina` | 2/2 | 文章发布 meta，源本地时间按北京时间处理 |
| DATE-005 | `infoq` | 2/2 | Nuxt 文章对象的 publish_time 毫秒Unix时间；不使用 ctime/utime |
| DATE-006 | `people` | 2/2 | 文章 #newstime；不使用 URL 日期补零点 |
| DATE-007 | `csdn` | 0/2 | 列表可获取，详情521；省略发布时间 |
| DATE-008 | `thepaper` | 2/2 | 文章 JSON-LD / article:published_time |
| DATE-009 | `hf` | 0/2 | 页面论文发布日只有日精度；API/页面中的零点值不据此认定准确时刻，评论和投稿时间不代填 |
| DATE-010 | `oschina` | 2/2 | 文章API pubTime，按来源北京时间处理；不使用 createTime/lastUpdate |
| DATE-011 | `juejin` | 2/2 | 文章 JSON-LD datePublished；不使用 dateModified |
| DATE-012 | `hn` | 0/2 | 只尝试外链原文发布元数据；HN投稿时间不冒充原文发布，本次两个样本没有可确认的元数据 |
| DATE-013 | `yahoo` | 2/2 | 优先列表 datetime，缺失时文章 JSON-LD；相对时间不推算 |
| DATE-014 | `theverge` | 2/2 | Atom published，保留完整时刻并统一备注口径 |
| DATE-017 | `ars` | 2/2 | 文章 published_time；移除URL推导的年月占位值 |
| DATE-018 | `reddit` | 0/0 | 删除 updated 冒充发布的逻辑；仅可读外链原文元数据可补充；本次限流403/429，连续复测列表为空 |
| DATE-019 | `bsky` | 1/2 | 删除 indexedAt/createdAt 冒充原文发布的逻辑；可读外链元数据可补充，403原站则省略 |
| DATE-020 | `polymarket` | 0/2 | 非新闻发布语义；Ends 只保留在备注，不填入四字段 |
| DATE-021 | `nytimes` | 2/2 | RSS pubDate完整时刻转换为+08:00，备注同步；不再先UTC截日 |
| DATE-022 | `caixin` | 2/2 | 文章 #pubtime_baidu，不再仅用URL日期 |
| DATE-023 | `xinhua` | 2/2 | 文章 publishdate 与 .header-time .time 组合；不再仅用URL日期 |
| DATE-024 | `mittr` | 2/2 | RSS pubDate保留时分秒，无效值省略 |
| DATE-025 | `cnbc` | 2/2 | RSS pubDate保留时分秒，无效值省略 |
| DATE-026 | `gnews` | 2/2 | 上游RSS报告的文章 pubDate；不能独立核实跳转后原文，维持该来源的发布时间语义 |

## 复核与限制

初次探测存在部分网络失败。纽约时报中文网、财新、新华、MIT TR、CNBC、Google News、Polymarket恢复后均追加两次请求，均成功。Reddit重复请求仍限流，属于既有SRC-004；日期代码通过固定样本验证，不声称其在线列表已恢复。CSDN原站521限制与既有SRC-002相同。

有效样本中所有条目均有首次观察时间；跨进程复读的相同URL保持原值。新闻列表会动态变化，二次抓取新增新闻拥有新观察时间是正常行为。

原始证据位于 `/tmp/date-audit/`（临时目录）：`implemented.json`、`verification.json`、各源页面及日志；本表保留长期核验摘要。

## 本地验证

单元测试验证跨日/时区转换、分钟精度、无效日期、缺失时区、社交时间隔离、更新/评论字段排除、日期冲突、来源专用解析、持久化失败、跨进程重复读取和并发首次写入。使用Makefile临时数据目录，避免将测试观察记录写入真实数据库。

持久化写入失败会报告错误，不返回伪造的首次观察时间。首次时间只代表启用记录后的本系统观察；删除或更换数据库会开始新的观察历史。短链接与原站URL未明确归一时视为不同标识。
