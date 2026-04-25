document.addEventListener("DOMContentLoaded", function () {
  const btn = document.getElementById("summary-refresh-btn");
  if (!btn) return;

  const analyzeSelect = document.querySelector(".summary-analyze-select");
  const summarizeSelect = document.querySelector(".summary-summarize-select");
  const statusDiv = document.getElementById("summary-status");
  const errorDiv = document.getElementById("summary-error");
  const summaryContentDiv = document.getElementById("summary-content");

  async function fetchAndDisplaySummary(summarizeThreadId) {
    const sessionId = window.MIMO_SESSION_ID;
    if (!sessionId || !summarizeThreadId) return;

    try {
      const response = await fetch(
        `/api/summary/latest?sessionId=${sessionId}&summarizeThreadId=${summarizeThreadId}`,
      );
      if (response.ok) {
        const data = await response.json();
        if (data.summary && data.summary.length > 0) {
          if (summaryContentDiv) {
            summaryContentDiv.textContent = data.summary;
            summaryContentDiv.style.display = "block";
          }
          if (statusDiv) {
            statusDiv.textContent = "Summary updated!";
            statusDiv.style.display = "block";
            setTimeout(() => {
              if (statusDiv) statusDiv.style.display = "none";
            }, 2000);
          }
          return true;
        }
      }
    } catch (e) {
      // Silent fail
    }
    return false;
  }

  // Auto-refresh when summarize thread receives a message
  function setupAutoRefresh() {
    window.addEventListener("message", function (e) {
      if (e.data?.type === "chat_message_complete") {
        const threadId = e.data.chatThreadId;
        const selectedSummarizeThreadId = summarizeSelect?.value;
        if (threadId === selectedSummarizeThreadId) {
          setTimeout(() => {
            fetchAndDisplaySummary(selectedSummarizeThreadId);
          }, 500);
        }
      }
    });

    window.addEventListener("mimo_message_finalized", function (e) {
      const threadId = e.detail?.chatThreadId;
      const selectedSummarizeThreadId = summarizeSelect?.value;
      if (threadId === selectedSummarizeThreadId) {
        setTimeout(() => {
          fetchAndDisplaySummary(selectedSummarizeThreadId);
        }, 500);
      }
    });
  }

  setupAutoRefresh();

  async function pollForSummary(sessId, summThreadId) {
    const maxAttempts = 60;
    let attempts = 0;

    try {
      const response = await fetch(
        `/api/summary/latest?sessionId=${sessId}&summarizeThreadId=${summThreadId}`,
      );

      if (response.ok) {
        const data = await response.json();
        if (data.summary && data.summary.length > 0) {
          return data.summary;
        }
      }
    } catch (e) {
      // Silent fail
    }
    return null;
  }

  btn.addEventListener("click", async function () {
    const sessionId = window.MIMO_SESSION_ID;
    const analyzeThreadId = analyzeSelect?.value;
    const summarizeThreadId = summarizeSelect?.value;

    if (!analyzeThreadId || !summarizeThreadId) {
      if (errorDiv) {
        errorDiv.textContent = "Please select both threads";
        errorDiv.style.display = "block";
      }
      return;
    }

    btn.disabled = true;
    btn.textContent = "⏳ Summarizing...";
    if (errorDiv) {
      errorDiv.textContent = "";
      errorDiv.style.display = "none";
    }
    if (statusDiv) {
      statusDiv.textContent = "";
      statusDiv.style.display = "none";
    }
    if (summaryContentDiv) {
      summaryContentDiv.textContent = "";
      summaryContentDiv.style.display = "none";
    }

    try {
      const response = await fetch(
        `/api/summary/refresh?sessionId=${sessionId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            analyzeThreadId,
            summarizeThreadId,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        if (errorDiv) {
          errorDiv.textContent =
            errorData.error || "Failed to generate summary";
          errorDiv.style.display = "block";
        }
        btn.disabled = false;
        btn.textContent = "Refresh";
        return;
      }

      if (statusDiv) statusDiv.style.display = "none";

      const summary = await pollForSummary(sessionId, summarizeThreadId);

      if (summary && summaryContentDiv) {
        summaryContentDiv.textContent = summary;
        summaryContentDiv.style.display = "block";
        if (statusDiv) statusDiv.style.display = "none";
      } else if (statusDiv) {
        statusDiv.textContent =
          "Summary request sent. Check the chat thread for the result.";
      }
    } catch (err) {
      if (errorDiv) {
        errorDiv.textContent = "Failed to generate summary";
        errorDiv.style.display = "block";
      }
    }

    btn.disabled = false;
    btn.textContent = "Refresh";
  });
});
