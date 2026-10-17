# Simple Fileserver Python

A lightweight file server application built with Python and Flask.

## Features
- Password-protected: a single login guards every page, file and API endpoint
- Drag & drop uploads via the web UI
- Browse and download individual files or all files as a ZIP archive
- Simple, single-file server app
- Serves static assets and templates

## Quick Start
1. Generate a password hash: `python -m utils.auth` (it asks for the password twice and prints the hash)
2. Set the login environment variables. Use single quotes: the hash contains `$`.
   - PowerShell:
     ```powershell
     $env:FILESERVER_USERNAME = 'admin'
     $env:FILESERVER_PASSWORD_HASH = '<paste the whole line printed by python -m utils.auth>'
     $env:FLASK_SECRET_KEY = 'a-long-random-string'
     ```
   - bash:
     ```bash
     export FILESERVER_USERNAME='admin'
     export FILESERVER_PASSWORD_HASH='<paste the whole line printed by python -m utils.auth>'
     export FLASK_SECRET_KEY='a-long-random-string'
     ```
3. Run the application: `python app.py`
4. Open your browser at `http://127.0.0.1:8000` and log in

The server listens on the local machine only.

## Login
| Variable | Required | Purpose |
| --- | --- | --- |
| `FILESERVER_USERNAME` | yes | The username to log in with |
| `FILESERVER_PASSWORD_HASH` | yes | Hash from `python -m utils.auth`; the plain password is never stored |
| `FLASK_SECRET_KEY` | recommended | Signs the session cookie. Without it a random key is used and everyone is logged out on every restart. Generate one with `python -c "import secrets; print(secrets.token_hex(32))"` |
| `FILESERVER_SECURE_COOKIES` | when using HTTPS | Set to `1` so the session cookie is only sent over HTTPS |

The server refuses to start until the username and password hash are set.

- Logins last 7 days. **Log out** ends the session in that browser.
- Changing the password (a new `FILESERVER_PASSWORD_HASH`) or `FLASK_SECRET_KEY` logs out every browser after a restart.
- After 5 failed attempts, an IP address is locked out for 15 minutes. The counter is kept in memory and resets when the server restarts.
- `static/` stays public so the login page can load its styles. Never put uploads or anything private in it.

## Project Structure
- `app.py` - Main application file
- `utils/auth.py` - Login helpers and the password-hash generator
- `templates/` - HTML templates
- `static/` - Static assets (CSS, JS)
- `uploads/` - Uploaded files directory
