const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const dropZone = document.getElementById('dropZone');
const dropZoneText = dropZone.querySelector('.drop-zone-text');
const uploadForm = document.getElementById('uploadForm');

// Enable/disable upload button
fileInput.addEventListener('change', function() {
  uploadBtn.disabled = !this.files.length;
  if (this.files.length) {
    dropZoneText.textContent = '✅ ' + this.files[0].name;
  }
});

// Click to browse
dropZone.addEventListener('click', function() {
  fileInput.click();
});

// Drag and drop handlers
dropZone.addEventListener('dragover', function(e) {
  e.preventDefault();
  e.stopPropagation();
  this.classList.add('dragover');
});

dropZone.addEventListener('dragleave', function(e) {
  e.preventDefault();
  e.stopPropagation();
  this.classList.remove('dragover');
});

dropZone.addEventListener('drop', function(e) {
  e.preventDefault();
  e.stopPropagation();
  this.classList.remove('dragover');

  const files = e.dataTransfer.files;
  if (files.length) {
    fileInput.files = files;
    uploadBtn.disabled = false;
    dropZoneText.textContent = '✅ ' + files[0].name;
  }
});

// Paste handler for images
document.addEventListener('paste', function(e) {
  const items = e.clipboardData.items;

  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      e.preventDefault();

      const blob = items[i].getAsFile();
      const timestamp = new Date().getTime();
      const fileName = `pasted-image-${timestamp}.png`;

      // Create a new File object with a proper name
      const file = new File([blob], fileName, { type: blob.type });

      // Create a DataTransfer object to set the file input
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;

      // Update UI
      uploadBtn.disabled = false;
      dropZoneText.textContent = '✅ ' + fileName;

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
document.addEventListener('keydown', function(e) {
  // Check for Enter key and not in a text input/textarea
  if (e.key === 'Enter' && !uploadBtn.disabled) {
    const activeElement = document.activeElement;
    // Only submit if we're not in an input field
    if (activeElement.tagName !== 'INPUT' && activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      uploadForm.submit();
    }
  }
});

// Alternative: Listen for Enter on the upload button itself
uploadBtn.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !this.disabled) {
    e.preventDefault();
    uploadForm.submit();
  }
});

function deleteFile(filename) {
  if (confirm('Are you sure you want to delete ' + filename + '?')) {
    fetch('/delete/' + encodeURIComponent(filename), {
      method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        location.reload();
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
    fetch('/delete-all', { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          location.reload();
        } else {
          alert('Failed to delete all: ' + (data.error || 'Unknown error'));
        }
      })
      .catch(err => {
        console.error('Error:', err);
        alert('Failed to delete all files');
      });
  }
}
