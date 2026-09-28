import pytest
import httpx
from mock_erp.main import app
from mock_erp.db import db_manager
from mock_erp.data.initial_data import init_seed_data


@pytest.fixture
async def client():
    await db_manager.connect()
    if db_manager.db is not None:
        # 清理自动化测试过程中遗留的瞬态测试订单
        await db_manager.db.erp_orders.delete_many({"order_no": {"$regex": "^XSDD-TEST-"}})
        await init_seed_data(db_manager.db)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as c:
        yield c
    await db_manager.close()


@pytest.mark.asyncio
async def test_ac03_initial_historical_orders_and_master_data(client):
    """验证中台预置的不同生命周期历史订单及合同/物料主数据"""
    # 1. 验证订单列表查询
    res = await client.get("/api/erp/orders?page_size=100")
    assert res.status_code == 200
    body = res.json()
    assert body["code"] == 200
    items = body["data"]["items"]
    assert len(items) >= 4

    statuses = {item["erp_status"] for item in items}
    assert "AUDITED" in statuses
    assert "PENDING_APPROVAL" in statuses
    assert "CLOSED" in statuses
    assert "REJECTED" in statuses

    # 2. 验证主数据契约
    res_contracts = await client.get("/api/erp/contracts")
    assert res_contracts.status_code == 200
    assert len(res_contracts.json()["data"]["items"]) >= 3

    res_materials = await client.get("/api/erp/materials")
    assert res_materials.status_code == 200
    assert len(res_materials.json()["data"]["items"]) >= 4


@pytest.mark.asyncio
async def test_ac01_orders_list_and_detail(client):
    """提供 GET /api/erp/orders 与 GET /api/erp/orders/{order_no} 接口"""
    # 1. 条件过滤与模糊搜索
    res_filter = await client.get("/api/erp/orders?erp_status=PENDING_APPROVAL")
    assert res_filter.status_code == 200
    filter_items = res_filter.json()["data"]["items"]
    assert all(o["erp_status"] == "PENDING_APPROVAL" for o in filter_items)

    res_search = await client.get("/api/erp/orders?keyword=科技城")
    assert res_search.status_code == 200
    assert len(res_search.json()["data"]["items"]) >= 1

    # 2. 单笔订单详情查询
    res_detail = await client.get("/api/erp/orders/XSDD-YD-20260925-002")
    assert res_detail.status_code == 200
    order = res_detail.json()["data"]
    assert order["order_no"] == "XSDD-YD-20260925-002"
    assert order["counterparty_name"] == "远大钢铁销售总公司"
    assert order["erp_status"] == "PENDING_APPROVAL"
    assert order["is_special_approved"] is True

    # 3. 不存在的订单返回业务校验码 400
    res_404 = await client.get("/api/erp/orders/NON-EXISTENT-NO")
    assert res_404.status_code == 200
    assert res_404.json()["code"] == 400


@pytest.mark.asyncio
async def test_ac01_atomic_counter_generation(client):
    """订单号使用 counters find_one_and_update 原子生成"""
    db = db_manager.db
    counter_before = await db.erp_counters.find_one({"name": "order_seq"})
    assert counter_before is not None
    val_before = counter_before["value"]

    payload = {
        "source_draft_id": "DFT-ATOMIC-001",
        "order_type": "SALES",
        "contract_no": "2026-WZ-090",
        "counterparty_name": "华夏石化销售集团",
        "project_name": "苏州轨道交通 8 号线 3 标",
        "delivery_address": "苏州市相城区现场中转站",
        "contact_person": "周工 13800000000",
        "items": [
            {
                "item_seq": 1,
                "material_code": "PIP-SM-20G-57",
                "material_name": "无缝钢管",
                "specification": "20G Φ57*3.5",
                "quantity": 10.0,
                "unit": "米",
                "unit_price": 120.0,
                "total_amount": 1200.0,
            }
        ],
        "total_amount": 1200.0,
        "is_special_approved": False,
    }
    res = await client.post("/api/erp/orders/writeback", json=payload)
    assert res.status_code == 200
    order_no = res.json()["data"]["order_no"]
    assert order_no.startswith("XSDD-YD-")

    counter_after = await db.erp_counters.find_one({"name": "order_seq"})
    assert counter_after["value"] >= val_before + 1
    seq_str = f"{counter_after['value']:03d}"
    assert order_no.endswith(seq_str)


@pytest.mark.asyncio
async def test_ac02_writeback_idempotency(client):
    """回写端点幂等：同 order_no 不重复创建，直接返回已有记录"""
    payload = {
        "order_no": "XSDD-TEST-IDEM-001",
        "source_draft_id": "DFT-TEST-IDEM-001",
        "order_type": "SALES",
        "contract_no": "2026-WZ-090",
        "counterparty_name": "华夏石化销售集团",
        "project_name": "苏州轨道交通 8 号线 3 标",
        "delivery_address": "苏州市相城区现场中转站",
        "contact_person": "周工 13800000000",
        "items": [
            {
                "item_seq": 1,
                "material_code": "PIP-SM-20G-57",
                "material_name": "无缝钢管",
                "specification": "20G Φ57*3.5",
                "quantity": 5.0,
                "unit": "米",
                "unit_price": 120.0,
                "total_amount": 600.0,
            }
        ],
        "total_amount": 600.0,
        "is_special_approved": False,
    }
    # 首次写入
    res1 = await client.post("/api/erp/orders/writeback", json=payload)
    assert res1.status_code == 200
    assert res1.json()["data"]["order_no"] == "XSDD-TEST-IDEM-001"

    # 二次重试写入同一 order_no
    res2 = await client.post("/api/erp/orders/writeback", json=payload)
    assert res2.status_code == 200
    assert res2.json()["data"]["order_no"] == "XSDD-TEST-IDEM-001"
    assert "已存在" in res2.json()["message"] or res2.json()["code"] == 200

    db = db_manager.db
    count = await db.erp_orders.count_documents({"order_no": "XSDD-TEST-IDEM-001"})
    assert count == 1


@pytest.mark.asyncio
async def test_step7_approval_callback_full_lifecycle_sync(client):
    """
    TASK-STEP-7 专项目标测试:
    AC-01: approval-callback 接收 APPROVE/PASS、REJECT、RETURN 动作并准确流转 erp_status
    AC-02: APPROVE/PASS 原子扣减 erp_contracts 额度与可用订单数，更新 accumulated_amount
    AC-03: 订单列表接口 GET /api/erp/orders 即时反映最新状态与审批人批注
    """
    db = db_manager.db

    # 1. 准备 3 笔特批申报测试订单 (分别用于 APPROVE/PASS、RETURN、REJECT)
    order_approve = {
        "order_no": "XSDD-TEST-SYNC-APPROVE",
        "source_draft_id": "DFT-SYNC-01",
        "order_type": "SALES",
        "contract_no": "2026-WZ-089",
        "counterparty_name": "远大钢铁销售总公司",
        "project_name": "科技城数字经济产业园一期项目",
        "delivery_address": "工地现场 1",
        "contact_person": "张总 13900000000",
        "items": [
            {
                "item_seq": 1,
                "material_code": "STL-RB-400E-20",
                "material_name": "热轧带肋钢筋",
                "specification": "HRB400E Φ20mm",
                "quantity": 10.0,
                "unit": "吨",
                "unit_price": 4000.0,
                "total_amount": 40000.0,
            }
        ],
        "total_amount": 40000.0,
        "is_special_approved": True,
        "special_approval_reason": "工期赶工特批追加 1",
    }
    order_return = {
        "order_no": "XSDD-TEST-SYNC-RETURN",
        "source_draft_id": "DFT-SYNC-02",
        "order_type": "SALES",
        "contract_no": "2026-WZ-089",
        "counterparty_name": "远大钢铁销售总公司",
        "project_name": "科技城数字经济产业园一期项目",
        "delivery_address": "工地现场 2",
        "contact_person": "张总 13900000000",
        "items": [
            {
                "item_seq": 1,
                "material_code": "STL-RB-400E-20",
                "material_name": "热轧带肋钢筋",
                "specification": "HRB400E Φ20mm",
                "quantity": 5.0,
                "unit": "吨",
                "unit_price": 4000.0,
                "total_amount": 20000.0,
            }
        ],
        "total_amount": 20000.0,
        "is_special_approved": True,
        "special_approval_reason": "工期赶工特批追加 2",
    }
    order_reject = {
        "order_no": "XSDD-TEST-SYNC-REJECT",
        "source_draft_id": "DFT-SYNC-03",
        "order_type": "SALES",
        "contract_no": "2026-WZ-089",
        "counterparty_name": "远大钢铁销售总公司",
        "project_name": "科技城数字经济产业园一期项目",
        "delivery_address": "工地现场 3",
        "contact_person": "张总 13900000000",
        "items": [
            {
                "item_seq": 1,
                "material_code": "STL-RB-400E-20",
                "material_name": "热轧带肋钢筋",
                "specification": "HRB400E Φ20mm",
                "quantity": 2.0,
                "unit": "吨",
                "unit_price": 4000.0,
                "total_amount": 8000.0,
            }
        ],
        "total_amount": 8000.0,
        "is_special_approved": True,
        "special_approval_reason": "工期赶工特批追加 3",
    }

    await client.post("/api/erp/orders/writeback", json=order_approve)
    await client.post("/api/erp/orders/writeback", json=order_return)
    await client.post("/api/erp/orders/writeback", json=order_reject)

    # 记录合同初始指标
    c_init = (await client.get("/api/erp/contracts/2026-WZ-089")).json()["data"]
    accum_init = c_init["accumulated_amount"]
    rem_init = c_init["remaining_amount"]
    orders_init = c_init["accumulated_orders"]

    # 2. 测试 APPROVE/PASS 裁决 (AC-01 & AC-02)
    cb_approve = {
        "order_no": "XSDD-TEST-SYNC-APPROVE",
        "action": "APPROVE",
        "approver_name": "王总",
        "comment": "工程急需，同意追加发运",
    }
    res_app = await client.post("/api/erp/orders/approval-callback", json=cb_approve)
    assert res_app.status_code == 200
    app_data = res_app.json()["data"]
    assert app_data["erp_status"] == "COMPLETED"
    assert app_data["order_status"] == "ACTIVE"

    # 验证合同配额与订单数原子扣减 (AC-02)
    c_after_app = (await client.get("/api/erp/contracts/2026-WZ-089")).json()["data"]
    assert round(c_after_app["accumulated_amount"] - accum_init, 2) == 40000.0
    assert round(rem_init - c_after_app["remaining_amount"], 2) == 40000.0
    assert c_after_app["accumulated_orders"] == orders_init + 1

    # 3. 测试 RETURN 退回修改裁决 (AC-01)
    cb_return = {
        "order_no": "XSDD-TEST-SYNC-RETURN",
        "action": "RETURN",
        "approver_name": "王总",
        "comment": "请补充现场监理签字后再报",
    }
    res_ret = await client.post("/api/erp/orders/approval-callback", json=cb_return)
    assert res_ret.status_code == 200
    assert res_ret.json()["data"]["erp_status"] == "RETURNED"

    # 4. 测试 REJECT 驳回裁决 (AC-01)
    cb_reject = {
        "order_no": "XSDD-TEST-SYNC-REJECT",
        "action": "REJECT",
        "approver_name": "王总",
        "comment": "超出项目月度采购预算，予以驳回",
    }
    res_rej = await client.post("/api/erp/orders/approval-callback", json=cb_reject)
    assert res_rej.status_code == 200
    assert res_rej.json()["data"]["erp_status"] == "REJECTED"

    # 驳回与退回均不消耗合同额度
    c_after_all = (await client.get("/api/erp/contracts/2026-WZ-089")).json()["data"]
    assert c_after_all["accumulated_amount"] == c_after_app["accumulated_amount"]

    # 5. 验证订单列表 GET /api/erp/orders 即时反映最新状态与审批人批注 (AC-03)
    res_list = await client.get("/api/erp/orders?page_size=100")
    assert res_list.status_code == 200
    list_items = {item["order_no"]: item for item in res_list.json()["data"]["items"]}

    # 核验 APPROVE 单据
    item_app = list_items["XSDD-TEST-SYNC-APPROVE"]
    assert item_app["erp_status"] == "COMPLETED"
    assert item_app["approver_name"] == "王总"
    assert item_app["approval_comment"] == "工程急需，同意追加发运"

    # 核验 RETURN 单据
    item_ret = list_items["XSDD-TEST-SYNC-RETURN"]
    assert item_ret["erp_status"] == "RETURNED"
    assert item_ret["approval_comment"] == "请补充现场监理签字后再报"

    # 核验 REJECT 单据
    item_rej = list_items["XSDD-TEST-SYNC-REJECT"]
    assert item_rej["erp_status"] == "REJECTED"
    assert item_rej["approval_comment"] == "超出项目月度采购预算，予以驳回"


@pytest.mark.asyncio
async def test_ac04_contract_quota_endpoint(client):
    """合同额度查询 GET /api/erp/contracts/{contract_no}/quota 端点验证"""
    res = await client.get("/api/erp/contracts/2026-WZ-089/quota")
    assert res.status_code == 200
    body = res.json()
    assert body["code"] == 200
    data = body["data"]

    assert data["contract_no"] == "2026-WZ-089"
    assert "total_amount" in data
    assert "accumulated_amount" in data
    assert "remaining_amount" in data
    assert "utilization_rate" in data
    assert "is_over_quota" in data
    assert isinstance(data["is_over_quota"], bool)
    assert isinstance(data["utilization_rate"], float)
    assert round(data["total_amount"] - data["accumulated_amount"], 2) == round(data["remaining_amount"], 2)

    res_404 = await client.get("/api/erp/contracts/NON-EXISTENT/quota")
    assert res_404.status_code == 200
    assert res_404.json()["code"] == 400


@pytest.mark.asyncio
async def test_step7_legacy_callback_and_boundary_cases(client):
    """
    步骤 7 边界断言：
    1. POST /api/erp/orders/{order_no}/callback 路径式审批回调与配额扣减
    2. 不存在的单号进行回调处理返回业务异常 400
    """
    # 准备测试单据
    test_order = {
        "order_no": "XSDD-TEST-LEGACY-001",
        "source_draft_id": "DFT-LEGACY-001",
        "order_type": "SALES",
        "contract_no": "2026-WZ-090",
        "counterparty_name": "华夏石化销售集团",
        "project_name": "苏州轨道交通 8 号线 3 标",
        "delivery_address": "相城区工地",
        "contact_person": "周工",
        "items": [
            {
                "item_seq": 1,
                "material_code": "PIP-SM-20G-57",
                "material_name": "无缝钢管",
                "specification": "20G Φ57*3.5",
                "quantity": 100.0,
                "unit": "米",
                "unit_price": 120.0,
                "total_amount": 12000.0,
            }
        ],
        "total_amount": 12000.0,
        "is_special_approved": True,
        "special_approval_reason": "现场抢工期需要",
    }
    await client.post("/api/erp/orders/writeback", json=test_order)

    # 1. 成功调用路径式回调 PASS
    cb_payload = {
        "decision": "PASS",
        "approver_name": "李总",
        "approval_comment": "同意特批放行",
    }
    res_cb = await client.post("/api/erp/orders/XSDD-TEST-LEGACY-001/callback", json=cb_payload)
    assert res_cb.status_code == 200
    assert res_cb.json()["code"] == 200
    data = res_cb.json()["data"]
    assert data["erp_status"] == "AUDITED"
    assert data["order_status"] == "ACTIVE"

    # 2. 不存在的单号调用路径式回调返回 400
    res_400 = await client.post("/api/erp/orders/NON-EXISTENT-ORDER/callback", json=cb_payload)
    assert res_400.status_code == 200
    assert res_400.json()["code"] == 400

