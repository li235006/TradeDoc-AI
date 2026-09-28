# 《智能商贸提单助手 (TradeDoc AI)》全栈开发规范与标准 API 接口契约说明书

| 文档版本 | 状态 | 编写人 | 适用范围 | 密级 |
| :--- | :--- | :--- | :--- | :--- |
| v1.0.0 (MVP) | 正式生效 | 资深技术开发规范与契约专家 (Tech Lead / Spec Author) | 全栈研发工程师、测试工程师、系统架构师 | 内部公开 |

---

## 一、全栈开发环境与工程规范

### 1.1 技术栈选型与运行版本规范
为确保系统高内聚、轻量化与可维护性，全栈采用固定技术栈组合，严禁擅自引入非规范第三方重型库：

| 技术层级 | 选型组件 | 指定版本 | 核心用途与约束说明 |
| :--- | :--- | :--- | :--- |
| **前端运行时** | Node.js | `>= 18.18.0` (LTS) | 前端开发、打包与本地预览环境 |
| **前端框架** | React | `^18.3.1` | 前端组件化视图层构建 |
| **构建工具** | Vite | `^5.2.0` | 极速前端热重载与模块打包 |
| **样式框架** | Tailwind CSS | `^3.4.0` | 原子化响应式布局，配合双模态形态自适应 |
| **全局状态** | Zustand | `^4.5.2` | 单源真相 (SSOT) 驱动全屏与悬浮窗数据无损切换 |
| **图标库** | Lucide React | `^0.359.0` | 统一商贸图标组件 |
| **网络请求** | Axios | `^1.6.8` | 统一 HTTP 客户端，集成统一拦截器与解包 |
| **后端运行时** | Python | `>= 3.10.0` | 后端服务执行环境，使用原生类型注解 |
| **后端框架** | FastAPI | `^0.110.0` | 高性能异步 API 框架，基于 ASGI 运行 |
| **数据校验** | Pydantic | `^2.6.0` | 后端 DTO 模型定义、数据校验与 JSON 序列化 |
| **MongoDB 驱动**| Motor | `^3.3.2` | MongoDB 异步原生协程驱动 |
| **向量检索客户端**| PyMilvus | `^2.4.0` | Milvus 向量近似检索与集合管理客户端 |
| **大模型 SDK** | DashScope / OpenAI | 最新稳定版 | Qwen 模型 API 调用（用于阶段一极简实体提取） |
| **表格解析** | openpyxl / pandas | `openpyxl ^3.1.2` | Excel 订单批量导入模板解析与校验 |
| **外部数据底座** | MongoDB & Milvus | 远程节点 `192.168.6.134` | MongoDB 端口 `27017`，Milvus 端口 `19530` |

---

### 1.2 扁平化工程目录结构规范

系统严格遵循极简 MVP 路线，剔除任何嵌套过度设计，前后端目录高度扁平并直观映射业务：

#### 1. 前端工程结构 (`front/`)
```text
front/
├── index.html                   # 单页入口 HTML
├── package.json                 # 前端依赖配置
├── tsconfig.json                # TypeScript 编译配置
├── vite.config.ts               # Vite 代理与打包配置
├── tailwind.config.js           # Tailwind 主题与扩展配置
└── src/
    ├── main.tsx                 # 根挂载入口
    ├── App.tsx                  # 双模态主容器 (基于 mode 条件渲染全屏或悬浮窗)
    ├── index.css                # 全局原子样式与 Tailwind 指令
    ├── views/                   # 页面与主容器组件 (2 个核心视图)
    │   ├── WorkbenchView.tsx    # 提单工作台主视图 (承载全屏双栏布局与商贸订单列表底座)
    │   └── OrderDetailDrawer.tsx# 订单详情抽屉 (点击商贸列表订单行滑出回查)
    ├── components/              # 业务复用呈现组件 (5 个核心业务组件)
    │   ├── ChatPanel.tsx        # 通道一：文本对话提单交互面板 (气泡流/快捷标签/输入框)
    │   ├── OcrPanel.tsx         # 通道二：单据图片上传、识别卡片与原图预览
    │   ├── ExcelPanel.tsx       # 通道三：Excel 批量上传与逐行数据校验工作台
    │   ├── DraftPreview.tsx     # 订单草稿预览核对区 (基础信息卡片/产品明细表/操作栏)
    │   └── QuotaCard.tsx        # 合同履约 4 项指标统计看板与超额预警红标横幅
    ├── stores/                  # 状态管理 (单源真相)
    │   └── useTradeStore.ts     # Zustand 统一全局 Store (草稿、指标、消息、窗口形态)
    └── services/                # 统一接口服务层
        └── api.ts               # Axios 实例、统一解包拦截器、8 大核心 API 调用封装
```

#### 2. 后端工程结构 (`backend/`)
```text
backend/
├── requirements.txt             # 后端 Python 依赖清单
├── .env.example                 # 环境变量模板示例
├── app/
│   ├── main.py                  # FastAPI 主实例、CORS 中间件与 Lifespan 启动生命周期
│   ├── config.py                # 环境变量读取与全局单例配置 (pydantic-settings)
│   ├── db.py                    # Motor MongoDB 客户端与 PyMilvus 连接池管理
│   ├── models/                  # 前后端对齐 DTO 与数据集合实体 (Pydantic V2)
│   │   └── schemas.py           # 核心数据传输模型 (SSOT)
│   ├── services/                # 核心业务服务层 (3 个核心服务)
│   │   ├── funnel_engine.py     # 两阶段省 Token 管道 (LLM 抽参 + Milvus 对齐 + 确定性额度算式)
│   │   ├── order_service.py     # 订单提单、特批申请、审批流转、列表分页与流水号派发
│   │   └── excel_parser.py      # Excel 表格逐行解析与字段规则校验器
│   └── routers/                 # API 业务路由层 (3 个业务路由模块)
│       ├── parse.py             # 提取解析路由 (/api/parse/chat, /ocr, /excel)
│       ├── orders.py            # 订单业务路由 (/api/orders/submit, /submit-special, /approve, list)
│       └── contracts.py         # 合同台账路由 (/api/contracts/{contract_no}/quota)
└── tests/                       # 自动化验证测试套件
    ├── conftest.py              # Pytest 测试固件与环境变量 Mock
    └── test_api_contracts.py    # 8 大核心端点全量契约测试与断言用例
```

---

### 1.3 环境变量与连接配置规范

所有环境敏感变量均通过 `.env` 文件注入，禁止在业务代码中硬编码任何主机 IP 或密钥：

#### 1. 后端 `.env` 规约
```ini
# ==========================================
# 基础设施连接配置 (指向 192.168.6.134 节点)
# ==========================================
MONGO_HOST=192.168.6.134
MONGO_PORT=27017
MONGO_DB_NAME=tradedoc_ai
MONGO_URI=mongodb://192.168.6.134:27017/tradedoc_ai

MILVUS_HOST=192.168.6.134
MILVUS_PORT=19530
MILVUS_COLLECTION_NAME=material_vector_index

# ==========================================
# 模型与第三方服务
# ==========================================
DASHSCOPE_API_KEY=sk-your-dashscope-api-key
QWEN_MODEL_NAME=qwen-plus

# ==========================================
# 服务运行参数
# ==========================================
APP_HOST=0.0.0.0
APP_PORT=8000
DEBUG=false
CORS_ORIGINS=["http://localhost:5173", "http://127.0.0.1:5173"]
```

#### 2. 前端 `vite.config.ts` 代理与 `.env` 规约
```typescript
// front/vite.config.ts 代理规范
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});
```

---

### 1.4 代码与命名契约
1. **大小写规约**：
   - **JSON / 接口传输字段**：一律采用 `snake_case`（下划线命名法），禁止使用驼峰，杜绝前后端因映射遗漏导致的字段解析为空。
   - **Python 变量与方法**：`snake_case`；类名使用 `PascalCase`；常量使用 `UPPER_SNAKE_CASE`。
   - **TypeScript 变量与方法**：`camelCase`；组件、类型与接口使用 `PascalCase`；DTO 字段与后端 JSON 保持 100% 对应的 `snake_case`。
   - **RESTful 端点路径**：统一使用小写中划线 `kebab-case`（如 `/api/orders/submit-special`）。
2. **浮点数金额与数量精度**：
   - 金额类字段（`unit_price`, `total_amount` 等）在存储与计算时必须保留 **2 位小数**（例如 `800000.00`）。
   - 数量类字段（`quantity`）保留 **3 位小数**（例如 `200.000` 吨）。
3. **时间戳规范**：全系统时间一律使用 ISO-8601 标准 UTC 格式字符串传输，例如 `2026-09-28T06:00:00Z`。

---

### 1.5 Git 提交与分支约定
1. **分支规范**：
   - `main`：生产就绪受保护分支，严禁直接 Push。
   - `develop`：集成测试主干分支。
   - `feature/xxx`：特性功能研发分支（如 `feature/two-stage-parser`）。
   - `fix/xxx`：缺陷修复分支。
2. **提交信息规范 (Conventional Commits)**：
   - `feat: <description>`：新增业务特性。
   - `fix: <description>`：修复 Bug。
   - `refactor: <description>`：代码重构（不改变外部行为）。
   - `test: <description>`：补充自动化测试用例。
   - `docs: <description>`：补充或修改文档。

---

## 二、统一通信协议与错误治理规范

### 2.1 统一 API 响应报文结构 (Standard Envelope)
系统彻底剔除复杂繁琐的 12 类状态码枚举，全站统一采用**标准三值协议**。所有 HTTP 请求状态码均响应 `200 OK`，实际业务成败与错误类型由顶层 JSON 报文内部明确区分：

```typescript
export interface ApiResponse<T = any> {
  code: 200 | 400 | 500; // 统一三值业务码
  message: string;        // 面向用户的中文语义提示（前端可直接 Toast 呈现）
  data: T;               // 业务承载体（失败时为 null 或空对象）
}
```

#### 业务码语义矩阵与处置策略：
| 业务响应码 `code` | 业务语义 | 典型触发场景 | 前端处理逻辑 |
| :--- | :--- | :--- | :--- |
| **`200`** | **操作成功 (Success)** | 文本解析完成、草稿更新、订单正式提交成功、审批完成 | 正常消费 `data` 载荷，更新 Zustand Store，必要时展示成功 Toast |
| **`400`** | **业务校验失败 / 规则拦截 (Business Error)** | 必填项缺失、格式不符、合同不存在、单据重复提交拦截、超额提单直接生效被拦截 | 读取 `message` 并直接弹出黄色/红色 Toast 警示，界面保持原状，**禁止引发系统白屏或崩溃** |
| **`500`** | **服务异常 / 基础设施故障 (System Error)** | MongoDB/Milvus 网络离线、LLM 服务端熔断、未捕获内部异常 | 弹出深红 Toast：“系统服务响应异常，请稍后重试”，打印控制台日志，保留用户当前编辑草稿不丢失 |

---

### 2.2 HTTP 动词与请求头规约
1. **HTTP Method 约定**：
   - 查询资源使用 `GET`（如合同配额查询、订单列表检索）。
   - 解析、创建、提交与特批流转一律使用 `POST`。
2. **关键请求头规范**：
   - `Content-Type`: `application/json`（常规 JSON 请求）或 `multipart/form-data`（OCR 图片与 Excel 上传）。
   - `Idempotency-Key`: 客户端 UUIDv4 字符串。在调用 `/api/orders/submit` 与 `/api/orders/submit-special` 时强制携带，用于服务端分布式防重防抖（有效期 60 秒）。

---

### 2.3 全局异常治理与 Axios 拦截器规范

#### 1. 后端全局异常拦截器 (`backend/app/main.py`)
```python
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

app = FastAPI()

class BusinessException(Exception):
    def __init__(self, message: str, code: int = 400):
        self.message = message
        self.code = code

@app.exception_handler(BusinessException)
async def business_exception_handler(request: Request, exc: BusinessException):
    return JSONResponse(
        status_code=200,
        content={"code": exc.code, "message": exc.message, "data": None}
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # 提取第一条校验错误，转化为易懂的中文
    err = exc.errors()[0]
    field = ".".join(str(loc) for loc in err["loc"] if loc != "body")
    msg = f"参数校验失败 [{field}]: {err.get('msg', '格式不合法')}"
    return JSONResponse(
        status_code=200,
        content={"code": 400, "message": msg, "data": None}
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=200,
        content={"code": 500, "message": f"服务器内部异常: {str(exc)}", "data": None}
    )
```

#### 2. 前端 Axios 拦截与自动解包规范 (`front/src/services/api.ts`)
```typescript
import axios, { AxiosResponse } from 'axios';

export const apiClient = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    const res = response.data;
    // 当 code 为 400 或 500 时，直接转为业务 Reject
    if (res && typeof res.code === 'number' && res.code !== 200) {
      return Promise.reject(new Error(res.message || '请求处理失败'));
    }
    return res;
  },
  (error) => {
    const msg = error.response?.data?.message || error.message || '网络连接超时，请检查服务状态';
    return Promise.reject(new Error(msg));
  }
);
```

---

## 三、核心业务 API 契约全景定义 (8 大核心端点)

### 3.1 端点总览矩阵

| 序号 | 端点路径 (URL) | 请求方法 | 鉴权与隔离要求 | 幂等控制 | 接口核心职责与业务描述 |
| :---: | :--- | :---: | :---: | :---: | :--- |
| **EP-01** | `/api/parse/chat` | `POST` | 绑定登录部门 | 否 | 通道一：自然语言意图理解、两阶段实体提取与额度试算 |
| **EP-02** | `/api/parse/ocr` | `POST` | 绑定登录部门 | 否 | 通道二：单据图片 (签收单/磅单) OCR 识别、物料纠错与额度试算 |
| **EP-03** | `/api/parse/excel` | `POST` | 绑定登录部门 | 否 | 通道三：Excel 模板表格批量按行解析与异常预警校验 |
| **EP-04** | `/api/orders/submit` | `POST` | 经办人角色 | **强制** (`Idempotency-Key`) | 额度充足条件下一键正式提单（自动生成单号，直接置为已生效） |
| **EP-05** | `/api/orders/submit-special` | `POST` | 经办人角色 | **强制** (`Idempotency-Key`) | 超额预警条件下提交特批申请（必须附带不少于 10 字理由） |
| **EP-06** | `/api/orders/{order_no}/approve` | `POST` | 审批人角色 | 否 | 业务审批人执行审批（通过、退回修改、驳回终结） |
| **EP-07** | `/api/orders` | `GET` | 按部门行级隔离 | 否 | 商贸订单列表查询与多维筛选（支持分页与详情回查） |
| **EP-08** | `/api/contracts/{contract_no}/quota`| `GET` | 登录即可 | 否 | 查询指定合同的主数据与 4 项实时履约额度指标 |

---

### 3.2 详细端点定义

```
┌────────────────────────────────────────────────────────────────────────┐
│ EP-01: 文本对话智能解析 (POST /api/parse/chat)                           │
└────────────────────────────────────────────────────────────────────────┘
```
- **请求方法**：`POST`
- **请求头**：`Content-Type: application/json`
- **请求体 (Request Body)**：
```json
{
  "text": "给中建八局科技城项目下200吨400E 20圆钢，走2026-WZ-089合同，后天送到一号工地",
  "session_id": "sess-default-01"
}
```
| 字段名 | 类型 | 必填 | 校验规则与说明 |
| :--- | :--- | :---: | :--- |
| `text` | string | 是 | 用户输入的自然语言文本，长度 2~500 字符 |
| `session_id` | string | 否 | 当前会话 ID，用于上下文追溯，默认为空 |

- **成功响应 (Response 200)**：
```json
{
  "code": 200,
  "message": "解析完成",
  "data": {
    "draft": {
      "order_type": "SALES",
      "contract_no": "2026-WZ-089",
      "counterparty_name": "中建八局第一建设有限公司",
      "project_name": "科技城数字经济产业园一期项目",
      "delivery_address": "苏州市高新区科技城 1 号工地物资中转站",
      "contact_person": "现场负责人",
      "business_name": "国内传统贸易",
      "procurement_mode": "直发",
      "business_tag": "传统贸易",
      "items": [
        {
          "item_seq": 1,
          "material_code": "STL-RB-400E-20",
          "material_name": "热轧带肋钢筋",
          "specification": "HRB400E Φ20mm",
          "quantity": 200.0,
          "unit": "吨",
          "unit_price": 4000.0,
          "total_amount": 800000.0,
          "match_status": "ALIGNED"
        }
      ],
      "total_amount": 800000.0,
      "is_over_quota": true,
      "special_approval_reason": "",
      "order_status": "DRAFT"
    },
    "quota": {
      "contract_total_amount": 5000000.0,
      "accumulated_order_amount": 4850000.0,
      "accumulated_order_count": 18,
      "remaining_quota_amount": 150000.0,
      "remaining_order_count": 2,
      "is_over_quota": true,
      "over_amount": 650000.0
    },
    "clarification": "检测到本次提单金额 (¥800,000.00) 超出合同剩余可用额度 (¥150,000.00)，差额 ¥650,000.00，已为您触发超额特批流程。"
  }
}
```
- **异常响应示例 (Response 400)**：
```json
{
  "code": 400,
  "message": "未识别到有效的商贸提单意图，请提供合同号、物料品名及数量",
  "data": null
}
```

---

```
┌────────────────────────────────────────────────────────────────────────┐
│ EP-02: 单据图片 OCR 结构化提单 (POST /api/parse/ocr)                     │
└────────────────────────────────────────────────────────────────────────┘
```
- **请求方法**：`POST`
- **请求头**：`Content-Type: multipart/form-data`
- **表单字段 (Form Data)**：
  - `file`: 二进制图片文件 (支持 JPG/PNG/JPEG/WEBP，大小 <= 10MB)。
  - `contract_no`: 可选字符串 (若经办人提前选定合同号，则优先使用)。
- **成功响应 (Response 200)**：
  - 载荷结构与 `EP-01` 保持完全一致，返回解析生成的 `draft`、`quota` 以及单据原始 OCR 文本提取卡片信息：
```json
{
  "code": 200,
  "message": "单据识别成功",
  "data": {
    "draft": {
      "order_type": "PURCHASE",
      "contract_no": "2026-WZ-089",
      "counterparty_name": "中建八局第一建设有限公司",
      "project_name": "科技城数字经济产业园一期项目",
      "delivery_address": "苏州市高新区科技城 1 号工地物资中转站",
      "contact_person": "张工",
      "business_name": "国内传统贸易",
      "procurement_mode": "直发",
      "business_tag": "传统贸易",
      "items": [
        {
          "item_seq": 1,
          "material_code": "CEM-PC-425",
          "material_name": "普通硅酸盐水泥",
          "specification": "P.O 42.5 散装",
          "quantity": 500.0,
          "unit": "吨",
          "unit_price": 440.0,
          "total_amount": 220000.0,
          "match_status": "ALIGNED"
        }
      ],
      "total_amount": 220000.0,
      "is_over_quota": true,
      "special_approval_reason": "",
      "order_status": "DRAFT"
    },
    "quota": {
      "contract_total_amount": 5000000.0,
      "accumulated_order_amount": 4850000.0,
      "accumulated_order_count": 18,
      "remaining_quota_amount": 150000.0,
      "remaining_order_count": 2,
      "is_over_quota": true,
      "over_amount": 70000.0
    },
    "ocr_raw_text": "发货签收单\n物资名称：42.5水泥\n数量：500吨\n单价：440元\n签收单位：中建八局科技城项目部"
  }
}
```
- **异常响应示例 (Response 400)**：
```json
{
  "code": 400,
  "message": "单据文字模糊或未能识别出有效凭证，请上传清晰的发货单或合同凭据",
  "data": null
}
```

---

```
┌────────────────────────────────────────────────────────────────────────┐
│ EP-03: Excel 批量表格解析校验 (POST /api/parse/excel)                    │
└────────────────────────────────────────────────────────────────────────┘
```
- **请求方法**：`POST`
- **请求头**：`Content-Type: multipart/form-data`
- **表单字段 (Form Data)**：
  - `file`: 二进制 Excel 文件 (`.xlsx` 或 `.xls`，大小 <= 20MB)。
- **成功响应 (Response 200)**：
```json
{
  "code": 200,
  "message": "批量文件解析校验完成",
  "data": {
    "total_rows": 2,
    "valid_rows": 1,
    "error_rows": 1,
    "rows": [
      {
        "row_index": 1,
        "status": "VALID",
        "error_msg": null,
        "contract_no": "2026-WZ-089",
        "counterparty_name": "中建八局第一建设有限公司",
        "project_name": "科技城数字经济产业园一期项目",
        "material_code": "STL-RB-400E-20",
        "material_name": "热轧带肋钢筋",
        "specification": "HRB400E Φ20mm",
        "quantity": 30.0,
        "unit": "吨",
        "unit_price": 4000.0,
        "total_amount": 120000.0,
        "delivery_address": "苏州市高新区科技城 1 号工地"
      },
      {
        "row_index": 2,
        "status": "ERROR",
        "error_msg": "合同编号 2026-WZ-999 不存在或已失效",
        "contract_no": "2026-WZ-999",
        "counterparty_name": "未知单位",
        "project_name": "无锡综合保税区项目",
        "material_code": "CEM-PC-425",
        "material_name": "普通硅酸盐水泥",
        "specification": "P.O 42.5",
        "quantity": 100.0,
        "unit": "吨",
        "unit_price": 440.0,
        "total_amount": 44000.0,
        "delivery_address": "无锡市新吴区工地"
      }
    ]
  }
}
```

---

```
┌────────────────────────────────────────────────────────────────────────┐
│ EP-04: 正式提单提交 (额度合规) (POST /api/orders/submit)                  │
└────────────────────────────────────────────────────────────────────────┘
```
- **请求方法**：`POST`
- **请求头**：
  - `Content-Type: application/json`
  - `Idempotency-Key: c9b2c86b-586b-4e12-8e10-912fbbd8199b` (必填)
- **请求体 (Request Body)**：
```json
{
  "order_type": "SALES",
  "contract_no": "2026-WZ-090",
  "counterparty_name": "中铁十二局集团有限公司",
  "project_name": "苏州轨道交通 8 号线 3 标",
  "delivery_address": "苏州市工业园区工地",
  "contact_person": "王工 13800000000",
  "business_name": "国内传统贸易",
  "procurement_mode": "直发",
  "business_tag": "传统贸易",
  "items": [
    {
      "item_seq": 1,
      "material_code": "STL-RB-400E-20",
      "material_name": "热轧带肋钢筋",
      "specification": "HRB400E Φ20mm",
      "quantity": 50.0,
      "unit": "吨",
      "unit_price": 4000.0,
      "total_amount": 200000.0
    }
  ],
  "total_amount": 200000.0,
  "operator_name": "李强",
  "operator_dept": "物资贸易一部"
}
```
- **服务端处理与校验逻辑**：
  1. 查验 `Idempotency-Key`，若 60 秒内存在相同单据提交记录，直接幂等返回已创建的订单。
  2. 读取合同 `2026-WZ-090`，纯代码核算剩余可用额度：若本次金额大于剩余可用金额，**直接阻断并返回 400**，提示“订单金额超额，请转入超额特批流程”。
  3. 原子自增派发单据号：`XSDD-WZGS-20260928-001`。
  4. 扣减合同累计可用配额，写入 MongoDB `orders` 集合，状态置为 `ACTIVE`。
- **成功响应 (Response 200)**：
```json
{
  "code": 200,
  "message": "提单成功，订单已生效",
  "data": {
    "order_no": "XSDD-WZGS-20260928-001",
    "order_status": "ACTIVE",
    "total_amount": 200000.0,
    "created_at": "2026-09-28T06:15:30Z"
  }
}
```
- **异常响应示例 (Response 400)**：
```json
{
  "code": 400,
  "message": "合同可用额度不足 (本次申请 ¥800,000.00 > 剩余可用 ¥150,000.00)，禁止直接生效，请提交超额特批申请",
  "data": null
}
```

---

```
┌────────────────────────────────────────────────────────────────────────┐
│ EP-05: 超额特批申请提交 (POST /api/orders/submit-special)                 │
└────────────────────────────────────────────────────────────────────────┘
```
- **请求方法**：`POST`
- **请求头**：
  - `Content-Type: application/json`
  - `Idempotency-Key: a1f83c01-7d12-4e4b-972d-88b9a997ef00` (必填)
- **请求体 (Request Body)**：
```json
{
  "order_type": "SALES",
  "contract_no": "2026-WZ-089",
  "counterparty_name": "中建八局第一建设有限公司",
  "project_name": "科技城数字经济产业园一期项目",
  "delivery_address": "苏州市高新区科技城 1 号工地物资中转站",
  "contact_person": "现场联系人",
  "business_name": "国内传统贸易",
  "procurement_mode": "直发",
  "business_tag": "传统贸易",
  "items": [
    {
      "item_seq": 1,
      "material_code": "STL-RB-400E-20",
      "material_name": "热轧带肋钢筋",
      "specification": "HRB400E Φ20mm",
      "quantity": 200.0,
      "unit": "吨",
      "unit_price": 4000.0,
      "total_amount": 800000.0
    }
  ],
  "total_amount": 800000.0,
  "special_approval_reason": "经现场项目经理确认，一期地下室结构抢工期急需追加钢材，已报备商务部补签增补协议",
  "operator_name": "李强",
  "operator_dept": "物资贸易一部"
}
```
- **校验规则**：
  - `special_approval_reason` 必填，且字符串去除前后空格后长度必须 `>= 10` 个字符。
  - 强制设置 `is_over_quota = true`，订单状态设置为 `PENDING_SPECIAL_APPROVAL`。
- **成功响应 (Response 200)**：
```json
{
  "code": 200,
  "message": "超额特批申请已提交，等待业务审批人审核",
  "data": {
    "order_no": "XSDD-WZGS-20260928-002",
    "order_status": "PENDING_SPECIAL_APPROVAL",
    "is_over_quota": true,
    "special_approval_reason": "经现场项目经理确认，一期地下室结构抢工期急需追加钢材，已报备商务部补签增补协议",
    "created_at": "2026-09-28T06:20:00Z"
  }
}
```

---

```
┌────────────────────────────────────────────────────────────────────────┐
│ EP-06: 审批人流转裁决 (POST /api/orders/{order_no}/approve)             │
└────────────────────────────────────────────────────────────────────────┘
```
- **请求方法**：`POST`
- **URL 路径参数**：`order_no` (待审单据流水号，如 `XSDD-WZGS-20260928-002`)
- **请求体 (Request Body)**：
```json
{
  "decision": "PASS",
  "comment": "现场情况属实，增补协议已走OA流程，同意特批放行",
  "approver_name": "王总",
  "approver_dept": "商贸风控审批部"
}
```
| 字段名 | 类型 | 必填 | 校验规则与说明 |
| :--- | :--- | :---: | :--- |
| `decision` | string | 是 | 审批裁决枚举：`PASS` (审核通过), `RETURN` (退回修改), `REJECT` (驳回作废) |
| `comment` | string | 是 | 审批人签署意见，长度 2~300 字符 |
| `approver_name` | string | 是 | 审批人姓名 |
| `approver_dept` | string | 是 | 审批人所属部门 |

- **业务流转分支处理**：
  - `PASS`：单据状态推进为 `ACTIVE`（已生效），扣减合同额度；
  - `RETURN`：单据状态变更回 `RETURNED`（已退回），经办人可重载编辑；
  - `REJECT`：单据状态推进为 `REJECTED`（已驳回），单据作废终结。
- **成功响应 (Response 200)**：
```json
{
  "code": 200,
  "message": "订单审批流转成功",
  "data": {
    "order_no": "XSDD-WZGS-20260928-002",
    "order_status": "ACTIVE",
    "decision": "PASS",
    "approved_at": "2026-09-28T06:30:15Z"
  }
}
```

---

```
┌────────────────────────────────────────────────────────────────────────┐
│ EP-07: 商贸订单列表查询 (GET /api/orders)                                │
└────────────────────────────────────────────────────────────────────────┘
```
- **请求方法**：`GET`
- **查询参数 (Query Parameters)**：
  - `page`: 整数，页码，默认 `1`
  - `page_size`: 整数，每页条数，默认 `10`，最大 `100`
  - `order_type`: 可选，`SALES` / `PURCHASE`
  - `order_status`: 可选，`DRAFT` / `PENDING_CONFIRM` / `PENDING_SPECIAL_APPROVAL` / `ACTIVE` / `RETURNED` / `REJECTED`
  - `keyword`: 可选，按单号、合同号、项目名称模糊搜索
  - `dept`: 可选，部门隔离筛选字段
- **成功响应 (Response 200)**：
```json
{
  "code": 200,
  "message": "查询成功",
  "data": {
    "total": 35,
    "page": 1,
    "page_size": 10,
    "list": [
      {
        "order_no": "XSDD-WZGS-20260928-002",
        "order_type": "SALES",
        "contract_no": "2026-WZ-089",
        "counterparty_name": "中建八局第一建设有限公司",
        "project_name": "科技城数字经济产业园一期项目",
        "total_amount": 800000.0,
        "is_over_quota": true,
        "order_status": "ACTIVE",
        "special_approval_reason": "经现场项目经理确认抢工期追加",
        "operator_name": "李强",
        "operator_dept": "物资贸易一部",
        "created_at": "2026-09-28T06:20:00Z",
        "items": [
          {
            "item_seq": 1,
            "material_code": "STL-RB-400E-20",
            "material_name": "热轧带肋钢筋",
            "specification": "HRB400E Φ20mm",
            "quantity": 200.0,
            "unit": "吨",
            "unit_price": 4000.0,
            "total_amount": 800000.0
          }
        ]
      }
    ]
  }
}
```

---

```
┌────────────────────────────────────────────────────────────────────────┐
│ EP-08: 合同配额看板查询 (GET /api/contracts/{contract_no}/quota)         │
└────────────────────────────────────────────────────────────────────────┘
```
- **请求方法**：`GET`
- **路径参数**：`contract_no`（合同编号，如 `2026-WZ-089`）
- **成功响应 (Response 200)**：
```json
{
  "code": 200,
  "message": "获取合同配额成功",
  "data": {
    "contract_no": "2026-WZ-089",
    "contract_type": "SALES",
    "counterparty_name": "中建八局第一建设有限公司",
    "project_name": "科技城数字经济产业园一期项目",
    "default_delivery_address": "苏州市高新区科技城 1 号工地物资中转站",
    "contract_total_amount": 5000000.0,
    "accumulated_order_amount": 4850000.0,
    "accumulated_order_count": 18,
    "remaining_quota_amount": 150000.0,
    "remaining_order_count": 2,
    "max_order_count": 20,
    "is_over_quota": false,
    "over_amount": 0.0
  }
}
```
- **异常响应 (Response 400)**：
```json
{
  "code": 400,
  "message": "合同编号 2026-WZ-999 不存在或已失效",
  "data": null
}
```

---

## 四、前后端统一实体模型契约 (SSOT DTO 对齐)

为确保前后端通信零摩擦，所有字段在 Python (Pydantic V2) 与 TypeScript (Interface) 之间实行 **100% 逐字对应对齐**，禁止擅自增减字段或修改数据类型。

### 4.1 物资明细模型 (`OrderItem`)

| 字段名称 | 后端 Pydantic 字段声明 | 前端 TypeScript 类型声明 | 约束说明 |
| :--- | :--- | :--- | :--- |
| `item_seq` | `int = Field(..., ge=1)` | `number` | 行序号，从 1 递增 |
| `material_code` | `str = Field(..., max_length=64)`| `string` | 标准物料主档编码 |
| `material_name` | `str = Field(..., max_length=128)`| `string` | 规范物资品名 |
| `specification` | `str = Field("", max_length=128)` | `string` | 规格牌号 |
| `quantity` | `float = Field(..., gt=0)` | `number` | 数量/吨数 (大于 0) |
| `unit` | `str = Field("吨", max_length=32)`| `string` | 计量单位 |
| `unit_price` | `float = Field(..., gt=0)` | `number` | 含税单价 (元) |
| `total_amount` | `float = Field(..., ge=0)` | `number` | 行总金额 (\(quantity \times unit\_price\)) |
| `match_status` | `Optional[str] = "ALIGNED"` | `string?` | 向量对齐状态 (`ALIGNED` / `CONFIRM` / `UNMATCHED`) |

#### 后端 Pydantic V2 定义：
```python
class OrderItemDTO(BaseModel):
    item_seq: int = Field(..., ge=1, description="行序号")
    material_code: str = Field(..., max_length=64, description="标准物料编码")
    material_name: str = Field(..., max_length=128, description="规范品名")
    specification: str = Field("", max_length=128, description="规格牌号")
    quantity: float = Field(..., gt=0, description="主计量吨数")
    unit: str = Field("吨", max_length=32, description="计量单位")
    unit_price: float = Field(..., gt=0, description="含税单价")
    total_amount: float = Field(..., ge=0, description="明细总金额")
    match_status: Optional[str] = Field("ALIGNED", description="物料对齐状态")
```

#### 前端 TypeScript Interface 定义：
```typescript
export interface OrderItem {
  item_seq: number;
  material_code: string;
  material_name: string;
  specification: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_amount: number;
  match_status?: 'ALIGNED' | 'CONFIRM' | 'UNMATCHED';
}
```

---

### 4.2 订单草稿与主档模型 (`OrderDraft` / `OrderHeader`)

| 字段名称 | 后端 Pydantic 字段 | 前端 TypeScript 类型 | 默认值 / 生成规则 |
| :--- | :--- | :--- | :--- |
| `order_no` | `Optional[str] = None` | `string?` | 正式单号（未提交时为 null） |
| `order_type` | `Literal["SALES", "PURCHASE"]` | `'SALES' \| 'PURCHASE'` | 默认 `'SALES'` |
| `contract_no` | `str = Field(..., min_length=1)`| `string` | 合同编号 |
| `counterparty_name`| `str = Field("", max_length=128)`| `string` | 签约往来单位 |
| `project_name` | `str = Field("", max_length=128)`| `string` | 工程项目名称 |
| `delivery_address` | `str = Field("", max_length=256)`| `string` | 送货详细地址 |
| `contact_person` | `Optional[str] = None` | `string?` | 现场联系人及电话 |
| `business_name` | `str = "国内传统贸易"` | `string` | 固定默认值 |
| `procurement_mode` | `str = "直发"` | `string` | 固定默认值 |
| `business_tag` | `str = "传统贸易"` | `string` | 固定默认值 |
| `items` | `List[OrderItemDTO] = []` | `OrderItem[]` | 物资产品明细列表 |
| `total_amount` | `float = 0.0` | `number` | 草稿全单总金额 |
| `is_over_quota` | `bool = False` | `boolean` | 是否触发超额预警 |
| `special_approval_reason`| `str = ""` | `string` | 追加特批说明 |
| `order_status` | `str = "DRAFT"` | `string` | 状态：`DRAFT` / `PENDING_CONFIRM` / `PENDING_SPECIAL_APPROVAL` / `ACTIVE` / `RETURNED` / `REJECTED` |
| `operator_name` | `str = "业务经办人"` | `string` | 经办人姓名 |
| `operator_dept` | `str = "物资贸易一部"` | `string` | 经办部门 |
| `created_at` | `Optional[str] = None` | `string?` | 创建时间戳 ISO-8601 |

#### 后端 Pydantic V2 定义：
```python
class OrderDraftDTO(BaseModel):
    order_no: Optional[str] = None
    order_type: Literal["SALES", "PURCHASE"] = "SALES"
    contract_no: str = Field(..., description="关联主合同号")
    counterparty_name: str = Field("", description="签约往来单位")
    project_name: str = Field("", description="工程项目名称")
    delivery_address: str = Field("", description="收货地址")
    contact_person: Optional[str] = None
    business_name: str = "国内传统贸易"
    procurement_mode: str = "直发"
    business_tag: str = "传统贸易"
    items: List[OrderItemDTO] = []
    total_amount: float = 0.0
    is_over_quota: bool = False
    special_approval_reason: str = ""
    order_status: Literal[
        "DRAFT", "PENDING_CONFIRM", "PENDING_SPECIAL_APPROVAL",
        "ACTIVE", "RETURNED", "REJECTED"
    ] = "DRAFT"
    operator_name: str = "业务经办人"
    operator_dept: str = "物资贸易一部"
    created_at: Optional[str] = None
```

#### 前端 TypeScript Interface 定义：
```typescript
export interface OrderDraft {
  order_no?: string;
  order_type: 'SALES' | 'PURCHASE';
  contract_no: string;
  counterparty_name: string;
  project_name: string;
  delivery_address: string;
  contact_person?: string;
  business_name: string;
  procurement_mode: string;
  business_tag: string;
  items: OrderItem[];
  total_amount: number;
  is_over_quota: boolean;
  special_approval_reason: string;
  order_status:
    | 'DRAFT'
    | 'PENDING_CONFIRM'
    | 'PENDING_SPECIAL_APPROVAL'
    | 'ACTIVE'
    | 'RETURNED'
    | 'REJECTED';
  operator_name: string;
  operator_dept: string;
  created_at?: string;
}
```

---

### 4.3 合同履约配额看板模型 (`ContractQuota`)

#### 后端 Pydantic V2：
```python
class ContractQuotaDTO(BaseModel):
    contract_no: Optional[str] = None
    contract_total_amount: float = Field(0.0, description="合同总金额")
    accumulated_order_amount: float = Field(0.0, description="累计已下金额")
    accumulated_order_count: int = Field(0, description="累计已下订单数")
    remaining_quota_amount: float = Field(0.0, description="剩余可用金额")
    remaining_order_count: int = Field(0, description="剩余可用笔数")
    max_order_count: int = Field(0, description="最大允许订单数")
    is_over_quota: bool = Field(False, description="当前当次申请是否超额")
    over_amount: float = Field(0.0, description="超额差额金额")
```

#### 前端 TypeScript：
```typescript
export interface ContractQuota {
  contract_no?: string;
  contract_total_amount: number;
  accumulated_order_amount: number;
  accumulated_order_count: number;
  remaining_quota_amount: number;
  remaining_order_count: number;
  max_order_count?: number;
  is_over_quota: boolean;
  over_amount: number;
}
```

---

## 五、数据底座与启动自愈规约 (Lifespan & Schema SSOT)

### 5.1 外部基础设施连接定义
后端服务统一连接位于 `192.168.6.134` 外部 Linux 宿主机上的数据库服务，禁止在本地随意启动内嵌 Mock 存储：
- **MongoDB**：`mongodb://192.168.6.134:27017/tradedoc_ai`
- **Milvus**：`192.168.6.134:19530`

---

### 5.2 MongoDB 核心集合 Schema 与索引规约
系统严控数据库表膨胀，全业务仅建立 **3 张业务核心集合** 与 **1 张原子发号集合**：

#### 1. 合同主数据集合：`contracts`
- **字段定义**：
  - `_id`: ObjectId
  - `contract_no`: String (唯一主键，如 `"2026-WZ-089"`)
  - `contract_type`: String (`"SALES"` 或 `"PURCHASE"`)
  - `counterparty_name`: String (往来签约单位全称)
  - `project_name`: String (归属工程项目名称)
  - `total_amount`: Double (合同约定法律效力总上限金额)
  - `accumulated_amount`: Double (历史累计已生效订单总金额)
  - `max_order_count`: Int (合同约定最大可下单数)
  - `accumulated_order_count`: Int (历史已生效订单笔数)
  - `default_delivery_address`: String (默认工地收货地址)
  - `status`: String (`"ACTIVE"` / `"TERMINATED"`)
- **索引规范**：
  - 唯一索引：`{"contract_no": 1}`, `unique=True`

#### 2. 标准物料主数据集合：`materials`
- **字段定义**：
  - `_id`: ObjectId
  - `material_code`: String (唯一主键，如 `"STL-RB-400E-20"`)
  - `material_name`: String (标准品名，如 `"热轧带肋钢筋"`)
  - `specification`: String (规格牌号，如 `"HRB400E Φ20mm"`)
  - `unit`: String (计量单位，如 `"吨"`)
  - `standard_price`: Double (指导基准单价，如 `4000.00`)
  - `aliases`: Array of String (现场俗称、手写简称列表)
- **索引规范**：
  - 唯一索引：`{"material_code": 1}`, `unique=True`

#### 3. 业务订单集合：`orders`
- **字段定义**：
  - `_id`: ObjectId
  - `order_no`: String (正式商贸流水单号，唯一)
  - `order_type`: String (`"SALES"` / `"PURCHASE"`)
  - `contract_no`: String (关联合同号)
  - `counterparty_name`: String
  - `project_name`: String
  - `delivery_address`: String
  - `contact_person`: String
  - `business_name`: String (`"国内传统贸易"`)
  - `procurement_mode`: String (`"直发"`)
  - `business_tag`: String (`"传统贸易"`)
  - `items`: Array of Object (`OrderItemDTO`)
  - `total_amount`: Double (订单总金额)
  - `is_over_quota`: Boolean (是否超额)
  - `special_approval_reason`: String (特批理由)
  - `order_status`: String (`"DRAFT"`, `"PENDING_CONFIRM"`, `"PENDING_SPECIAL_APPROVAL"`, `"ACTIVE"`, `"RETURNED"`, `"REJECTED"`)
  - `operator_name`: String
  - `operator_dept`: String (用于行级数据权限隔离)
  - `approver_name`: String (审批人姓名，初始为 null)
  - `approval_comment`: String (审批批注)
  - `created_at`: String (ISO-8601 UTC 时间戳)
- **索引规范**：
  - 唯一索引：`{"order_no": 1}`, `unique=True, sparse=True`
  - 复合检索索引：`{"contract_no": 1, "order_status": 1}`
  - 部门隔离检索索引：`{"operator_dept": 1, "created_at": -1}`

#### 4. 原子流水号发号器集合：`counters`
- **字段定义**：`{"_id": "order_seq_20260928", "seq": 1}`

---

### 5.3 Milvus 向量集合设计 (`material_vector_index`)

- **Collection Name**：`material_vector_index`
- **向量维度**：`1024`（浮点型向量，与 Embedding 模型对齐）
- **度量方式**：`COSINE`（余弦相似度，范围 -1 ~ 1）
- **索引类型**：`HNSW`（`M=16, efConstruction=200`）或 `IVF_FLAT`（`nlist=128`）
- **字段规范 (Fields)**：
  - `id`: INT64, 主键，`auto_id=True`
  - `material_code`: VARCHAR(64), 标准物料编码
  - `material_name`: VARCHAR(128), 规范品名
  - `specification`: VARCHAR(128), 规格型号
  - `alias_text`: VARCHAR(256), 俗称简称文本
  - `standard_price`: FLOAT, 官方基准价
  - `vector`: FLOAT_VECTOR(1024), 语义向量

---

### 5.4 启动自愈规约与法定种子数据

在后端 FastAPI `lifespan` 启动钩子中，系统必须自动执行以下自愈逻辑，确保**零手工配置、即开即用**：

```python
# backend/app/main.py Lifespan 自愈伪代码规约
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 步骤 1: 探测并连接 192.168.6.134 MongoDB
    db = get_mongo_db()
    for coll in ["contracts", "materials", "orders", "counters"]:
        if coll not in await db.list_collection_names():
            await db.create_collection(coll)
    await db.contracts.create_index("contract_no", unique=True)
    await db.materials.create_index("material_code", unique=True)

    # 步骤 2: 注入商贸合同法定种子数据 (若为空)
    if await db.contracts.count_documents({}) == 0:
        await db.contracts.insert_many(CONTRACT_SEEDS)

    # 步骤 3: 注入物料法定种子数据 (若为空)
    if await db.materials.count_documents({}) == 0:
        await db.materials.insert_many(MATERIAL_SEEDS)

    # 步骤 4: 探测并初始化 Milvus 向量索引库
    milvus_client = get_milvus_client()
    if not milvus_client.has_collection("material_vector_index"):
        create_milvus_collection_and_index()
        # 将物料别名字典生成向量并入库
        sync_materials_to_milvus()
    milvus_client.load_collection("material_vector_index")

    yield
    # 关闭数据库连接池
```

#### 法定合同种子数据 (Contract Seeds)：
```json
[
  {
    "contract_no": "2026-WZ-089",
    "contract_type": "SALES",
    "counterparty_name": "中建八局第一建设有限公司",
    "project_name": "科技城数字经济产业园一期项目",
    "total_amount": 5000000.0,
    "accumulated_amount": 4850000.0,
    "max_order_count": 20,
    "accumulated_order_count": 18,
    "default_delivery_address": "苏州市高新区科技城 1 号工地物资中转站",
    "status": "ACTIVE"
  },
  {
    "contract_no": "2026-WZ-090",
    "contract_type": "SALES",
    "counterparty_name": "中铁十二局集团有限公司",
    "project_name": "苏州轨道交通 8 号线 3 标",
    "total_amount": 10000000.0,
    "accumulated_amount": 2000000.0,
    "max_order_count": 50,
    "accumulated_order_count": 5,
    "default_delivery_address": "苏州市工业园区工地",
    "status": "ACTIVE"
  }
]
```

#### 法定标准物料种子数据 (Material Seeds)：
```json
[
  {
    "material_code": "STL-RB-400E-20",
    "material_name": "热轧带肋钢筋",
    "specification": "HRB400E Φ20mm",
    "unit": "吨",
    "standard_price": 4000.0,
    "aliases": ["400E 20圆钢", "20螺纹钢", "HRB400E 20", "20厘螺纹钢", "400E螺纹钢20"]
  },
  {
    "material_code": "CEM-PC-425",
    "material_name": "普通硅酸盐水泥",
    "specification": "P.O 42.5 散装",
    "unit": "吨",
    "standard_price": 440.0,
    "aliases": ["42.5水泥", "425水泥", "42.5散装水泥", "PO42.5", "42.5普硅水泥"]
  }
]
```

---

## 六、研发质量与 Zero-Fake 守则

### 6.1 Zero-Fake (零伪造) 硬性准则
为坚守项目交付真实性与工程健壮度，所有参与人员与 Agent 必须无条件遵守以下 Zero-Fake 铁律：
1. **禁止前端静态假数据数组**：
   - 严禁在 `front/src` 中编写 `const mockOrders = [...]` 或假列表欺骗视图。
   - 所有商贸订单列表、合同额度、草稿回显必须真实发起 Axios 请求拉取后端 `/api` 接口。
2. **禁止无动作的空 Toast 假按钮**：
   - “一键提单”、“提交特批”、“审批通过/驳回”等按钮点击后，必须真实产生对后端接口的 HTTP 交互，并实际修改 MongoDB 单据状态与扣减配额。
3. **两阶段真实调用防虚假流程**：
   - 阶段一必须真实通过 API 发起实体抽取。
   - 阶段二必须通过 PyMilvus 真实执行向量相似度搜索并取得标准编码。
   - 阶段三必须严格执行纯代码数学公式运算，严禁把算术题丢回大模型脑补。

---

### 6.2 自动化测试断言规范 (Pytest)

后端必须提供针对 8 大核心端点的自动化测试用例集 (`backend/tests/test_api_contracts.py`)，覆盖率必须达到以下原子断言标准：

```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_ep01_parse_chat_contract_check(async_client: AsyncClient):
    """验证 EP-01 文本解析契约与额度核算"""
    payload = {
        "text": "给中建八局科技城项目下200吨400E 20圆钢，走2026-WZ-089合同",
        "session_id": "test-01"
    }
    resp = await async_client.post("/api/parse/chat", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 200
    assert body["data"]["draft"]["contract_no"] == "2026-WZ-089"
    # 200 吨 * 4000 = 800,000 元，超过剩余 150,000 元
    assert body["data"]["draft"]["is_over_quota"] is True
    assert body["data"]["quota"]["over_amount"] == 650000.0

@pytest.mark.asyncio
async def test_ep04_submit_over_quota_blocked(async_client: AsyncClient):
    """验证超额订单直接走普通提交必须被 400 阻断"""
    payload = {
        "order_type": "SALES",
        "contract_no": "2026-WZ-089",
        "items": [{
            "item_seq": 1,
            "material_code": "STL-RB-400E-20",
            "material_name": "热轧带肋钢筋",
            "specification": "HRB400E Φ20mm",
            "quantity": 200.0,
            "unit": "吨",
            "unit_price": 4000.0,
            "total_amount": 800000.0
        }],
        "total_amount": 800000.0
    }
    resp = await async_client.post(
        "/api/orders/submit",
        json=payload,
        headers={"Idempotency-Key": "test-key-01"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 400
    assert "超额" in body["message"]

@pytest.mark.asyncio
async def test_ep05_submit_special_requires_reason(async_client: AsyncClient):
    """验证特批提交理由少于 10 字被 400 拦截"""
    payload = {
        "contract_no": "2026-WZ-089",
        "items": [],
        "total_amount": 800000.0,
        "special_approval_reason": "加点钢材"  # 仅 4 字，小于 10 字
    }
    resp = await async_client.post("/api/orders/submit-special", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == 400
```

---

### 6.3 开发阶段禁止事项清单 (Don'ts)
- ❌ **严禁自行引入复杂的 12 类细分状态码**（如 `40001`, `40002` 等），统一恪守 `200`、`400`、`500`。
- ❌ **严禁在阶段一 Prompt 中塞入全量物料字典**，坚决维护轻量省 Token 原则。
- ❌ **严禁使用大模型进行金额累加或额度判定四则运算**，必须由后端 Python 代码确定性计算。
- ❌ **严禁破坏双模态单源真相**：全屏工作台与悬浮窗必须共用一个 Zustand `useTradeStore`，严禁在各自组件内私设互相脱节的局部草稿。
- ❌ **严禁跨部门操作单据**：严格遵循经办人部门与审批人管辖范围权限校验。
