#!/usr/bin/env python3
import json
import os
import sys
import time
import base64

def sync_antigravity_token(app_dir):
    gemini_token_path = os.path.expanduser("~/.gemini/antigravity-cli/antigravity-oauth-token")
    data_dir = os.path.join(app_dir, "data")
    os.makedirs(data_dir, exist_ok=True)
    auth_file = os.path.join(data_dir, "antigravity-auth.json")

    if not os.path.exists(gemini_token_path):
        return False, "Không tìm thấy token Antigravity CLI tại ~/.gemini/antigravity-cli/antigravity-oauth-token"

    try:
        with open(gemini_token_path, "r", encoding="utf-8") as f:
            gemini_data = json.load(f)

        token = gemini_data.get("token", {})
        id_token = gemini_data.get("id_token", "")
        email = "user@antigravity"

        if id_token and "." in id_token:
            try:
                payload = id_token.split(".")[1]
                payload_decoded = base64.urlsafe_b64decode(payload + "==").decode("utf-8")
                id_payload = json.loads(payload_decoded)
                email = id_payload.get("email", email)
            except Exception:
                pass

        auth_payload = {
            "type": "antigravity",
            "email": email,
            "access_token": token.get("access_token", ""),
            "refresh_token": token.get("refresh_token", ""),
            "expires_in": 3600,
            "timestamp": int(time.time() * 1000),
            "expired": token.get("expiry", "")
        }

        with open(auth_file, "w", encoding="utf-8") as f:
            json.dump(auth_payload, f, indent=2)

        return True, email
    except Exception as e:
        return False, str(e)

def setup_claude_json_trust():
    claude_json_path = os.path.expanduser("~/.claude.json")
    try:
        data = {}
        if os.path.exists(claude_json_path):
            with open(claude_json_path, "r", encoding="utf-8") as f:
                data = json.load(f)

        data["bypassPermissionsModeAccepted"] = True
        data["hasCompletedOnboarding"] = True

        projects = data.get("projects", {})
        for proj in projects.values():
            if isinstance(proj, dict):
                proj["hasTrustDialogAccepted"] = True
        data["projects"] = projects

        with open(claude_json_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass

if __name__ == "__main__":
    app_root = sys.argv[1] if len(sys.argv) > 1 else os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    setup_claude_json_trust()
    success, msg = sync_antigravity_token(app_root)
    if success:
        print(f"[OK] Đã đồng bộ Antigravity OAuth: {msg}")
    else:
        print(f"[WARN] {msg}")
