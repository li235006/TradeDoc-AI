import pytest
import httpx
from mock_erp.main import app
from mock_erp.db import db_manager
from mock_erp.data.initial_data import init_seed_data


@pytest.fixture
async def client():
    await db_manager.connect()
    if db_manager.db is not None:
        await init_seed_data(db_manager.db)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as c:
        yield c
    await db_manager.close()


@pytest.mark.asyncio
async def test_ac03_initial_historical_orders_and_master_data(client):
    """AC-03: 验证中台预置的 3~5 条不同生命周期历史订单及合同/物料主数据"""
    # 1. 验证订单列表查询
    res = await client.get("/api/erp/orders")
    assert res.status_code == 200
    body = res.json()
    assert body["code"] == 200
    items = body["data"]["items"]
    assert len(items) >= 4

    statuses = {item["erp_status"] for item in items}
    # 必须覆盖履约中(AUDITED)、待特批(PENDING_APPROVAL)、已归档(CLOSED)、已驳回(REJECTED)
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
    """AC-01: 提供 GET /api/erp/orders 与 GET /api/erp/orders/{order_no} 接口"""
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
async def test_ac02_orders_writeback_and_callback(client):
    """AC-02: 提供 POST /api/erp/orders/writeback 与审批回调通知"""
    # 1. 常规合规提单回写 -> 直接 AUDITED 生效并扣减配额
    c_before = await client.get("/api/erp/contracts/2026-WZ-090")
    rem_before = c_before.json()["data"]["remaining_amount"]

    writeback_regular = {
        "source_draft_id": "DFT-TEST-REGULAR-001",
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
                "quantity": 100.0,
                "unit": "米",
                "unit_price": 120.0,
                "total_amount": 12000.0,
            }
        ],
        "total_amount": 12000.0,
        "is_special_approved": False,
        "operator_name": "测试员",
        "operator_dept": "物资贸易一部",
    }
    res_wb_reg = await client.post("/api/erp/orders/writeback", json=writeback_regular)
    assert res_wb_reg.status_code == 200
    wb_reg_data = res_wb_reg.json()["data"]
    assert wb_reg_data["erp_status"] == "AUDITED"
    reg_order_no = wb_reg_data["order_no"]

    # 验证合同配额扣减
    c_after = await client.get("/api/erp/contracts/2026-WZ-090")
    rem_after = c_after.json()["data"]["remaining_amount"]
    assert round(rem_before - rem_after, 2) == 12000.0

    # 2. 特批申报提单回写 -> 进入 PENDING_APPROVAL
    writeback_special = {
        "source_draft_id": "DFT-TEST-SPECIAL-002",
        "order_type": "SALES",
        "contract_no": "2026-WZ-089",
        "counterparty_name": "远大钢铁销售总公司",
        "project_name": "科技城数字经济产业园一期项目",
        "delivery_address": "工地现场",
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
        "special_approval_reason": "工期赶工特批追加",
        "operator_name": "测试员",
        "operator_dept": "物资贸易一部",
    }
    res_wb_sp = await client.post("/api/erp/orders/writeback", json=writeback_special)
    assert res_wb_sp.status_code == 200
    wb_sp_data = res_wb_sp.json()["data"]
    assert wb_sp_data["erp_status"] == "PENDING_APPROVAL"
    sp_order_no = wb_sp_data["order_no"]

    # 3. 审批裁决回调 (PASS)
    callback_payload = {
        "decision": "PASS",
        "approver_name": "王总",
        "approval_comment": "工程急需，同意追加",
        "approval_time": "2026-09-28T08:00:00Z",
    }
    res_cb = await client.post(f"/api/erp/orders/{sp_order_no}/callback", json=callback_payload)
    assert res_cb.status_code == 200
    cb_data = res_cb.json()["data"]
    assert cb_data["erp_status"] == "AUDITED"

    # 再次查询确认状态已更新为 AUDITED
    res_verify = await client.get(f"/api/erp/orders/{sp_order_no}")
    assert res_verify.json()["data"]["erp_status"] == "AUDITED"
    assert res_verify.json()["data"]["approver_name"] == "王总"
