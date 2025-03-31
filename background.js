// 后台脚本，用于处理插件的生命周期和事件
chrome.runtime.onInstalled.addListener(() => {
    console.log("Kimi 历史会话清理器已安装");
});
