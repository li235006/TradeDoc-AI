import io
import logging
from typing import Dict, Any, List, Optional
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from motor.motor_asyncio import AsyncIOMotorDatabase

try:
    from app.schemas.parse import ExcelRowResult, ExcelParseResultData
    from app.services.semantic import semantic_service
    from app.core.exceptions import BusinessException
except ImportError:
    from backend.app.schemas.parse import ExcelRowResult, ExcelParseResultData
    from backend.app.services.semantic import semantic_service
    from backend.app.core.exceptions import BusinessException

logger = logging.getLogger("tradedoc.excel_parser")


class ExcelParserService:
    # 字段别名映射表 (支持多样式中英文表头容错)
    HEADER_ALIASES = {
        "contract_no": ["合同编号", "关联合同编号", "合同号", "合同", "contract_no"],
        "counterparty_name": ["签约单位", "往来签约单位", "往来单位", "客户名称", "供应商", "单位名称", "counterparty_name"],
        "project_name": ["项目名称", "工程项目名称", "工程名称", "项目", "工程", "project_name"],
        "material_code": ["物料编码", "标准物料编码", "物资编码", "编码", "material_code"],
        "material_name": ["物资名称", "规范物资名称", "物料名称", "品名", "产品名称", "material_name"],
        "specification": ["规格型号", "规格牌号", "规格", "型号", "牌号", "specification"],
        "quantity": ["采购数量", "数量", "主计量吨数", "吨数", "主数量", "quantity"],
        "unit": ["计量单位", "单位", "unit"],
        "unit_price": ["含税单价", "单价", "单价(元)", "单价（元）", "unit_price"],
        "total_amount": ["明细总金额", "总金额", "金额", "明细金额", "total_amount"],
        "delivery_address": ["送货地址", "工地送货地址", "收货地址", "地址", "交货地点", "delivery_address"],
    }

    def generate_template(self) -> io.BytesIO:
        """
        AC-04: 生成标准 Excel 导入模板文件 (含规范表头、示例行与样式设计)
        """
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "商贸订单导入模板"

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

        # 表头样式: 商务深蓝底色、白字加粗、居中对齐
        header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
        header_font = Font(name="Microsoft YaHei", size=11, bold=True, color="FFFFFF")
        center_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        thin_border = Border(
            left=Side(style="thin", color="CBD5E1"),
            right=Side(style="thin", color="CBD5E1"),
            top=Side(style="thin", color="CBD5E1"),
            bottom=Side(style="thin", color="CBD5E1"),
        )

        ws.append(headers)
        ws.row_dimensions[1].height = 28

        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=1, column=col_idx)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = center_alignment
            cell.border = thin_border

        # 示例数据行
        examples = [
            [
                "2026-WZ-089",
                "远大钢铁销售总公司",
                "科技城数字经济产业园一期项目",
                "STL-RB-400E-20",
                "热轧带肋钢筋",
                "HRB400E Φ20mm",
                30.0,
                "吨",
                4000.0,
                "苏州市高新区科技城 1 号工地物资中转站",
            ],
            [
                "2026-WZ-090",
                "华夏石化销售集团",
                "苏州轨道交通 8 号线 3 标",
                "PIP-SM-20G-57",
                "无缝钢管",
                "20G Φ57*3.5",
                500.0,
                "米",
                120.0,
                "苏州市工业园区工地",
            ],
        ]

        data_font = Font(name="Microsoft YaHei", size=10)
        data_alignment = Alignment(horizontal="left", vertical="center")

        for row_data in examples:
            ws.append(row_data)
            row_idx = ws.max_row
            ws.row_dimensions[row_idx].height = 22
            for col_idx in range(1, len(headers) + 1):
                cell = ws.cell(row=row_idx, column=col_idx)
                cell.font = data_font
                cell.border = thin_border
                if col_idx in [7, 9]:  # 数量与单价靠右对齐
                    cell.alignment = Alignment(horizontal="right", vertical="center")
                else:
                    cell.alignment = data_alignment

        # 自动调整列宽
        col_widths = {
            1: 18,  # 合同编号
            2: 24,  # 签约单位
            3: 28,  # 项目名称
            4: 20,  # 物料编码
            5: 20,  # 物资名称
            6: 20,  # 规格型号
            7: 14,  # 采购数量
            8: 12,  # 计量单位
            9: 14,  # 含税单价
            10: 36, # 送货地址
        }
        for col_idx, width in col_widths.items():
            col_letter = openpyxl.utils.get_column_letter(col_idx)
            ws.column_dimensions[col_letter].width = width

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return output

    async def parse_excel(
        self,
        file_bytes: bytes,
        filename: str,
        db: AsyncIOMotorDatabase,
    ) -> ExcelParseResultData:
        """
        AC-01 ~ AC-03: 解析 Excel 订单文件并逐行穿透合规规则校验
        校验规则：
        1. 数量必须大于 0 (quantity > 0)
        2. 单价不能为负数 (unit_price >= 0)
        3. 合同必须真实存在于 db.contracts 且处于有效状态 (status == 'ACTIVE')
        4. 物料需对齐标准字典 (通过编码查找或品名向量近似对齐)
        5. 单价偏离度不可超过 ±15%
        """
        if not filename.lower().endswith((".xlsx", ".xls")):
            raise BusinessException(message="仅支持上传 .xlsx 或 .xls 格式的 Excel 表格文件", code=400)

        try:
            wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
            ws = wb.active
        except Exception as e:
            logger.error(f"Failed to load workbook with openpyxl: {e}")
            raise BusinessException(message=f"Excel 文件损坏或无法读取: {str(e)}", code=400)

        # 1. 解析表头映射
        header_map: Dict[str, int] = {}
        first_row = list(ws.iter_rows(min_row=1, max_row=1, values_only=True))[0]
        if not first_row:
            raise BusinessException(message="Excel 文件为空或缺少表头", code=400)

        for col_idx, cell_val in enumerate(first_row):
            if not cell_val:
                continue
            clean_val = str(cell_val).strip().replace("*", "").replace("（", "(").replace("）", ")")
            for field, aliases in self.HEADER_ALIASES.items():
                if any(alias in clean_val or clean_val.lower() == alias.lower() for alias in aliases):
                    if field not in header_map:
                        header_map[field] = col_idx
                    break

        # 校验必备列是否存在
        required_fields = ["material_name", "quantity", "unit_price"]
        missing_fields = [f for f in required_fields if f not in header_map]
        if missing_fields:
            logger.warning(f"Excel missing key columns: {missing_fields}, header_map={header_map}")

        # 2. 逐行读取与穿透校验
        row_results: List[ExcelRowResult] = []
        data_rows = list(ws.iter_rows(min_row=2, values_only=True))

        for row_idx, row in enumerate(data_rows, start=1):
            # 过滤全空行
            if not any(row):
                continue

            def get_col(field_name: str, default=None):
                idx = header_map.get(field_name)
                if idx is not None and idx < len(row):
                    val = row[idx]
                    return val if val is not None else default
                return default

            contract_no = str(get_col("contract_no", "")).strip()
            counterparty_name = str(get_col("counterparty_name", "")).strip() or None
            project_name = str(get_col("project_name", "")).strip() or None
            raw_material_code = str(get_col("material_code", "")).strip() or None
            material_name = str(get_col("material_name", "")).strip() or None
            specification = str(get_col("specification", "")).strip()
            unit = str(get_col("unit", "吨")).strip() or "吨"
            delivery_address = str(get_col("delivery_address", "")).strip() or None

            # 数值类型安全解析
            try:
                raw_qty = get_col("quantity", 0.0)
                quantity = float(raw_qty) if raw_qty is not None else 0.0
            except (ValueError, TypeError):
                quantity = -1.0

            try:
                raw_price = get_col("unit_price", 0.0)
                unit_price = float(raw_price) if raw_price is not None else 0.0
            except (ValueError, TypeError):
                unit_price = -1.0

            total_amount = round(max(0.0, quantity) * max(0.0, unit_price), 2)

            error_msgs: List[str] = []

            # 校验 1: 数量有效性
            if quantity <= 0:
                error_msgs.append(f"采购数量必须大于0 (当前值: {quantity})")

            # 校验 2: 单价有效性
            if unit_price < 0:
                error_msgs.append(f"单价不能为负数 (当前值: {unit_price})")

            # 校验 3: 合同有效性
            contract_doc = None
            if not contract_no:
                error_msgs.append("缺少合同编号")
            else:
                contract_doc = await db.contracts.find_one({"contract_no": contract_no})
                if not contract_doc:
                    error_msgs.append(f"合同编号 {contract_no} 不存在或已失效")
                else:
                    if contract_doc.get("status") != "ACTIVE":
                        error_msgs.append(f"合同 [{contract_no}] 处于非有效履约状态 ({contract_doc.get('status')})")
                    # 自动补全签约单位、工程名、送货地址
                    if not counterparty_name:
                        counterparty_name = contract_doc.get("counterparty_name")
                    if not project_name:
                        project_name = contract_doc.get("project_name")
                    if not delivery_address:
                        delivery_address = contract_doc.get("default_delivery_address")

            # 校验 4: 物料主数据与向量对齐
            material_doc = None
            std_price = 0.0
            final_material_code = raw_material_code
            final_material_name = material_name

            if raw_material_code:
                material_doc = await db.materials.find_one({"material_code": raw_material_code})
                if not material_doc:
                    error_msgs.append(f"物资编码 [{raw_material_code}] 不存在于标准主数据字典中")
                else:
                    std_price = material_doc.get("standard_price", 0.0)
                    if not final_material_name:
                        final_material_name = material_doc.get("material_name")
                    if not specification:
                        specification = material_doc.get("specification", "")
            elif material_name:
                align_res = semantic_service.align_material(material_name)
                if not align_res or not align_res.material_code or align_res.match_status == "UNMATCHED":
                    error_msgs.append(f"物资品名 [{material_name}] 未对齐标准物料编码")
                else:
                    final_material_code = align_res.material_code
                    final_material_name = align_res.material_name
                    std_price = align_res.standard_price
                    if not specification:
                        specification = align_res.specification or ""
                    material_doc = await db.materials.find_one({"material_code": final_material_code})
            else:
                error_msgs.append("物资品名或物料编码缺失")

            # 校验 5: 单价偏离度校验 (±15% 双向预警)
            if std_price > 0 and unit_price > 0:
                deviation = (unit_price - std_price) / std_price
                if abs(deviation) > 0.15:
                    dev_pct = round(deviation * 100, 1)
                    direction = "高于" if deviation > 0 else "低于"
                    error_msgs.append(
                        f"物资[{final_material_name}]单价(¥{unit_price:,.2f}){direction}指导价(¥{std_price:,.2f})，偏离度 {dev_pct:+}% 超出 ±15% 阈值"
                    )

            is_valid = len(error_msgs) == 0
            row_results.append(
                ExcelRowResult(
                    row_index=row_idx,
                    status="VALID" if is_valid else "ERROR",
                    error_msg="; ".join(error_msgs) if error_msgs else None,
                    contract_no=contract_no or None,
                    counterparty_name=counterparty_name,
                    project_name=project_name,
                    material_code=final_material_code,
                    material_name=final_material_name,
                    specification=specification,
                    quantity=quantity,
                    unit=unit,
                    unit_price=unit_price,
                    total_amount=total_amount,
                    delivery_address=delivery_address,
                )
            )

        total_cnt = len(row_results)
        valid_cnt = sum(1 for r in row_results if r.status == "VALID")
        error_cnt = total_cnt - valid_cnt

        return ExcelParseResultData(
            total_rows=total_cnt,
            valid_rows=valid_cnt,
            error_rows=error_cnt,
            rows=row_results,
        )


excel_parser_service = ExcelParserService()
