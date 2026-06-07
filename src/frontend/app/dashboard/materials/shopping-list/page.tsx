"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, ExternalLink, ShoppingCart, Calculator } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShoppingItem {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  purchased: boolean;
}

// ---------------------------------------------------------------------------
// Store deep-link helpers
// ---------------------------------------------------------------------------

const STORES = [
  {
    name: "Hornbach",
    url: (q: string) => `https://www.hornbach.nl/zoeken/?q=${encodeURIComponent(q)}`,
  },
  {
    name: "Gamma",
    url: (q: string) => `https://www.gamma.nl/zoeken?text=${encodeURIComponent(q)}`,
  },
  {
    name: "Praxis",
    url: (q: string) => `https://www.praxis.nl/zoeken?q=${encodeURIComponent(q)}`,
  },
  {
    name: "Bouwmaat",
    url: (q: string) => `https://www.bouwmaat.nl/search?q=${encodeURIComponent(q)}`,
  },
];

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = "foreman_shopping_list";

function loadFromStorage(): ShoppingItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ShoppingItem[]) : [];
  } catch {
    return [];
  }
}

function saveToStorage(items: ShoppingItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ShoppingListPage() {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");

  // Load from localStorage on mount
  useEffect(() => {
    setItems(loadFromStorage());
  }, []);

  // Persist on every change
  useEffect(() => {
    saveToStorage(items);
  }, [items]);

  function handleAdd() {
    if (!name.trim()) return;
    const newItem: ShoppingItem = {
      id: crypto.randomUUID(),
      name: name.trim(),
      quantity: quantity.trim(),
      unit: unit.trim(),
      purchased: false,
    };
    setItems((prev) => [...prev, newItem]);
    setName("");
    setQuantity("");
    setUnit("");
  }

  function handleRemove(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  function handleTogglePurchased(id: string) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, purchased: !item.purchased } : item
      )
    );
  }

  function handleClearAll() {
    setItems([]);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleAdd();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Boodschappenlijst</h1>
        <Link href="/dashboard/projects/new/calculator">
          <Button variant="outline" size="sm">
            <Calculator className="mr-1.5 h-4 w-4" />
            Rekenmachine
          </Button>
        </Link>
      </div>

      {/* Add item form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Materiaal toevoegen</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Input
              className="flex-1"
              placeholder="Materiaal naam"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <Input
              className="w-24"
              placeholder="Aantal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <Input
              className="w-28"
              placeholder="Eenheid (m, kg…)"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <Button onClick={handleAdd}>
              <ShoppingCart className="mr-1.5 h-4 w-4" />
              Toevoegen
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Geen materialen in de lijst. Voeg hierboven materialen toe.
        </p>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">
              {items.length} {items.length === 1 ? "item" : "items"}
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleClearAll}>
              Alles wissen
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground w-8">
                      Gekocht
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Materiaal
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground w-20">
                      Aantal
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground w-24">
                      Eenheid
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Winkellinks
                    </th>
                    <th className="px-4 py-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className={`border-b last:border-0 transition-colors ${
                        item.purchased ? "opacity-50" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={item.purchased}
                          onChange={() => handleTogglePurchased(item.id)}
                          className="h-4 w-4 cursor-pointer rounded border-gray-300"
                          aria-label={`Markeer ${item.name} als gekocht`}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium">
                        <span className={item.purchased ? "line-through" : ""}>
                          {item.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {item.quantity}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {item.unit}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {STORES.map((store) => (
                            <a
                              key={store.name}
                              href={store.url(item.name)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium hover:bg-muted/80 transition-colors"
                              aria-label={store.name}
                            >
                              {store.name}
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemove(item.id)}
                          aria-label={`Verwijder ${item.name}`}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
