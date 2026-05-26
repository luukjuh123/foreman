"""Shared pytest fixtures for foreman backend tests."""

# Note: do NOT import app at module level — SQLAlchemy 2.x registers tables
# eagerly and will conflict with per-test create_app() calls. Each test file
# that needs a real DB defines its own app_with_db + client fixtures.
