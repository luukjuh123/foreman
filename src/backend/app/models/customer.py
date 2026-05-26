"""Customer model — re-exports from invoice domain for backward compatibility."""

# The canonical Customer model lives in app.models.invoice to keep it co-located
# with Invoice, InvoiceLine, and InvoiceCounter (same domain).
# The customers router and any other module should import from here.
from app.models.invoice import Customer  # noqa: F401
