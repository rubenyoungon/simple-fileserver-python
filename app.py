from flask import Flask, request, send_from_directory, render_template, redirect, url_for, jsonify
import os
import shutil
import threading
import time
from datetime import datetime, timedelta
from collections import defaultdict

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


def get_files_grouped_by_date(upload_dir: str) -> dict[str, list[dict]]:
    """Get files grouped by their modification date"""
    files = os.listdir(upload_dir)
    files_with_info = []
    
    for filename in files:
        file_path = os.path.join(upload_dir, filename)
        if os.path.isfile(file_path):
            mtime = os.path.getmtime(file_path)
            mtime_datetime = datetime.fromtimestamp(mtime)
            date_key = mtime_datetime.strftime('%Y-%m-%d')
            
            files_with_info.append({
                'filename': filename,
                'mtime': mtime,
                'date_key': date_key,
                'is_image': filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'))
            })
    
    # Sort files within each date group by modification time (newest first)
    files_with_info.sort(key=lambda x: x['mtime'], reverse=True)
    
    # Group by date
    grouped_files = defaultdict(list)
    for file_info in files_with_info:
        grouped_files[file_info['date_key']].append(file_info)
    
    # Sort date groups (newest first)
    sorted_dates = sorted(grouped_files.keys(), reverse=True)
    
    # Return ordered dictionary
    return {date: grouped_files[date] for date in sorted_dates}

def format_date_header(date_str: str) -> str:
    """Format date string for display"""
    date_obj = datetime.strptime(date_str, '%Y-%m-%d')
    today = datetime.now().date()
    file_date = date_obj.date()
    
    if file_date == today:
        return "Today"
    elif file_date == today - timedelta(days=1):
        return "Yesterday"
    else:
        return date_obj.strftime('%A, %B %d, %Y')


def get_available_filename(upload_dir: str, original_filename: str) -> str:
    name, extension = os.path.splitext(original_filename)
    target_filename = original_filename
    counter = 1
    while os.path.exists(os.path.join(upload_dir, target_filename)):
        target_filename = f"{name}-{counter}{extension}"
        counter += 1
    return target_filename


def save_uploaded_file(upload_dir: str, file) -> str:
    """Saves the werkzeug FileStorage to disk using collision-safe name. Returns final filename."""
    target_filename = get_available_filename(upload_dir, file.filename)
    file.save(os.path.join(upload_dir, target_filename))
    return target_filename


@app.route("/", methods=["GET", "POST"])
def upload():
    if request.method == "POST":
        file = request.files.get('file')
        if file:
            save_uploaded_file(UPLOAD_FOLDER, file)
        return redirect(url_for('upload'))

    grouped_files = get_files_grouped_by_date(UPLOAD_FOLDER)
    file_count = sum(len(files) for files in grouped_files.values())
    return render_template("index.html", grouped_files=grouped_files, file_count=file_count, 
                         disk_space=disk_space_info, format_date_header=format_date_header)


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


@app.route("/delete-all", methods=["POST"])
def delete_all_files():
    try:
        deleted = 0
        for entry in os.listdir(UPLOAD_FOLDER):
            path = os.path.join(UPLOAD_FOLDER, entry)
            if os.path.isfile(path):
                os.remove(path)
                deleted += 1
        return {"success": True, "deleted": deleted}, 200
    except Exception as e:
        return {"success": False, "error": str(e)}, 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
