const instance = require('./instance');

// MS function overrides
let bgMSService = null;
let bgMSMethod = null;
// eslint-disable-next-line no-unused-vars
let config = null;

function init(conf) {
	config = conf;
	instance.whenReady().then(overrideMSMethod).catch(() => {
		console.error('Failed to override MS Method');
	});
}

async function overrideMSMethod(inst) {
	bgMSService = inst.injector.get('customVideoBackgroundsService');
	bgMSMethod = bgMSService.getProvidedImagesFromCdn;
	bgMSService.getProvidedImagesFromCdn = customBGProvider;
}

async function customBGProvider(...args) {
	const ms_response = config.customBGServiceIgnoreMSDefaults ? [] : await bgMSMethod.apply(bgMSService, [...args]);
	const customList = await window.api.getCustomBgList();
	ms_response.push(...customList);
	return ms_response;
}

module.exports = init;