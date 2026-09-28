import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Sparkles,
  Bot,
  User,
  RotateCcw,
  Package,
  Trash2
} from 'lucide-react';
import { tradeApi } from '../../services/api';
import { useTradeStore } from '../../stores/useTradeStore';

export const ChatPanel: React.FC = () => {
  const { messages, addMessage, clearMessages, setDraft, setQuota } = useTradeStore();
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputValue).trim();
    if (!text || isSending) return;

    // 添加用户消息
    addMessage({
      role: 'user',
      content: text,
    });
    setInputValue('');

    try {
      setIsSending(true);
      const res = await tradeApi.parseChat({ text });
      if (res.data) {
        if (res.data.draft) {
          setDraft(res.data.draft);
        }
        if (res.data.quota) {
          setQuota(res.data.quota);
        }

        const clarification =
          res.data.clarification ||
          `已成功提取提单要素：关联合同【${res.data.draft.contract_no}】，物资品名【${
            res.data.draft.items[0]?.material_name || '大宗物资'
          }】，全单总额 ¥${res.data.draft.total_amount.toLocaleString('zh-CN')}。草稿数据已同步至右侧核对区。`;

        addMessage({
          role: 'assistant',
          content: clarification,
          suggestions: [
            '查询合同 2026-WZ-089 剩余履约配额',
            '将送货地址修改为科技城 2 号工地',
            '追加 100 吨水泥',
          ],
        });
      }
    } catch (e: any) {
      addMessage({
        role: 'assistant',
        content: e.message || '抱歉，未能识别出有效的商贸提单信息，请确认包含合同号、物资品名与数量。',
        suggestions: [
          '给中建八局科技城项目下200吨400E 20圆钢，走2026-WZ-089合同',
          '给中铁十二局下100吨42.5散装水泥，走2026-WZ-090合同',
        ],
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-full flex flex-col select-none overflow-hidden bg-white">
      {/* 顶部快捷引导胶囊区 */}
      <div className="p-3 border-b border-[#F1F5F9] bg-[#F8FAFC] flex items-center justify-between gap-2 overflow-x-auto">
        <div className="flex items-center gap-1.5 flex-nowrap">
          <button
            onClick={() => handleSend('新建销售订单：给中建八局科技城项目下200吨400E 20圆钢，走2026-WZ-089合同')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#EFF6FF] text-[#0071E3] border border-[#DBEAFE] hover:bg-[#DBEAFE] text-[11px] font-medium transition flex-shrink-0"
          >
            <Sparkles className="w-3 h-3" />
            <span>新建销售订单</span>
          </button>
          <button
            onClick={() => handleSend('新建采购订单：给中铁十二局下100吨普通硅酸盐水泥，走2026-WZ-090合同')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white text-[#475569] border border-[#E2E8F0] hover:bg-[#F1F5F9] text-[11px] font-medium transition flex-shrink-0"
          >
            <Package className="w-3 h-3" />
            <span>新建采购订单</span>
          </button>
          <button
            onClick={() => handleSend('查询当前合同 2026-WZ-089 履约剩余配额')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white text-[#475569] border border-[#E2E8F0] hover:bg-[#F1F5F9] text-[11px] font-medium transition flex-shrink-0"
          >
            <RotateCcw className="w-3 h-3" />
            <span>查合同配额</span>
          </button>
        </div>

        <button
          onClick={clearMessages}
          title="清空对话流"
          className="text-[#94A3B8] hover:text-[#475569] p-1 rounded transition"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 消息会话流 */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role !== 'user' && (
              <div className="w-7 h-7 rounded-hig-sm bg-[#0071E3] flex items-center justify-center text-white flex-shrink-0 shadow-hig-sm mt-0.5">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div className={`max-w-[85%] space-y-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div
                className={`p-3 rounded-hig-lg text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[#0071E3] text-white shadow-hig-sm rounded-br-xs'
                    : 'bg-[#F8FAFC] text-[#0F172A] border border-[#E2E8F0] rounded-bl-xs'
                }`}
              >
                {msg.content}
              </div>

              {/* 推荐气泡建议 */}
              {msg.suggestions && msg.suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {msg.suggestions.map((sug, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(sug)}
                      className="text-[11px] text-[#0071E3] bg-[#EFF6FF] hover:bg-[#DBEAFE] border border-[#BFDBFE] px-2.5 py-1 rounded-hig transition text-left"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-hig-sm bg-[#F1F5F9] border border-[#E2E8F0] flex items-center justify-center text-[#475569] flex-shrink-0 mt-0.5">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {isSending && (
          <div className="flex gap-2.5 justify-start">
            <div className="w-7 h-7 rounded-hig-sm bg-[#0071E3] flex items-center justify-center text-white flex-shrink-0 shadow-hig-sm mt-0.5 animate-pulse">
              <Bot className="w-4 h-4" />
            </div>
            <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-hig-lg rounded-bl-xs text-xs text-[#64748B] flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#0071E3] animate-bounce" />
              <div className="w-1.5 h-1.5 rounded-full bg-[#0071E3] animate-bounce [animation-delay:0.2s]" />
              <div className="w-1.5 h-1.5 rounded-full bg-[#0071E3] animate-bounce [animation-delay:0.4s]" />
              <span>正在智能提取商贸要素并试算合同额度...</span>
            </div>
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* 底部输入框 */}
      <div className="p-3 border-t border-[#E5E5EA] bg-white">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSending}
            placeholder="输入自然语言提单需求（例如：给中建八局下200吨400E 20圆钢，走2026-WZ-089合同）..."
            className="flex-1 px-3 py-2 bg-[#F1F5F9] rounded-hig text-xs placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 transition"
          />
          <button
            onClick={() => handleSend()}
            disabled={isSending || !inputValue.trim()}
            className="px-3.5 py-2 bg-[#0071E3] hover:bg-[#0071E3]/90 disabled:opacity-50 text-white rounded-hig text-xs font-semibold shadow-hig-sm flex items-center gap-1 active:scale-95 transition"
          >
            <Send className="w-3.5 h-3.5" />
            <span>发送</span>
          </button>
        </div>
      </div>
    </div>
  );
};
