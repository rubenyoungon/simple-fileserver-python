from flask import Flask, request, send_from_directory, render_template, redirect, url_for, jsonify
import os
from utils.utils import (
    get_files_grouped_by_date, format_date_header, save_uploaded_file,
    start_disk_space_monitoring, get_disk_space_info
)

app = Flask(__name__)
UPLOAD_FOLDER = './uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Start disk space monitoring
disk_space_thread = start_disk_space_monitoring(UPLOAD_FOLDER)


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
                         disk_space=get_disk_space_info(), format_date_header=format_date_header)


@app.route("/api/disk-space")
def get_disk_space():
    """API endpoint to get current disk space"""
    return jsonify(get_disk_space_info())


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
