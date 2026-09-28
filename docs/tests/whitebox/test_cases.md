# TradeDoc AI 白盒自动化测试用例规约 (Step 7 & Step 8)

| 文档版本 | 状态 | 责任人 | 适用范围 | 密级 |
| :--- | :--- | :--- | :--- | :--- |
| **v1.0.0** | **正式发布** | **Whitebox QA Engineer** | TradeDoc AI 后端核心微服务与模拟中台沙箱 (Mock ERP) | 内部公开 |

---

## 一、 测试架构与环境规约

### 1.1 系统与测试范围
本用例规约面向 **TradeDoc AI 智能提单助手系统** 的核心后端服务（`backend`）与宿主模拟中台系统（`mock_erp`），重点针对 **步骤 7（侧滑审批抽屉与中台回写闭环）** 与 **步骤 8（白盒自动化断言）** 进行系统级代码与接口契约白盒设计。

### 1.2 真实运行环境与技术栈约束
严格恪守 **Zero-Fake (零伪造)** 铁律，所有用例均在真实外部数据库环境执行，杜绝内存伪造数据：
- **测试框架**：Pytest 9.1.1、pytest-asyncio 1.4.0、HTTPX 0.28.1 (ASGITransport)
- **运行环境**：Python 3.12.13 (macOS Darwin)
- **MongoDB 实例**：`192.168.6.134:27017`（包含 `contracts`, `materials`, `orders`, `drafts`, `counters`, `erp_orders`, `erp_contracts`, `erp_materials`, `erp_counters`）
- **Milvus 向量引擎**：`192.168.6.134:19530`（向量集合 `material_vector_index`，1024 维 COSINE 距离索引）
- **契约响应协议**：统一采用标准三值报文封套 `{code, message, data, timestamp}`，业务成功为 `200`，业务阻断/校验失败为 `400`，系统异常为 `500`。

---

## 二、 白盒测试用例矩阵总览

| 模块类别 | 用例编号 | 用例名称与验证目标 | 被测端点 / 核心函数 | 断言类型 |
| :--- | :--- | :--- | :--- | :--- |
| **8 组契约接口 DTO 校验** | `TC-DTO-EP01` | EP-01 对话智能解析契约 DTO 与额度试算校验 | `POST /api/parse/chat` | DTO Schema、字段完整性、额度核算 |
| | `TC-DTO-EP02` | EP-02 单据 OCR 结构化提单 DTO 与物料对齐校验 | `POST /api/parse/ocr` | Multipart Form、DTO 契约、合规指标 |
| | `TC-DTO-EP03` | EP-03 批量 Excel 表格穿透解析与行级异常 DTO 校验 | `POST /api/parse/excel` | 文件流、行级状态机、异常穿透 |
| | `TC-DTO-EP04` | EP-04 额度合规正常提单提交 DTO 与生效流转 | `POST /api/orders/submit` | Idempotency、DTO 结构、ACTIVE 状态 |
| | `TC-DTO-EP05` | EP-05 超额特批申请提交 DTO 与待审流转 | `POST /api/orders/submit-special` | DTO 结构、特批标志、PENDING 状态 |
| | `TC-DTO-EP06` | EP-06 业务审批人流转裁决契约 DTO 校验 | `POST /api/orders/{order_no}/approve` | DTO 结构、审批操作人透传、决议生效 |
| | `TC-DTO-EP07` | EP-07 商贸订单台账列表分页与多维筛选 DTO 校验 | `GET /api/orders` | 分页 DTO、列表数组、过滤条件匹配 |
| | `TC-DTO-EP08` | EP-08 合同配额看板 4 项履约指标 DTO 校验 | `GET /api/contracts/{contract_no}/quota` | 4 项配额指标、DTO 字段 SSOT 校验 |
| **5 类规则边界值穿透** | `TC-BND-R1` | 规则 1 边界：物料编码合法性核验（合法/未匹配/不存在） | `ComplianceEngine.verify` | `RULE_MATERIAL_UNMATCHED` 阻断 |
| | `TC-BND-R2` | 规则 2 边界：±15% 单价偏离度临界值穿透判定 | `ComplianceEngine.verify` | `RULE_PRICE_DEVIATION` 双向预警 |
| | `TC-BND-R3` | 规则 3 边界：合同有效性与 EXPIRED 效期阻断判定 | `ComplianceEngine.verify` | `RULE_CONTRACT_EXPIRED` 绝对阻断 |
| | `TC-BND-R4` | 规则 4 边界：合同超额试算 1 分钱临界差额穿透判定 | `ComplianceEngine.verify` | `RULE_CONTRACT_OVER_QUOTA` 阻断 |
| | `TC-BND-R5` | 规则 5 边界：Milvus 向量近似度阈值 (0.85/0.60) 临界测试 | `SemanticAlignmentService` | ALIGNED / PENDING / UNMATCHED |
| **幂等性与理由拦截** | `TC-IDEM-01` | 提单端点缺失 `Idempotency-Key` 强阻断返回 400 | `POST /api/orders/submit[-special]` | 统一错误响应、Header 强制校验 |
| | `TC-IDEM-02` | 相同 `Idempotency-Key` 重复请求幂等性防重返单号 | `OrderService.submit_order` | 数据库防重、订单唯一性保障 |
| | `TC-LEN-01` | 特批理由去除空格后 `< 10` 字严格 400 拦截 | `OrderService.submit_order` | 长度边界（9 字阻断 vs 10 字放行） |
| **步骤 7 审批与回写闭环** | `TC-S7-PASS` | 审批抽屉 PASS 裁决：ACTIVE 状态推进与合同额度原子扣减 | `OrderService.approve_order` | `$inc` 配额原子扣减、双库状态同步 |
| | `TC-S7-RET` | 审批抽屉 RETURN 裁决：RETURNED 状态退回与额度无损保障 | `OrderService.approve_order` | 配额无损、草稿重载流转 |
| | `TC-S7-REJ` | 审批抽屉 REJECT 裁决：REJECTED 状态终结与额度无损保障 | `OrderService.approve_order` | 配额无损、单据作废终结 |
| | `TC-S7-ERP-WB` | 中台沙箱 OrderWriteback 幂等回写与订单号发号器 | `POST /api/erp/orders/writeback` | `erp_counters` 原子自增、回写幂等 |
| | `TC-S7-ERP-CB` | 中台沙箱 Approval-Callback 状态机与履约额度联动 | `POST /api/erp/orders/approval-callback` | ERP 列表即时刷新、合同台账同步 |

---

## 三、 详细用例设计规约

### 3.1 8 组核心契约接口 DTO 校验用例集

#### 1. TC-DTO-EP01: 文本对话智能解析契约 DTO 校验
- **测试目标**：验证 `POST /api/parse/chat` 输入 DTO (`ParseChatRequest`) 与输出 DTO (`ParseResultData`)。
- **前置条件**：系统预置 3 家合同与 4 类物料。
- **输入数据**：
  ```json
  {
    "text": "给中建八局科技城项目下200吨400E 20圆钢，走2026-WZ-089合同，后天送到一号工地",
    "session_id": "sess-test-contract-01"
  }
  ```
- **核心断言**：
  - `response.status_code == 200` 且 `body["code"] == 200`
  - `draft.contract_no == "2026-WZ-089"`，`draft.order_type == "SALES"`
  - `draft.items[0].material_code == "STL-RB-400E-20"`，`match_status == "ALIGNED"`
  - `draft.total_amount == 800000.0`，`draft.is_over_quota == True`
  - `quota.remaining_quota_amount == 150000.0`，`quota.over_amount == 650000.0`
  - 异常边界：输入 `{"text": ""}` 返回 `code == 400`。

#### 2. TC-DTO-EP02: 单据 OCR 结构化提单 DTO 校验
- **测试目标**：验证 `POST /api/parse/ocr` Multipart 文件上传与结构化输出 DTO。
- **输入数据**：带有“签收单 关联合同：2026-WZ-090 物资名称：57管 数量：1000米 单价：120元”的真实 PDF 文件流。
- **核心断言**：
  - `body["code"] == 200`
  - `draft.contract_no == "2026-WZ-090"`
  - `draft.items[0].material_code == "PIP-SM-20G-57"`，数量 `1000.0`，单价 `120.0`，金额 `120000.0`
  - `quota.remaining_quota_amount == 8000000.0`，`is_over_quota == False`
  - `ocr_raw_text` 包含所识别的物资文本。

#### 3. TC-DTO-EP03: 批量 Excel 表格穿透解析与行级异常 DTO 校验
- **测试目标**：验证 `POST /api/parse/excel` 文件流、行级状态机与异常行穿透。
- **输入数据**：含 2 行的 Excel 二进制流（行 1 合规合同 2026-WZ-090，行 2 不存在合同 2026-WZ-999）。
- **核心断言**：
  - `data.total_rows == 2`，`data.valid_rows == 1`，`data.error_rows == 1`
  - 行 1 `status == "VALID"`，行 2 `status == "ERROR"`
  - 行 2 `error_msg` 精确提示“合同编号 2026-WZ-999 不存在或已失效”。

#### 4. TC-DTO-EP04: 额度合规正常提单提交 DTO 校验
- **测试目标**：验证 `POST /api/orders/submit` 正常合规提单 DTO 与单据置为 `ACTIVE`。
- **输入数据**：合同 `2026-WZ-090`，采购 50 米 57管（金额 6000 元），带合规 `Idempotency-Key`。
- **核心断言**：
  - `body["code"] == 200`
  - `order_no` 符合 `^XSDD-WZGS-\d{8}-\d{3}$` 格式
  - `order_status == "ACTIVE"`，`total_amount == 6000.0`
  - 合同 `2026-WZ-090` 的 `accumulated_amount` 原子递增 6000.0。

#### 5. TC-DTO-EP05: 超额特批申请提交 DTO 校验
- **测试目标**：验证 `POST /api/orders/submit-special` 超额特批 DTO 与置为 `PENDING_SPECIAL_APPROVAL`。
- **输入数据**：合同 `2026-WZ-089`，申请 200 吨钢筋（金额 80 万，超额 65 万），特批说明不少于 10 字。
- **核心断言**：
  - `body["code"] == 200`
  - `order_status == "PENDING_SPECIAL_APPROVAL"`，`is_over_quota == True`
  - 合同 `2026-WZ-089` 的 `accumulated_amount` 保持不变（待审阶段不提前扣减）。

#### 6. TC-DTO-EP06: 业务审批人流转裁决契约 DTO 校验
- **测试目标**：验证 `POST /api/orders/{order_no}/approve` 审批接口 DTO 及审批操作人信息透传。
- **输入数据**：`decision: "PASS"`，`comment: "同意特批放行"`，`approver_name: "李思远风控总监"`。
- **核心断言**：
  - `body["code"] == 200`
  - `data.order_status == "ACTIVE"`，`data.decision == "PASS"`
  - `data.approver_name == "李思远风控总监"`，`data.approved_at` 为有效 ISO 时间戳。

#### 7. TC-DTO-EP07: 商贸订单台账列表分页与多维筛选 DTO 校验
- **测试目标**：验证 `GET /api/orders` 分页参数、条件筛选与 DTO 返回。
- **输入数据**：`limit=10&skip=0`，可选过滤参数 `contract_no`、`order_status`、`keyword`。
- **核心断言**：
  - `body["code"] == 200`
  - `data` 包含 `total`（整数）与 `list`（数组）
  - 列表中单据明细均对齐 `OrderHeader` 与 `OrderItem` 结构。

#### 8. TC-DTO-EP08: 合同配额看板 4 项履约指标 DTO 校验
- **测试目标**：验证 `GET /api/contracts/{contract_no}/quota` 返回 4 项事实指标。
- **输入数据**：`contract_no = "2026-WZ-089"`。
- **核心断言**：
  - `contract_total_amount == 5000000.0`
  - `accumulated_amount == 4850000.0`
  - `remaining_amount == 150000.0`（$\text{总额} - \text{已用}$ 严格相等）
  - `max_order_count == 20`，`accumulated_order_count == 18`，`remaining_order_count == 2`。

---

### 3.2 5 类合规风控规则边界值穿透用例集

#### 1. TC-BND-R1: 物料编码合法性核验边界
- **边界 1（合规物料）**：传入有效编码 `PIP-SM-20G-57`，状态 `ALIGNED` $\rightarrow$ 判定 `PASS`。
- **边界 2（显式未匹配）**：传入物料标记 `UNMATCHED` $\rightarrow$ 判定 `BLOCKED`，`can_direct_submit=False` 且 `can_special_submit=False`（不可特批）。
- **边界 3（虚假编码）**：传入编码 `INVALID-CODE-9999` $\rightarrow$ 判定 `BLOCKED`，命中 `RULE_MATERIAL_UNMATCHED`。

#### 2. TC-BND-R2: ±15% 单价偏离度临界穿透测试
以标准物料 `STL-RB-400E-20`（指导价 ¥4,000.00/吨）为基准：
- **边界 1（恰好 +15% 临界）**：$4000 \times 1.15 = 4600.00$ 元 $\rightarrow$ 偏离度恰好 15.0%，**不触发预警，判定 `PASS`**。
- **边界 2（超出 +15% 预警）**：$4800.00$ 元（偏离 +20.0%）$\rightarrow$ 命中 `RULE_PRICE_DEVIATION`，判定 `WARNING`，`deviation_rate == 20.0`。
- **边界 3（恰好 -15% 临界）**：$4000 \times 0.85 = 3400.00$ 元 $\rightarrow$ 偏离度恰好 -15.0%，**不触发预警，判定 `PASS`**。
- **边界 4（超出 -15% 预警）**：$3200.00$ 元（偏离 -20.0%）$\rightarrow$ 命中 `RULE_PRICE_DEVIATION`，判定 `WARNING`，`abs(deviation_rate) == 20.0`。

#### 3. TC-BND-R3: 合同有效性与 EXPIRED 效期阻断边界
- **边界 1（履约有效合同）**：`2026-WZ-090`，状态 `ACTIVE` 且未到期 $\rightarrow$ 判定 `PASS`。
- **边界 2（已失效过期合同）**：`2025-WZ-012`（中原特钢，状态 `EXPIRED`）$\rightarrow$ 判定 `BLOCKED`，命中 `RULE_CONTRACT_EXPIRED`，强制阻断且禁止特批。

#### 4. TC-BND-R4: 合同超额试算 1 分钱临界差额穿透测试
以合同 `2026-WZ-089`（可用额度 ¥150,000.00）为基准：
- **边界 1（恰好占满可用额度）**：申请 $37.5 \times 4000 = 150000.00$ 元 $\rightarrow$ 超额金额为 0.00 元，判定 `PASS`，`can_direct_submit = True`。
- **边界 2（超额 1 分钱临界）**：申请单价 $150000.01$ 元 $\rightarrow$ 超额金额为 0.01 元，命中 `RULE_CONTRACT_OVER_QUOTA`，判定 `BLOCKED`，`over_amount == 0.01`，`can_direct_submit = False`，`can_special_submit = True`。

#### 5. TC-BND-R5: Milvus 向量近似度阈值临界测试
- **边界 1（高置信对齐）**：输入现场俗称“18螺纹”，向量相似度余弦距离 $\ge 0.85$ $\rightarrow$ 判定 `match_status = "ALIGNED"`，自动回填 `STL-RB-400E-20`。
- **边界 2（低置信未知）**：输入“完全不相干的高分子塑料薄膜”，相似度 $< 0.60$ $\rightarrow$ 判定 `match_status = "UNMATCHED"`，禁止回退假数据默认值。

---

### 3.3 幂等性控制与特批理由长度拦截用例集

#### 1. TC-IDEM-01 & TC-IDEM-02: 幂等性请求头强制核查与防重返单
- **断言 1（缺少 Header）**：发起 `POST /api/orders/submit` 未带 `Idempotency-Key` $\rightarrow$ 强制 400 阻断，返回“缺少必需的请求头 Idempotency-Key”。
- **断言 2（防重重试）**：携带同一 `Idempotency-Key` 连续提交两次 $\rightarrow$ 两次均成功返回 200，且单号完全一致，合同额度仅扣减一次，杜绝并发重扣。

#### 2. TC-LEN-01: 特批理由 $\ge 10$ 字临界拦截
- **边界 1（9 字符）**：`special_approval_reason = "一二三四五六七八九"`（9 字）$\rightarrow$ 接口 400 阻断，提示“超额特批申请必须填写不少于10字的特批说明”。
- **边界 2（10 字符）**：`special_approval_reason = "一二三四五六七八九十"`（10 字）$\rightarrow$ 校验通过放行，生成 `PENDING_SPECIAL_APPROVAL` 订单。

---

### 3.4 步骤 7 侧滑审批抽屉三态流转与中台回写闭环用例集

#### 1. TC-S7-PASS: 态一 PASS 审批放行
- **操作**：调用 `POST /api/orders/{order_no}/approve`，参数 `{"decision": "PASS", "comment": "现场情况属实，同意特批放行"}`。
- **断言**：
  - 订单状态由 `PENDING_SPECIAL_APPROVAL` 变更为 `ACTIVE`
  - 关联合同 `2026-WZ-089` 执行原子累加：$\text{accumulated\_amount} \mathrel{+}= 100000.0$，$\text{remaining\_amount} \mathrel{-}= 100000.0$
  - 异步同步 Mock ERP，中台单据置为 `COMPLETED` / `AUDITED`。

#### 2. TC-S7-RET: 态二 RETURN 退回修改
- **操作**：调用 `POST /api/orders/{order_no}/approve`，参数 `{"decision": "RETURN", "comment": "请经办人补充监理签字"}`。
- **断言**：
  - 订单状态变更为 `RETURNED`
  - 合同额度绝不扣减，$\text{accumulated\_amount}$ 保持原有数值
  - 经办人工作台可重新载入该订单继续编辑修改。

#### 3. TC-S7-REJ: 态三 REJECT 驳回作废
- **操作**：调用 `POST /api/orders/{order_no}/approve`，参数 `{"decision": "REJECT", "comment": "超出月度预算，予以驳回"}`。
- **断言**：
  - 订单状态变更为 `REJECTED`
  - 合同额度无损，绝不扣减
  - 单据生命周期终结作废，中台标记为已驳回。

#### 4. TC-S7-ERP-WB & TC-S7-ERP-CB: Mock ERP 沙箱回写与状态机回调
- **回写幂等**：`POST /api/erp/orders/writeback` 相同 `order_no` 二次写入，返回已有订单，不生成重复数据。
- **流水号自增**：未指定单号时，通过 `erp_counters` 集合执行 `find_one_and_update` 原子自增，格式为 `XSDD-YD-YYYYMMDD-XXX`。
- **审批回调**：`POST /api/erp/orders/approval-callback` 支持 `APPROVE`/`PASS`/`RETURN`/`REJECT`，即时联动更新合同已用额度，并使 ERP 列表接口 `GET /api/erp/orders` 无刷新反映最新审批人与批注。
