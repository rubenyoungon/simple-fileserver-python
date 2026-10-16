from flask import Flask, request, send_file, send_from_directory, render_template, redirect, url_for, jsonify, make_response
from flask_wtf.csrf import CSRFProtect
import secrets
import os
import tempfile
import zipfile
from email.utils import formatdate

from utils.utils import (
    get_files_grouped_by_date, format_date_header, save_uploaded_file,
    start_disk_space_monitoring, get_disk_space_info,
    start_background_deletion, get_deletion_status
)

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY") or secrets.token_hex(32)
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
CSRFProtect(app)

UPLOAD_FOLDER = './uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Start disk space monitoring
disk_space_thread = start_disk_space_monitoring(UPLOAD_FOLDER)

@app.route("/", methods=["GET", "POST"])
def upload():
    if request.method == "POST":
        files = request.files.getlist('file')
        for file in files:
            if file:
                save_uploaded_file(UPLOAD_FOLDER, file)
        
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({"success": True})

        return redirect(url_for('upload'))

    grouped_files = get_files_grouped_by_date(UPLOAD_FOLDER)
    file_count = sum(len(files) for files in grouped_files.values())
    
    if request.args.get('partial'):
        return render_template("index.html", grouped_files=grouped_files, file_count=file_count, 
                             disk_space=get_disk_space_info(), format_date_header=format_date_header, partial=True)

    return render_template("index.html", grouped_files=grouped_files, file_count=file_count, 
                         disk_space=get_disk_space_info(), format_date_header=format_date_header)


@app.route("/api/disk-space", methods=["GET"])
def get_disk_space():
    """API endpoint to get current disk space"""
    return jsonify(get_disk_space_info())


@app.route("/api/deletion-status", methods=["GET"])
def deletion_status():
    """API endpoint to get current deletion status"""
    return jsonify(get_deletion_status())


@app.route("/download-all", methods=["GET"])
def download_all():
    """Download all uploaded files as a ZIP archive."""
    filenames = [
        filename for filename in os.listdir(UPLOAD_FOLDER)
        if os.path.isfile(os.path.join(UPLOAD_FOLDER, filename))
    ]
    if not filenames:
        return jsonify({"success": False, "error": "No files to download"}), 404

    archive = tempfile.SpooledTemporaryFile()
    try:
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zip_file:
            for filename in filenames:
                zip_file.write(os.path.join(UPLOAD_FOLDER, filename), arcname=filename)
        archive.seek(0)
        return send_file(
            archive,
            mimetype="application/zip",
            as_attachment=True,
            download_name="files.zip",
        )
    except Exception:
        archive.close()
        raise


@app.route("/files/<filename>", methods=["GET"])
def files(filename):
    """Serve files with headers that are friendlier for iOS/WebKit."""
    file_path = os.path.join(UPLOAD_FOLDER, filename)

    if not os.path.exists(file_path):
        return {"success": False, "error": "File not found"}, 404

    response = make_response(send_from_directory(UPLOAD_FOLDER, filename))

    stat_result = os.stat(file_path)
    response.headers["Content-Length"] = str(stat_result.st_size)
    response.headers["Last-Modified"] = formatdate(stat_result.st_mtime, usegmt=True)
    response.headers["ETag"] = f'"{stat_result.st_mtime_ns}-{stat_result.st_size}"'
    response.headers["Accept-Ranges"] = "bytes"
    response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    response.headers["Content-Disposition"] = f'inline; filename="{filename}"'

    return response


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
        start_background_deletion(UPLOAD_FOLDER)
        return {"success": True}, 202  # 202 Accepted
    except Exception as e:
        return {"success": False, "error": str(e)}, 500


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000)
