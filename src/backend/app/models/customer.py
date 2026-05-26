"""Customer model — re-exported from invoice domain for backwards compatibility."""

# The canonical Customer model (scoped by owner_id, Dutch invoice fields) lives in
# invoice.py and was defined there first. Importing it here so app.routers.customers
# can reference the same class without a duplicate table definition.
from app.models.invoice import Customer

__all__ = ["Customer"]
