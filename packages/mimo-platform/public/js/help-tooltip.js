(function () {
  "use strict";

  const SHOW_DELAY_MS = 500;
  const HIDE_DELAY_MS = 200;
  const TOOLTIP_OFFSET = 10;

  class MarkdownRenderer {
    render(content) {
      throw new Error("Not implemented");
    }
  }

  class MarkedRenderer extends MarkdownRenderer {
    render(content) {
      if (typeof marked !== "undefined" && typeof marked.parse === "function") {
        return marked.parse(content);
      }
      return this.fallbackRender(content);
    }

    fallbackRender(content) {
      let html = content
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/`(.+?)`/g, "<code>$1</code>")
        .replace(
          /\[(.+?)\]\((.+?)\)/g,
          '<a href="$2" target="_blank" rel="noopener">$1</a>',
        )
        .replace(/\n/g, "<br>");
      return html;
    }
  }

  class LightweightRenderer extends MarkdownRenderer {
    render(content) {
      let html = content
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/`(.+?)`/g, "<code>$1</code>")
        .replace(
          /\[(.+?)\]\((.+?)\)/g,
          '<a href="$2" target="_blank" rel="noopener">$1</a>',
        )
        .replace(/\n/g, "<br>");
      return html;
    }
  }

  function createMarkdownRenderer(type) {
    switch (type) {
      case "marked":
        return new MarkedRenderer();
      case "lightweight":
        return new LightweightRenderer();
      default:
        return new MarkedRenderer();
    }
  }

  class HelpTooltipManager {
    constructor() {
      this.renderer = createMarkdownRenderer("marked");
      this.helpContent = {};
      this.activeTooltip = null;
      this.showTimeout = null;
      this.hideTimeout = null;
      this.currentHelpId = null;
    }

    async loadHelpContent() {
      try {
        const response = await fetch("/api/help");
        if (response.ok) {
          this.helpContent = await response.json();
        }
      } catch (error) {
        console.warn("[help-tooltip] Failed to load help content:", error);
        this.helpContent = {};
      }
    }

    getHelpEntry(helpId) {
      return this.helpContent[helpId] || null;
    }

    showTooltip(target, helpId) {
      const entry = this.getHelpEntry(helpId);
      if (!entry) {
        return;
      }

      this.hideTooltip(true);

      let tooltip = document.querySelector(".help-tooltip");
      if (!tooltip) {
        tooltip = document.createElement("div");
        tooltip.className = "help-tooltip";
        document.body.appendChild(tooltip);
      }

      const titleEl = document.createElement("div");
      titleEl.className = "help-tooltip-title";
      titleEl.textContent = entry.title || "";

      const contentEl = document.createElement("div");
      contentEl.className = "help-tooltip-content";
      contentEl.innerHTML = this.renderer.render(entry.content || "");

      tooltip.innerHTML = "";
      tooltip.appendChild(titleEl);
      tooltip.appendChild(contentEl);

      const rect = target.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();

      let top = rect.top - tooltipRect.height - TOOLTIP_OFFSET;
      let left = rect.left + rect.width / 2 - tooltipRect.width / 2;

      if (top < 10) {
        top = rect.bottom + TOOLTIP_OFFSET;
      }

      const maxLeft = window.innerWidth - tooltipRect.width - 10;
      if (left > maxLeft) {
        left = maxLeft;
      }
      if (left < 10) {
        left = 10;
      }

      tooltip.style.top = `${top + window.scrollY}px`;
      tooltip.style.left = `${left}px`;
      tooltip.classList.add("visible");

      this.activeTooltip = tooltip;
      this.currentHelpId = helpId;
    }

    hideTooltip(immediate) {
      if (this.hideTimeout) {
        clearTimeout(this.hideTimeout);
        this.hideTimeout = null;
      }

      if (immediate) {
        const tooltip = document.querySelector(".help-tooltip");
        if (tooltip) {
          tooltip.classList.remove("visible");
        }
        this.activeTooltip = null;
        this.currentHelpId = null;
        return;
      }

      this.hideTimeout = setTimeout(() => {
        const tooltip = document.querySelector(".help-tooltip");
        if (tooltip) {
          tooltip.classList.remove("visible");
        }
        this.activeTooltip = null;
        this.currentHelpId = null;
      }, HIDE_DELAY_MS);
    }

    handleMouseEnter(event) {
      const target = event.target.closest("[data-help-id]");
      if (!target) return;

      const helpId = target.getAttribute("data-help-id");
      if (!helpId) return;

      if (this.showTimeout) {
        clearTimeout(this.showTimeout);
        this.showTimeout = null;
      }

      this.showTimeout = setTimeout(() => {
        this.showTooltip(target, helpId);
      }, SHOW_DELAY_MS);
    }

    handleMouseLeave(event) {
      const target = event.target.closest("[data-help-id]");
      if (!target) return;

      if (this.showTimeout) {
        clearTimeout(this.showTimeout);
        this.showTimeout = null;
      }

      this.hideTooltip(false);
    }

    init() {
      this.loadHelpContent();

      document.addEventListener(
        "mouseenter",
        this.handleMouseEnter.bind(this),
        true,
      );
      document.addEventListener(
        "mouseleave",
        this.handleMouseLeave.bind(this),
        true,
      );
    }
  }

  const tooltipManager = new HelpTooltipManager();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      tooltipManager.init();
    });
  } else {
    tooltipManager.init();
  }

  window.MIMOHelpTooltipManager = tooltipManager;
})();
