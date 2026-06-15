const KIMI_API_BASE = "https://www.kimi.com";
const LIST_CHATS_PATH = "/apiv2/kimi.chat.v1.ChatService/ListChats";
const BATCH_DELETE_PATH =
    "/apiv2/kimi.chat.v1.ChatService/BatchDeleteChats";
const DELETE_CHATS_PATH = "/apiv2/kimi.chat.v1.ChatService/DeleteChats";
const PAGE_SIZE = 50;
const DELETE_BATCH_SIZE = 50;
const LIST_DELAY_MS = 500;
const DELETE_DELAY_MS = 300;

let cachedSessionId = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action !== "clearAllHistory") {
        return false;
    }

    clearAllHistory(message)
        .then((result) => sendResponse({ success: true, ...result }))
        .catch((error) => {
            console.error("清理历史会话失败：", error);
            sendResponse({ success: false, error: error.message });
        });

    return true;
});

async function clearAllHistory(message) {
    const headers = await buildHeaders();
    let chats = [];

    try {
        chats = await listAllChats(headers);
    } catch (error) {
        if (!shouldTryLegacyApi(error)) {
            throw error;
        }
        chats = await listAllChatsLegacy(message.domain, headers);
    }

    if (chats.length === 0) {
        throw new Error("当前没有历史会话记录");
    }

    const chatsToDelete = filterChatsByTimeRange(chats, message.timeRange);
    if (chatsToDelete.length === 0) {
        throw new Error("在选定时间范围内未找到历史会话");
    }

    const chatIds = chatsToDelete
        .map(getChatId)
        .filter(Boolean);

    if (chatIds.length === 0) {
        throw new Error("未找到可删除的会话 ID");
    }

    const statusIndicator = createStatusIndicator();
    document.body.appendChild(statusIndicator);

    const deletedCount = await deleteChats(
        message.domain,
        headers,
        chatIds,
        (current, total) => {
            updateStatus(statusIndicator, current, total);
        }
    );

    showResult(statusIndicator, deletedCount, chatIds.length);
    return { deletedCount, totalCount: chatIds.length };
}

function shouldTryLegacyApi(error) {
    const message = String(error?.message || error || "");
    return /404|405|not found/i.test(message);
}

async function buildHeaders() {
    const authToken = localStorage.getItem("access_token");
    if (!authToken) {
        throw new Error("未找到认证信息，请确保已登录");
    }

    const deviceId = getDeviceId();
    const sessionId = getSessionId();

    return {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Connect-Protocol-Version": "1",
        Authorization: `Bearer ${authToken}`,
        "X-Msh-Platform": "web",
        "X-Msh-Device-Id": deviceId,
        "X-Msh-Session-Id": sessionId,
    };
}

function getDeviceId() {
    const storageKeys = [
        "device_id",
        "deviceId",
        "msh_device_id",
        "x-msh-device-id",
    ];

    for (const key of storageKeys) {
        const value = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (value && /^\d{16,20}$/.test(value)) {
            return value;
        }
    }

    return readStoredExtensionValue("kimiDeviceId", generateDeviceId);
}

function getSessionId() {
    if (cachedSessionId) {
        return cachedSessionId;
    }

    const storageKeys = ["session_id", "sessionId", "msh_session_id"];
    for (const key of storageKeys) {
        const value = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (value && /^\d{16,20}$/.test(value)) {
            cachedSessionId = value;
            return cachedSessionId;
        }
    }

    cachedSessionId = readStoredExtensionValue(
        "kimiSessionId",
        generateSessionId
    );
    return cachedSessionId;
}

function readStoredExtensionValue(storageKey, createValue) {
    try {
        const existing = localStorage.getItem(`__kimi_cleaner_${storageKey}`);
        if (existing) {
            return existing;
        }

        const value = createValue();
        localStorage.setItem(`__kimi_cleaner_${storageKey}`, value);
        return value;
    } catch (_error) {
        return createValue();
    }
}

function generateNumericId(prefixDigit) {
    let value = String(prefixDigit);
    while (value.length < 19) {
        value += Math.floor(Math.random() * 10);
    }
    return value;
}

function generateDeviceId() {
    return generateNumericId(7);
}

function generateSessionId() {
    let value = "17";
    while (value.length < 19) {
        value += Math.floor(Math.random() * 10);
    }
    return value;
}

async function listAllChats(headers) {
    const allChats = [];
    let pageToken = "";

    while (true) {
        const data = await apiPost(KIMI_API_BASE, LIST_CHATS_PATH, headers, {
            query: "",
            pageToken,
            pageSize: PAGE_SIZE,
        });

        const chats = Array.isArray(data?.chats) ? data.chats : [];
        allChats.push(...chats);

        pageToken = data?.nextPageToken || "";
        if (!pageToken || chats.length === 0) {
            break;
        }

        await sleep(LIST_DELAY_MS);
    }

    return allChats;
}

async function listAllChatsLegacy(domain, headers) {
    const allItems = [];
    let offset = 0;

    while (true) {
        const response = await fetch(`https://${domain}/api/chat/list`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                kimiplus_id: "",
                offset,
                q: "",
                size: PAGE_SIZE,
            }),
        });

        const data = await parseResponse(response);
        const items = Array.isArray(data?.items) ? data.items : [];

        if (items.length === 0) {
            break;
        }

        allItems.push(...items);
        offset += PAGE_SIZE;
        await sleep(LIST_DELAY_MS);
    }

    return allItems;
}

async function deleteChats(domain, headers, chatIds, onProgress) {
    let deletedCount = 0;

    for (let index = 0; index < chatIds.length; index += DELETE_BATCH_SIZE) {
        const batch = chatIds.slice(index, index + DELETE_BATCH_SIZE);

        try {
            await batchDeleteChats(headers, batch);
            deletedCount += batch.length;
        } catch (error) {
            if (!shouldTryLegacyApi(error)) {
                throw error;
            }
            deletedCount += await deleteChatsLegacy(
                domain,
                headers,
                batch,
                (current) => {
                    onProgress(deletedCount + current, chatIds.length);
                }
            );
        }

        onProgress(deletedCount, chatIds.length);
        await sleep(DELETE_DELAY_MS);
    }

    return deletedCount;
}

async function batchDeleteChats(headers, chatIds) {
    try {
        await apiPost(KIMI_API_BASE, BATCH_DELETE_PATH, headers, {
            chatIds,
        });
    } catch (error) {
        if (!shouldTryLegacyApi(error)) {
            throw error;
        }
        await apiPost(KIMI_API_BASE, DELETE_CHATS_PATH, headers, { chatIds });
    }
}

async function deleteChatsLegacy(domain, headers, chatIds, onProgress) {
    let deletedCount = 0;

    for (const chatId of chatIds) {
        const response = await fetch(`https://${domain}/api/chat/${chatId}`, {
            method: "DELETE",
            headers,
        });

        if (response.ok || response.status === 204) {
            deletedCount += 1;
            onProgress(deletedCount);
        }

        await sleep(DELETE_DELAY_MS);
    }

    return deletedCount;
}

function filterChatsByTimeRange(chats, timeRange) {
    if (!timeRange || (!timeRange.startTime && !timeRange.endTime)) {
        return chats;
    }

    return chats.filter((chat) => {
        const itemTime = getChatTimestamp(chat);
        if (itemTime === null) {
            return true;
        }
        if (timeRange.startTime && itemTime < timeRange.startTime) {
            return false;
        }
        if (timeRange.endTime && itemTime > timeRange.endTime) {
            return false;
        }
        return true;
    });
}

function getChatId(chat) {
    return chat.id || chat.chatId || chat.chat_id;
}

function getChatTimestamp(chat) {
    const raw =
        chat.updateTime ||
        chat.createTime ||
        chat.updated_at ||
        chat.updatedAt ||
        chat.lastMessage?.createTime;

    if (raw === undefined || raw === null) {
        return null;
    }

    if (typeof raw === "number") {
        return raw > 1e12 ? raw : raw * 1000;
    }

    if (typeof raw === "string") {
        const parsed = Date.parse(raw);
        return Number.isNaN(parsed) ? null : parsed;
    }

    if (typeof raw === "object" && raw.seconds !== undefined) {
        const seconds = Number(raw.seconds);
        const nanos = Number(raw.nanos || 0);
        return seconds * 1000 + Math.floor(nanos / 1e6);
    }

    return null;
}

async function apiPost(baseUrl, path, headers, body) {
    const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });

    return parseResponse(response);
}

async function parseResponse(response) {
    const text = await response.text();
    let data = null;

    if (text) {
        try {
            data = JSON.parse(text);
        } catch (_error) {
            data = null;
        }
    }

    if (!response.ok) {
        const detail =
            (data && (data.message || data.error || data.code)) ||
            text.slice(0, 200) ||
            response.statusText;
        throw new Error(`API 请求失败 (${response.status}): ${detail}`);
    }

    return data;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
