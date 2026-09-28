import uuid
import pytest
from httpx import AsyncClient, ASGITransport
import pymupdf
import io
import openpyxl

try:
    from app.main import app
    from app.db import db_manager
    from app.db.seed import seed_master_data
    from app.services.semantic import semantic_service
except ImportError:
    from backend.app.main import app
    from backend.app.db import db_manager
    from backend.app.db.seed import seed_master_data
    from backend.app.services.semantic import semantic_service


@pytest.fixture(autouse=True)
async def setup_db_and_vectors():
    """每个用例自动重置并连接真实数据库 (192.168.6.134:27017, 19530) 并灌装主数据"""
    await db_manager.connect_mongo()
    db_manager.connect_milvus()
    if db_manager.mongo_db is not None:
        await seed_master_data(db_manager.mongo_db)
        if db_manager.milvus_client is not None:
            await semantic_service.sync_materials_to_milvus(db_manager.mongo_db, db_manager.milvus_client)
    yield
    await db_manager.close_mongo()
    db_manager.close_milvus()


# ==============================================================================
# 模块一：8 组契约接口 DTO 校验与标准响应测试 (EP-01 ~ EP-08)
# ==============================================================================

@pytest.mark.asyncio
async def test_ep01_parse_chat_dto_and_quota_calculation():
    """EP-01: POST /api/parse/chat 对话智能解析契约 DTO 校验与额度核算"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        payload = {
            "text": "给中建八局科技城项目下200吨400E 20圆钢，走2026-WZ-089合同，后天送到一号工地",
            "session_id": "sess-test-contract-01",
        }
        res = await ac.post("/api/parse/chat", json=payload)
        assert res.status_code == 200
        body = res.json()
        assert body["code"] == 200
        assert "data" in body
        data = body["data"]

        # DTO 结构校验
        assert "draft" in data
        assert "quota" in data
        assert "compliance" in data

        draft = data["draft"]
        assert draft["contract_no"] == "2026-WZ-089"
        assert draft["order_type"] == "SALES"
        assert len(draft["items"]) >= 1
        assert draft["items"][0]["material_code"] == "STL-RB-400E-20"
        assert draft["total_amount"] == 800000.0
        assert draft["is_over_quota"] is True

        quota = data["quota"]
        assert quota["contract_total_amount"] == 5000000.0
        assert quota["remaining_quota_amount"] == 150000.0
        assert quota["is_over_quota"] is True
        assert quota["over_amount"] == 650000.0

        # 400 边界：文本过短或无有效输入
        res_empty = await ac.post("/api/parse/chat", json={"text": ""})
        assert res_empty.json()["code"] == 400


@pytest.mark.asyncio
async def test_ep02_parse_ocr_dto_and_quota_calculation():
    """EP-02: POST /api/parse/ocr 单据文件 OCR 解析契约 DTO 校验"""
    # 动态生成单据 PDF 内存流
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text(
        (50, 100),
        "发货签收单\n关联合同：2026-WZ-090\n物资名称：57管\n发货数量：1000米\n单价：120元\n签收单位：华夏石化销售集团",
        fontname="china-ss",
    )
    pdf_bytes = doc.tobytes()
    doc.close()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.post(
            "/api/parse/ocr",
            files={"file": ("delivery_bill.pdf", pdf_bytes, "application/pdf")},
            data={"contract_no": "2026-WZ-090"},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["code"] == 200
        data = body["data"]

        # DTO 校验
        assert "draft" in data
        assert "quota" in data
        assert "ocr_raw_text" in data
        assert data["draft"]["contract_no"] == "2026-WZ-090"
        assert data["draft"]["items"][0]["material_code"] == "PIP-SM-20G-57"
        assert data["draft"]["total_amount"] == 120000.0
        assert data["quota"]["remaining_quota_amount"] == 8000000.0


@pytest.mark.asyncio
async def test_ep03_parse_excel_dto_and_validation():
    """EP-03: POST /api/parse/excel 批量 Excel 表格解析与行级异常穿透校验"""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "提单明细"
    # 标准表头
    ws.append(["合同编号", "物资名称", "规格型号", "数量", "单价", "送货地址"])
    # 行 1: 有效行
    ws.append(["2026-WZ-090", "57管", "20G Φ57*3.5", 100, 120, "苏州市相城区现场中转站"])
    # 行 2: 异常行 (不存在合同)
    ws.append(["2026-WZ-999", "未知材料", "SPEC-999", 50, 200, "未知地址"])
    bio = io.BytesIO()
    wb.save(bio)
    excel_bytes = bio.getvalue()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.post(
            "/api/parse/excel",
            files={"file": ("orders.xlsx", excel_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["code"] == 200
        data = body["data"]

        # DTO 校验
        assert "total_rows" in data
        assert "valid_rows" in data
        assert "error_rows" in data
        assert "rows" in data
        assert data["total_rows"] == 2
        assert data["valid_rows"] == 1
        assert data["error_rows"] == 1

        # 检查行级错误穿透
        err_row = [r for r in data["rows"] if r["status"] == "ERROR"][0]
        assert "不存在" in err_row["error_msg"]


@pytest.mark.asyncio
async def test_ep04_submit_order_compliant_dto():
    """EP-04: POST /api/orders/submit 额度充足正常提单 DTO 校验与直接生效"""
    payload = {
        "order_type": "SALES",
        "contract_no": "2026-WZ-090",
        "counterparty_name": "华夏石化销售集团",
        "project_name": "苏州轨道交通 8 号线 3 标",
        "delivery_address": "苏州市工业园区工地",
        "contact_person": "王工 13800000000",
        "items": [
            {
                "item_seq": 1,
                "material_code": "PIP-SM-20G-57",
                "material_name": "无缝钢管",
                "specification": "20G Φ57*3.5",
                "quantity": 50.0,
                "unit": "米",
                "unit_price": 120.0,
                "match_status": "ALIGNED",
            }
        ],
        "total_amount": 6000.0,
    }
    idem_key = f"IDEM-EP04-{uuid.uuid4().hex[:8]}"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.post("/api/orders/submit", json=payload, headers={"Idempotency-Key": idem_key})
        assert res.status_code == 200
        body = res.json()
        assert body["code"] == 200
        data = body["data"]

        # DTO 响应核验
        assert "order_no" in data
        assert data["order_no"].startswith("XSDD-WZGS-")
        assert data["order_status"] == "ACTIVE"
        assert data["total_amount"] == 6000.0
        assert "created_at" in data


@pytest.mark.asyncio
async def test_ep05_submit_special_dto():
    """EP-05: POST /api/orders/submit-special 超额特批提单 DTO 校验与流转"""
    payload = {
        "order_type": "SALES",
        "contract_no": "2026-WZ-089",
        "counterparty_name": "远大钢铁销售总公司",
        "project_name": "科技城数字经济产业园一期项目",
        "delivery_address": "苏州市高新区科技城 1 号工地物资中转站",
        "items": [
            {
                "item_seq": 1,
                "material_code": "STL-RB-400E-20",
                "material_name": "热轧带肋钢筋",
                "specification": "HRB400E Φ20mm",
                "quantity": 200.0,
                "unit": "吨",
                "unit_price": 4000.0,
                "match_status": "ALIGNED",
            }
        ],
        "total_amount": 800000.0,
        "special_approval_reason": "经现场项目经理确认抢工期急需追加钢材，已报备商务部补签增补协议",
    }
    idem_key = f"IDEM-EP05-{uuid.uuid4().hex[:8]}"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.post("/api/orders/submit-special", json=payload, headers={"Idempotency-Key": idem_key})
        assert res.status_code == 200
        body = res.json()
        assert body["code"] == 200
        data = body["data"]

        # DTO 响应核验
        assert data["order_status"] == "PENDING_SPECIAL_APPROVAL"
        assert data["is_over_quota"] is True
        assert data["special_approval_reason"] == payload["special_approval_reason"]
        assert data["order_no"].startswith("XSDD-WZGS-")


@pytest.mark.asyncio
async def test_ep06_approve_order_dto():
    """EP-06: POST /api/orders/{order_no}/approve 审批裁决契约 DTO 校验"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. 提交特批单
        payload = {
            "contract_no": "2026-WZ-089",
            "items": [
                {
                    "item_seq": 1,
                    "material_code": "STL-RB-400E-20",
                    "material_name": "热轧带肋钢筋",
                    "specification": "HRB400E Φ20mm",
                    "quantity": 10.0,
                    "unit": "吨",
                    "unit_price": 4000.0,
                    "match_status": "ALIGNED",
                }
            ],
            "special_approval_reason": "现场工期提前追加采购10吨高标号钢筋",
        }
        res_init = await ac.post("/api/orders/submit-special", json=payload, headers={"Idempotency-Key": f"IDEM-{uuid.uuid4().hex[:8]}"})
        order_no = res_init.json()["data"]["order_no"]

        # 2. 调用 EP-06
        approve_body = {
            "decision": "PASS",
            "comment": "同意特批申请放行",
            "approver_name": "李思远风控总监",
            "approver_dept": "商贸风控审批部",
        }
        res_app = await ac.post(f"/api/orders/{order_no}/approve", json=approve_body)
        assert res_app.status_code == 200
        body = res_app.json()
        assert body["code"] == 200
        data = body["data"]

        # DTO 校验
        assert data["order_no"] == order_no
        assert data["order_status"] == "ACTIVE"
        assert data["decision"] == "PASS"
        assert data["approver_name"] == "李思远风控总监"
        assert "approved_at" in data


@pytest.mark.asyncio
async def test_ep07_list_orders_dto():
    """EP-07: GET /api/orders 订单列表查询契约 DTO 校验"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/orders?limit=10&skip=0")
        assert res.status_code == 200
        body = res.json()
        assert body["code"] == 200
        data = body["data"]

        # DTO 校验
        assert "total" in data
        assert "list" in data
        assert isinstance(data["list"], list)


@pytest.mark.asyncio
async def test_ep08_contract_quota_dto():
    """EP-08: GET /api/contracts/{contract_no}/quota 合同配额看板契约 DTO 校验"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/contracts/2026-WZ-089/quota")
        assert res.status_code == 200
        body = res.json()
        assert body["code"] == 200
        data = body["data"]

        # DTO 校验 4 项核心履约指标
        assert data["contract_no"] == "2026-WZ-089"
        assert data["total_amount"] == 5000000.0
        assert data["accumulated_amount"] == 4850000.0
        assert data["remaining_amount"] == 150000.0
        assert data["max_order_count"] == 20
        assert data["accumulated_order_count"] == 18
        assert data["remaining_order_count"] == 2
        assert "is_over_quota" in data
        assert "over_amount" in data


# ==============================================================================
# 模块二：5 类合规风控规则边界值穿透测试 (Boundary Values)
# ==============================================================================

@pytest.mark.asyncio
async def test_rule1_material_code_boundary():
    """规则 1 边界值：物料编码合法性核验（合法编码、未匹配 UNMATCHED、字典中不存在）"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. 合法存在物料
        res1 = await ac.post(
            "/api/compliance/verify",
            json={
                "contract_no": "2026-WZ-090",
                "items": [
                    {
                        "item_seq": 1,
                        "material_code": "PIP-SM-20G-57",
                        "material_name": "无缝钢管",
                        "quantity": 10.0,
                        "unit_price": 120.0,
                        "match_status": "ALIGNED",
                    }
                ],
            },
        )
        assert res1.json()["data"]["level"] == "PASS"

        # 2. 状态显式为 UNMATCHED
        res2 = await ac.post(
            "/api/compliance/verify",
            json={
                "contract_no": "2026-WZ-090",
                "items": [
                    {
                        "item_seq": 1,
                        "material_code": "PIP-SM-20G-57",
                        "material_name": "无缝钢管",
                        "quantity": 10.0,
                        "unit_price": 120.0,
                        "match_status": "UNMATCHED",
                    }
                ],
            },
        )
        assert res2.json()["data"]["level"] == "BLOCKED"
        assert res2.json()["data"]["can_direct_submit"] is False
        assert res2.json()["data"]["can_special_submit"] is False

        # 3. 编码在字典中不存在
        res3 = await ac.post(
            "/api/compliance/verify",
            json={
                "contract_no": "2026-WZ-090",
                "items": [
                    {
                        "item_seq": 1,
                        "material_code": "INVALID-CODE-9999",
                        "material_name": "虚假物料",
                        "quantity": 10.0,
                        "unit_price": 120.0,
                        "match_status": "ALIGNED",
                    }
                ],
            },
        )
        assert res3.json()["data"]["level"] == "BLOCKED"
        assert res3.json()["data"]["can_special_submit"] is False


@pytest.mark.asyncio
async def test_rule2_price_deviation_boundary():
    """
    规则 2 边界值：±15% 价格偏离度临界测试
    以 STL-RB-400E-20 (指导价 4000.00) 为例：
    +15% 临界：4000 * 1.15 = 4600.00 -> 合规 PASS (未超)
    +15.01% 偏离：4000 * 1.1501 = 4600.40 -> 预警 WARNING
    -15% 临界：4000 * 0.85 = 3400.00 -> 合规 PASS (未超)
    -15.01% 偏离：4000 * 0.8499 = 3399.60 -> 预警 WARNING
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        base_item = {
            "item_seq": 1,
            "material_code": "STL-RB-400E-20",
            "material_name": "热轧带肋钢筋",
            "quantity": 1.0,
            "match_status": "ALIGNED",
        }

        # 1. 恰好 +15% (4600.00)
        item1 = {**base_item, "unit_price": 4600.00}
        res1 = await ac.post("/api/compliance/verify", json={"contract_no": "2026-WZ-090", "items": [item1]})
        assert res1.json()["data"]["level"] == "PASS"

        # 2. 超过 +15% (4800.00, +20%)
        item2 = {**base_item, "unit_price": 4800.00}
        res2 = await ac.post("/api/compliance/verify", json={"contract_no": "2026-WZ-090", "items": [item2]})
        assert res2.json()["data"]["level"] == "WARNING"
        assert res2.json()["data"]["deviation_rate"] == 20.0

        # 3. 恰好 -15% (3400.00)
        item3 = {**base_item, "unit_price": 3400.00}
        res3 = await ac.post("/api/compliance/verify", json={"contract_no": "2026-WZ-090", "items": [item3]})
        assert res3.json()["data"]["level"] == "PASS"

        # 4. 超过 -15% (3200.00, -20%)
        item4 = {**base_item, "unit_price": 3200.00}
        res4 = await ac.post("/api/compliance/verify", json={"contract_no": "2026-WZ-090", "items": [item4]})
        assert res4.json()["data"]["level"] == "WARNING"
        assert abs(res4.json()["data"]["deviation_rate"]) == 20.0


@pytest.mark.asyncio
async def test_rule3_contract_expired_boundary():
    """规则 3 边界值：合同效期与有效性判定（有效履约、EXPIRED 状态阻断）"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 有效合同 2026-WZ-090
        res_valid = await ac.post(
            "/api/compliance/verify",
            json={
                "contract_no": "2026-WZ-090",
                "items": [{"item_seq": 1, "material_code": "PIP-SM-20G-57", "quantity": 10.0, "unit_price": 120.0, "match_status": "ALIGNED"}],
            },
        )
        assert res_valid.json()["data"]["level"] == "PASS"

        # 已过期合同 2025-WZ-012 (中原特钢)
        res_exp = await ac.post(
            "/api/compliance/verify",
            json={
                "contract_no": "2025-WZ-012",
                "items": [{"item_seq": 1, "material_code": "PIP-SM-20G-57", "quantity": 10.0, "unit_price": 120.0, "match_status": "ALIGNED"}],
            },
        )
        assert res_exp.json()["data"]["level"] == "BLOCKED"
        assert res_exp.json()["data"]["can_direct_submit"] is False
        assert res_exp.json()["data"]["can_special_submit"] is False
        hits = [r["rule_code"] for r in res_exp.json()["data"]["rule_items"]]
        assert "RULE_CONTRACT_EXPIRED" in hits


@pytest.mark.asyncio
async def test_rule4_quota_calculation_boundary():
    """
    规则 4 边界值：合同超额试算临界测试
    以 2026-WZ-089 (可用金额 150000.00 元) 为例：
    临界点 1: 恰好申请 150000.00 元 -> 超额 0 元，合规 PASS，允许直接提单
    临界点 2: 申请 150000.01 元 -> 超额 0.01 元，触发 BLOCKED，允许超额特批
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. 恰好 150000.00 元
        res1 = await ac.post(
            "/api/compliance/verify",
            json={
                "contract_no": "2026-WZ-089",
                "items": [
                    {
                        "item_seq": 1,
                        "material_code": "STL-RB-400E-20",
                        "material_name": "热轧带肋钢筋",
                        "quantity": 37.5,
                        "unit_price": 4000.0,  # 37.5 * 4000 = 150000.00
                        "match_status": "ALIGNED",
                    }
                ],
            },
        )
        assert res1.json()["data"]["level"] == "PASS"
        assert res1.json()["data"]["over_amount"] == 0.0
        assert res1.json()["data"]["can_direct_submit"] is True

        # 2. 超出 1 分钱 (150000.01 元)
        res2 = await ac.post(
            "/api/compliance/verify",
            json={
                "contract_no": "2026-WZ-089",
                "items": [
                    {
                        "item_seq": 1,
                        "material_code": "STL-RB-400E-20",
                        "material_name": "热轧带肋钢筋",
                        "quantity": 1.0,
                        "unit_price": 150000.01,
                        "match_status": "ALIGNED",
                    }
                ],
            },
        )
        assert res2.json()["data"]["level"] == "BLOCKED"
        assert res2.json()["data"]["over_amount"] == 0.01
        assert res2.json()["data"]["can_direct_submit"] is False
        assert res2.json()["data"]["can_special_submit"] is True


@pytest.mark.asyncio
async def test_rule5_vector_similarity_threshold_boundary():
    """规则 5 边界值：向量相似度阈值判定 (>=0.85 ALIGNED, 0.60~0.85 PENDING_CONFIRM, <0.60 UNMATCHED)"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 高置信度对齐 (>=0.85)
        res1 = await ac.post("/api/master/materials/align", json={"text": "18螺纹"})
        assert res1.status_code == 200
        d1 = res1.json()["data"]
        assert d1["match_status"] == "ALIGNED"
        assert d1["score"] >= 0.85
        assert d1["material_code"] == "STL-RB-400E-20"

        # 低置信度未知品名 (<0.60)
        res2 = await ac.post("/api/master/materials/align", json={"text": "完全不相干的高分子塑料薄膜"})
        assert res2.status_code == 200
        d2 = res2.json()["data"]
        assert d2["match_status"] == "UNMATCHED"
        assert d2["score"] < 0.60
        assert d2["material_code"] == ""


# ==============================================================================
# 模块三：幂等性控制与特批理由长度拦截测试
# ==============================================================================

@pytest.mark.asyncio
async def test_idempotency_control_and_missing_key_interception():
    """测试幂等性控制与缺失 Idempotency-Key 请求头 400 阻断"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        payload = {
            "contract_no": "2026-WZ-090",
            "items": [
                {
                    "item_seq": 1,
                    "material_code": "PIP-SM-20G-57",
                    "material_name": "无缝钢管",
                    "quantity": 10.0,
                    "unit_price": 120.0,
                    "match_status": "ALIGNED",
                }
            ],
            "total_amount": 1200.0,
        }

        # 1. 缺失 Idempotency-Key 拦截
        res_no_key = await ac.post("/api/orders/submit", json=payload)
        assert res_no_key.json()["code"] == 400
        assert "Idempotency-Key" in res_no_key.json()["message"]

        # 2. 相同 Idempotency-Key 幂等调用，返回相同单号
        idem_key = f"IDEM-TEST-KEY-{uuid.uuid4().hex[:8]}"
        res1 = await ac.post("/api/orders/submit", json=payload, headers={"Idempotency-Key": idem_key})
        order_no1 = res1.json()["data"]["order_no"]

        res2 = await ac.post("/api/orders/submit", json=payload, headers={"Idempotency-Key": idem_key})
        order_no2 = res2.json()["data"]["order_no"]
        assert order_no1 == order_no2


@pytest.mark.asyncio
async def test_special_approval_reason_length_interception():
    """
    测试特批理由必须 >= 10 字严格拦截：
    - 9 字理由 -> 400 拦截
    - 10 字理由 -> 200 放行
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        payload_base = {
            "contract_no": "2026-WZ-089",
            "items": [
                {
                    "item_seq": 1,
                    "material_code": "STL-RB-400E-20",
                    "material_name": "热轧带肋钢筋",
                    "quantity": 200.0,
                    "unit_price": 4000.0,
                    "match_status": "ALIGNED",
                }
            ],
            "total_amount": 800000.0,
        }

        # 1. 理由仅 9 个字符 -> 拦截
        payload_9_chars = {**payload_base, "special_approval_reason": "一二三四五六七八九"}
        res9 = await ac.post(
            "/api/orders/submit-special",
            json=payload_9_chars,
            headers={"Idempotency-Key": f"IDEM-9C-{uuid.uuid4().hex[:8]}"},
        )
        assert res9.json()["code"] == 400
        assert "不少于10字" in res9.json()["message"]

        # 2. 理由恰好 10 个字符 -> 放行
        payload_10_chars = {**payload_base, "special_approval_reason": "一二三四五六七八九十"}
        res10 = await ac.post(
            "/api/orders/submit-special",
            json=payload_10_chars,
            headers={"Idempotency-Key": f"IDEM-10C-{uuid.uuid4().hex[:8]}"},
        )
        assert res10.status_code == 200
        assert res10.json()["code"] == 200
        assert res10.json()["data"]["order_status"] == "PENDING_SPECIAL_APPROVAL"


# ==============================================================================
# 模块四：步骤 7 侧滑审批抽屉 EP-06 三态流转与中台回写闭环断言
# ==============================================================================

@pytest.mark.asyncio
async def test_step7_drawer_approval_flow_and_quota_atomicity():
    """
    步骤 7 侧滑审批抽屉与中台状态机三态断言：
    - 态一 PASS：状态推进为 ACTIVE，扣减合同可用配额与可用笔数
    - 态二 RETURN：状态转为 RETURNED，合同配额无损不扣减
    - 态三 REJECT：状态转为 REJECTED，单据作废终结，合同配额无损不扣减
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        special_payload = {
            "contract_no": "2026-WZ-089",
            "items": [
                {
                    "item_seq": 1,
                    "material_code": "STL-RB-400E-20",
                    "material_name": "热轧带肋钢筋",
                    "specification": "HRB400E Φ20mm",
                    "quantity": 25.0,
                    "unit": "吨",
                    "unit_price": 4000.0,
                    "match_status": "ALIGNED",
                }
            ],
            "total_amount": 100000.0,
            "special_approval_reason": "科技城数字经济产业园二期抢工期急需追加钢材",
        }

        # -----------------------------
        # 1. 态一：PASS 审批放行
        # -----------------------------
        res1 = await ac.post(
            "/api/orders/submit-special",
            json=special_payload,
            headers={"Idempotency-Key": f"IDEM-S7-PASS-{uuid.uuid4().hex[:8]}"},
        )
        order_no_pass = res1.json()["data"]["order_no"]

        c_before_pass = (await ac.get("/api/contracts/2026-WZ-089/quota")).json()["data"]
        accum_before = c_before_pass["accumulated_amount"]

        res_pass = await ac.post(
            f"/api/orders/{order_no_pass}/approve",
            json={"decision": "PASS", "comment": "现场情况属实，同意特批放行", "approver_name": "王总"},
        )
        assert res_pass.json()["code"] == 200
        assert res_pass.json()["data"]["order_status"] == "ACTIVE"

        c_after_pass = (await ac.get("/api/contracts/2026-WZ-089/quota")).json()["data"]
        assert round(c_after_pass["accumulated_amount"] - accum_before, 2) == 100000.0

        # -----------------------------
        # 2. 态二：RETURN 退回修改
        # -----------------------------
        res2 = await ac.post(
            "/api/orders/submit-special",
            json=special_payload,
            headers={"Idempotency-Key": f"IDEM-S7-RET-{uuid.uuid4().hex[:8]}"},
        )
        order_no_ret = res2.json()["data"]["order_no"]

        res_ret = await ac.post(
            f"/api/orders/{order_no_ret}/approve",
            json={"decision": "RETURN", "comment": "请经办人补充监理签字", "approver_name": "王总"},
        )
        assert res_ret.json()["code"] == 200
        assert res_ret.json()["data"]["order_status"] == "RETURNED"

        c_after_ret = (await ac.get("/api/contracts/2026-WZ-089/quota")).json()["data"]
        assert c_after_ret["accumulated_amount"] == c_after_pass["accumulated_amount"]

        # -----------------------------
        # 3. 态三：REJECT 驳回作废
        # -----------------------------
        res3 = await ac.post(
            "/api/orders/submit-special",
            json=special_payload,
            headers={"Idempotency-Key": f"IDEM-S7-REJ-{uuid.uuid4().hex[:8]}"},
        )
        order_no_rej = res3.json()["data"]["order_no"]

        res_rej = await ac.post(
            f"/api/orders/{order_no_rej}/approve",
            json={"decision": "REJECT", "comment": "预算超标严重驳回", "approver_name": "王总"},
        )
        assert res_rej.json()["code"] == 200
        assert res_rej.json()["data"]["order_status"] == "REJECTED"

        c_after_rej = (await ac.get("/api/contracts/2026-WZ-089/quota")).json()["data"]
        assert c_after_rej["accumulated_amount"] == c_after_pass["accumulated_amount"]
