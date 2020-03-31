const {ipcRenderer, desktopCapturer, remote} = require('electron');
const $ = require('jquery');
const {screen} = remote;
const config = require('./config');

const win = remote.getCurrentWindow();
const screenshotHelper = require('./screenshot.js');
const iracing = require('./node-irsdk').getInstance();
const {width, height} = screen.getPrimaryDisplay().bounds;

const homedir = require('os').homedir();

const fs = require('fs');

const dir = homedir + '\\Pictures\\Screenshots\\';

let iRacingWindowSource = null;

const jimpWorker = new Worker('./workers/jimp-worker.js');
const imageLoaderWorker = new Worker('./workers/image-loader.worker.js');

jimpWorker.addEventListener('message', e => {
	addImage(e.data);
});

loadState();

document.querySelector('#resolution').addEventListener('change', () => {
	resolutionChange();
}, false);

function resolutionChange() {
	const resolution = document.querySelector('#resolution');
	const {value} = resolution.options[resolution.selectedIndex];
	config.set('resolution', resolution.selectedIndex);
	if (value === 'Custom') {
		$('#custom-resolution').show();
	} else {
		$('#custom-resolution').hide();
	}
}

document.querySelector('#crop').addEventListener('change', () => {
	config.set('crop', document.querySelector('#crop').checked);
}, false);

document.querySelector('#custom-width').addEventListener('change', e => {
	config.set('customWidth', e.target.value);
}, false);

document.querySelector('#custom-height').addEventListener('change', e => {
	config.set('customHeight', e.target.value);
}, false);

loadGallery();

ipcRenderer.on('updateMemory', (event, arg) => {
	document.querySelector('#memory-free').textContent = arg.free;
});

document.querySelector('#screenshot-button').addEventListener('click', async () => {
	const resolution = document.querySelector('#resolution');
	const crop = document.querySelector('#crop').checked;
	const {value} = resolution.options[resolution.selectedIndex];
	const args = {resolution: value, crop};
	iRacingWindowSource = null;
	await	desktopCapturer
		.getSources({types: ['window', 'screen']})
		.then(async sources => {
			for (const source of sources) {
				if (source.name === 'iRacing.com Simulator') {
					iRacingWindowSource = source;
				}
			}
		});

	let w = 0;
	let h = 0;

	switch (args.resolution) {
		case '1080p':
			w = 1920;
			h = 1080;
			break;
		case '2k':
			w = 2560;
			h = 1440;
			break;
		case '4k':
			w = 3840;
			h = 2160;
			break;
		case '5k':
			w = 5120;
			h = 2880;
			break;
		case '6k':
			w = 6400;
			h = 3600;
			break;
		case '7k':
			w = 7168;
			h = 4032;
			break;
		case '8k':
			w = 7680;
			h = 4320;
			break;
		case 'Custom':
			w = parseInt(document.querySelector('#custom-width').value, 10);
			h = parseInt(document.querySelector('#custom-height').value, 10);
			break;
		default:
			w = 1920;
			h = 1080;
	}

	if (crop) {
		w += 54;
		h += 30;
	}

	if (iRacingWindowSource === null) {
		showError('iRacing Not Running!');
	} else {
		screenshotHelper.screenshot(w, h);
		fullscreenScreenshot(base64data => {
			saveImage(base64data, args.crop);
		}, 'image/png');
	}
});

function showError(errorMessage) {
	document.querySelector('#error-message').innerHTML = errorMessage;
	$('#errorModal').modal('show');
}

function saveImage(base64data, crop) {
	const base64Data = base64data.replace(/^data:image\/png;base64,/, '');
	const fileName = dir + getFileNameString();

	require('fs').writeFile(fileName, base64Data, 'base64', err => {
		if (err) {
			console.log(err);
		}

		if (crop) {
			jimpWorker.postMessage(fileName);
		} else {
			addImage(fileName);
		}
	});
}

function addImage(fileName) {
	screenshotHelper.resize(width, height);
	addImageToGallery(fileName.replace(/\\/g, '/'));
}

function getFileNameString() {
	const trackName = iracing.sessionInfo.data.WeekendInfo.TrackDisplayShortName;
	let driverName = '';
	iracing.sessionInfo.data.DriverInfo.Drivers.forEach(item => {
		if (iracing.telemetry.values.CamCarIdx === item.CarIdx) {
			driverName = item.UserName;
		}
	});

	const now = new Date();
	return trackName + '-' + driverName + '-' + now.getTime() + '.png';
}

document.querySelector('#motion').addEventListener('click', () => {
	desktopCapturer
		.getSources({types: ['window', 'screen']})
		.then(async sources => {
			for (const source of sources) {
				if (source.name === 'iRacing.com Simulator') {
					iRacingWindowSource = source;
				}
			}
		});
	motionScreenshot(base64data => {
		base64data.forEach((item, i) => {
			const base64Data = item.replace(/^data:image\/png;base64,/, '');
			const fileName = 'C:\\Users\\savag\\Pictures\\Screenshots\\' + i + '.png';
			require('fs').writeFile(fileName, base64Data, 'base64', err => {
				if (err) {
					console.log(err);
				}
			});
		});
	}, 'image/png');
	ipcRenderer.send('motion');
});

const screenshot = document.querySelector('#screenshot');
screenshot.addEventListener('load', () => {
	screenshot.style.visibility = 'visible';
	screenshot.style.opacity = 1;
});

function addImageToGallery(src) {
	const image = document.createElement('img');

	image.dataset.src = src;
	image.setAttribute('class', 'img m-1');
	image.setAttribute('width', '200px');
	image.setAttribute('style', 'object-fit:contain;cursor: pointer;  opacity: 0; -webkit-transition: opacity 0.5s ease;-moz-transition: opacity 0.5s ease;-ms-transition: opacity 0.5s ease;-o-transition: opacity 0.5s ease;transition: opacity 0.5s ease;');
	image.style.visibility = 'hidden';
	image.addEventListener('load', () => {
		image.style.visibility = 'visible';
		image.style.opacity = 1;
	});
	image.addEventListener('click', () => {
		selectImage(src, image);
	});

	document.querySelector('#gallery').prepend(image);

	imageLoaderWorker.postMessage(src);
	selectImage(src, image);
}

const {shell} = require('electron');
const sizeOf = require('image-size');

function selectImage(arg, image) {
	const dimensions = sizeOf(arg);
	document.querySelector('#screenshot').dataset.src = arg;
	imageLoaderWorker.postMessage(arg);

	document.querySelector('#file-name').innerHTML = arg
		.split(/[\\/]/)
		.pop();

	document.querySelector('#file-resolution').innerHTML =
	dimensions.width + ' x ' + dimensions.height;
	recreateNode(document.querySelector('#open-ps'));
	recreateNode(document.querySelector('#open-external'));
	recreateNode(document.querySelector('#open-folder'));
	recreateNode(document.querySelector('#delete'));
	document.querySelector('#open-ps').addEventListener('click', () => {
		const {exec} = require('child_process');
		const executablePath =
		'C:\\Program Files\\Adobe\\Adobe Photoshop 2020\\';
		const parameters = [arg];
		exec('cd ' + executablePath + ' && start Photoshop.exe ' + parameters);
	});
	document.querySelector('#open-external').addEventListener('click', () => {
		shell.openItem(arg);
	});
	document.querySelector('#open-folder').addEventListener('click', () => {
		const file = arg.replace(/\//g, '\\');
		shell.showItemInFolder(file);
	});
	document.querySelector('#delete').addEventListener('click', () => {
		const file = arg.replace(/\//g, '\\');
		document.querySelector('#screenshot').setAttribute('src', '');
		document.querySelector('#info-controls').style.visibility = 'hidden';
		if (image.nextSibling !== null) {
			image.nextSibling.dispatchEvent(new MouseEvent('click'));
		}

		image.remove();
		shell.moveItemToTrash(file);
	});

	document.querySelector('#info-controls').style.visibility = 'visible';
}

function recreateNode(el, withChildren) {
	if (withChildren) {
		el.parentNode.replaceChild(el.cloneNode(true), el);
	} else {
		const newEl = el.cloneNode(false);
		while (el.hasChildNodes()) {
			newEl.append(el.firstChild);
		}

		el.parentNode.replaceChild(newEl, el);
	}
}

async function motionScreenshot(callback, imageFormat) {
	const _this = this;
	this.callback = callback;
	imageFormat = imageFormat || 'image/jpeg';

	this.handleStream = stream => {
		// Create hidden video tag
		const video = document.createElement('video');
		video.style.cssText = 'position:absolute;top:-10000px;left:-10000px;';

		// Event connected to stream
		video.addEventListener('loadedmetadata', function () {
			// Set video ORIGINAL height (screenshot)
			video.style.height = this.videoHeight + 'px'; // VideoHeight
			video.style.width = this.videoWidth + 'px'; // VideoWidth

			video.play();

			// Create canvas
			const canvas = document.createElement('canvas');
			canvas.width = this.videoWidth;
			canvas.height = this.videoHeight;
			const ctx = canvas.getContext('2d');
			// Draw video on canvas
			ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

			const array = [];
			for (let i = 0; i < 5; i++) {
				array.push(canvas.toDataURL(imageFormat));
				ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
			}

			if (_this.callback) {
				// Save screenshot to base64
				_this.callback(array);
			} else {
				console.log('Need callback!');
			}

			// Remove hidden video tag
			video.remove();
			try {
				// Destroy connect to stream
				stream.getTracks()[0].stop();
			} catch (error) {
				console.log(error);
			}
		});

		video.srcObject = stream;
		document.body.append(video);
	};

	this.handleError = function (e) {
		console.log(e);
	};

	const source = iRacingWindowSource;
	if (source.name === 'iRacing.com Simulator') {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: false,
				video: {
					mandatory: {
						chromeMediaSource: 'desktop',
						chromeMediaSourceId: source.id,
						minWidth: 1280,
						maxWidth: 10000,
						minHeight: 720,
						maxHeight: 10000
					}
				}
			});
			_this.handleStream(stream);
		} catch (error) {
			_this.handleError(error);
		}
	}
}

async function fullscreenScreenshot(callback, imageFormat) {
	const _this = this;
	this.callback = callback;
	imageFormat = imageFormat || 'image/jpeg';

	this.handleStream = stream => {
		// Create hidden video tag
		const video = document.createElement('video');
		video.style.cssText = 'position:absolute;top:-10000px;left:-10000px;';

		// Event connected to stream
		video.addEventListener('loadedmetadata', function () {
			// Set video ORIGINAL height (screenshot)
			video.style.height = this.videoHeight + 'px'; // VideoHeight
			video.style.width = this.videoWidth + 'px'; // VideoWidth

			video.play();

			// Create canvas
			const canvas = document.createElement('canvas');
			canvas.width = this.videoWidth;
			canvas.height = this.videoHeight;
			const ctx = canvas.getContext('2d');
			// Draw video on canvas
			ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

			if (_this.callback) {
				// Save screenshot to base64
				_this.callback(canvas.toDataURL(imageFormat));
			} else {
				console.log('Need callback!');
			}

			// Remove hidden video tag
			video.remove();
			try {
				// Destroy connect to stream
				stream.getTracks()[0].stop();
			} catch (error) {
				console.log(error);
			}
		});

		video.srcObject = stream;
		document.body.append(video);
	};

	this.handleError = function (e) {
		console.log(e);
	};

	const source = iRacingWindowSource;
	if (source.name === 'iRacing.com Simulator') {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: false,
				video: {
					mandatory: {
						chromeMediaSource: 'desktop',
						chromeMediaSourceId: source.id,
						minWidth: 1280,
						maxWidth: 10000,
						minHeight: 720,
						maxHeight: 10000
					}
				}
			});
			_this.handleStream(stream);
		} catch (error) {
			_this.handleError(error);
		}
	}
}

// When document has loaded, initialise
document.onreadystatechange = () => {
	if (document.readyState === 'complete') {
		handleWindowControls();
	}
};

window.addEventListener('beforeunload', () => {
	/* If window is reloaded, remove win event listeners
	(DOM element listeners get auto garbage collected but not
	Electron win listeners as the win is not dereferenced unless closed) */
	win.removeAllListeners();
});

function handleWindowControls() {
	// Make minimise/maximise/restore/close buttons work when they are clicked
	document.querySelector('#min-button').addEventListener('click', () => {
		win.minimize();
	});

	document.querySelector('#max-button').addEventListener('click', () => {
		win.maximize();
	});

	document.querySelector('#restore-button').addEventListener('click', () => {
		win.unmaximize();
	});

	document.querySelector('#close-button').addEventListener('click', () => {
		win.close();
	});

	// Toggle maximise/restore buttons when maximisation/unmaximisation occurs
	toggleMaxRestoreButtons();
	win.on('maximize', toggleMaxRestoreButtons);
	win.on('unmaximize', toggleMaxRestoreButtons);

	function toggleMaxRestoreButtons() {
		if (win.isMaximized()) {
			document.body.classList.add('maximized');
		} else {
			document.body.classList.remove('maximized');
		}
	}
}

$(() => {
	$('[data-toggle="tooltip"]').tooltip();
});

function loadState() {
	document.querySelector('#resolution').selectedIndex = config.get('resolution');
	resolutionChange();
	document.querySelector('#crop').checked = config.get('crop');
	document.querySelector('#custom-width').value = config.get('customWidth');
	document.querySelector('#custom-height').value = config.get('customHeight');
}

async function loadGallery() {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir);
	}

	// Load images from screenshots Folder
	await fs.readdir(dir, (err, files) => {
		if (err) {
			console.log(err);
		}

		files = files.map(fileName => {
			return {
				name: fileName,
				time: fs.statSync(dir + '/' + fileName).mtime.getTime()
			};
		})
			.sort((a, b) => {
				return a.time - b.time;
			})
			.map(v => {
				return v.name;
			});

		files.forEach(async file => {
			if (file.split('.').pop() === 'png') {
				let url = dir + file;
				url = url.replace(/\\/g, '/');
				addImageToGallery(url);
			}
		});
	});
}

imageLoaderWorker.addEventListener('message', event => {
	const imageData = event.data;
	const imageElements = document.querySelectorAll('img[data-src="' + event.data.imageURL + '"]');

	const objectURL = URL.createObjectURL(imageData.blob);
	imageElements.forEach(imageElement => {
		imageElement.addEventListener('load', () => {
			imageElement.removeAttribute('data-src');
			URL.revokeObjectURL(objectURL);
		});

		imageElement.setAttribute('src', objectURL);
	});
});
