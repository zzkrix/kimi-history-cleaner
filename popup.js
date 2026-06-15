document.addEventListener("DOMContentLoaded", function () {
    const elements = {
        timeRangeSelect: document.getElementById("timeRange"),
        customTimeDiv: document.getElementById("customTime"),
        clearButton: document.getElementById("clearHistory"),
        statusDiv: document.getElementById("status"),
        startTimeInput: document.getElementById("startTime"),
        endTimeInput: document.getElementById("endTime"),
    };

    const formatDateTime = (date) => {
        const pad = (num) => String(num).padStart(2, "0");
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
            date.getDate()
        )}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
            date.getSeconds()
        )}`;
    };

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

    elements.timeRangeSelect.addEventListener("change", handleTimeRangeChange);
    elements.clearButton.addEventListener("click", handleClearHistory);

    async function handleClearHistory() {
        elements.clearButton.disabled = true;

        try {
            const [tab] = await chrome.tabs.query({
                active: true,
                currentWindow: true,
            });

            if (!isValidKimiTab(tab)) {
                showStatus(
                    `请在 <a href="https://www.kimi.com" target="_blank">Kimi</a> 页面使用此插件`,
                    "error"
                );
                return;
            }

            showStatus("正在清理历史会话，请稍候...", "success");

            const { startTime, endTime } = getTimeRange();
            const domain = new URL(tab.url).hostname;

            const response = await chrome.tabs.sendMessage(tab.id, {
                action: "clearAllHistory",
                domain,
                timeRange: { startTime, endTime },
            });

            if (!response) {
                throw new Error(
                    "无法连接到页面脚本，请刷新 Kimi 页面后重试"
                );
            }

            if (!response.success) {
                throw new Error(response.error || "未知错误");
            }

            showStatus(
                `清理完成，已删除 ${response.deletedCount || 0} 条会话`,
                "success"
            );
            setTimeout(() => window.close(), 2000);
        } catch (error) {
            showStatus(`操作失败：${error.message}`, "error");
        } finally {
            elements.clearButton.disabled = false;
        }
    }

    function isValidKimiTab(tab) {
        if (!tab || !tab.url) {
            return false;
        }

        try {
            const hostname = new URL(tab.url).hostname;
            return (
                hostname === "kimi.com" ||
                hostname.endsWith(".kimi.com") ||
                hostname === "kimi.ai" ||
                hostname.endsWith(".kimi.ai") ||
                hostname.endsWith(".moonshot.cn")
            );
        } catch (_error) {
            return false;
        }
    }

    function showStatus(message, type) {
        elements.statusDiv.innerHTML = message;
        elements.statusDiv.className = `status ${type}`;
        elements.statusDiv.style.display = "block";
    }

    function getTimeRange() {
        const selectedRange = elements.timeRangeSelect.value;
        let startTime = null;
        let endTime = null;

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

        if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
            throw new Error("时间格式不正确");
        }
        if (startTime > endTime) {
            throw new Error("开始时间不能晚于结束时间");
        }
    }
});

function parseDuration(range) {
    const value = parseInt(range, 10);
    const unit = range.slice(-1);
    const multipliers = {
        m: 60 * 1000,
        h: 60 * 60 * 1000,
    };
    return value * (multipliers[unit] || 0);
}

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
