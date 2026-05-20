"""Tests for nginx reverse proxy configuration.

Validates nginx.conf contains required directives for:
- Frontend proxy (default route to Next.js on port 3000)
- Backend proxy (/api/* and /healthz to FastAPI on port 8000)
- Security headers
- Gzip compression
- WebSocket upgrade support
- Proxy headers
"""

import re
from pathlib import Path

NGINX_CONF = Path(__file__).parents[2] / "nginx" / "nginx.conf"
NGINX_DOCKERFILE = Path(__file__).parents[2] / "nginx" / "Dockerfile"


def _read_conf() -> str:
    assert NGINX_CONF.exists(), f"nginx.conf not found at {NGINX_CONF}"
    return NGINX_CONF.read_text()


# ---------------------------------------------------------------------------
# File existence
# ---------------------------------------------------------------------------


def test_nginx_conf_exists():
    assert NGINX_CONF.exists(), "nginx/nginx.conf must exist"


def test_nginx_dockerfile_exists():
    assert NGINX_DOCKERFILE.exists(), "nginx/Dockerfile must exist"


# ---------------------------------------------------------------------------
# Proxy pass directives
# ---------------------------------------------------------------------------


def test_api_proxy_pass_to_backend():
    conf = _read_conf()
    # /api/ location must proxy to the backend upstream
    assert re.search(r"location\s+/api/", conf), "Missing /api/ location block"
    # Verify proxy_pass inside the /api/ block points to backend
    api_block = re.search(
        r"location\s+/api/\s*\{(.*?)\}", conf, re.DOTALL
    )
    assert api_block, "Could not parse /api/ location block"
    assert re.search(r"proxy_pass\s+http://backend", api_block.group(1)), (
        "proxy_pass in /api/ must point to http://backend"
    )


def test_healthz_proxy_pass_to_backend():
    conf = _read_conf()
    assert re.search(r"location\s+/healthz", conf), "Missing /healthz location block"


def test_frontend_default_proxy():
    conf = _read_conf()
    # Default location / must proxy to frontend:3000
    assert re.search(r"location\s+/\s*\{", conf), "Missing default / location block"
    assert "frontend:3000" in conf or "localhost:3000" in conf, (
        "Default location must proxy to frontend on port 3000"
    )


# ---------------------------------------------------------------------------
# Proxy headers
# ---------------------------------------------------------------------------


def test_x_forwarded_for_header():
    conf = _read_conf()
    assert "X-Forwarded-For" in conf, "Missing X-Forwarded-For proxy header"


def test_x_forwarded_proto_header():
    conf = _read_conf()
    assert "X-Forwarded-Proto" in conf, "Missing X-Forwarded-Proto proxy header"


def test_proxy_host_header():
    conf = _read_conf()
    assert "proxy_set_header Host" in conf, "Missing proxy_set_header Host"


# ---------------------------------------------------------------------------
# WebSocket upgrade support
# ---------------------------------------------------------------------------


def test_websocket_upgrade_header():
    conf = _read_conf()
    assert "Upgrade" in conf, "Missing WebSocket Upgrade header"
    assert "Connection" in conf, "Missing WebSocket Connection header"


# ---------------------------------------------------------------------------
# Gzip compression
# ---------------------------------------------------------------------------


def test_gzip_enabled():
    conf = _read_conf()
    assert re.search(r"gzip\s+on", conf), "gzip must be enabled"


def test_gzip_types_include_json():
    conf = _read_conf()
    assert "application/json" in conf, "gzip_types must include application/json"


def test_gzip_types_include_javascript():
    conf = _read_conf()
    # gzip_types may span multiple lines — use DOTALL and match up to the semicolon
    assert re.search(r"gzip_types\b.*?(?:javascript|js).*?;", conf, re.DOTALL), (
        "gzip_types must include javascript"
    )


def test_gzip_types_include_css():
    conf = _read_conf()
    assert re.search(r"gzip_types\b.*?text/css.*?;", conf, re.DOTALL), (
        "gzip_types must include text/css"
    )


# ---------------------------------------------------------------------------
# Security headers
# ---------------------------------------------------------------------------


def test_x_frame_options_header():
    conf = _read_conf()
    assert "X-Frame-Options" in conf, "Missing X-Frame-Options security header"


def test_x_content_type_options_header():
    conf = _read_conf()
    assert "X-Content-Type-Options" in conf, (
        "Missing X-Content-Type-Options security header"
    )


def test_hsts_header():
    conf = _read_conf()
    assert "Strict-Transport-Security" in conf, "Missing HSTS (Strict-Transport-Security) header"


def test_content_security_policy_header():
    conf = _read_conf()
    assert "Content-Security-Policy" in conf, "Missing Content-Security-Policy header"
    assert re.search(r"default-src\s+'self'", conf), (
        "CSP must include default-src 'self'"
    )


# ---------------------------------------------------------------------------
# Client body size (photo uploads)
# ---------------------------------------------------------------------------


def test_client_max_body_size_50m():
    conf = _read_conf()
    assert re.search(r"client_max_body_size\s+50[mM]", conf), (
        "client_max_body_size must be set to 50M for photo uploads"
    )


# ---------------------------------------------------------------------------
# Nginx Dockerfile
# ---------------------------------------------------------------------------


def test_nginx_dockerfile_uses_alpine():
    assert NGINX_DOCKERFILE.exists(), "nginx/Dockerfile must exist"
    content = NGINX_DOCKERFILE.read_text()
    assert "nginx:alpine" in content, "Dockerfile must use nginx:alpine base image"


def test_nginx_dockerfile_copies_config():
    content = NGINX_DOCKERFILE.read_text()
    assert "nginx.conf" in content, "Dockerfile must copy nginx.conf into the image"
