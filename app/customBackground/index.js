const httpHelper = require('../helpers');
const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let customBGServiceUrl;

class CustomBackground {
    constructor(app, config) {
        this.app = app;
        this.config = config;
        if (this.isCustomBackgroundEnabled()) {
            this.downloadCustomBGServiceRemoteConfig();
            ipcMain.handle('get-custom-bg-list', this.handleGetCustomBGList);
        }
    }

    isCustomBackgroundEnabled() {
        return this.config.isCustomBackgroundEnabled;
    }

    async downloadCustomBGServiceRemoteConfig() {
        let customBGUrl;
        try {
            customBGUrl = new URL('', this.config.customBGServiceBaseUrl);
        }
        catch (err) {
            console.warning(`Failed to load custom background service configuration. ${err}. Setting Background service URL to http://localhost `);
            customBGUrl = new URL('', 'http://localhost');
        }
    
        const remotePath = httpHelper.joinURLs(customBGUrl.href, 'config.json');
        console.debug(`Fetching custom background configuration from '${remotePath}'`);
        httpHelper.getAsync(remotePath);
        if (this.config.customBGServiceConfigFetchInterval > 0) {
            setTimeout(this.downloadCustomBGServiceRemoteConfig, this.config.customBGServiceConfigFetchInterval * 1000);
        }
    }

    async handleGetCustomBGList() {
        const file = path.join(this.app.getPath('userData'), 'custom_bg_remote.json');
        if (!fs.existsSync(file)) {
            return [];
        } else {
            return JSON.parse(fs.readFileSync(file));
        }
    }

    beforeRequestHandlerRedirectUrl(details) {
        if (details.url.startsWith('https://statics.teams.cdn.office.net/evergreen-assets/backgroundimages/') && this.config.isCustomBackgroundEnabled) {
            const reqUrl = details.url.replace('https://statics.teams.cdn.office.net/evergreen-assets/backgroundimages/', '');
            const imgUrl = httpHelper.joinURLs(customBGServiceUrl.href, reqUrl);
            console.debug(`Forwarding '${details.url}' to '${imgUrl}'`);
            return { redirectURL: imgUrl };
        }
    }

    addCustomBackgroundHeaders(detail) {
        if (!this.isCustomBackgroundEnabled()) {
            return;
        } else if (detail.url.startsWith(customBGServiceUrl.href)) {
			detail.requestHeaders['Access-Control-Allow-Origin'] = '*';
		}
    }

    onHeadersReceivedHandler(details) {
        if (!this.isCustomBackgroundEnabled()) {
            return;
        } else if (details.responseHeaders['content-security-policy']) {
            const policies = details.responseHeaders['content-security-policy'][0].split(';');
            setImgSrcSecurityPolicy(policies);
            setConnectSrcSecurityPolicy(policies);
            details.responseHeaders['content-security-policy'][0] = policies.join(';');
        }
    }

    initializeCustomBGServiceURL() {
        if (!this.isCustomBackgroundEnabled()) {
            return;
        }
        try {
            customBGServiceUrl = new URL('', this.config.customBGServiceBaseUrl);
            console.debug(`Custom background service url is '${this.config.customBGServiceBaseUrl}'`);
        }
        catch (err) {
            console.error(`Invalid custom background service url '${this.config.customBGServiceBaseUrl}' \n ${err} \n Updating to default 'http://localhost'`);
            customBGServiceUrl = new URL('', 'http://localhost');
        }
    }

    isCustomBackgroundHttpProtocol() {
        return customBGServiceUrl?.protocol === 'http:';
    }

}

function setConnectSrcSecurityPolicy(policies) {
	const connectsrcIndex = policies.findIndex(f => f.indexOf('connect-src') >= 0);
	if (connectsrcIndex >= 0) {
		policies[connectsrcIndex] = policies[connectsrcIndex] + ` ${customBGServiceUrl.origin}`;
	}
}

function setImgSrcSecurityPolicy(policies) {
	const imgsrcIndex = policies.findIndex(f => f.indexOf('img-src') >= 0);
	if (imgsrcIndex >= 0) {
		policies[imgsrcIndex] = policies[imgsrcIndex] + ` ${customBGServiceUrl.origin}`;
	}
}

module.exports = CustomBackground;
