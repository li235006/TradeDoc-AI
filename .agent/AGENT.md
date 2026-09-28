# TradeDoc AI - 智能体协作与工作指南 (AGENT.md)

> **核心指引**：后续接手的任何 Coding Agent（包括 Codex、Antigravity Subagent、Claude 等）在接手本项目时，**必须强制加载并遵循 `/agent-task-orchestrator` 规范**（规范文件见 `/Users/li/.gemini/config/skills/agent-task-orchestrator/SKILL.md`）。严禁无序自由发散，坚守契约化协作。

---

## 1. 项目运作模式与业务拓扑

### 1.1 业务定位
本项目为**智能商贸提单助手 (TradeDoc AI) MVP**，服务于大宗商贸流通企业（如钢材、管材、板材、阀门、水泥）。业务核心场景为：
1. **多模态提单**：经办人通过自然语言对话（如“给中建八局下200吨400E 20圆钢，走2026-WZ-089合同”）或上传拍照发票/送货单/PDF，系统完成实体抽取与行业黑话向量对齐（Milvus 余弦检索）。
2. **确定性合规风控引擎**：提单过程中，实时对物料归属、价格偏离度（基准价 $\pm 15\%$）、合同履约剩余配额、合同效期进行纯代码数学计算，产生绿/黄/红三态诊断。
3. **双模态提单终端**：
   - **全屏工作台** (`/workbench`)：左单据/对话，右表单与合规卡片联动。
   - **ERP 悬浮助手** (`FloatingWidget`)：常驻宿主 ERP 沙箱右下角 56px 悬浮球，展开 420px 挂件面板。
4. **批量表格中心** (`/batch`)：Excel 模板下载、拖拽解析、逐行合规校验与原位纠错。
5. **审批流转与 ERP 回写**：超额订单触发特批申报（强校验理由 $\ge 10$ 字），审批通过后向 ERP 宿主回写并原子核减合同配额。

### 1.2 架构分层
```text
[浏览器前端 front (Vite + React 18 + TailwindCSS, 端口 5173)]
   │
   ├─► [核心后端 backend (FastAPI, 端口 8000)]
   │       ├─► MongoDB (192.168.6.134:27017, db: tradedoc_ai)
   │       ├─► Milvus (192.168.6.134:19530, collection: material_vector_index)
   │       └─► 阿里百炼 DashScope (Qwen-Plus / Qwen-VL, API Key + Base URL)
   │
   └─► [宿主中台沙箱 mock_erp (FastAPI, 端口 8001)]
           └─► MongoDB (192.168.6.134:27017, db: tradedoc_ai)
```

---

## 2. 多智能体分工与协同标准 (`/agent-task-orchestrator`)

所有接手本项目的 Agent 团队必须恪守以下四权分立与最小上下文交互铁律：

### 2.1 角色职责
1. **项目组长 (Lead / Coordinator)**：
   - **铁律**：组长**不越权直接编写业务代码**。
   - **职责**：负责阅读全局文档、对标 `docs/04_execution_plan_and_data_closure.md` 9 步计划拆解任务、采用标准契约派发任务给子智能体、审查交付成果并更新 `PROJECT_STATE.md`。
   - **对外回复要求**：直接面向用户的汇总回复，遵循精简原则，直击核心结论与关键决策。
2. **后端工程师 (Backend Engineer)**：
   - 专注 `backend/` 目录的 API 端点、Pydantic DTO、Service、DB 交互与 Pytest 编写。
   - 保证接口遵守统一三值报文，且单测 100% PASS。
3. **前端工程师 (Frontend Engineer)**：
   - 专注 `front/` 目录的 React 视图与组件实现。
   - 严格还原 `docs/原型图/*.pen` 原型规范，遵循 Apple HIG 设计语言。
   - 保证 `useTradeStore` 作为全局单源真相，执行 `npm run build` 确保 TypeScript 与 Vite 构建 0 报错。
4. **中台工程师 (Mock ERP Engineer)**：
   - 专注 `mock_erp/` 目录的沙箱接口与合同/订单台账回调。
5. **测试与审查员 (QA / Reviewer)**：
   - 负责白盒测试自动化（步骤 8）与全场景黑盒业务穿刺验收（步骤 9）。

---

## 3. 标准任务派发与结果接收契约模板

### 3.1 组长派发任务模板 (`task_dispatch_schema_v1`)
每次向子智能体指派任务时，必须封装为如下标准 JSON 报文：

```json
{
  "$schema": "task_dispatch_schema_v1",
  "task_id": "TASK-STEP-XX-MODULE-NAME",
  "role": "Backend Engineer | Frontend Engineer | QA Engineer",
  "instructions": "清晰的任务说明，包含实现步骤与关键约束",
  "input_files": [
    "docs/01_prd.md",
    "docs/03_dev_guidelines_and_api_contracts.md",
    "docs/04_execution_plan_and_data_closure.md"
  ],
  "output_targets": [
    "目标修改或新建的代码文件路径清单"
  ],
  "acceptance_criteria": {
    "AC-01": "可验证的原子验收标准 1",
    "AC-02": "可验证的原子验收标准 2"
  }
}
```

### 3.2 子智能体汇报结果模板 (`task_result_schema_v1`)
子智能体完成任务后，必须以如下标准格式返回：

```json
{
  "$schema": "task_result_schema_v1",
  "task_id": "TASK-STEP-XX-MODULE-NAME",
  "status": "PASS | FAIL | BLOCKED",
  "changes": [
    "实际修改或新增的文件路径"
  ],
  "validation": {
    "tests": "PASS | FAIL",
    "acceptance_criteria": {
      "AC-01": "PASS",
      "AC-02": "PASS"
    }
  },
  "issues": [],
  "next_action": "QA | RELEASE | DEV_FIX"
}
```

---

## 4. 研发铁律与不可逾越红线 (Zero-Fake Guidelines)

1. **绝对禁止硬编码数据 (No Hardcoded Mock Data)**：
   - 严禁在 Python 或 TypeScript 代码内写死任何业务合同、物料列表或测试假数据。
   - 严禁在代码中写死类似 `"发货签收单\n物资名称：42.5水泥..."` 等假 OCR 文本。
   - 所有主数据统一存放于根目录 `data/seeds/*.json`，由程序动态读取并向数据库更新。
2. **禁止虚假 UI 动作 (No Fake Buttons / Empty Toasts)**：
   - 前端按钮（如“暂存草稿”、“一键提单”、“特批提报”）点击后，必须真实发起网络请求并持久化至后端与 MongoDB。
3. **禁止大模型进行数值与额度运算**：
   - 偏离度浮动、超额差额、总金额累加必须严格由后端 Python 或前端纯代码进行确定性数学四则运算。
4. **单源真相 (Single Source of Truth)**：
   - 全屏工作台与悬浮窗必须共用同一个 Zustand `useTradeStore`，严禁在各自组件内建立脱节的局部草稿。
5. **统一三值协议 (Three-Value Standard Envelope)**：
   - 业务状态码仅限 `200` (成功)、`400` (业务校验失败/规则拦截)、`500` (系统内部异常)。
   - HTTP 状态码保持为 `200`，由 JSON 报文中的 `code` 表达业务语义。

---

## 5. 常用运行与测试命令速查

### 后端 (`backend/`)
```bash
cd backend
# 同步环境与依赖
uv sync
# 启动核心服务 (8000 端口)
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
# 执行全量自动化测试
uv run pytest
# 执行指定测试模块
uv run pytest tests/test_orders_crud.py
```

### 宿主中台沙箱 (`mock_erp/`)
```bash
cd mock_erp
# 同步环境与依赖
uv sync
# 启动中台沙箱 (8001 端口)
uv run uvicorn main:app --host 0.0.0.0 --port 8001 --reload
# 执行中台单测
uv run pytest
```

### 前端 (`front/`)
```bash
cd front
# 启动前端开发服务器 (5173 端口)
npm run dev
# 执行生产模式类型检查与打包构建
npm run build
```

---

## 6. 避坑指南与常见问题 (Gotchas)

1. **远程数据库连接权限**：
   - MongoDB 与 Milvus 部署于专用 Linux VM (`192.168.6.134`)。
   - 在沙箱终端环境中运行 Python 脚本或测试时，若遇到 `Operation not permitted` 或网络超时，需开启网络权限（Bypass Sandbox）。
2. **模型服务自定义 Base URL**：
   - 用户配置了定制版 DashScope 服务接入点（例如 `https://ws-xxx.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`）。
   - 代码中必须始终读取 `settings.QWEN_BASE_URL`，严禁硬编码官方阿里云域名。
3. **循环软链接排查**：
   - 严禁在 `mock_erp/` 下创建指向自身的软链接（如 `mock_erp/mock_erp -> .`），避免引发递归与打包混乱。
4. **PyMilvus 告警处理**：
   - `backend/pyproject.toml` 已配置全局过滤 PyMilvus 废弃告警，保持测试控制台整洁。
