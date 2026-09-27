import { useEffect, useRef, useState } from 'react';
import type { FormField, FillResult } from '../types/models';
import { executeFullFill } from '../engine/fillOrchestrator';
import { APP_VERSION } from '../version';
import QAPanel from './QAPanel';
import './Sidebar.css';

type TabType = 'fill' | 'result' | 'qa' | 'info';

/**
 * 向指定标签页的内容脚本发消息。
 * 内容脚本未注入时回调不会带 response，只会设置 lastError，
 * 若不读取该错误会表现为「界面一直卡在加载中」，因此统一在此收敛。
 */
function sendTabMessage<T>(tabId: number, message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response: T) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message || '无法连接到页面'));
        return;
      }
      resolve(response);
    });
  });
}

export default function Sidebar() {
  const [activeTab, setActiveTab] = useState<TabType>('fill');
  const [isScanning, setIsScanning] = useState(false);
  const [isFilling, setIsFilling] = useState(false);
  const [scannedFields, setScannedFields] = useState<FormField[]>([]);
  const [fillResult, setFillResult] = useState<FillResult | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  // 获取当前标签页 ID
  const getActiveTabId = (): Promise<number | undefined> => {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs[0]?.id);
      });
    });
  };

  // 扫描页面表单
  const handleScan = async () => {
    setIsScanning(true);
    setStatusMessage('正在扫描页面表单...');

    try {
      const tabId = await getActiveTabId();
      if (!tabId) {
        setStatusMessage('❌ 无法获取当前标签页');
        return;
      }

      const response = await sendTabMessage<{ success: boolean; fields: FormField[] }>(tabId, {
        type: 'SCAN_FORM_FIELDS',
      });
      if (response?.success) {
        setScannedFields(response.fields);
        setStatusMessage(`✅ 发现 ${response.fields.length} 个可填充字段`);
      } else {
        setStatusMessage('❌ 扫描失败，请确认页面已完全加载');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      setStatusMessage(
        msg.includes('Receiving end does not exist') || msg.includes('Could not establish')
          ? '❌ 当前页面未注入脚本，请刷新页面后重试'
          : '❌ 扫描出错，请刷新页面重试'
      );
    } finally {
      setIsScanning(false);
    }
  };

  // 一键填充 —— 调用真实填充引擎
  const handleFill = async () => {
    setIsFilling(true);
    setStatusMessage('🔄 正在启动智能填充...');

    try {
      const tabId = await getActiveTabId();
      if (!tabId) {
        setStatusMessage('❌ 无法获取当前标签页');
        setIsFilling(false);
        return;
      }

      // 调用填充编排器（扫描→规则匹配→语义匹配→LLM兜底→填充→校验）
      const result = await executeFullFill(tabId, (step, progress) => {
        setStatusMessage(`${step} (${progress}%)`);
      });

      setFillResult(result);
      setActiveTab('result');
      setStatusMessage(
        `✅ 填充完成！成功 ${result.successFields} 项，失败 ${result.failedFields} 项，待确认 ${result.pendingFields} 项`
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : '未知错误';
      setStatusMessage(`❌ ${msg}`);
    } finally {
      setIsFilling(false);
    }
  };

  // 清空填充
  const handleClear = async () => {
    const tabId = await getActiveTabId();
    if (!tabId) {
      setStatusMessage('❌ 无法获取当前标签页');
      return;
    }

    try {
      const response = await sendTabMessage<{ success: boolean }>(tabId, {
        type: 'CLEAR_ALL_FILLED',
      });
      if (response?.success) {
        setFillResult(null);
        setScannedFields([]);
        setStatusMessage('🧹 已清空所有填充内容');
      } else {
        setStatusMessage('❌ 清空失败，请刷新页面后重试');
      }
    } catch {
      setStatusMessage('❌ 当前页面未注入脚本，请刷新页面后重试');
    }
  };

  // 右键菜单「一键填充整页」由 background 广播 AUTO_FILL 事件驱动
  // 用 ref 保存最新 handler，避免把 handleFill 放进依赖数组导致重复订阅
  const fillHandlerRef = useRef(handleFill);
  fillHandlerRef.current = handleFill;

  useEffect(() => {
    const listener = (message: { type?: string }) => {
      if (message?.type === 'AUTO_FILL') {
        void fillHandlerRef.current();
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  return (
    <div className="sidebar">
      {/* 头部 */}
      <header className="sidebar-header">
        <div className="sidebar-logo">
          <span className="sidebar-logo-icon">🎓</span>
          <div>
            <h1 className="sidebar-title">CampusApply</h1>
            <p className="sidebar-subtitle">校招网申智能体</p>
          </div>
        </div>
      </header>

      {/* 标签切换 */}
      <nav className="sidebar-nav">
        <button
          className={`sidebar-nav-btn ${activeTab === 'fill' ? 'active' : ''}`}
          onClick={() => setActiveTab('fill')}
        >
          ⚡ 智能填充
        </button>
        <button
          className={`sidebar-nav-btn ${activeTab === 'result' ? 'active' : ''}`}
          onClick={() => setActiveTab('result')}
        >
          📊 填充结果
        </button>
        <button
          className={`sidebar-nav-btn ${activeTab === 'qa' ? 'active' : ''}`}
          onClick={() => setActiveTab('qa')}
        >
          💬 AI问答
        </button>
        <button
          className={`sidebar-nav-btn ${activeTab === 'info' ? 'active' : ''}`}
          onClick={() => setActiveTab('info')}
        >
          👤 我的
        </button>
      </nav>

      {/* 状态消息 */}
      {statusMessage && (
        <div className="sidebar-status">{statusMessage}</div>
      )}

      {/* 内容区域 */}
      <main className="sidebar-content">
        {/* ===== 智能填充标签 ===== */}
        {activeTab === 'fill' && (
          <div className="fill-panel">
            {/* 一键填充大按钮 */}
            <button
              className="ca-btn ca-btn-primary ca-btn-lg ca-btn-block fill-main-btn"
              onClick={handleFill}
              disabled={isFilling}
            >
              {isFilling ? (
                <>
                  <span className="ca-spinner" /> 填充中...
                </>
              ) : (
                <>🚀 一键智能填充</>
              )}
            </button>

            {/* 辅助操作 */}
            <div className="fill-actions">
              <button
                className="ca-btn ca-btn-outline"
                onClick={handleScan}
                disabled={isScanning}
              >
                {isScanning ? '扫描中...' : '🔍 扫描表单'}
              </button>
              <button className="ca-btn ca-btn-outline" onClick={handleClear}>
                🧹 清空填充
              </button>
            </div>

            {/* 扫描结果预览 */}
            {scannedFields.length > 0 && (
              <div className="ca-card scan-result-card">
                <h3 className="scan-result-title">
                  📋 发现 {scannedFields.length} 个表单字段
                </h3>
                <div className="scan-fields-list">
                  {scannedFields.slice(0, 20).map((field) => (
                    <div key={field.id} className="scan-field-item">
                      <span className="scan-field-label">{field.label}</span>
                      <span className={`ca-badge ${field.required ? 'ca-badge-danger' : 'ca-badge-info'}`}>
                        {field.required ? '必填' : field.tagName}
                      </span>
                    </div>
                  ))}
                  {scannedFields.length > 20 && (
                    <p className="scan-field-more">...还有 {scannedFields.length - 20} 个字段</p>
                  )}
                </div>
              </div>
            )}

            {/* 使用提示 */}
            {scannedFields.length === 0 && !isScanning && (
              <div className="ca-card fill-tip-card">
                <h3>💡 使用提示</h3>
                <ol className="fill-tips">
                  <li>打开任意企业的网申页面</li>
                  <li>点击上方「一键智能填充」按钮</li>
                  <li>系统自动识别表单并智能填充</li>
                  <li>核对结果后提交网申</li>
                </ol>
              </div>
            )}
          </div>
        )}

        {/* ===== 填充结果标签 ===== */}
        {activeTab === 'result' && (
          <div className="result-panel">
            {fillResult ? (
              <>
                {/* 统计概览 */}
                <div className="result-stats">
                  <div className="ca-stat">
                    <div className="ca-stat-value" style={{ color: 'var(--ca-primary)' }}>
                      {fillResult.totalFields}
                    </div>
                    <div className="ca-stat-label">总字段</div>
                  </div>
                  <div className="ca-stat">
                    <div className="ca-stat-value" style={{ color: 'var(--ca-success)' }}>
                      {fillResult.successFields}
                    </div>
                    <div className="ca-stat-label">成功</div>
                  </div>
                  <div className="ca-stat">
                    <div className="ca-stat-value" style={{ color: 'var(--ca-danger)' }}>
                      {fillResult.failedFields}
                    </div>
                    <div className="ca-stat-label">失败</div>
                  </div>
                  <div className="ca-stat">
                    <div className="ca-stat-value" style={{ color: 'var(--ca-warning)' }}>
                      {fillResult.pendingFields}
                    </div>
                    <div className="ca-stat-label">待确认</div>
                  </div>
                </div>

                {/* 进度条 */}
                <div className="ca-progress" style={{ marginBottom: '16px' }}>
                  <div
                    className="ca-progress-bar"
                    style={{
                      width: `${
                        fillResult.totalFields > 0
                          ? (fillResult.successFields / fillResult.totalFields) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>

                {/* 字段列表 */}
                <div className="result-fields">
                  {fillResult.fields.map((field) => (
                    <div key={field.fieldId} className={`result-field-item ${field.status}`}>
                      <div className="result-field-header">
                        <span className="result-field-label">{field.label}</span>
                        <span
                          className={`ca-badge ${
                            field.status === 'success'
                              ? 'ca-badge-success'
                              : field.status === 'failed'
                              ? 'ca-badge-danger'
                              : 'ca-badge-warning'
                          }`}
                        >
                          {field.status === 'success' ? '✓' : field.status === 'failed' ? '✗' : '?'}
                        </span>
                      </div>
                      {field.filledValue && (
                        <div className="result-field-value">{field.filledValue}</div>
                      )}
                      {field.errorMessage && (
                        <div className="result-field-error">{field.errorMessage}</div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="ca-empty">
                <div className="ca-empty-icon">📊</div>
                <p>暂无填充结果</p>
                <p style={{ fontSize: '12px', marginTop: '4px' }}>请先执行一键填充操作</p>
              </div>
            )}
          </div>
        )}

        {/* ===== AI 问答标签 ===== */}
        {activeTab === 'qa' && (
          <QAPanel onStatusUpdate={setStatusMessage} />
        )}

        {/* ===== 我的信息标签 ===== */}
        {activeTab === 'info' && (
          <div className="info-panel">
            <div className="ca-card">
              <h3>👤 个人信息管理</h3>
              <p style={{ color: 'var(--ca-text-secondary)', fontSize: '13px', margin: '8px 0' }}>
                请在选项页面中管理您的完整个人信息
              </p>
              <button
                className="ca-btn ca-btn-outline ca-btn-block"
                onClick={() => chrome.runtime.openOptionsPage()}
              >
                📝 打开信息管理页面
              </button>
            </div>

            <div className="ca-card" style={{ marginTop: '12px' }}>
              <h3>⚙️ 快捷设置</h3>
              <div className="info-quick-settings">
                <button
                  className="ca-btn ca-btn-outline ca-btn-sm"
                  onClick={() => {
                    chrome.runtime.openOptionsPage();
                  }}
                >
                  🤖 AI 模型配置
                </button>
                <button
                  className="ca-btn ca-btn-outline ca-btn-sm"
                  onClick={async () => {
                    // 导出数据
                    const { exportAllData } = await import('../storage/db');
                    const data = await exportAllData();
                    const blob = new Blob([JSON.stringify(data, null, 2)], {
                      type: 'application/json',
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `campus-apply-backup-${new Date().toISOString().slice(0, 10)}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    setStatusMessage('✅ 数据已导出');
                  }}
                >
                  💾 导出数据
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 底部 */}
      <footer className="sidebar-footer">
        <span>CampusApply Agent v{APP_VERSION}</span>
        <span>数据仅存储在本地 🔒</span>
      </footer>
    </div>
  );
}
