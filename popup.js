document.addEventListener("DOMContentLoaded", async function () {
    // 获取 DOM 元素
    const elements = {
        timeRangeSelect: document.getElementById("timeRange"),
        customTimeDiv: document.getElementById("customTime"),
        clearButton: document.getElementById("clearHistory"),
        statusDiv: document.getElementById("status"),
        startTimeInput: document.getElementById("startTime"),
        endTimeInput: document.getElementById("endTime"),
    };

    // 时间格式化函数
    const formatDateTime = (date) => {
        const pad = (num) => String(num).padStart(2, "0");
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
            date.getDate()
        )}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
            date.getSeconds()
        )}`;
    };

    // 处理时间范围选择变化
    const handleTimeRangeChange = () => {
        const selectedRange = elements.timeRangeSelect.value;
        elements.customTimeDiv.style.display =
            selectedRange === "custom" ? "block" : "none";

        if (selectedRange === "custom") {
            const now = new Date();
            elements.endTimeInput.value = formatDateTime(now);
            elements.startTimeInput.value = formatDateTime(
                new Date(now - 24 * 60 * 60 * 1000)
            );
        } else if (selectedRange !== "all") {
            const now = new Date();
            const endTime = formatDateTime(now);
            const startDate = new Date(now - parseDuration(selectedRange));
            const startTime = formatDateTime(startDate);

            elements.startTimeInput.value = startTime;
            elements.endTimeInput.value = endTime;
        }
    };

    // 初始化事件监听
    elements.timeRangeSelect.addEventListener("change", handleTimeRangeChange);
    elements.clearButton.addEventListener("click", handleClearHistory);

    // 清理历史记录处理函数
    async function handleClearHistory() {
        try {
            const [tab] = await chrome.tabs.query({
                active: true,
                currentWindow: true,
            });

            if (!isValidKimiTab(tab)) {
                showStatus(
                    `请在 <a href="https://kimi.ai" target="_blank">kimi</a> 的历史会话页面使用此插件`,
                    "error"
                );
                return;
            }

            const { startTime, endTime } = getTimeRange();
            const domain = new URL(tab.url).hostname;
            const cookies = await chrome.cookies.getAll({ domain });

            const response = await chrome.tabs.sendMessage(tab.id, {
                action: "clearAllHistory",
                domain,
                cookies,
                timeRange: { startTime, endTime },
            });

            if (response && !response.success) {
                throw new Error(response.error || "未知错误");
            }

            showStatus("🧹正在执行清理，请稍候...", "success");
            setTimeout(() => window.close(), 3000);
        } catch (error) {
            showStatus(`操作失败：${error.message}`, "error");
        }
    }

    // 辅助函数
    function isValidKimiTab(tab) {
        return tab && tab.url && tab.url.includes("kimi");
    }

    function showStatus(message, type) {
        elements.statusDiv.innerHTML = message; // 使用 innerHTML 而不是 textContent
        elements.statusDiv.className = `status ${type}`;
        elements.statusDiv.style.display = "block";
    }

    function getTimeRange() {
        const selectedRange = elements.timeRangeSelect.value;
        let startTime = null,
            endTime = null;

        if (selectedRange === "custom") {
            validateCustomTime();
            startTime = new Date(elements.startTimeInput.value).getTime();
            endTime = new Date(elements.endTimeInput.value).getTime();
        } else if (selectedRange !== "all") {
            endTime = Date.now();
            startTime = endTime - parseDuration(selectedRange);
        }

        return { startTime, endTime };
    }

    function validateCustomTime() {
        if (!elements.startTimeInput.value || !elements.endTimeInput.value) {
            throw new Error("请选择完整的时间范围");
        }
        const startTime = new Date(elements.startTimeInput.value).getTime();
        const endTime = new Date(elements.endTimeInput.value).getTime();

        if (isNaN(startTime) || isNaN(endTime)) {
            throw new Error("时间格式不正确");
        }
        if (startTime > endTime) {
            throw new Error("开始时间不能晚于结束时间");
        }
    }
});

function parseDuration(range) {
    const value = parseInt(range);
    const unit = range.slice(-1);
    const multipliers = {
        m: 60 * 1000,
        h: 60 * 60 * 1000,
    };
    return value * (multipliers[unit] || 0);
}

// 添加赞赏码折叠功能
document.addEventListener("DOMContentLoaded", function () {
    const toggleDonationBtn = document.getElementById("toggleDonation");
    const donationContent = document.getElementById("donationContent");

    if (toggleDonationBtn && donationContent) {
        toggleDonationBtn.addEventListener("click", function () {
            if (donationContent.style.display === "none") {
                donationContent.style.display = "block";
                toggleDonationBtn.textContent = "点击隐藏赞赏码";
            } else {
                donationContent.style.display = "none";
                toggleDonationBtn.textContent = "👍 点击支持作者";
            }
        });
    }
});
