import io
import pytest
import openpyxl
from httpx import AsyncClient, ASGITransport

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
    await db_manager.connect_mongo()
    db_manager.connect_milvus()
    if db_manager.mongo_db is not None:
        await seed_master_data(db_manager.mongo_db)
        if db_manager.milvus_client is not None:
            await semantic_service.sync_materials_to_milvus(db_manager.mongo_db, db_manager.milvus_client)
    yield
    await db_manager.close_mongo()
    db_manager.close_milvus()


def create_mock_excel(rows_data) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "导入数据"
    headers = [
        "合同编号*",
        "签约单位",
        "项目名称",
        "物料编码",
        "物资名称*",
        "规格型号",
        "采购数量*",
        "计量单位",
        "含税单价*",
        "送货地址",
    ]
    ws.append(headers)
    for r in rows_data:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@pytest.mark.asyncio
async def test_download_excel_template():
    """验证 AC-04: GET /api/v1/parse/excel/template 与 /api/parse/excel/template 标准模板下载"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/v1/parse/excel/template")
        assert res.status_code == 200
        assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in res.headers.get("content-type", "")
        assert "TradeDoc_Order_Template.xlsx" in res.headers.get("content-disposition", "")
        
        # 验证返回内容能被 openpyxl 正确读取并包含规范表头与2行示例
        content = res.content
        assert len(content) > 1000
        wb = openpyxl.load_workbook(io.BytesIO(content))
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        assert len(rows) >= 3  # 表头 + 2行示例
        assert "合同编号*" in rows[0]
        assert "物资名称*" in rows[0]
        assert "2026-WZ-089" in str(rows[1])


@pytest.mark.asyncio
async def test_parse_excel_compliance_penetration():
    """验证 AC-01 ~ AC-03, AC-05: 批量 Excel 表格穿透合规校验 (5+ 混合行数据)"""
    mock_rows = [
        # 行1: 正常有效行 (标准物料编码 + 合同存在)
        [
            "2026-WZ-089",
            "远大钢铁销售总公司",
            "科技城数字经济产业园一期项目",
            "STL-RB-400E-20",
            "热轧带肋钢筋",
            "HRB400E Φ20mm",
            20.0,
            "吨",
            4000.0,
            "苏州市高新区科技城 1 号工地物资中转站",
        ],
        # 行2: 语义对齐有效行 ("57管" 自动对齐 PIP-SM-20G-57, 单价 120.0 符合指导价)
        [
            "2026-WZ-090",
            "",
            "",
            "",
            "57管",
            "",
            100.0,
            "米",
            120.0,
            "",
        ],
        # 行3: 异常行 - 合同不存在
        [
            "2026-WZ-999",
            "未知单位",
            "虚构项目",
            "STL-RB-400E-20",
            "热轧带肋钢筋",
            "HRB400E Φ20mm",
            50.0,
            "吨",
            4000.0,
            "某工地",
        ],
        # 行4: 异常行 - 物料无法对齐标准编码
        [
            "2026-WZ-089",
            "",
            "",
            "",
            "绝密超导特种陶瓷材料",
            "",
            10.0,
            "件",
            5000.0,
            "",
        ],
        # 行5: 异常行 - 单价偏离度过大 (指导价 4000，申报 5000，偏离 +25% > 15%)
        [
            "2026-WZ-089",
            "",
            "",
            "STL-RB-400E-20",
            "热轧带肋钢筋",
            "HRB400E Φ20mm",
            10.0,
            "吨",
            5000.0,
            "",
        ],
        # 行6: 异常行 - 采购数量非法 (quantity <= 0)
        [
            "2026-WZ-089",
            "",
            "",
            "STL-RB-400E-20",
            "热轧带肋钢筋",
            "HRB400E Φ20mm",
            -5.0,
            "吨",
            4000.0,
            "",
        ],
    ]

    excel_bytes = create_mock_excel(mock_rows)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        files = {
            "file": (
                "bulk_orders_test.xlsx",
                excel_bytes,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        }
        res = await ac.post("/api/v1/parse/excel", files=files)
        assert res.status_code == 200
        body = res.json()
        assert body["code"] == 200
        data = body["data"]

        assert data["total_rows"] == 6
        assert data["valid_rows"] == 2
        assert data["error_rows"] == 4

        rows = data["rows"]
        assert len(rows) == 6

        # 行1: VALID
        r1 = rows[0]
        assert r1["status"] == "VALID"
        assert r1["error_msg"] is None
        assert r1["material_code"] == "STL-RB-400E-20"
        assert r1["quantity"] == 20.0
        assert r1["total_amount"] == 80000.0

        # 行2: VALID (语义自动对齐)
        r2 = rows[1]
        assert r2["status"] == "VALID"
        assert r2["error_msg"] is None
        assert r2["material_code"] == "PIP-SM-20G-57"
        assert r2["material_name"] == "无缝钢管"
        assert r2["counterparty_name"] == "华夏石化销售集团"  # 自动回填合同信息

        # 行3: ERROR - 合同不存在
        r3 = rows[2]
        assert r3["status"] == "ERROR"
        assert "不存在或已失效" in r3["error_msg"]

        # 行4: ERROR - 物资品名未对齐
        r4 = rows[3]
        assert r4["status"] == "ERROR"
        assert "未对齐标准物料编码" in r4["error_msg"]

        # 行5: ERROR - 单价偏离度超出 ±15%
        r5 = rows[4]
        assert r5["status"] == "ERROR"
        assert "超出 ±15% 阈值" in r5["error_msg"]

        # 行6: ERROR - 数量必须大于0
        r6 = rows[5]
        assert r6["status"] == "ERROR"
        assert "采购数量必须大于0" in r6["error_msg"]


@pytest.mark.asyncio
async def test_parse_excel_invalid_extension():
    """验证上传非 Excel 扩展名时返回 400 校验异常"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        files = {
            "file": (
                "invalid_file.txt",
                b"contract_no,quantity,price",
                "text/plain",
            )
        }
        res = await ac.post("/api/v1/parse/excel", files=files)
        assert res.status_code == 200
        body = res.json()
        assert body["code"] == 400
        assert "仅支持上传 .xlsx 或 .xls" in body["message"]
