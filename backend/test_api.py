import asyncio
import os
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:///./test_zhuangleme.db"

from fastapi.testclient import TestClient

import main


def setup_module():
    test_db = Path(__file__).parent / "test_zhuangleme.db"
    if test_db.exists():
        test_db.unlink()


def test_core_flow(monkeypatch):
    assert main.stable_versions(["23.11.0", "24.4.1", "24.4.0", "25.0.0-rc.1"])[0] == "24.4.1"

    async def fake_plan(software, version, platform):
        return f"""# {software.name} {version}

## 一键安装脚本

```powershell
# 中文注释
$ErrorActionPreference = "Stop"
Write-Host "install"
```

## 安装验证

脚本已包含验证。
"""

    monkeypatch.setattr(main, "generate_markdown", fake_plan)
    with TestClient(main.app) as client:
        health = client.get("/api/health")
        assert health.status_code == 200
        assert health.json()["status"] == "ok"

        software = client.get("/api/software")
        assert software.status_code == 200
        assert len(software.json()) >= 17

        resolved = client.post("/api/software/resolve", json={"query": "我想装 Node.js"})
        assert resolved.status_code == 200
        assert resolved.json()["slug"] == "nodejs"

        official = client.post("/api/plans/generate", json={
            "software_slug": "vscode", "version": "latest", "platform": "windows"
        })
        assert official.status_code == 200
        assert "https://code.visualstudio.com/Download" in official.json()["markdown"]

        plan = client.post("/api/plans/generate", json={
            "software_slug": "nodejs", "version": "22.0.0", "platform": "windows"
        })
        assert plan.status_code == 200
        plan_id = plan.json()["id"]

        feedback = client.post("/api/feedback", json={
            "plan_id": plan_id, "effective": True, "content": "装好了"
        })
        assert feedback.status_code == 201

        headers = {"X-Admin-Password": main.ADMIN_PASSWORD}
        assert client.get("/api/admin/plans", headers=headers).status_code == 200
        assert client.get("/api/admin/feedback", headers=headers).status_code == 200
        stats = client.get("/api/admin/stats", headers=headers)
        assert stats.status_code == 200
        assert len(stats.json()) >= 2


def test_version_source_fallback_order(monkeypatch):
    software = main.Software(slug="demo", name="Demo", category="ai", install_kind="script")
    calls: list[str] = []

    async def no_official(_software):
        calls.append("official")
        return [], "official"

    async def search_found(_software):
        calls.append("search")
        return ["3.2.1", "3.1.0"], "web-search"

    monkeypatch.setattr(main, "fetch_official_versions", no_official)
    monkeypatch.setattr(main, "web_search_versions", search_found)
    values, source = asyncio.run(main.fetch_versions(software))

    assert calls == ["official", "search"]
    assert values == ["3.2.1", "3.1.0"]
    assert source == "web-search"


def test_version_text_parser_rejects_noise():
    text = "Demo latest stable version 4.2.1, released in 2026. Demo v4.1.9-rc.1 is preview."
    assert main.versions_from_text(text, "Demo") == ["4.2.1"]


def teardown_module():
    main.engine.dispose()
    test_db = Path(__file__).parent / "test_zhuangleme.db"
    if test_db.exists():
        test_db.unlink()

