"""Loan balance calculations — pure functions, integer cents only."""

from __future__ import annotations


def compute_outstanding(principal_cents: int, deductions: list[int]) -> int:
    """Outstanding balance for a single loan.

    Returns max(0, principal - sum(deductions)). Over-deduction is clamped to 0
    so an accidental extra deduction does not produce a negative balance.
    """
    if principal_cents < 0:
        raise ValueError("principal_cents must be non-negative")
    if any(d < 0 for d in deductions):
        raise ValueError("deduction amounts must be non-negative")
    deducted = sum(deductions)
    return max(0, principal_cents - deducted)
