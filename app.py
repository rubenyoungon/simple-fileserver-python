from flask import Flask, request, send_file, send_from_directory, render_template, redirect, url_for, jsonify, make_response
from flask_wtf.csrf import CSRFProtect, generate_csrf
from werkzeug.exceptions import HTTPException, BadRequest
import secrets
import os
import tempfile
import zipfile
from email.utils import formatdate

from utils.utils import (
    get_files_grouped_by_date, format_date_header, save_uploaded_file,
    start_disk_space_monitoring, get_disk_space_info,
    start_background_deletion, get_deletion_status,
    ALLOWED_EXTENSIONS, is_allowed_file, get_upload_path
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

def wants_json() -> bool:
    """True for requests made by script.js, which expect JSON instead of HTML error pages."""
    return request.headers.get('X-Requested-With') == 'XMLHttpRequest'


@app.errorhandler(HTTPException)
def handle_http_exception(error):
    """Return JSON errors (e.g. expired CSRF token, upload too large) to fetch() callers."""
    if wants_json():
        return jsonify({"success": False, "error": error.description}), error.code
    return error


@app.errorhandler(Exception)
def handle_unexpected_exception(error):
    app.logger.exception("Unhandled error")
    if wants_json():
        return jsonify({"success": False, "error": f"Internal server error: {error}"}), 500
    return "Internal server error", 500


@app.route("/", methods=["GET", "POST"])
def upload():
    if request.method == "POST":
        files = [file for file in request.files.getlist('file') if file and file.filename]
        if not files:
            if wants_json():
                return jsonify({"success": False, "error": "No file was selected."}), 400
            return redirect(url_for('upload'))

        invalid = [file.filename for file in files if get_upload_path(UPLOAD_FOLDER, file.filename) is None]
        if invalid:
            raise BadRequest("Invalid file name: " + ", ".join(invalid))

        rejected = [file.filename for file in files if not is_allowed_file(file.filename)]
        if rejected:
            # Reject the whole upload so nothing is half-saved.
            raise BadRequest(
                "Only photos, videos and documents can be uploaded. Not allowed: "
                + ", ".join(rejected)
                + "\n\nAllowed types: " + ", ".join(ALLOWED_EXTENSIONS)
            )

        failed = []
        for file in files:
            try:
                save_uploaded_file(UPLOAD_FOLDER, file)
            except OSError as error:
                app.logger.exception("Failed to save %s", file.filename)
                failed.append(f"{file.filename}: {error.strerror or error}")

        if wants_json():
            if failed:
                saved_count = len(files) - len(failed)
                message = f"Could not save {len(failed)} of {len(files)} file(s)"
                if saved_count:
                    message += f" ({saved_count} saved)"
                message += ".\n" + "\n".join(failed)
                return jsonify({"success": False, "error": message}), 500
            return jsonify({"success": True})

        return redirect(url_for('upload'))

    grouped_files = get_files_grouped_by_date(UPLOAD_FOLDER)
    file_count = sum(len(files) for files in grouped_files.values())
    
    accept = ",".join(ALLOWED_EXTENSIONS)

    if request.args.get('partial'):
        return render_template("index.html", grouped_files=grouped_files, file_count=file_count, 
                             disk_space=get_disk_space_info(), format_date_header=format_date_header, partial=True)

    return render_template("index.html", grouped_files=grouped_files, file_count=file_count, 
                         disk_space=get_disk_space_info(), format_date_header=format_date_header, accept=accept)


@app.route("/api/disk-space", methods=["GET"])
def get_disk_space():
    """API endpoint to get current disk space"""
    return jsonify(get_disk_space_info())


@app.route("/api/csrf-token", methods=["GET"])
def get_csrf_token():
    response = jsonify({"csrf_token": generate_csrf()})
    response.headers["Cache-Control"] = "no-store"
    return response


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
    file_path = get_upload_path(UPLOAD_FOLDER, filename)

    if file_path is None or not os.path.isfile(file_path):
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
        file_path = get_upload_path(UPLOAD_FOLDER, filename)

        if file_path is not None and os.path.isfile(file_path):
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
