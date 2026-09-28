# TradeDoc AI (智能商贸提单助手) - 项目真实状态交接报告 (PROJECT_STATE.md)

> **文档定位**：本文件为项目工程交接文档。供后续接入的 Coding Agent（如 Codex、Antigravity Subagents）无缝继承项目上下文，基于代码与 Spec 的实际物理状态直接开展研发，**无需依赖任何历史会话记忆**。

---

## 1. 项目基础元数据与环境

| 属性 | 配置值 / 状态 | 说明 |
| :--- | :--- | :--- |
| **项目名称** | 智能商贸提单助手 (TradeDoc AI) MVP | 大宗物资（钢材/管材/水泥/阀门）智能提单与合规审查 |
| **当前 Git 分支** | `dev` | 活跃研发分支 |
| **最新已提交 Commit** | `113006a` | `feat: 完成沙箱主数据、合规引擎与单据解析` (覆盖步骤 1~4) |
| **当前未提交改动** | 步骤 5 产出代码 | 提单草稿 CRUD、正式提交、双模态全屏与悬浮组件 |
| **Python 环境** | CPython 3.12.13 (`uv` 管理) | `backend` 与 `mock_erp` 分离虚拟环境 (`.venv`) |
| **Node.js 环境** | Node v26.8.1 / npm 11.19.0 | `front/` (React 18 + Vite 5 + TailwindCSS) |
| **远程基础设施节点** | Linux VM (`192.168.6.134`) | 外部专用网络，运行 MongoDB 与 Milvus |
| **MongoDB 连接** | `mongodb://192.168.6.134:27017/tradedoc_ai` | 承载合同、物料、订单草稿、订单台账 |
| **Milvus 向量库** | `http://192.168.6.134:19530` | 集合: `material_vector_index` (1024-dim, COSINE, IVF_FLAT) |
| **多模态大模型配置** | 阿里云百炼 DashScope (Qwen-VL / Qwen-Plus) | 配置于 `backend/.env`，支持自定义 `QWEN_BASE_URL` |
| **协同调度规范** | 强制执行 `/agent-task-orchestrator` | 严格采用 `task_dispatch_schema_v1` 与 `task_result_schema_v1` |

---

## 2. 9 步实施计划完成情况矩阵

依据 `docs/04_execution_plan_and_data_closure.md` 规定的 9 步循序渐进里程碑，对实际物理代码进行全量审计：

| 步骤 | 里程碑阶段 | 责任 Agent | 实际代码状态 | 验证结果 (测试/构建) | 准出判定 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **步骤 1** | 全栈工程底座与依赖就绪 | @后端 / @中台 / @前端 | **已完成** (Committed) | 三端初始化正常，健康探针通畅 | **100% PASS** |
| **步骤 2** | 宿主中台沙箱与主数据注入 | @中台 / @后端 / @前端 | **已完成** (Committed) | Mock ERP 5 组 API 通畅，种子注入 MongoDB | **100% PASS** |
| **步骤 3** | 合规规则引擎与看板联动 | @后端 / @前端 | **已完成** (Committed) | 4 项硬核合规规则引擎就绪，诊断看板联调 | **100% PASS** |
| **步骤 4** | 多模态单据解析与品名语义对齐 | @后端 / @前端 | **已完成** (Committed) | PyMuPDF + Qwen-VL + Milvus 向量对齐 | **100% PASS** |
| **步骤 5** | 核心提单双模态实现 | @后端 / @前端 | **已完成** (Working Tree) | 草稿 CRUD、超额强阻断、提交 API、双模态互通 | **100% PASS** |
| **步骤 6** | Excel 批量导入中心闭环 | @后端 / @前端 | **未完成** (待执行) | 仅有前端原型静态骨架，缺少流式解析与逐行纠错 | **待启动** |
| **步骤 7** | 侧滑审批抽屉与中台回写闭环 | @中台 / @后端 / @前端 | **未完成** (待执行) | 抽屉原型就绪，中台回写与配额原子扣减待串接 | **待启动** |
| **步骤 8** | 白盒测试自动化断言 | @后端 / @测试 | **部分完成** (进行中) | 后端已覆盖 25 项单测，全量 8 组契约综合白盒待补 | **需补全** |
| **步骤 9** | 黑盒测试全场景业务穿刺 | @前端 / @后端 / @中台 | **未完成** (待执行) | Case A~E 端到端穿刺及无技术黑话业务词汇审计 | **待执行** |

---

## 3. 各子工程实际实现详情

### 3.1 后端工程 (`backend/`)
- **运行命令**：`cd backend && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`
- **单测命令**：`cd backend && uv run pytest` (25 passed in 2.05s)
- **已实现模块**：
  - `app/config.py`: 基于 `pydantic-settings`，加载 `backend/.env`，支持 `DASHSCOPE_API_KEY`, `QWEN_BASE_URL`, `QWEN_MODEL_NAME`, `QWEN_VL_MODEL_NAME`, `MONGO_*`, `MILVUS_*`。
  - `app/db/session.py`: 管理 MongoDB `AsyncIOMotorClient` 与 Milvus `MilvusClient` 连接池生命周期与心跳检查。
  - `app/db/seed.py`: 动态从 `data/seeds/*.json` 读取数据并向 MongoDB 注入合同与物料，自动建立唯一索引。
  - `app/services/compliance.py`: 确定性风控规则引擎，实现 4 类硬规则：物料匹配度校验、基准单价偏离度浮动校验（$\pm 15\%$）、合同剩余额度强校验、合同效期校验。
  - `app/services/semantic.py`: Milvus 向量近似对齐服务，1024 维余弦相似度检索，支持别名黑话多路召回与置信度打分。
  - `app/services/parser.py`: 双阶段提单解析。实体抽取（合同号/物料黑话/数量/单价）+ 向量对齐 + 风控试算；PDF 单据通过 PyMuPDF 确定性提取，图片单据通过 Qwen-VL 多模态抽取（缺失 API Key 时严格抛出 400 阻断，拒绝假数据）。
  - `app/services/order_service.py`: 提单草稿 CRUD、字段修改联动重新试算金额与合规状态、超额订单强校验特批理由（$\ge 10$ 字）、正式提交生成业务单号 (`XSDD-WZGS-YYYYMMDD-xxx`) 并支持 Header `Idempotency-Key` 幂等控制。
  - `app/routers/`:
    - `master.py`: 合同列表/详情、物料字典列表、物料向量近似对齐 (`POST /api/v1/master/materials/align`)。
    - `compliance.py`: 提单合规风控核验 (`POST /api/v1/compliance/verify`)。
    - `parse.py`: 自然语言对话提单解析 (`POST /api/v1/parse/chat`)、单据 OCR 解析 (`POST /api/v1/parse/ocr`)。
    - `orders.py`: 草稿增删改查 (`/api/v1/orders/draft`)、正式提交 (`/api/v1/orders/submit`)、超额特批提交 (`/api/v1/orders/submit-special`)、订单列表台账 (`/api/v1/orders`)。
- **自动化测试文件**：
  - `tests/test_health.py` (5 passed): 探针与数据库连通性。
  - `tests/test_compliance.py` (5 passed): 4 项合规规则与综合研判边界。
  - `tests/test_master.py` (4 passed): 主数据读取与向量对齐。
  - `tests/test_parse_and_alignment.py` (4 passed): 对话意图、超额试算、PDF 单据 OCR 解析。
  - `tests/test_orders_crud.py` (7 passed): 草稿保存、字段修改重算、超额阻断、特批提交、幂等校验。

### 3.2 宿主中台沙箱 (`mock_erp/`)
- **运行命令**：`cd mock_erp && uv run uvicorn main:app --host 0.0.0.0 --port 8001 --reload`
- **单测命令**：`cd mock_erp && uv run pytest` (6 passed in 0.25s)
- **已实现模块**：
  - `db.py`: MongoDB 连接池与心跳检查。
  - `data/initial_data.py`: 动态从根目录 `data/seeds/` 加载合同、物料及历史订单（涵盖 AUDITED, PENDING_APPROVAL, CLOSED, REJECTED 4 种生命周期）。
  - `routers/orders.py`: 中台订单列表分页与搜索 (`GET /api/erp/orders`)、订单详情 (`GET /api/erp/orders/{order_no}`)、中台回写接收 (`POST /api/erp/orders/writeback`)、特批审批回调扣减配额 (`POST /api/erp/orders/approval-callback`)。
  - `routers/master.py`: 模拟中台合同列表与物料主档查询。
- **单测文件**：
  - `tests/test_health.py` (3 passed)
  - `tests/test_orders.py` (3 passed)

### 3.3 前端工程 (`front/`)
- **运行命令**：`cd front && npm run dev` (运行于 `http://localhost:5173`)
- **构建命令**：`cd front && npm run build` (`tsc && vite build`，0 报错)
- **已实现视图与组件**：
  - `src/stores/useTradeStore.ts`: 统一单源真相 Zustand 状态管理，管理 `draft`, `quota`, `messages`, `displayMode` ('fullscreen' \| 'floating')。
  - `src/services/api.ts` & `src/services/orderApi.ts`: Axios 拦截器解包，覆盖 8 大 API 端点封装。
  - `src/views/workbench/WorkbenchView.tsx`: 全屏提单工作台，左侧双通道切换（单据高亮与多轮对话），右侧草稿编审与合规看板。
  - `src/components/FloatingWidget.tsx`: 56px 常驻右下角悬浮球 + 420px 弹出轻量助手，1:1 还原 `floating_widget.pen`，支持快速意图解析与特批申报。
  - `src/components/draft/OrderForm.tsx`: 订单草稿核心表单，支持明细行增删改、金额动态汇总、物料别名校准与风控看板联动。
  - `src/components/document/DocumentViewer.tsx`: 单据 PDF/图片上传与高亮选框预览。
  - `src/components/chat/ChatPanel.tsx`: 气泡对话与意图自动解析。
  - `src/components/compliance/`: `ComplianceBoard.tsx` (合规看板), `ComplianceBadge.tsx` (三态徽章), `SpecialApprovalPrompt.tsx` (特批引导).
  - `src/views/erp/ErpSandboxView.tsx`: 宿主 ERP 台账沙箱，常驻挂载 `FloatingWidget` 悬浮助手。
  - `src/views/erp/MasterDataView.tsx`: 合同配额池与物资字典中心。

### 3.4 外部共享数据源 (`data/seeds/`)
- 杜绝代码内硬编码，统一外置管理：
  - `data/seeds/contracts.json`: 3 家闭环合同数据（远大钢铁、华夏石化、中原特钢过期）。
  - `data/seeds/materials.json`: 4 类标准物资及黑话别名词典。
  - `data/seeds/orders.json`: 4 条不同状态的历史台账订单。

---

## 4. 当前 Git 状态与未提交修改清单

执行 `git status` 得到以下 13 个变动文件（均为步骤 5 产物，尚未 Commit）：

```text
Changes not staged for commit:
  modified:   backend/app/main.py                         # 注册 orders_router 路由
  modified:   front/src/views/erp/ErpSandboxView.tsx      # 挂载 FloatingWidget 悬浮球
  modified:   front/src/views/workbench/WorkbenchView.tsx # 接入 OrderForm 核心表单
  modified:   mock_erp/tests/test_orders.py               # 增加测试数据清理与分页容错

Untracked files:
  backend/app/routers/orders.py                           # 提单草稿与正式提交 API 端点
  backend/app/schemas/orders.py                           # 订单与草稿 Pydantic DTO
  backend/app/services/order_service.py                   # 订单草稿持久化与合规逻辑
  backend/tests/test_orders_crud.py                       # 提单草稿与提交 25 组自动化测试
  front/src/components/FloatingWidget.tsx                  # 56px 悬浮球及 420px 展开面板
  front/src/components/OrderForm.tsx                       # 表单组件入口
  front/src/components/draft/OrderForm.tsx                 # 提单表单详细实现
  front/src/services/orderApi.ts                          # 提单草稿与提报 API 服务
  front/src/views/WorkbenchView.tsx                       # 顶层工作台兼容导出视图
```

---

## 5. 核心架构决策与不可变更设计 (Frozen SSOT)

1. **统一 API 报文协议 (Standard Envelope)**：
   - 统一三值业务码：`code: 200` (成功)、`400` (业务校验失败/合规规则阻断)、`500` (系统服务异常)。
   - HTTP 状态码统一返回 `200`，由报文内 `code` 表达业务语义。
2. **零硬编码与真实数据源 (Zero-Fake)**：
   - 严禁在 Python 或 TypeScript 代码内写死任何业务合同、物料列表或测试假数据。
   - 所有主数据统一由 `data/seeds/*.json` 注入 MongoDB，动态检索。
   - 多模态图片解析必须真实调用 DashScope Qwen-VL，未配置 Key 时直接抛出 400 提示，严禁静默假 Mock。
3. **双模态单源真相 (SSOT)**：
   - 全屏工作台 (`/workbench`) 与悬浮助理 (`FloatingWidget`) 共享同一个 Zustand Store (`useTradeStore`)。
   - 在任何一端修改草稿字段，另一端必须无缝实时响应。
4. **确定性算术与风控计算**：
   - 所有金额计算（单价 $\times$ 数量、总额累加、偏离度比率、剩余配额核减）必须由后端 Python 或前端纯代码进行数学四则运算，**严禁交由大模型自由推算**。
5. **超额特批硬阻断逻辑**：
   - 当订单金额超出合同剩余配额时，必须阻断直接提单。
   - 必须通过特批通道提报，且特批理由严格校验 `len(reason) >= 10`，少于 10 字强制 400 阻断。

---

## 6. Spec 规范与实际代码的不一致 / 待对齐项清单

经过对 `docs/` 与代码库的全面对比，记录以下 4 项客观差异（接手 Agent 请保持注意，勿私自删改）：

| 编号 | 差异项 | Spec 描述 (`docs/`) | 当前代码实际实现 | 影响评估与说明 |
| :--- | :--- | :--- | :--- | :--- |
| **D-01** | **API 版本前缀** | `docs/03` 定义路由为 `/api/orders/submit`、`/api/parse/chat` 等无版本前缀 | `backend/app/main.py` 同时注册了 `/api/v1/*` 与 `/api/*` 双前缀 | **兼容良好**。前端无论请求带或不带 `/v1` 均可正常响应。 |
| **D-02** | **Mock ERP 代理端口** | `docs/05` 规划 Mock ERP 独立运行于 `8001` 端口，暴露 `/api/erp/*` | `front/vite.config.ts` 的 proxy 目前仅代理 `/api` 至 `8000` (后端) | **待对齐**。当独立启动 Mock ERP (8001) 时，Vite proxy 需增加 `/api/erp` 指向 8001，或由后端转发。目前前端有 localStorage 兜底。 |
| **D-03** | **物资主档字典数量** | `docs/05` 第 6.2 节定义 4 类闭环物资（钢筋、钢板、无缝管、闸阀）；`docs/03` 第 5.2 节示例出现水泥 (`CEM-PC-425`) | `data/seeds/materials.json` 当前包含 `docs/05` 的 4 类核心物资，水泥作为扩展黑话支持 | **无破坏性影响**。向量检索以当前 4 类标准物资为主。 |
| **D-04** | **表单组件文件路径** | `docs/04` 计划提到输出至 `front/src/components/OrderForm.tsx` | 前端实际生成了 `front/src/components/draft/OrderForm.tsx` 并在 `components/OrderForm.tsx` 做了 re-export | **兼容良好**。两处路径引用均有效。 |

---

## 7. 当前已知问题与技术注意事项

1. **沙箱网络权限限制**：
   - 运行针对 `192.168.6.134`（MongoDB 与 Milvus）的测试或命令时，由于需要建立远程 TCP 连接，在部分 Agent 环境中需要显式允许网络外联（或配置代理）。
2. **大模型 API Key 依赖**：
   - `backend/.env` 中已注入真实的 `DASHSCOPE_API_KEY` 与用户专用 `QWEN_BASE_URL`。本地执行真实大模型推理前需确保该 Key 额度有效。
3. **PyMilvus 弃用告警过滤**：
   - `backend/pyproject.toml` 中已配置 `filterwarnings = ["ignore::UserWarning", "ignore::DeprecationWarning"]`，防止 Milvus 驱动版本警告打断 pytest 断言。

---

## 8. 下一步开发任务与交接指引

当前项目已完成**步骤 1 至步骤 5**。接手 Agent 应直接推进 **步骤 6：Excel 批量导入中心闭环**。

### 步骤 6 具体执行要求（参考 `docs/原型图/batch_import.pen` 与 `docs/04`）：
1. **后端任务**：
   - 实现 `POST /api/v1/orders/batch-parse`：接收上传的 `.xlsx` / `.xls` 文件。
   - 使用 `openpyxl` / `pandas` 进行流式解析。
   - 对每一行数据穿透调用 `compliance_engine.verify` 进行风控判定。
   - 返回包含 `valid_rows`、`invalid_rows`（含行号、错误字段与告警原因）以及 `batch_id` 的结构化校验明细。
   - 提供标准 Excel 模板下载端点 `GET /api/v1/orders/batch-template`。
2. **前端任务**：
   - 在 `front/src/views/batch/BatchImportView.tsx` 中落地完整的 `batch_import.pen` 交互：
   - 包含模板下载卡片、拖拽上传区域、解析进度条、行级表格呈现、行级原位编辑修复、一键提交有效订单。
3. **协作调度方式**：
   - 严格按照 `AGENT.md` 中指明的 `/agent-task-orchestrator` 规范，使用 `task_dispatch_schema_v1` 进行派发，以 `task_result_schema_v1` 进行收口。
