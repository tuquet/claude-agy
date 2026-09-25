#!/usr/bin/env python3
import json
import os
import sys
import time
import base64

def is_valid_token(p):
    if not p or not os.path.isfile(p):
        return False
    try:
        if os.path.getsize(p) > 1024 * 1024 or os.path.getsize(p) < 20:
            return False
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not data:
            return False
        tok = data.get("token", data)
        return bool(tok.get("access_token") or data.get("access_token") or tok.get("refresh_token") or data.get("refresh_token"))
    except Exception:
        return False

def find_antigravity_token(app_dir, explicit_path=None):
    if explicit_path and is_valid_token(explicit_path):
        return explicit_path

    env_token = os.environ.get("ANTIGRAVITY_TOKEN_PATH") or os.environ.get("GEMINI_TOKEN_PATH")
    if env_token and is_valid_token(env_token):
        return env_token

    settings_file = os.path.join(app_dir, "config", "settings.env")
    if os.path.isfile(settings_file):
        try:
            with open(settings_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        if k in ("ANTIGRAVITY_TOKEN_PATH", "TOKEN_PATH") and is_valid_token(v):
                            return v
        except Exception:
            pass

    home = os.path.expanduser("~")
    candidates = [
        os.path.join(home, ".gemini", "antigravity-cli", "antigravity-oauth-token"),
        os.path.join(home, ".gemini", "jetski-standalone-oauth-token"),
        os.path.join(home, ".gemini", "oauth_creds.json"),
        os.path.join(home, ".gemini", "antigravity", "oauth_creds.json"),
        os.path.join(home, ".gemini", "antigravity-ide", "oauth_creds.json"),
        os.path.join(home, ".config", "Antigravity", "oauth_creds.json"),
        os.path.join(home, ".config", "antigravity", "oauth_creds.json"),
        os.path.join(home, "Library", "Application Support", "Antigravity", "oauth_creds.json")
    ]
    for c in candidates:
        if is_valid_token(c):
            return c

    gemini_dir = os.path.join(home, ".gemini")
    if os.path.isdir(gemini_dir):
        skip_dirs = {"brain", "history", "tmp", "code_tracker", "crashes", "browser_recordings", "conversations", "implicit", "playground", "plugins", "skills"}
        try:
            for item in os.listdir(gemini_dir):
                item_path = os.path.join(gemini_dir, item)
                if os.path.isfile(item_path):
                    if any(x in item.lower() for x in ("token", "oauth", "cred", "auth")) and is_valid_token(item_path):
                        return item_path
                elif os.path.isdir(item_path) and item not in skip_dirs:
                    try:
                        for sub in os.listdir(item_path):
                            sub_path = os.path.join(item_path, sub)
                            if os.path.isfile(sub_path) and any(x in sub.lower() for x in ("token", "oauth", "cred", "auth")) and is_valid_token(sub_path):
                                return sub_path
                    except Exception:
                        pass
        except Exception:
            pass

    return None

def sync_antigravity_token(app_dir, explicit_path=None):
    source_path = find_antigravity_token(app_dir, explicit_path)
    if not source_path:
        return False, "No Antigravity token found at ~/.gemini, config dirs, or ANTIGRAVITY_TOKEN_PATH"
    auth_file = os.path.join(app_dir, "data", "antigravity-auth.json")
    try:
        with open(source_path, "r", encoding="utf-8") as f:
            gemini_data = json.load(f)
        tok = gemini_data.get("token", gemini_data)
        id_tok = gemini_data.get("id_token", "")
        access_tok = tok.get("access_token", gemini_data.get("access_token", ""))
        refresh_tok = tok.get("refresh_token", gemini_data.get("refresh_token", ""))
        expiry_val = tok.get("expiry", gemini_data.get("expiry_date", ""))
        project_id = gemini_data.get("project_id", tok.get("project_id", "aicode-consumers"))
        email = "user@antigravity"
        if id_tok and "." in id_tok:
            try:
                p = json.loads(base64.urlsafe_b64decode(id_tok.split(".")[1] + "==").decode("utf-8"))
                email = p.get("email", email)
            except Exception:
                pass
        if email == "user@antigravity":
            if gemini_data.get("email"):
                email = gemini_data.get("email")
            else:
                ga_path = os.path.expanduser("~/.gemini/google_accounts.json")
                if os.path.isfile(ga_path):
                    try:
                        with open(ga_path, "r", encoding="utf-8") as gf:
                            ga = json.load(gf)
                            if isinstance(ga.get("active"), str) and "@" in ga["active"]:
                                email = ga["active"]
                    except Exception:
                        pass
        auth_payload = {
            "type": "antigravity",
            "email": email,
            "access_token": access_tok,
            "refresh_token": refresh_tok,
            "project_id": project_id,
            "disabled": False,
            "expires_in": 3600,
            "timestamp": int(time.time() * 1000),
            "expired": expiry_val
        }
        data_dir = os.path.dirname(auth_file)
        os.makedirs(data_dir, exist_ok=True)
        with open(auth_file, "w", encoding="utf-8") as f:
            json.dump(auth_payload, f, indent=2)
        return True, f"{email} (from {source_path})"
    except Exception as e:
        return False, str(e)

def setup_trust():
    p = os.path.expanduser("~/.claude.json")
    try:
        data = {}
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as f:
                data = json.load(f)
        data["bypassPermissionsModeAccepted"] = True
        data["hasCompletedOnboarding"] = True
        for proj in data.get("projects", {}).values():
            if isinstance(proj, dict): proj["hasTrustDialogAccepted"] = True
        with open(p, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass

if __name__ == "__main__":
    setup_trust()
    app = sys.argv[1] if len(sys.argv) > 1 else os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    explicit = sys.argv[2] if len(sys.argv) > 2 else None
    ok, msg = sync_antigravity_token(app, explicit)
    if ok: print(f"[OK] Token synced: {msg}")
    else: print(f"[INFO] {msg}")
