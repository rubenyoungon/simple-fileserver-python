const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const uploadBtnText = document.getElementById('uploadBtnText');
const dropZone = document.getElementById('dropZone');
const dropZoneIcon = document.getElementById('dropZoneIcon');
const dropZoneMessage = document.getElementById('dropZoneMessage');
const uploadForm = document.getElementById('uploadForm');
const csrfToken = document.querySelector('meta[name="csrf-token"]').content;

// Enable/disable upload button
fileInput.addEventListener('change', function () {
	uploadBtn.disabled = !this.files.length;
	if (this.files.length) {
		dropZoneIcon.textContent = 'check_circle';
		if (this.files.length === 1) {
			dropZoneMessage.textContent = this.files[0].name;
		} else {
			dropZoneMessage.textContent = this.files.length + ' files selected';
		}
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
	if (files.length) {
		fileInput.files = files;
		uploadBtn.disabled = false;
		dropZoneIcon.textContent = 'check_circle';
		if (files.length === 1) {
			dropZoneMessage.textContent = files[0].name;
		} else {
			dropZoneMessage.textContent = files.length + ' files selected';
		}
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
			uploadBtn.disabled = false;
			dropZoneIcon.textContent = 'check_circle';
			dropZoneMessage.textContent = fileName;

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

function handleUpload() {
	if (uploadBtn.disabled) return;

	const formData = new FormData(uploadForm);
	uploadBtn.disabled = true;
	uploadBtnText.textContent = 'Uploading...';

	fetch('/', {
		method: 'POST',
		body: formData,
		headers: {
			'X-Requested-With': 'XMLHttpRequest',
			'X-CSRFToken': csrfToken
		}
	})
		.then(response => response.json())
		.then(async data => {
			if (data.success) {
				await refreshFileList();
				// Reset form
				uploadForm.reset();
				dropZoneIcon.textContent = 'attach_file';
				dropZoneMessage.textContent = 'Drag & drop, paste (Ctrl+V), or click to browse';
				uploadBtnText.textContent = 'Upload';
			} else {
				alert('Upload failed');
				uploadBtn.disabled = false;
				uploadBtnText.textContent = 'Upload';
			}
		})
		.catch(error => {
			console.error('Error:', error);
			alert('Upload failed');
			uploadBtn.disabled = false;
			uploadBtnText.textContent = 'Upload';
		});
}

function refreshFileList() {
	return fetch('/?partial=1')
		.then(response => response.text())
		.then(html => {
			document.getElementById('fileListWrapper').innerHTML = html;
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

function deleteFile(filename) {
	if (confirm('Are you sure you want to delete ' + filename + '?')) {
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

function deleteAllFiles() {
	if (confirm('Are you sure you want to delete all files? This action cannot be undone.')) {
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
