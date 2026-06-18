import os
import shutil
import threading
import time
from datetime import datetime, timedelta
from collections import defaultdict

# Global variable to store disk space info
disk_space_info = {"free": "Calculating...", "total": "Calculating...", "percent": 0}

# Global state for deletion process
deletion_status = {"in_progress": False, "deleted": 0, "total": 0, "error": None}
deletion_lock = threading.Lock()

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
    """Generate a unique filename by adding a counter if the file already exists"""
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


def start_disk_space_monitoring(upload_folder: str):
    """Start the background thread for monitoring disk space"""
    global UPLOAD_FOLDER
    UPLOAD_FOLDER = upload_folder
    
    # Start the background thread
    disk_space_thread = threading.Thread(target=update_disk_space, daemon=True)
    disk_space_thread.start()
    return disk_space_thread


def get_disk_space_info():
    """Get current disk space information"""
    return disk_space_info


def perform_background_deletion(upload_dir: str):
    """Background task to delete all files with retries for busy files"""
    global deletion_status
    
    with deletion_lock:
        if deletion_status["in_progress"]:
            return
        deletion_status = {"in_progress": True, "deleted": 0, "total": 0, "error": None}

    try:
        files = [f for f in os.listdir(upload_dir) if os.path.isfile(os.path.join(upload_dir, f))]
        deletion_status["total"] = len(files)
        
        for filename in files:
            file_path = os.path.join(upload_dir, filename)
            # Try to delete with retries
            max_retries = 5
            for attempt in range(max_retries):
                try:
                    if os.path.exists(file_path):
                        os.remove(file_path)
                    deletion_status["deleted"] += 1
                    break
                except OSError as e:
                    if attempt < max_retries - 1:
                        # Wait a bit for file handles to close
                        time.sleep(0.5)
                        continue
                    else:
                        print(f"Error deleting {filename} after {max_retries} attempts: {e}")
                        # We don't stop the whole process, just keep going
            
    except Exception as e:
        deletion_status["error"] = str(e)
    finally:
        deletion_status["in_progress"] = False


def start_background_deletion(upload_dir: str):
    """Start the background thread for deleting all files"""
    thread = threading.Thread(target=perform_background_deletion, args=(upload_dir,), daemon=True)
    thread.start()
    return thread


def get_deletion_status():
    """Get current status of background deletion"""
    return deletion_status