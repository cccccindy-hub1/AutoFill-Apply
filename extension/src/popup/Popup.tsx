import './Popup.css';

export default function Popup() {
  const handleOpenSidebar = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.sidePanel.open({ tabId: tab.id });
      window.close();
    }
  };

  const handleOpenOptions = () => {
    chrome.runtime.openOptionsPage();
    window.close();
  };

  return (
    <div className="popup">
      <div className="popup-header">
        <span className="popup-logo">🎓</span>
        <div>
          <h1 className="popup-title">CampusApply Agent</h1>
          <p className="popup-subtitle">校招网申智能体 v1.0.0</p>
        </div>
      </div>

      <div className="popup-actions">
        <button className="ca-btn ca-btn-primary ca-btn-block" onClick={handleOpenSidebar}>
          ⚡ 打开智能填充面板
        </button>
        <button className="ca-btn ca-btn-outline ca-btn-block" onClick={handleOpenOptions}>
          ⚙️ 管理个人信息
        </button>
      </div>

      <div className="popup-footer">
        <p>💡 点击上方按钮打开侧边栏，即可开始一键填充</p>
        <p className="popup-privacy">🔒 所有数据仅存储在本地浏览器中</p>
      </div>
    </div>
  );
}
