// 后台脚本，用于处理插件的生命周期和事件
chrome.runtime.onInstalled.addListener(() => {
    console.log("kimi 历史会话清理助手已安装");
});

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.action === "clearAllHistory") {
        const response = await chrome.tabs.sendMessage(tab.id, message);
        sendResponse({
            success: response.success,
            error: response.error || null,
        });
    }
});
