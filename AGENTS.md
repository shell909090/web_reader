# 文件规范

- AGENTS.md：项目规范文档，说明项目如何开发及文件位置，AI禁止修改。
- README.md：项目说明，由AI维护，写给人类阅读，使用英文；英文说明中必须包含其他语言说明的链接。
- README.cn.md：项目中文说明。
- .env：项目启动所需环境变量，禁止加入git。
- docs/req.md：需求文档，用户写给AI看；未经用户明确指示，AI不得修改。
- docs/tasks.md：任务文档，记录当前未完成任务，由AI维护，不加入git。
- docs/design.md：设计文档，AI写给系统维护者看，使用中文。
- docs/review.md：评审文档，由AI和用户共同维护，使用中文，不加入git。
- docs/log.md：运行日志，记录需要保留的重要过程，由AI维护，使用中文并带时间，不加入git。
- frontend/：前后端分离时存放前端代码。
- backend/：前后端分离时存放后端代码。

# 代码规范

- 代码和注释使用英文；一般文档使用中文，README.md除外。
- git commit message使用英文，要求简明扼要，禁止把AI列为co-author。
- 流程由Makefile统一控制。
- 代码质量检测使用make fmt、make lint、make build。
- 代码测试使用make unittest、make test。
- 测试覆盖率底线为50%，一般目标为75%；分模块覆盖率不得低于50%，低于50%必须警告用户；总体覆盖率低于75%时应尽力提升。
- 若覆盖率确实无法提升，询问用户如何处理：引入外部依赖，或在review.md中保留问题。
- 测试用例必须严格依据文档，不得受实现影响。
- 代码关键处可加注释帮助理解，但不得机械描述代码行为。
- logging系统必须支持调试开关，调试信息使用调试级别输出。
- 如条件允许，优先使用docker进行部署。

# 前端规范

- 强制使用TypeScript，尽量不用any；确需使用时必须通过注释说明原因，并尽量缩小作用域。
- 优先使用ES6+语法。
- 优先复用项目现有技术栈、目录结构、组件风格和状态管理方式，不要无故新增模式。
- 页面负责组装，复杂逻辑下沉到独立模块，不要在页面或 JSX 中堆过多业务逻辑。
- 接口请求统一封装，禁止在多个页面重复手写请求逻辑。
- 表单、异步请求、错误处理必须有基本反馈，禁止无 loading、无 error、无 empty state。
- 不要提交调试代码，如 console.log、临时 mock、无用样式和注释。

# python规范

- 强制使用Type Annotations。
- 公有函数必须包含简洁Docstring，不超过一行，说明核心功能。
- Python环境使用uv管理。
- 静态检查使用ruff，并在make lint中配置McCabe复杂度阈值为10。
- 删除无用代码和无效import。
- 使用logging处理日志。
- 使用py_compile在make build中检查语法。

# golang规范

- Go代码必须使用gofmt格式化，并使用goimports处理导入分组；这两项在make fmt中执行。
- Go代码提交前必须通过go test和golangci-lint，分别在make test和make lint中执行。
- 导出符号必须有简洁注释，说明用途。
- 错误必须显式处理，禁止无原因忽略返回的error。如需忽略写注释。

# 测试手段

- 前端测试可直接使用后端服务作为mock承接；后端应支持mock模式，以提供mock数据或绕过高频接口的熔断限制。
- smoke test可使用无头浏览器，或通过Chrome DevTools Protocol直接驱动用户提供的浏览器。

# 依赖安全覆盖与上游跟踪

- 当前 `package.json` 使用 npm `overrides` 将 `glob` 固定为 `14.0.2`、`minimatch` 固定为 `11.0.1`，分别处理 Trivy 报告的 `CVE-2026-118773`（遍历取消不完整导致拒绝服务）和 `CVE-2026-118764`（特制 glob 模式展开导致拒绝服务）。对应锁文件必须同步维护。
- 这些包来自开发工具链：`c8 → test-exclude` 引入 `glob` 和 `minimatch`；ESLint、`@eslint/config-array`、SonarJS 和 TypeScript ESTree 也引入 `minimatch`。本次修复时，最新 `test-exclude@8.0.0` 仍要求 `glob ^13.0.6`、`minimatch ^10.2.2`，其他相关工具仍要求 `minimatch` 10.x。因此即使将直接依赖全部升级到最新版，也无法自然解析到上述修复版本。
- 上述版本信息是修复时的快照，不应视为永久事实。后续每次检查或升级依赖，都必须检查这两个漏洞及相关上游的最新发布、依赖范围和实际解析结果，确认是否已有兼容的修复版本或回补版本。
- `overrides` 是临时措施。若上游变动已解决问题，应尽量通过正常升级依赖消除覆盖项；可分别移除已经不再需要的覆盖，不必等待两者同时解决。移除前确认所有引入路径都能解析到不受影响的版本，不能只检查直接依赖。
- 升级或移除覆盖后，更新 `package-lock.json`，用 `npm ls glob minimatch` 检查是否残留受影响版本，并运行 `make quality`（包含测试和 Trivy 扫描）。只有确认工具链兼容、相关漏洞不再出现后，才能保留该变更；仍需覆盖时应记录原因并继续跟踪上游。
