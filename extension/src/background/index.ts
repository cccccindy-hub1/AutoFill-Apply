// ============================================================
// Background Service Worker
// 处理插件后台逻辑：右键菜单、消息路由、侧边栏管理
// ============================================================

// 安装时初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log('[CampusApply] 插件已安装/更新');

  // 创建右键菜单
  chrome.contextMenus.create({
    id: 'campus-apply-fill-field',
    title: '🤖 智能填充此字段',
    contexts: ['editable'],
  });

  chrome.contextMenus.create({
    id: 'campus-apply-fill-page',
    title: '📋 一键填充整页',
    contexts: ['page'],
  });
});

// 右键菜单点击处理
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === 'campus-apply-fill-field') {
    chrome.tabs.sendMessage(tab.id, {
      type: 'FILL_SINGLE_FIELD',
    });
  } else if (info.menuItemId === 'campus-apply-fill-page') {
    chrome.tabs.sendMessage(tab.id, {
      type: 'FILL_ALL_FIELDS',
    });
  }
});

// 处理来自 content script / popup / sidebar 的消息
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'OPEN_SIDEBAR': {
      // 打开侧边栏。sidePanel.open 必须在用户手势上下文中调用，
      // 否则会抛错——这里捕获并如实反馈，避免前端一直等待。
      const tabId = message.tabId;
      if (!tabId) {
        sendResponse({ success: false, error: '缺少 tabId，无法打开侧边栏' });
        break;
      }
      // 仅对目标标签页启用侧边栏，避免影响其他标签页
      chrome.sidePanel.setOptions({ tabId, path: 'src/sidebar/index.html', enabled: true });
      chrome.sidePanel
        .open({ tabId })
        .then(() => sendResponse({ success: true }))
        .catch((error: unknown) => {
          const message_ = error instanceof Error ? error.message : String(error);
          console.warn('[CampusApply] 打开侧边栏失败:', message_);
          sendResponse({ success: false, error: message_ });
        });
      return true; // 异步响应
    }

    case 'GET_ACTIVE_TAB':
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        sendResponse({ tab: tabs[0] });
      });
      return true; // 异步响应

    case 'SCAN_PAGE':
      // 转发扫描请求给 content script
      if (message.tabId) {
        chrome.tabs.sendMessage(message.tabId, { type: 'SCAN_FORM_FIELDS' }, (response) => {
          sendResponse(response);
        });
        return true;
      }
      break;

    case 'FILL_FIELDS':
      // 转发填充请求给 content script
      if (message.tabId) {
        chrome.tabs.sendMessage(
          message.tabId,
          {
            type: 'EXECUTE_FILL',
            data: message.data,
          },
          (response) => {
            sendResponse(response);
          }
        );
        return true;
      }
      break;

    case 'CLEAR_FILLED':
      // 清空已填充内容
      if (message.tabId) {
        chrome.tabs.sendMessage(message.tabId, { type: 'CLEAR_ALL_FILLED' }, (response) => {
          sendResponse(response);
        });
        return true;
      }
      break;

    case 'TRIGGER_FILL_FROM_CONTEXT_MENU':
      // content script 收到右键菜单指令后无法直接驱动侧边栏，
      // 由这里广播给侧边栏，触发整页填充流程。
      chrome.runtime.sendMessage({ type: 'AUTO_FILL' }).catch(() => {
        // 侧边栏未打开时没有接收方，属于正常情况
      });
      sendResponse({ success: true });
      break;

    default:
      break;
  }
});

export {};
