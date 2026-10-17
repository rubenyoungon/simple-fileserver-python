const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const uploadBtnText = document.getElementById('uploadBtnText');
const cancelUploadBtn = document.getElementById('cancelUploadBtn');
const dropZone = document.getElementById('dropZone');
const dropZoneIcon = document.getElementById('dropZoneIcon');
const dropZoneMessage = document.getElementById('dropZoneMessage');
const uploadForm = document.getElementById('uploadForm');
const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]');
const csrfTokenInput = uploadForm.querySelector('input[name="csrf_token"]');
let csrfToken = csrfTokenMeta.content;
let uploadController = null;

const errorDialog = document.getElementById('errorDialog');
const errorDialogTitleText = document.getElementById('errorDialogTitleText');
const errorDialogMessage = document.getElementById('errorDialogMessage');
const errorDialogClose = document.getElementById('errorDialogClose');

errorDialog.addEventListener('click', event => {
	if (event.target === errorDialog) {
		errorDialog.close();
	}
});

function showErrorDialog(title, message) {
	if (errorDialog.open) {
		// Another error is already showing: keep both visible instead of losing one.
		errorDialogMessage.textContent += `\n\n${title}: ${message}`;
		return;
	}
	errorDialogTitleText.textContent = title;
	errorDialogMessage.textContent = message;
	errorDialog.showModal();
	errorDialogClose.focus();
}

// Turns any failure (network, HTTP status, server-reported error) into a readable message.
function describeError(error) {
	if (error instanceof TypeError) {
		return 'Could not reach the server. Check that it is running and that you are connected, then try again.';
	}
	return error.message || String(error);
}

// Thrown when the server answers 503 because "Delete All" is running.
class ServerBusyError extends Error {
	name = 'ServerBusyError';
}

// Parses a JSON response and throws an Error carrying the server's message if the request failed.
async function readJsonResponse(response) {
	let data = null;
	try {
		data = await response.json();
	} catch {
		// Response body was not JSON (e.g. an HTML error page from a proxy).
	}

	if (response.status === 503 && data && data.busy) {
		showServerBusy();
		throw new ServerBusyError(data.error);
	}
	if (!response.ok || (data && data.success === false)) {
		const fallback = response.status === 413
			? 'The upload is too large for the server to accept.'
			: `Server responded with ${response.status}${response.statusText ? ' ' + response.statusText : ''}.`;
		throw new Error((data && data.error) || fallback);
	}
	if (data === null) {
		throw new Error('The server returned an unexpected response.');
	}
	return data;
}

async function refreshCsrfToken() {
	const response = await fetch('/api/csrf-token', { cache: 'no-store' });
	if (!response.ok) {
		throw new Error(`CSRF token refresh failed: ${response.status}`);
	}

	const data = await response.json();
	if (typeof data.csrf_token !== 'string') {
		throw new Error('CSRF token refresh returned an invalid token');
	}

	csrfToken = data.csrf_token;
	csrfTokenMeta.content = csrfToken;
	csrfTokenInput.value = csrfToken;
}

function refreshCsrfTokenSafely() {
	refreshCsrfToken().catch(error => console.error('CSRF token refresh error:', error));
}

setInterval(refreshCsrfTokenSafely, 45 * 60 * 1000);
document.addEventListener('visibilitychange', () => {
	if (!document.hidden) {
		refreshCsrfTokenSafely();
	}
});

function alignFileNamesByRow() {
	const fileNamesByRow = new Map();

	document.querySelectorAll('.file-name').forEach(fileName => {
		fileName.style.minHeight = '';
		const rowTop = Math.round(fileName.closest('li').getBoundingClientRect().top);
		const rowFileNames = fileNamesByRow.get(rowTop) || [];
		rowFileNames.push(fileName);
		fileNamesByRow.set(rowTop, rowFileNames);
	});

	fileNamesByRow.forEach(rowFileNames => {
		const rowHeight = Math.max(...rowFileNames.map(fileName => fileName.offsetHeight));
		rowFileNames.forEach(fileName => {
			fileName.style.minHeight = `${rowHeight}px`;
		});
	});
}

window.addEventListener('load', alignFileNamesByRow);
window.addEventListener('resize', alignFileNamesByRow);

function updateFileSelection(files) {
	uploadBtn.disabled = Boolean(uploadController) || !files.length;
	cancelUploadBtn.hidden = !files.length && !uploadController;

	if (!files.length) {
		dropZoneIcon.textContent = 'attach_file';
		dropZoneMessage.textContent = 'Drag & drop, paste (Ctrl+V), or click to browse';
		return;
	}

	dropZoneIcon.textContent = 'check_circle';
	dropZoneMessage.textContent = files.length === 1
		? files[0].name
		: `${files.length} files selected`;
}

// Enable/disable upload button
const allowedExtensions = fileInput.accept.split(',').map(ext => ext.trim().toLowerCase()).filter(Boolean);

function isAllowedFile(file) {
	const dot = file.name.lastIndexOf('.');
	const extension = dot === -1 ? '' : file.name.slice(dot).toLowerCase();
	return allowedExtensions.includes(extension);
}

// Shows an error and clears the selection if any file is not a photo, video or document.
function validateSelection(files) {
	const rejected = Array.from(files).filter(file => !isAllowedFile(file)).map(file => file.name);
	if (!rejected.length) {
		return true;
	}
	fileInput.value = '';
	updateFileSelection(fileInput.files);
	showErrorDialog(
		'File type not allowed',
		`Only photos, videos and documents can be uploaded. Not allowed: ${rejected.join(', ')}\n\nAllowed types: ${allowedExtensions.join(', ')}`
	);
	return false;
}

fileInput.addEventListener('change', function () {
	if (validateSelection(this.files)) {
		updateFileSelection(this.files);
	}
});

// Drag and drop handlers
dropZone.addEventListener('dragover', function (e) {
	e.preventDefault();
	e.stopPropagation();
	this.classList.add('dragover');
});

dropZone.addEventListener('dragleave', function (e) {
	e.preventDefault();
	e.stopPropagation();
	this.classList.remove('dragover');
});

dropZone.addEventListener('drop', function (e) {
	e.preventDefault();
	e.stopPropagation();
	this.classList.remove('dragover');

	const files = e.dataTransfer.files;
	if (files.length && validateSelection(files)) {
		fileInput.files = files;
		updateFileSelection(fileInput.files);
	}
});

// Paste handler for images
document.addEventListener('paste', function (e) {
	const items = e.clipboardData.items;

	for (const item of items) {
		if (item.type.includes('image')) {
			e.preventDefault();

			const blob = item.getAsFile();
			const timestamp = Date.now();
			const fileName = `pasted-image-${timestamp}.png`;

			// Create a new File object with a proper name
			const file = new File([blob], fileName, { type: blob.type });

			// Create a DataTransfer object to set the file input
			const dataTransfer = new DataTransfer();
			dataTransfer.items.add(file);
			fileInput.files = dataTransfer.files;

			// Update UI
			updateFileSelection(fileInput.files);

			// Focus on the drop zone to give visual feedback
			dropZone.style.backgroundColor = '#e3f2fd';
			setTimeout(() => {
				dropZone.style.backgroundColor = '';
			}, 500);

			break;
		}
	}
});

// Enter key to submit
document.addEventListener('keydown', function (e) {
	// Check for Enter key and not in a text input/textarea
	if (e.key === 'Enter' && !uploadBtn.disabled) {
		const activeElement = document.activeElement;
		// Only submit if we're not in an input field
		if (activeElement.tagName !== 'INPUT' && activeElement.tagName !== 'TEXTAREA') {
			e.preventDefault();
			handleUpload();
		}
	}
});

// Alternative: Listen for Enter on the upload button itself
uploadBtn.addEventListener('keydown', function (e) {
	if (e.key === 'Enter' && !this.disabled) {
		e.preventDefault();
		handleUpload();
	}
});

uploadForm.addEventListener('submit', function (e) {
	e.preventDefault();
	handleUpload();
});

cancelUploadBtn.addEventListener('click', function () {
	if (uploadController) {
		uploadController.abort();
		return;
	}

	fileInput.value = '';
	updateFileSelection(fileInput.files);
});

function handleUpload() {
	if (uploadBtn.disabled || uploadController) return;

	const formData = new FormData(uploadForm);
	uploadController = new AbortController();
	uploadBtn.disabled = true;
	uploadBtnText.textContent = 'Uploading...';
	cancelUploadBtn.hidden = false;

	fetch('/', {
		method: 'POST',
		body: formData,
		signal: uploadController.signal,
		headers: {
			'X-Requested-With': 'XMLHttpRequest',
			'X-CSRFToken': csrfToken
		}
	})
		.then(readJsonResponse)
		.then(async () => {
			uploadController = null;
			await refreshFileList();
			// Reset form
			uploadForm.reset();
			dropZoneIcon.textContent = 'attach_file';
			dropZoneMessage.textContent = 'Drag & drop, paste (Ctrl+V), or click to browse';
			uploadBtnText.textContent = 'Upload';
			uploadBtn.disabled = true;
		})
		.catch(error => {
			uploadController = null;
			uploadBtn.disabled = !fileInput.files.length;
			uploadBtnText.textContent = 'Upload';
			if (error.name === 'AbortError') {
				return;
			}
			console.error('Upload error:', error);
			showErrorDialog('Upload failed', describeError(error));
		})
		.finally(() => {
			uploadController = null;
			cancelUploadBtn.hidden = !fileInput.files.length;
		});
}

function refreshFileList() {
	return fetch('/?partial=1', { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
		.then(async response => {
			if (response.status === 503) {
				await readJsonResponse(response);
			}
			if (!response.ok) {
				throw new Error(`Server responded with ${response.status}${response.statusText ? ' ' + response.statusText : ''}.`);
			}
			return response.text();
		})
		.then(html => {
			document.getElementById('fileListWrapper').innerHTML = html;
			alignFileNamesByRow();
			return updateDiskSpace();
		})
		.catch(error => {
			console.error('File list refresh error:', error);
			if (error instanceof ServerBusyError) return;
			showErrorDialog('Failed to refresh files', describeError(error));
		});
}

function updateDiskSpace() {
	return fetch('/api/disk-space')
		.then(readJsonResponse)
		.then(data => {
			document.getElementById('freeSpace').textContent = data.free;
		})
		.catch(error => {
			console.error('Disk space update error:', error);
			if (error instanceof ServerBusyError) return;
			showErrorDialog('Failed to update disk space', describeError(error));
		});
}

const confirmDialog = document.getElementById('confirmDialog');
const confirmDialogMessage = document.getElementById('confirmDialogMessage');
const confirmDialogConfirm = document.getElementById('confirmDialogConfirm');
const confirmDialogCancel = document.getElementById('confirmDialogCancel');

function showConfirmDialog(message) {
	return new Promise(resolve => {
		confirmDialogMessage.textContent = message;

		const finish = result => {
			confirmDialogConfirm.removeEventListener('click', onConfirm);
			confirmDialogCancel.removeEventListener('click', onCancel);
			confirmDialog.removeEventListener('cancel', onCancel);
			confirmDialog.removeEventListener('click', onBackdropClick);
			confirmDialog.close();
			resolve(result);
		};
		const onConfirm = () => finish(true);
		const onCancel = e => {
			e.preventDefault();
			finish(false);
		};

		confirmDialogConfirm.addEventListener('click', onConfirm);
		confirmDialogCancel.addEventListener('click', onCancel);
		confirmDialog.addEventListener('cancel', onCancel);
		confirmDialog.addEventListener('click', onBackdropClick);
		confirmDialog.showModal();
		confirmDialogCancel.focus();

		function onBackdropClick(event) {
			if (event.target === confirmDialog) {
				finish(false);
			}
		}
	});
}

async function deleteFile(filename) {
	if (await showConfirmDialog('Are you sure you want to delete ' + filename + '?')) {
		fetch('/delete/' + encodeURIComponent(filename), {
			method: 'POST',
			headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-CSRFToken': csrfToken }
		})
			.then(readJsonResponse)
			.then(() => refreshFileList())
			.catch(error => {
				console.error('Delete error:', error);
				showErrorDialog(`Failed to delete ${filename}`, describeError(error));
			});
	}
}

async function deleteAllFiles() {
	if (!await showConfirmDialog('Are you sure you want to delete all files? This action cannot be undone.')) {
		return;
	}

	const deleteBtn = document.getElementById('deleteAllBtn');
	deleteBtn.disabled = true;
	deletingLocally = true;
	showBusyDialog('Deleting files...', 'Starting...');

	fetch('/delete-all', {
		method: 'POST',
		headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-CSRFToken': csrfToken }
	})
		.then(readJsonResponse)
		.then(() => scheduleDeletionStatusCheck(0))
		.catch(err => {
			console.error('Delete all error:', err);
			deletingLocally = false;
			deleteBtn.disabled = false;
			if (err instanceof ServerBusyError) {
				// Someone else started a deletion first: keep showing their progress.
				showServerBusy();
				return;
			}
			hideBusyDialog();
			showErrorDialog('Failed to delete all files', describeError(err));
		});
}

// Loading dialog shown while "Delete All" runs, both to the user who started it and to everyone else.
const busyDialog = document.getElementById('busyDialog');
const busyDialogTitle = document.getElementById('busyDialogTitle');
const busyDialogMessage = document.getElementById('busyDialogMessage');
const busyDialogProgress = document.getElementById('busyDialogProgress');
const successDialog = document.getElementById('successDialog');
const successDialogTitleText = document.getElementById('successDialogTitleText');
const successDialogMessage = document.getElementById('successDialogMessage');
const successDialogClose = document.getElementById('successDialogClose');

const IDLE_STATUS_INTERVAL = 3000;
const BUSY_STATUS_INTERVAL = 1000;
const FAILED_STATUS_RETRY = 2000;
let deletingLocally = false;
let busyActive = false;
let deletionStatusTimer = null;

// The dialog cannot be dismissed while the server is busy.
busyDialog.addEventListener('cancel', event => event.preventDefault());
busyDialog.addEventListener('close', () => {
	if (busyActive) {
		busyDialog.showModal();
	}
});

function showBusyDialog(title, message) {
	busyActive = true;
	busyDialogTitle.textContent = title;
	busyDialogMessage.textContent = message;
	busyDialogProgress.removeAttribute('value');
	if (!busyDialog.open) {
		busyDialog.showModal();
	}
}

function hideBusyDialog() {
	busyActive = false;
	busyDialog.close();
}

function showServerBusy() {
	if (!busyActive) {
		showBusyDialog('Server busy', 'All files are being deleted. Please wait...');
	}
	scheduleDeletionStatusCheck(BUSY_STATUS_INTERVAL);
}

function showDeletionProgress(status) {
	if (deletingLocally) {
		showBusyDialog('Deleting files...', status.total > 0
			? `${status.deleted} of ${status.total} files deleted`
			: 'Starting...');
	} else {
		showBusyDialog('Server busy', status.total > 0
			? `All files are being deleted (${status.deleted} of ${status.total}). Please wait...`
			: 'All files are being deleted. Please wait...');
	}
	if (status.total > 0) {
		busyDialogProgress.value = Math.round((status.deleted / status.total) * 100);
	}
}

async function finishDeletion(status) {
	const startedHere = deletingLocally;
	deletingLocally = false;
	hideBusyDialog();
	await refreshFileList();

	if (!startedHere) {
		return;
	}
	if (status.error) {
		showErrorDialog('Deletion encountered an error', status.error);
	} else if (status.deleted < status.total) {
		const failed = status.total - status.deleted;
		showErrorDialog('Some files were not deleted', `Could not delete ${failed} of ${status.total} file(s). They may be in use; try again.`);
	} else {
		successDialogTitleText.textContent = 'All files deleted';
		successDialogMessage.textContent = status.total === 1
			? '1 file was deleted.'
			: `${status.total} files were deleted.`;
		successDialog.showModal();
		successDialogClose.focus();
	}
}

function scheduleDeletionStatusCheck(delay) {
	clearTimeout(deletionStatusTimer);
	deletionStatusTimer = setTimeout(checkDeletionStatus, delay);
}

// Polls slowly while idle so other users notice a deletion, and quickly while one is running.
function checkDeletionStatus() {
	if (document.hidden && !busyActive) {
		// Resumed by the visibilitychange listener.
		return;
	}

	fetch('/api/deletion-status', { cache: 'no-store' })
		.then(readJsonResponse)
		.then(async status => {
			if (status.in_progress) {
				showDeletionProgress(status);
				scheduleDeletionStatusCheck(BUSY_STATUS_INTERVAL);
				return;
			}
			if (busyActive || deletingLocally) {
				await finishDeletion(status);
			}
			scheduleDeletionStatusCheck(IDLE_STATUS_INTERVAL);
		})
		.catch(err => {
			console.error('Status check error:', err);
			scheduleDeletionStatusCheck(busyActive ? FAILED_STATUS_RETRY : IDLE_STATUS_INTERVAL);
		});
}

document.addEventListener('visibilitychange', () => {
	if (!document.hidden) {
		scheduleDeletionStatusCheck(0);
	}
});
scheduleDeletionStatusCheck(0);
