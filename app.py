from flask import Flask, request, send_from_directory, render_template, redirect, url_for, jsonify
import os
import uuid
import shutil
import threading
import time

app = Flask(__name__)
UPLOAD_FOLDER = './uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Global variable to store disk space info
disk_space_info = {"free": "Calculating...", "total": "Calculating...", "percent": 0}

# Configuration for update interval (in seconds)
DISK_SPACE_UPDATE_INTERVAL = 60  # Update every 60 seconds - customize this as needed

def format_bytes(bytes):
    """Convert bytes to human readable format"""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if bytes < 1024.0:
            return f"{bytes:.2f} {unit}"
        bytes /= 1024.0
    return f"{bytes:.2f} TB"

def update_disk_space():
    """Background task to update disk space information"""
    global disk_space_info
    while True:
        try:
            disk_usage = shutil.disk_usage(UPLOAD_FOLDER)
            disk_space_info = {
                "free": format_bytes(disk_usage.free),
                "total": format_bytes(disk_usage.total),
                "percent": round((disk_usage.used / disk_usage.total) * 100, 1)
            }
        except Exception as e:
            print(f"Error updating disk space: {e}")
        time.sleep(DISK_SPACE_UPDATE_INTERVAL)

# Start the background thread
disk_space_thread = threading.Thread(target=update_disk_space, daemon=True)
disk_space_thread.start()

@app.route("/", methods=["GET", "POST"])
def upload():
    if request.method == "POST":
        file = request.files.get('file')
        if file:
            # Generate unique filename with original name
            original_filename = file.filename
            name, extension = os.path.splitext(original_filename)
            unique_filename = f"{name}_{uuid.uuid4().hex}{extension}"
            file.save(os.path.join(UPLOAD_FOLDER, unique_filename))
        return redirect(url_for('upload'))
    files = os.listdir(UPLOAD_FOLDER)
    return render_template("index.html", files=files, disk_space=disk_space_info)

@app.route("/api/disk-space")
def get_disk_space():
    """API endpoint to get current disk space"""
    return jsonify(disk_space_info)

@app.route("/files/<filename>")
def files(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

@app.route("/delete/<filename>", methods=["POST"])
def delete_file(filename):
    try:
        file_path = os.path.join(UPLOAD_FOLDER, filename)

        if os.path.exists(file_path):
            os.remove(file_path)
            return {"success": True}, 200
        
        return {"success": False, "error": "File not found"}, 404
    except Exception as e:
        return {"success": False, "error": str(e)}, 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
