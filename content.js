// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.action === "clearAllHistory") {
        try {
            // 先跳转到历史会话页面
            const chatHistoryButton = document.querySelector(
                ".chat-history button"
            );
            if (chatHistoryButton) {
                chatHistoryButton.click();
                console.log("找到 .chat-history button 元素");
            } else {
                console.warn("未找到 .chat-history button 元素");
            }

            const headers = {
                "Content-Type": "application/json",
            };

            // 如果有 cookies，添加认证信息
            if (message.cookies && message.cookies.length > 0) {
                const authToken = message.cookies.find(
                    (c) => c.name === "kimi-auth"
                );
                if (!authToken) {
                    throw new Error("未找到认证信息，请确保已登录");
                }
                headers["Authorization"] = `Bearer ${authToken.value}`;
                headers["Cookie"] = message.cookies
                    .map((c) => `${c.name}=${c.value}`)
                    .join("; ");
            }

            // 循环获取所有历史记录
            let allItems = [];
            let offset = 0;
            const pageSize = 50;

            while (true) {
                const response = await fetch(
                    `https://${message.domain}/api/chat/list`,
                    {
                        method: "POST",
                        headers: headers,
                        body: JSON.stringify({
                            kimiplus_id: "",
                            offset: offset,
                            q: "",
                            size: pageSize,
                        }),
                    }
                );

                const data = await response.json();

                if (
                    !data.items ||
                    !Array.isArray(data.items) ||
                    data.items.length === 0
                ) {
                    break;
                }

                allItems = allItems.concat(data.items);
                offset += pageSize;

                // 添加适当的延迟，避免请求过于频繁
                await new Promise((resolve) => setTimeout(resolve, 500));
            }

            // 检查是否有历史记录
            if (allItems.length === 0) {
                alert("当前没有历史会话记录");
                throw new Error("当前没有历史会话记录");
            }

            await deleteHistoryItems(
                message.domain,
                headers,
                allItems,
                message.timeRange
            );
            sendResponse({ success: true });
        } catch (error) {
            console.error("发生错误：", error);
            sendResponse({ success: false, error: error.message });
        }
    }
    return true;
});

async function deleteHistoryItems(domain, headers, historyItems, timeRange) {
    try {
        // 根据时间范围过滤历史记录
        let itemsToDelete = historyItems;
        if (timeRange && (timeRange.startTime || timeRange.endTime)) {
            itemsToDelete = historyItems.filter((item) => {
                const itemTime = new Date(item.updated_at).getTime();
                if (timeRange.startTime && itemTime < timeRange.startTime)
                    return false;
                if (timeRange.endTime && itemTime > timeRange.endTime)
                    return false;
                return true;
            });
        }

        if (itemsToDelete.length === 0) {
            throw new Error("在选定时间范围内未找到历史会话");
        }

        const statusIndicator = createStatusIndicator();
        document.body.appendChild(statusIndicator);

        let deletedCount = 0;
        const totalItems = itemsToDelete.length;

        for (const item of itemsToDelete) {
            try {
                const deleteResponse = await fetch(
                    `https://${domain}/api/chat/${item.id}`,
                    {
                        method: "DELETE",
                        headers: headers,
                    }
                );

                if (deleteResponse.status === 200) {
                    deletedCount++;
                    updateStatus(statusIndicator, deletedCount, totalItems);
                }

                await new Promise((resolve) => setTimeout(resolve, 300));
            } catch (error) {
                console.error("删除单条记录时出错：", error);
                continue;
            }
        }
        showResult(statusIndicator, deletedCount, itemsToDelete.length);
    } catch (error) {
        console.error("删除过程中发生错误：", error);
        throw error;
    }
}

function createStatusIndicator() {
    const indicator = document.createElement("div");
    Object.assign(indicator.style, {
        position: "fixed",
        top: "10px",
        right: "10px",
        padding: "10px",
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        color: "white",
        borderRadius: "5px",
        zIndex: "9999",
    });
    return indicator;
}

function updateStatus(indicator, current, total) {
    indicator.textContent = `正在删除：${current}/${total}`;
}

function showResult(indicator, deletedCount, totalItems) {
    indicator.textContent = `删除完成：${deletedCount}/${totalItems}`;
    setTimeout(() => {
        indicator.remove();
        alert(`已成功删除 ${deletedCount} 条历史会话`);
        window.location.reload();
    }, 2000);
}
