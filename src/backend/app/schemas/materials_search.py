"""Pydantic response schemas for the /materials/search, /compare, /stores endpoints."""

from __future__ import annotations

from pydantic import BaseModel


class ProductResultSchema(BaseModel):
    store: str
    product_id: str
    name: str
    url: str
    price_cents: int
    in_stock: bool
    unit: str
    extra: dict[str, str] = {}


class SearchResponse(BaseModel):
    data: list[ProductResultSchema]
    error: str | None = None


class CompareData(BaseModel):
    query: str
    results_by_store: dict[str, list[ProductResultSchema]]
    ranked: list[ProductResultSchema]


class CompareResponse(BaseModel):
    data: CompareData
    error: str | None = None


class StoresResponse(BaseModel):
    data: list[str]
    error: str | None = None
