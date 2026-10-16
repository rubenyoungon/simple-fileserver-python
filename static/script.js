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
fileInput.addEventListener('change', function () {
	updateFileSelection(this.files);
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
	if (files.length) {
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
		.then(response => {
			uploadController = null;
			return response.json();
		})
		.then(async data => {
			if (data.success) {
				await refreshFileList();
				// Reset form
				uploadForm.reset();
				dropZoneIcon.textContent = 'attach_file';
				dropZoneMessage.textContent = 'Drag & drop, paste (Ctrl+V), or click to browse';
				uploadBtnText.textContent = 'Upload';
				uploadBtn.disabled = true;
			} else {
				alert('Upload failed');
				uploadBtn.disabled = !fileInput.files.length;
				uploadBtnText.textContent = 'Upload';
			}
		})
		.catch(error => {
			if (error.name === 'AbortError') {
				uploadBtn.disabled = !fileInput.files.length;
				uploadBtnText.textContent = 'Upload';
				return;
			}
			console.error('Error:', error);
			alert('Upload failed');
			uploadBtn.disabled = !fileInput.files.length;
			uploadBtnText.textContent = 'Upload';
		})
		.finally(() => {
			uploadController = null;
			cancelUploadBtn.hidden = !fileInput.files.length;
		});
}

function refreshFileList() {
	return fetch('/?partial=1')
		.then(response => response.text())
		.then(html => {
			document.getElementById('fileListWrapper').innerHTML = html;
			alignFileNamesByRow();
			return updateDiskSpace();
		})
		.catch(error => {
			console.error('File list refresh error:', error);
			alert('Failed to refresh files');
		});
}

function updateDiskSpace() {
	return fetch('/api/disk-space')
		.then(response => response.json())
		.then(data => {
			document.getElementById('freeSpace').textContent = data.free;
		})
		.catch(error => {
			console.error('Disk space update error:', error);
			alert('Failed to update disk space');
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
			headers: { 'X-CSRFToken': csrfToken }
		})
			.then(response => response.json())
			.then(async data => {
				if (data.success) {
					await refreshFileList();
				} else {
					alert('Failed to delete: ' + (data.error || 'Unknown error'));
				}
			})
			.catch(error => {
				console.error('Error:', error);
				alert('Failed to delete file');
			});
	}
}

async function deleteAllFiles() {
	if (await showConfirmDialog('Are you sure you want to delete all files? This action cannot be undone.')) {
		const deleteBtn = document.getElementById('deleteAllBtn');
		deleteBtn.disabled = true;
		deleteBtn.querySelector('.button-label').textContent = 'Deleting...';

		fetch('/delete-all', {
			method: 'POST',
			headers: { 'X-CSRFToken': csrfToken }
		})
			.then(r => r.json())
			.then(data => {
				if (data.success) {
					pollDeletionStatus();
				} else {
					alert('Failed to start deletion: ' + (data.error || 'Unknown error'));
					deleteBtn.disabled = false;
					deleteBtn.querySelector('.button-label').textContent = 'Delete All';
				}
			})
			.catch(err => {
				console.error('Error:', err);
				alert('Failed to delete all files');
				deleteBtn.disabled = false;
				deleteBtn.querySelector('.button-label').textContent = 'Delete All';
			});
	}
}

function pollDeletionStatus() {
	const deleteBtn = document.getElementById('deleteAllBtn');

	fetch('/api/deletion-status')
		.then(r => r.json())
		.then(async status => {
			if (status.in_progress) {
				const percent = status.total > 0 ? Math.round((status.deleted / status.total) * 100) : 0;
				deleteBtn.querySelector('.button-label').textContent = `Deleting... (${percent}%)`;
				setTimeout(pollDeletionStatus, 1000);
			} else {
				if (status.error) {
					alert('Deletion encountered an error: ' + status.error);
				}
				await refreshFileList();
				deleteBtn.querySelector('.button-label').textContent = 'Delete All';
				// Button will be disabled by refreshFileList if no files left
			}
		})
		.catch(err => {
			console.error('Status check error:', err);
			setTimeout(pollDeletionStatus, 2000);
		});
}
