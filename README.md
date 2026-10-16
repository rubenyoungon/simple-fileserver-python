# Simple Fileserver Python

A lightweight file server application built with Python and Flask.

## Features
- Drag & drop uploads via the web UI
- Browse and download individual files or all files as a ZIP archive
- Simple, single-file server app
- Serves static assets and templates

## Quick Start
1. Run the application: `python app.py`
2. Open your browser and navigate to `http://127.0.0.1:8000`

The server listens on the local machine only. Set the `FLASK_SECRET_KEY` environment variable to a stable, random secret when running multiple workers or across restarts; otherwise a fresh key is generated at startup.

## Project Structure
- `app.py` - Main application file
- `templates/` - HTML templates
- `static/` - Static assets (CSS, JS)
- `uploads/` - Uploaded files directory
