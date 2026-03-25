const fs = require("node:fs");
const path = require("node:path");

const defaultHiddenSelectors = [
  "[data-tid='more-options-menu-download-mobile-apps']",
  "#download-app-button",
  "#get-app-button",
  "[data-tid^='more-options-menu-premium-button']",
  "[data-tid='more-options-header'] > div:first-child",
  "[data-tid='more-options-header'] > span:not(.fui-Button__icon)",
  "[data-tid^='more-options-menu-premium-button'] + div.fui-MenuDivider"
].join(", ");
const hiddenSelectorsCss = `${defaultHiddenSelectors} { display: none !important; }`;
const moreOptionsHeaderLayoutCss = "[data-tid='more-options-header'] { min-width: 0 !important; width: auto !important; gap: 0 !important; }";
const moreOptionsHeaderIconCss = "[data-tid='more-options-header'] > .fui-Button__icon { margin-left: 0 !important; }";
const premiumMenuSeparatorCss = "[data-tid^='more-options-menu-premium-button'] + [role='separator'] { display: none !important; }";
const premiumMenuTopBorderCss = "[data-tid^='more-options-menu-premium-button'] + [role='menuitem'] { border-top: none !important; margin-top: 0 !important; }";
const defaultHideCss = `${hiddenSelectorsCss}\n${moreOptionsHeaderLayoutCss}\n${moreOptionsHeaderIconCss}\n${premiumMenuSeparatorCss}\n${premiumMenuTopBorderCss}`;
const zoetropeCss = ".zoetrope { animation-iteration-count: 1 !important; }";
const microsoftLoginHosts = [
  "login.microsoftonline.com",
  "login.live.com",
  "login.microsoft.com",
  "account.microsoft.com"
];
const loginFontFixCss = "html, body, div, span, p, label, a, input, button, select, textarea, #loginHeader, #loginHeader [role='heading'], .ext-title, .ext-title * { font-family: 'Segoe UI', 'Noto Sans', 'Helvetica Neue', Arial, sans-serif !important; }";

exports.onDidFinishLoad = function onDidFinishLoad(content, config) {
  const customCssLocation = getCustomCssLocation(config);
  if (customCssLocation) {
    applyCustomCSSToContent(content, customCssLocation);
  }
  applyDefaultCSSToContent(content);
};

exports.onDidFrameFinishLoad = function onDidFrameFinishLoad(webFrame, config) {
  const customCssLocation = getCustomCssLocation(config);
  if (customCssLocation) {
    applyCustomCSSToFrame(webFrame, customCssLocation);
  }
  applyDefaultCSSToFrame(webFrame);
};

function getCustomCssLocation(config) {
  if (config.customCSSName) {
    return path.join(__dirname, "assets", "css", config.customCSSName + ".css");
  } else if (config.customCSSLocation) {
    return config.customCSSLocation;
  }
  return null;
}

function applyCustomCSSToContent(content, cssLocation) {
  fs.readFile(cssLocation, "utf-8", (error, data) => {
    if (!error) {
      content.insertCSS(data);
    }
  });
}

function applyDefaultCSSToContent(content) {
  content.insertCSS(defaultHideCss);
  content.insertCSS(zoetropeCss);

  if (shouldApplyMicrosoftLoginFontFix(content)) {
    content.insertCSS(loginFontFixCss);
  }
}

/**
 * Applies custom CSS to iframe-based content for Teams V2.
 * Teams V2 uses iframes for the main view where content.insertCSS() doesn't work,
 * so we inject <style> elements directly into the DOM using JavaScript execution.
 * This is a workaround for iframe CSS isolation in Electron.
 *
 * @param {Electron.WebFrameMain} webFrame - The iframe's web frame
 * @param {string} cssLocation - Path to the CSS file to inject
 */
function applyCustomCSSToFrame(webFrame, cssLocation) {
  const customCssId = "tfl-custom-css-style";

  fs.readFile(cssLocation, "utf-8", (error, data) => {
    if (error) {
      return;
    }

    data = data.replaceAll("`", String.raw`\u0060`);

    webFrame.executeJavaScript(`
			if(!document.getElementById("${customCssId}")) {
				const style = document.createElement('style');
				style.id = "${customCssId}";
				style.type = "text/css";
				style.textContent = ${JSON.stringify(data)};
				document.head.appendChild(style);
			}
		`);
  });
}

function applyDefaultCSSToFrame(webFrame) {
  const cssContent = JSON.stringify(`${defaultHideCss}\n${zoetropeCss}`);
  const loginCssContent = JSON.stringify(loginFontFixCss);
  webFrame.executeJavaScript(`
			if (!document.getElementById("tfl-default-css-style")) {
				const style = document.createElement('style');
				style.id = "tfl-default-css-style";
				style.type = "text/css";
				style.textContent = ${cssContent};
				document.head.appendChild(style);
			}

      if ((location.hostname === "login.microsoftonline.com" || location.hostname.endsWith(".microsoftonline.com") || location.hostname === "login.live.com" || location.hostname === "login.microsoft.com" || location.hostname === "account.microsoft.com") && !document.getElementById("tfl-login-font-fix-style")) {
        const loginStyle = document.createElement('style');
        loginStyle.id = "tfl-login-font-fix-style";
        loginStyle.type = "text/css";
        loginStyle.textContent = ${loginCssContent};
        document.head.appendChild(loginStyle);
      }
		`);
}

function shouldApplyMicrosoftLoginFontFix(content) {
  if (!content || typeof content.getURL !== "function") {
    return false;
  }

  let hostname;
  try {
    ({ hostname } = new URL(content.getURL()));
  } catch {
    return false;
  }

  return hostname === "login.microsoftonline.com" || hostname.endsWith(".microsoftonline.com") || microsoftLoginHosts.includes(hostname);
}
