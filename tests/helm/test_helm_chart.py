"""Tests for the foreman Helm chart structure and values correctness.

These tests validate the chart without requiring helm to be installed:
- Required files exist
- Chart.yaml has required fields
- values.yaml has all required configuration keys
- Templates contain expected resource kinds
- No secrets are hardcoded in values.yaml
"""

import os
import re

import pytest
import yaml

CHART_DIR = os.path.join(
    os.path.dirname(__file__), "..", "..", "helm", "foreman"
)


def chart_path(*parts: str) -> str:
    return os.path.join(CHART_DIR, *parts)


# ---------------------------------------------------------------------------
# Chart.yaml
# ---------------------------------------------------------------------------


def test_chart_yaml_exists():
    assert os.path.isfile(chart_path("Chart.yaml")), "Chart.yaml must exist"


def test_chart_yaml_required_fields():
    with open(chart_path("Chart.yaml")) as f:
        chart = yaml.safe_load(f)

    assert chart.get("apiVersion") == "v2", "apiVersion must be v2"
    assert chart.get("name") == "foreman", "name must be foreman"
    assert chart.get("version"), "version must be set"
    assert chart.get("appVersion"), "appVersion must be set"
    assert chart.get("description"), "description must be set"


# ---------------------------------------------------------------------------
# values.yaml
# ---------------------------------------------------------------------------


def test_values_yaml_exists():
    assert os.path.isfile(chart_path("values.yaml")), "values.yaml must exist"


@pytest.fixture(scope="module")
def values():
    with open(chart_path("values.yaml")) as f:
        return yaml.safe_load(f)


def test_values_backend_section_present(values):
    assert "backend" in values, "values.yaml must have a 'backend' section"


def test_values_frontend_section_present(values):
    assert "frontend" in values, "values.yaml must have a 'frontend' section"


def test_values_backend_image(values):
    backend = values["backend"]
    assert "image" in backend
    assert "repository" in backend["image"]
    assert "tag" in backend["image"]


def test_values_frontend_image(values):
    frontend = values["frontend"]
    assert "image" in frontend
    assert "repository" in frontend["image"]
    assert "tag" in frontend["image"]


def test_values_backend_resources(values):
    backend = values["backend"]
    assert "resources" in backend, "backend must declare resource requests/limits"
    resources = backend["resources"]
    assert "requests" in resources
    assert "limits" in resources
    assert "cpu" in resources["requests"]
    assert "memory" in resources["requests"]
    assert "cpu" in resources["limits"]
    assert "memory" in resources["limits"]


def test_values_frontend_resources(values):
    frontend = values["frontend"]
    assert "resources" in frontend, "frontend must declare resource requests/limits"
    resources = frontend["resources"]
    assert "requests" in resources
    assert "limits" in resources


def test_values_backend_replica_count(values):
    assert "replicaCount" in values["backend"], "backend must have replicaCount"
    assert values["backend"]["replicaCount"] >= 1


def test_values_frontend_replica_count(values):
    assert "replicaCount" in values["frontend"], "frontend must have replicaCount"
    assert values["frontend"]["replicaCount"] >= 1


def test_values_backend_probes(values):
    backend = values["backend"]
    assert "livenessProbe" in backend, "backend must have livenessProbe"
    assert "readinessProbe" in backend, "backend must have readinessProbe"


def test_values_frontend_probes(values):
    frontend = values["frontend"]
    assert "livenessProbe" in frontend, "frontend must have livenessProbe"
    assert "readinessProbe" in frontend, "frontend must have readinessProbe"


def test_values_no_hardcoded_secrets(values):
    """No real secrets should appear in values.yaml — only secretKeyRef references."""
    values_text = yaml.dump(values)
    # Patterns that indicate a secret was accidentally hardcoded
    forbidden_patterns = [
        r"sk-[A-Za-z0-9]{20,}",  # OpenAI key pattern
        r"live_[A-Za-z0-9]{20,}",  # Mollie live key
        r"test_[A-Za-z0-9]{20,}",  # Mollie test key
        r"eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+",  # JWT token
    ]
    for pattern in forbidden_patterns:
        assert not re.search(pattern, values_text), (
            f"Possible hardcoded secret found matching pattern: {pattern}"
        )


def test_values_postgresql_section(values):
    assert "postgresql" in values, "values.yaml must have a 'postgresql' section"


def test_values_ingress_section(values):
    assert "ingress" in values, "values.yaml must have an 'ingress' section"


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------


REQUIRED_TEMPLATES = [
    "_helpers.tpl",
    "backend-deployment.yaml",
    "backend-service.yaml",
    "frontend-deployment.yaml",
    "frontend-service.yaml",
    "ingress.yaml",
    "secrets.yaml",
]


@pytest.mark.parametrize("template", REQUIRED_TEMPLATES)
def test_template_file_exists(template):
    path = chart_path("templates", template)
    assert os.path.isfile(path), f"Template {template} must exist"


def test_backend_deployment_template_kind():
    with open(chart_path("templates", "backend-deployment.yaml")) as f:
        content = f.read()
    assert "kind: Deployment" in content


def test_backend_service_template_kind():
    with open(chart_path("templates", "backend-service.yaml")) as f:
        content = f.read()
    assert "kind: Service" in content


def test_frontend_deployment_template_kind():
    with open(chart_path("templates", "frontend-deployment.yaml")) as f:
        content = f.read()
    assert "kind: Deployment" in content


def test_frontend_service_template_kind():
    with open(chart_path("templates", "frontend-service.yaml")) as f:
        content = f.read()
    assert "kind: Service" in content


def test_ingress_template_kind():
    with open(chart_path("templates", "ingress.yaml")) as f:
        content = f.read()
    assert "kind: Ingress" in content


def test_secrets_template_uses_secret_kind():
    with open(chart_path("templates", "secrets.yaml")) as f:
        content = f.read()
    assert "kind: Secret" in content


def test_backend_deployment_uses_secretkeyref():
    """Backend deployment must reference secrets via secretKeyRef, not hardcode them."""
    with open(chart_path("templates", "backend-deployment.yaml")) as f:
        content = f.read()
    assert "secretKeyRef" in content, (
        "backend-deployment.yaml must use secretKeyRef for sensitive env vars"
    )


def test_backend_deployment_liveness_probe():
    with open(chart_path("templates", "backend-deployment.yaml")) as f:
        content = f.read()
    assert "livenessProbe" in content


def test_backend_deployment_readiness_probe():
    with open(chart_path("templates", "backend-deployment.yaml")) as f:
        content = f.read()
    assert "readinessProbe" in content


def test_frontend_deployment_liveness_probe():
    with open(chart_path("templates", "frontend-deployment.yaml")) as f:
        content = f.read()
    assert "livenessProbe" in content


def test_backend_deployment_non_root():
    with open(chart_path("templates", "backend-deployment.yaml")) as f:
        content = f.read()
    assert "runAsNonRoot" in content


def test_frontend_deployment_non_root():
    with open(chart_path("templates", "frontend-deployment.yaml")) as f:
        content = f.read()
    assert "runAsNonRoot" in content
