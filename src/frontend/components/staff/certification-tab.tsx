"use client";

import React, { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Certification {
  id: string;
  staff_id: string;
  cert_type: string;
  cert_name: string;
  issued_at: string;
  expires_at: string;
  document_path: string | null;
  created_at: string;
  updated_at: string;
}

const CERT_TYPES = ["VCA", "BHV", "crane_license", "asbestos", "other"] as const;
type CertType = typeof CERT_TYPES[number];

interface CertFormData {
  cert_type: CertType;
  cert_name: string;
  issued_at: string;
  expires_at: string;
}

const EMPTY_FORM: CertFormData = {
  cert_type: "VCA",
  cert_name: "",
  issued_at: "",
  expires_at: "",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  // ISO "2027-03-15" → "15-03-2027"
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function certStatus(expiresAt: string): "verlopen" | "verloopt-binnenkort" | "geldig" {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiresAt);
  exp.setHours(0, 0, 0, 0);
  if (exp <= today) return "verlopen";
  const soon = new Date(today);
  soon.setDate(today.getDate() + 30);
  if (exp <= soon) return "verloopt-binnenkort";
  return "geldig";
}

// ---------------------------------------------------------------------------
// Add dialog
// ---------------------------------------------------------------------------

interface AddDialogProps {
  staffId: string;
  onClose: () => void;
  onSaved: (cert: Certification) => void;
}

function AddCertificationDialog({ staffId, onClose, onSaved }: AddDialogProps) {
  const [form, setForm] = useState<CertFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const cert = await apiFetch<Certification>(
        `/staff/${staffId}/certifications`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      onSaved(cert);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4">Certificering toevoegen</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="cert_type" className="block text-sm font-medium mb-1">
              Type
            </label>
            <select
              id="cert_type"
              value={form.cert_type}
              onChange={(e) => setForm({ ...form, cert_type: e.target.value as CertType })}
              className="w-full border rounded px-3 py-2 text-sm"
              required
            >
              {CERT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cert_name" className="block text-sm font-medium mb-1">
              Naam
            </label>
            <input
              id="cert_name"
              type="text"
              value={form.cert_name}
              onChange={(e) => setForm({ ...form, cert_name: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm"
              required
              minLength={1}
            />
          </div>
          <div>
            <label htmlFor="issued_at" className="block text-sm font-medium mb-1">
              Afgiftedatum
            </label>
            <input
              id="issued_at"
              type="date"
              value={form.issued_at}
              onChange={(e) => setForm({ ...form, issued_at: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label htmlFor="expires_at" className="block text-sm font-medium mb-1">
              Vervaldatum
            </label>
            <input
              id="expires_at"
              type="date"
              value={form.expires_at}
              onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm"
              required
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Annuleren
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Opslaan..." : "Opslaan"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface CertificationTabProps {
  staffId: string;
}

export default function CertificationTab({ staffId }: CertificationTabProps) {
  const [certs, setCerts] = useState<Certification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<Certification[]>(`/staff/${staffId}/certifications`)
      .then((data) => {
        if (!cancelled) {
          setCerts(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Laden mislukt");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  if (loading) {
    return <div className="py-8 text-center text-gray-500">Laden...</div>;
  }

  if (error) {
    return <div className="py-8 text-center text-red-600">{error}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-base font-semibold">Certificeringen</h3>
        <Button
          size="sm"
          onClick={() => setShowAdd(true)}
        >
          <Plus className="mr-1 h-4 w-4" />
          Certificering toevoegen
        </Button>
      </div>

      {certs.length === 0 ? (
        <p className="text-gray-500 text-sm py-4">
          Geen certificeringen gevonden.
        </p>
      ) : (
        <div className="divide-y">
          {certs.map((cert) => {
            const status = certStatus(cert.expires_at);
            return (
              <div key={cert.id} className="py-3 flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium text-sm">{cert.cert_name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Verloopt: {formatDate(cert.expires_at)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {cert.cert_type}
                  </Badge>
                  {status === "verlopen" && (
                    <Badge variant="destructive" className="text-xs">
                      Verlopen
                    </Badge>
                  )}
                  {status === "verloopt-binnenkort" && (
                    <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800">
                      Verloopt binnenkort
                    </Badge>
                  )}
                  {status === "geldig" && (
                    <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                      Geldig
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <AddCertificationDialog
          staffId={staffId}
          onClose={() => setShowAdd(false)}
          onSaved={(cert) => {
            setCerts((prev) => [...prev, cert]);
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}
