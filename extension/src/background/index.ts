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
    case 'OPEN_SIDEBAR':
      // 打开侧边栏
      chrome.sidePanel.setOptions({ enabled: true });
      if (message.tabId) {
        chrome.sidePanel.open({ tabId: message.tabId });
      }
      sendResponse({ success: true });
      break;

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

    default:
      break;
  }
});

// 点击插件图标时打开侧边栏
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

export {};
