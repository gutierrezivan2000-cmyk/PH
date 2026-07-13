"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/dashboard/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Building2,
  Plus,
  MapPin,
  Home,
  X,
  AlertCircle,
  Trash2,
  Pencil,
  Check,
  FileText,
  Shield,
  BookOpen,
  Loader2,
  ChevronDown,
  ChevronUp,
  Upload,
  Layers,
} from "lucide-react";
import { upload as blobUpload } from "@vercel/blob/client";

interface PropertyDocument {
  id: string;
  type: string;
  name: string;
  url: string;
  size: number;
  mimeType: string | null;
  createdAt: string;
}

interface Property {
  id: string;
  name: string;
  address?: string;
  city?: string;
  units?: number;
  createdAt: string;
}

// Shared inline styles
const monoLabel: React.CSSProperties = {
  fontFamily: "'Geist Mono', 'GeistMono', monospace",
  fontSize: "10px",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

const cardStyle: React.CSSProperties = {
  background: "#15151a",
  border: "1px solid rgba(255,255,255,0.07)",
};

const inputStyle: React.CSSProperties = {
  background: "#1d1d24",
  border: "1px solid rgba(255,255,255,0.07)",
  color: "#f6f5f7",
  borderRadius: "10px",
};

export default function PropiedadesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [units, setUnits] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editUnits, setEditUnits] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [docs, setDocs] = useState<Record<string, PropertyDocument[]>>({});
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);

  const fetchProperties = () => {
    fetch("/api/properties")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProperties(data);
      })
      .catch(console.error);
  };

  useEffect(() => {
    fetchProperties();
  }, []);

  const fetchDocs = async (propertyId: string) => {
    try {
      const res = await fetch(`/api/properties/${propertyId}/documents`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setDocs((prev) => ({ ...prev, [propertyId]: data }));
      }
    } catch {
      // ignore
    }
  };

  const toggleExpand = (propertyId: string) => {
    if (expandedId === propertyId) {
      setExpandedId(null);
    } else {
      setExpandedId(propertyId);
      if (!docs[propertyId]) fetchDocs(propertyId);
    }
  };

  const handleDocUpload = async (propertyId: string, type: string, file: File) => {
    setUploadingDoc(`${propertyId}-${type}`);
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const result = await blobUpload(`property-docs/${propertyId}/${Date.now()}-${safeName}`, file, {
        access: "private",
        handleUploadUrl: "/api/upload/token",
        contentType: file.type || "application/octet-stream",
      });
      await fetch(`/api/properties/${propertyId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          name: file.name,
          url: result.url,
          size: file.size,
          mimeType: file.type,
        }),
      });
      await fetchDocs(propertyId);
    } catch {
      // ignore
    } finally {
      setUploadingDoc(null);
    }
  };

  const handleDocDelete = async (propertyId: string, docId: string) => {
    try {
      await fetch(`/api/properties/${propertyId}/documents?docId=${docId}`, {
        method: "DELETE",
      });
      setDocs((prev) => ({
        ...prev,
        [propertyId]: (prev[propertyId] || []).filter((d) => d.id !== docId),
      }));
    } catch {
      // ignore
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, address, city, units }),
      });

      if (res.ok) {
        setName("");
        setAddress("");
        setCity("");
        setUnits("");
        setShowForm(false);
        fetchProperties();
      } else {
        const data = await res.json();
        setError(data.error || "Error al guardar la propiedad");
      }
    } catch {
      setError("Error de conexion. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        "¿Eliminar esta propiedad? Se borrará también todo su historial de documentos generados (informes, actas y presentaciones). Esta acción no se puede deshacer."
      )
    )
      return;
    try {
      const res = await fetch(`/api/properties?id=${id}`, { method: "DELETE" });
      if (res.ok) fetchProperties();
    } catch {
      // ignore
    }
  };

  const startEditing = (property: Property) => {
    setEditingId(property.id);
    setEditName(property.name);
    setEditAddress(property.address || "");
    setEditCity(property.city || "");
    setEditUnits(property.units ? String(property.units) : "");
    setEditError("");
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditError("");
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim() || !editingId) return;

    setEditLoading(true);
    setEditError("");
    try {
      const res = await fetch("/api/properties", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          name: editName,
          address: editAddress,
          city: editCity,
          units: editUnits,
        }),
      });

      if (res.ok) {
        setEditingId(null);
        fetchProperties();
      } else {
        const data = await res.json();
        setEditError(data.error || "Error al actualizar la propiedad");
      }
    } catch {
      setEditError("Error de conexion. Intenta de nuevo.");
    } finally {
      setEditLoading(false);
    }
  };

  const getDocByType = (propertyId: string, type: string) =>
    (docs[propertyId] || []).find((d) => d.type === type);

  return (
    <div>
      <Header title="Mis Propiedades" />
      <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-3xl space-y-4">

        {/* Top row */}
        <div className="flex justify-between items-center">
          <p className="text-sm" style={{ color: "rgba(246,245,247,0.66)" }}>
            Administra las propiedades horizontales que gestionas
          </p>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 h-9 rounded-xl text-sm font-medium transition-all"
            style={{
              background: showForm ? "rgba(255,255,255,0.06)" : "#7c5cff",
              color: "#ffffff",
              border: showForm ? "1px solid rgba(255,255,255,0.12)" : "none",
              boxShadow: showForm ? "none" : "0 2px 12px rgba(124,92,255,0.35)",
            }}
            onMouseEnter={(e) => {
              if (!showForm) e.currentTarget.style.background = "#9a7fff";
            }}
            onMouseLeave={(e) => {
              if (!showForm) e.currentTarget.style.background = "#7c5cff";
            }}
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? "Cancelar" : "Nueva propiedad"}
          </button>
        </div>

        {/* Create Form */}
        {showForm && (
          <div className="animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="rounded-2xl p-6" style={cardStyle}>
              <h3
                className="font-medium mb-5"
                style={{ color: "#f6f5f7", fontSize: "15px", fontWeight: 500 }}
              >
                Nueva Propiedad
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div
                    className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
                    style={{
                      background: "rgba(255,111,111,0.08)",
                      border: "1px solid rgba(255,111,111,0.25)",
                      color: "#ff6f6f",
                    }}
                  >
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {error}
                  </div>
                )}
                <div>
                  <label className="block mb-1.5 text-xs font-medium" style={{ color: "rgba(246,245,247,0.66)" }}>
                    Nombre del conjunto/edificio *
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej: Conjunto Residencial Los Pinos"
                    required
                    className="w-full h-10 px-4 text-sm outline-none transition-all"
                    style={inputStyle}
                    onFocus={(e) => {
                      e.currentTarget.style.border = "1px solid #7c5cff";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,92,255,0.15)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.border = "1px solid rgba(255,255,255,0.07)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>
                <div>
                  <label className="block mb-1.5 text-xs font-medium" style={{ color: "rgba(246,245,247,0.66)" }}>
                    Direccion
                  </label>
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Ej: Calle 123 #45-67"
                    className="w-full h-10 px-4 text-sm outline-none transition-all"
                    style={inputStyle}
                    onFocus={(e) => {
                      e.currentTarget.style.border = "1px solid #7c5cff";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,92,255,0.15)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.border = "1px solid rgba(255,255,255,0.07)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1.5 text-xs font-medium" style={{ color: "rgba(246,245,247,0.66)" }}>
                      Ciudad
                    </label>
                    <input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Ej: Bogota"
                      className="w-full h-10 px-4 text-sm outline-none transition-all"
                      style={inputStyle}
                      onFocus={(e) => {
                        e.currentTarget.style.border = "1px solid #7c5cff";
                        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,92,255,0.15)";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.border = "1px solid rgba(255,255,255,0.07)";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    />
                  </div>
                  <div>
                    <label className="block mb-1.5 text-xs font-medium" style={{ color: "rgba(246,245,247,0.66)" }}>
                      Unidades
                    </label>
                    <input
                      type="number"
                      value={units}
                      onChange={(e) => setUnits(e.target.value)}
                      placeholder="Ej: 120"
                      className="w-full h-10 px-4 text-sm outline-none transition-all"
                      style={inputStyle}
                      onFocus={(e) => {
                        e.currentTarget.style.border = "1px solid #7c5cff";
                        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,92,255,0.15)";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.border = "1px solid rgba(255,255,255,0.07)";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-10 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                  style={{
                    background: loading ? "rgba(124,92,255,0.40)" : "#7c5cff",
                    color: "#ffffff",
                    boxShadow: loading ? "none" : "0 2px 12px rgba(124,92,255,0.30)",
                    cursor: loading ? "not-allowed" : "pointer",
                    border: "none",
                  }}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    "Guardar Propiedad"
                  )}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Empty State */}
        {properties.length === 0 && !showForm && (
          <div
            className="rounded-2xl flex flex-col items-center py-16 text-center px-6"
            style={{
              background: "#15151a",
              border: "1.5px dashed rgba(255,255,255,0.10)",
            }}
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
              style={{
                background: "rgba(124,92,255,0.10)",
                border: "1px solid rgba(124,92,255,0.20)",
              }}
            >
              <Building2 className="h-8 w-8" style={{ color: "#9a7fff" }} />
            </div>
            <span
              className="block mb-1"
              style={{
                ...monoLabel,
                color: "rgba(246,245,247,0.42)",
                marginBottom: "6px",
              }}
            >
              Sin propiedades
            </span>
            <p className="font-medium mb-1" style={{ color: "#f6f5f7", fontSize: "15px" }}>
              Aun no tienes propiedades
            </p>
            <p className="text-sm max-w-xs" style={{ color: "rgba(246,245,247,0.66)" }}>
              Agrega tu primera propiedad para empezar a generar documentos profesionales
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-6 flex items-center gap-2 px-5 h-10 rounded-xl text-sm font-medium transition-all"
              style={{
                background: "#7c5cff",
                color: "#ffffff",
                boxShadow: "0 2px 12px rgba(124,92,255,0.35)",
                border: "none",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#9a7fff"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#7c5cff"; }}
            >
              <Plus className="h-4 w-4" />
              Agregar primera propiedad
            </button>
          </div>
        )}

        {/* Property Cards */}
        <div className="space-y-3">
          {properties.map((property) => (
            <div
              key={property.id}
              className="group rounded-2xl overflow-hidden transition-all duration-300"
              style={{
                background: "#15151a",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.border = "1px solid rgba(124,92,255,0.25)";
                el.style.transform = "translateY(-2px)";
                el.style.boxShadow = "0 8px 32px rgba(0,0,0,0.30)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.border = "1px solid rgba(255,255,255,0.07)";
                el.style.transform = "translateY(0)";
                el.style.boxShadow = "none";
              }}
            >
              {editingId === property.id ? (
                <div className="p-5 animate-in fade-in duration-200">
                  <form onSubmit={handleEditSubmit} className="space-y-4">
                    {editError && (
                      <div
                        className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
                        style={{
                          background: "rgba(255,111,111,0.08)",
                          border: "1px solid rgba(255,111,111,0.25)",
                          color: "#ff6f6f",
                        }}
                      >
                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                        {editError}
                      </div>
                    )}
                    <div>
                      <label className="block mb-1.5 text-xs font-medium" style={{ color: "rgba(246,245,247,0.66)" }}>
                        Nombre *
                      </label>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Nombre del conjunto/edificio"
                        required
                        className="w-full h-10 px-4 text-sm outline-none transition-all"
                        style={inputStyle}
                        onFocus={(e) => {
                          e.currentTarget.style.border = "1px solid #7c5cff";
                          e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,92,255,0.15)";
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.border = "1px solid rgba(255,255,255,0.07)";
                          e.currentTarget.style.boxShadow = "none";
                        }}
                      />
                    </div>
                    <div>
                      <label className="block mb-1.5 text-xs font-medium" style={{ color: "rgba(246,245,247,0.66)" }}>
                        Direccion
                      </label>
                      <input
                        value={editAddress}
                        onChange={(e) => setEditAddress(e.target.value)}
                        placeholder="Direccion"
                        className="w-full h-10 px-4 text-sm outline-none transition-all"
                        style={inputStyle}
                        onFocus={(e) => {
                          e.currentTarget.style.border = "1px solid #7c5cff";
                          e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,92,255,0.15)";
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.border = "1px solid rgba(255,255,255,0.07)";
                          e.currentTarget.style.boxShadow = "none";
                        }}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block mb-1.5 text-xs font-medium" style={{ color: "rgba(246,245,247,0.66)" }}>
                          Ciudad
                        </label>
                        <input
                          value={editCity}
                          onChange={(e) => setEditCity(e.target.value)}
                          placeholder="Ciudad"
                          className="w-full h-10 px-4 text-sm outline-none transition-all"
                          style={inputStyle}
                          onFocus={(e) => {
                            e.currentTarget.style.border = "1px solid #7c5cff";
                            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,92,255,0.15)";
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.border = "1px solid rgba(255,255,255,0.07)";
                            e.currentTarget.style.boxShadow = "none";
                          }}
                        />
                      </div>
                      <div>
                        <label className="block mb-1.5 text-xs font-medium" style={{ color: "rgba(246,245,247,0.66)" }}>
                          Unidades
                        </label>
                        <input
                          type="number"
                          value={editUnits}
                          onChange={(e) => setEditUnits(e.target.value)}
                          placeholder="Unidades"
                          className="w-full h-10 px-4 text-sm outline-none transition-all"
                          style={inputStyle}
                          onFocus={(e) => {
                            e.currentTarget.style.border = "1px solid #7c5cff";
                            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,92,255,0.15)";
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.border = "1px solid rgba(255,255,255,0.07)";
                            e.currentTarget.style.boxShadow = "none";
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="submit"
                        disabled={editLoading}
                        className="flex-1 h-10 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all"
                        style={{
                          background: "#7c5cff",
                          color: "#ffffff",
                          boxShadow: "0 2px 12px rgba(124,92,255,0.30)",
                          border: "none",
                          cursor: editLoading ? "not-allowed" : "pointer",
                        }}
                      >
                        <Check className="h-4 w-4" />
                        {editLoading ? "Guardando..." : "Guardar"}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditing}
                        className="flex-1 h-10 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          color: "rgba(246,245,247,0.66)",
                          border: "1px solid rgba(255,255,255,0.10)",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                      >
                        <X className="h-4 w-4" />
                        Cancelar
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <>
                  {/* Card main row */}
                  <div className="flex items-center gap-3 sm:gap-4 p-4 sm:p-5">
                    {/* Building icon */}
                    <div
                      className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{
                        background: "rgba(124,92,255,0.10)",
                        border: "1px solid rgba(124,92,255,0.20)",
                      }}
                    >
                      <Building2 className="h-5 w-5 sm:h-6 sm:w-6" style={{ color: "#9a7fff" }} />
                    </div>

                    {/* Name + chips */}
                    <div className="flex-1 min-w-0">
                      <h3
                        className="font-bold truncate"
                        style={{ color: "#f6f5f7", fontSize: "15px" }}
                      >
                        {property.name}
                      </h3>
                      {property.address && (
                        <div
                          className="flex items-center gap-1 mt-0.5"
                          style={{
                            fontFamily: "'Geist Mono', monospace",
                            fontSize: "11px",
                            color: "rgba(246,245,247,0.42)",
                          }}
                        >
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{property.address}{property.city ? `, ${property.city}` : ""}</span>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {property.units && (
                          <span
                            className="flex items-center gap-1 px-2 py-0.5 rounded-md"
                            style={{
                              ...monoLabel,
                              background: "rgba(124,92,255,0.08)",
                              border: "1px solid rgba(124,92,255,0.20)",
                              color: "#9a7fff",
                            }}
                          >
                            <Home className="h-2.5 w-2.5" />
                            {property.units} unidades
                          </span>
                        )}
                        {property.city && !property.address && (
                          <span
                            className="flex items-center gap-1 px-2 py-0.5 rounded-md"
                            style={{
                              ...monoLabel,
                              background: "rgba(255,255,255,0.04)",
                              border: "1px solid rgba(255,255,255,0.07)",
                              color: "rgba(246,245,247,0.66)",
                            }}
                          >
                            {property.city}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => toggleExpand(property.id)}
                        className="p-2 rounded-lg transition-all"
                        style={{ color: "rgba(246,245,247,0.42)" }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(124,92,255,0.10)";
                          e.currentTarget.style.color = "#9a7fff";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.color = "rgba(246,245,247,0.42)";
                        }}
                        title="Documentos"
                      >
                        {expandedId === property.id ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={() => startEditing(property)}
                        className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200 p-2 rounded-lg"
                        style={{ color: "rgba(246,245,247,0.42)" }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(124,92,255,0.10)";
                          e.currentTarget.style.color = "#9a7fff";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.color = "rgba(246,245,247,0.42)";
                        }}
                        title="Editar propiedad"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(property.id)}
                        className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200 p-2 rounded-lg"
                        style={{ color: "rgba(246,245,247,0.42)" }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(255,111,111,0.10)";
                          e.currentTarget.style.color = "#ff6f6f";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.color = "rgba(246,245,247,0.42)";
                        }}
                        title="Eliminar propiedad"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Documents section */}
                  {expandedId === property.id && (
                    <div
                      className="px-5 pb-5"
                      style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      <div className="pt-4 space-y-3">
                        <div className="flex items-center gap-2 mb-1">
                          <BookOpen className="h-4 w-4" style={{ color: "#9a7fff" }} />
                          <span
                            className="text-sm font-semibold"
                            style={{ color: "#f6f5f7" }}
                          >
                            Documentos de la propiedad
                          </span>
                        </div>
                        <p className="text-xs" style={{ color: "rgba(246,245,247,0.42)" }}>
                          Los agentes IA usaran estos documentos como contexto para darte respuestas mas precisas.
                        </p>

                        <DocumentSlot
                          label="Manual de Convivencia"
                          icon={<Shield className="h-5 w-5 flex-shrink-0" style={{ color: "#9a7fff" }} />}
                          doc={getDocByType(property.id, "manual_convivencia")}
                          uploading={uploadingDoc === `${property.id}-manual_convivencia`}
                          onUpload={(file) => handleDocUpload(property.id, "manual_convivencia", file)}
                          onDelete={(docId) => handleDocDelete(property.id, docId)}
                        />

                        <DocumentSlot
                          label="Reglamento Interno"
                          icon={<FileText className="h-5 w-5 flex-shrink-0" style={{ color: "#4cd6a0" }} />}
                          doc={getDocByType(property.id, "reglamento_interno")}
                          uploading={uploadingDoc === `${property.id}-reglamento_interno`}
                          onUpload={(file) => handleDocUpload(property.id, "reglamento_interno", file)}
                          onDelete={(docId) => handleDocDelete(property.id, docId)}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DocumentSlot({
  label,
  icon,
  doc,
  uploading,
  onUpload,
  onDelete,
}: {
  label: string;
  icon: React.ReactNode;
  doc?: PropertyDocument;
  uploading: boolean;
  onUpload: (file: File) => void;
  onDelete: (docId: string) => void;
}) {
  const monoMini: React.CSSProperties = {
    fontFamily: "'Geist Mono', monospace",
    fontSize: "11px",
    letterSpacing: "0.08em",
  };

  if (uploading) {
    return (
      <div
        className="flex items-center gap-3 p-3 rounded-xl"
        style={{
          background: "#1d1d24",
          border: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        {icon}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium" style={{ color: "#f6f5f7" }}>{label}</span>
          <span className="block text-xs" style={{ color: "#9a7fff", ...monoMini }}>Subiendo...</span>
        </div>
        <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#9a7fff" }} />
      </div>
    );
  }

  if (doc) {
    return (
      <div
        className="flex items-center gap-3 p-3 rounded-xl"
        style={{
          background: "#1d1d24",
          border: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        {icon}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium truncate block" style={{ color: "#f6f5f7" }}>{doc.name}</span>
          <span className="text-xs" style={{ color: "rgba(246,245,247,0.42)", ...monoMini }}>
            {label} — {(doc.size / 1024 / 1024).toFixed(1)} MB
          </span>
        </div>
        <button
          onClick={() => onDelete(doc.id)}
          className="p-1.5 rounded-lg transition-all"
          style={{ color: "rgba(246,245,247,0.42)" }}
          title="Eliminar documento"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,111,111,0.10)";
            e.currentTarget.style.color = "#ff6f6f";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "rgba(246,245,247,0.42)";
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <label
      className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all"
      style={{
        background: "transparent",
        border: "1.5px dashed rgba(255,255,255,0.10)",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.border = "1.5px dashed rgba(124,92,255,0.40)";
        el.style.background = "rgba(124,92,255,0.05)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.border = "1.5px dashed rgba(255,255,255,0.10)";
        el.style.background = "transparent";
      }}
    >
      {icon}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium" style={{ color: "#f6f5f7" }}>{label}</span>
        <span className="block text-xs" style={{ color: "rgba(246,245,247,0.42)", ...monoMini }}>
          PDF o Word — clic para subir
        </span>
      </div>
      <Upload className="h-4 w-4" style={{ color: "rgba(246,245,247,0.42)" }} />
      <input
        type="file"
        className="hidden"
        accept=".pdf,.docx,.doc"
        onChange={(e) => {
          if (e.target.files?.[0]) onUpload(e.target.files[0]);
        }}
      />
    </label>
  );
}
