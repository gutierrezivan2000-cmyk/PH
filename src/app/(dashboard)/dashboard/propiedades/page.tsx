"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/dashboard/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Building,
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
    if (!confirm("¿Estas seguro de eliminar esta propiedad?")) return;
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
      <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-3xl space-y-6">
        <div className="flex justify-between items-center">
          <p className="text-muted-foreground text-sm">
            Administra las propiedades horizontales que gestionas
          </p>
          <Button
            onClick={() => setShowForm(!showForm)}
            className="gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-lg shadow-violet-500/25 transition-all duration-300 rounded-xl"
          >
            {showForm ? (
              <X className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {showForm ? "Cancelar" : "Agregar"}
          </Button>
        </div>

        {/* Create Form */}
        {showForm && (
          <div className="animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="bg-white dark:bg-white/5 dark:backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-3xl shadow-lg shadow-violet-500/5 dark:shadow-black/20 p-6">
              <h3 className="text-base font-semibold mb-4">Nueva Propiedad</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="bg-red-50/80 dark:bg-red-500/10 backdrop-blur-sm border border-red-200/50 dark:border-red-500/20 rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {error}
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">
                    Nombre del conjunto/edificio *
                  </label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej: Conjunto Residencial Los Pinos"
                    className="rounded-xl border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 focus:border-violet-300 focus:ring-violet-200 transition-all duration-200"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">
                    Direccion
                  </label>
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Ej: Calle 123 #45-67"
                    className="rounded-xl border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 focus:border-violet-300 focus:ring-violet-200 transition-all duration-200"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">
                      Ciudad
                    </label>
                    <Input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Ej: Bogota"
                      className="rounded-xl border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 focus:border-violet-300 focus:ring-violet-200 transition-all duration-200"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">
                      Unidades
                    </label>
                    <Input
                      type="number"
                      value={units}
                      onChange={(e) => setUnits(e.target.value)}
                      placeholder="Ej: 120"
                      className="rounded-xl border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 focus:border-violet-300 focus:ring-violet-200 transition-all duration-200"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-lg shadow-violet-500/25 transition-all duration-300 rounded-xl"
                >
                  {loading ? "Guardando..." : "Guardar Propiedad"}
                </Button>
              </form>
            </div>
          </div>
        )}

        {/* Empty State */}
        {properties.length === 0 && !showForm && (
          <div className="bg-white dark:bg-white/5 dark:backdrop-blur-xl border border-dashed border-gray-300 dark:border-white/10 rounded-3xl shadow-lg shadow-violet-500/5 dark:shadow-black/20">
            <div className="flex flex-col items-center py-16 text-center px-6">
              <div className="w-16 h-16 bg-gradient-to-br from-violet-500/20 to-purple-500/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-4">
                <Building className="h-8 w-8 text-violet-600 dark:text-violet-400" />
              </div>
              <p className="font-semibold mb-1">
                No tienes propiedades registradas
              </p>
              <p className="text-sm text-muted-foreground max-w-xs">
                Agrega tu primera propiedad para empezar a generar documentos
                profesionales
              </p>
              <Button
                className="mt-6 gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-lg shadow-violet-500/25 transition-all duration-300 rounded-xl"
                onClick={() => setShowForm(true)}
              >
                <Plus className="h-4 w-4" />
                Agregar primera propiedad
              </Button>
            </div>
          </div>
        )}

        {/* Property Cards */}
        <div className="space-y-3">
          {properties.map((property) => (
            <div
              key={property.id}
              className="group bg-white dark:bg-white/5 dark:backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-3xl shadow-lg shadow-violet-500/5 dark:shadow-black/20 hover:shadow-xl hover:shadow-violet-500/10 dark:hover:shadow-black/30 transition-all duration-300"
            >
              {editingId === property.id ? (
                <div className="p-5 animate-in fade-in duration-200">
                  <form onSubmit={handleEditSubmit} className="space-y-4">
                    {editError && (
                      <div className="bg-red-50/80 dark:bg-red-500/10 backdrop-blur-sm border border-red-200/50 dark:border-red-500/20 rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                        {editError}
                      </div>
                    )}
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1.5 block">
                        Nombre *
                      </label>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Nombre del conjunto/edificio"
                        className="rounded-xl border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 focus:border-violet-300 focus:ring-violet-200 transition-all duration-200"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1.5 block">
                        Direccion
                      </label>
                      <Input
                        value={editAddress}
                        onChange={(e) => setEditAddress(e.target.value)}
                        placeholder="Direccion"
                        className="rounded-xl border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 focus:border-violet-300 focus:ring-violet-200 transition-all duration-200"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-foreground mb-1.5 block">
                          Ciudad
                        </label>
                        <Input
                          value={editCity}
                          onChange={(e) => setEditCity(e.target.value)}
                          placeholder="Ciudad"
                          className="rounded-xl border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 focus:border-violet-300 focus:ring-violet-200 transition-all duration-200"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-foreground mb-1.5 block">
                          Unidades
                        </label>
                        <Input
                          type="number"
                          value={editUnits}
                          onChange={(e) => setEditUnits(e.target.value)}
                          placeholder="Unidades"
                          className="rounded-xl border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 focus:border-violet-300 focus:ring-violet-200 transition-all duration-200"
                        />
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Button
                        type="submit"
                        disabled={editLoading}
                        className="flex-1 gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-lg shadow-violet-500/25 transition-all duration-300 rounded-xl"
                      >
                        <Check className="h-4 w-4" />
                        {editLoading ? "Guardando..." : "Guardar"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={cancelEditing}
                        className="flex-1 gap-2 rounded-xl border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 transition-all duration-200"
                      >
                        <X className="h-4 w-4" />
                        Cancelar
                      </Button>
                    </div>
                  </form>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 sm:gap-4 p-4 sm:p-5">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-violet-500/20 to-purple-500/20 backdrop-blur-sm rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform duration-300">
                      <Building className="h-5 w-5 sm:h-6 sm:w-6 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{property.name}</p>
                      <div className="flex flex-wrap gap-3 mt-1">
                        {property.address && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {property.address}
                          </span>
                        )}
                        {property.city && (
                          <span className="text-xs text-muted-foreground">
                            {property.city}
                          </span>
                        )}
                        {property.units && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Home className="h-3 w-3" /> {property.units} unidades
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => toggleExpand(property.id)}
                        className="p-2 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-500/10 text-muted-foreground hover:text-violet-600 dark:hover:text-violet-400 transition-all"
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
                        className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200 p-2 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-500/10 text-muted-foreground hover:text-violet-600 dark:hover:text-violet-400"
                        title="Editar propiedad"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(property.id)}
                        className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                        title="Eliminar propiedad"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Documents section */}
                  {expandedId === property.id && (
                    <div className="px-5 pb-5 pt-0 border-t border-gray-100 dark:border-white/5 mt-0">
                      <div className="pt-4 space-y-3">
                        <div className="flex items-center gap-2 mb-1">
                          <BookOpen className="h-4 w-4 text-violet-500" />
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">Documentos de la propiedad</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Los agentes IA usaran estos documentos como contexto para darte respuestas mas precisas.
                        </p>

                        {/* Manual de Convivencia */}
                        <DocumentSlot
                          label="Manual de Convivencia"
                          icon={<Shield className="h-5 w-5 text-violet-500 flex-shrink-0" />}
                          doc={getDocByType(property.id, "manual_convivencia")}
                          uploading={uploadingDoc === `${property.id}-manual_convivencia`}
                          onUpload={(file) => handleDocUpload(property.id, "manual_convivencia", file)}
                          onDelete={(docId) => handleDocDelete(property.id, docId)}
                        />

                        {/* Reglamento Interno */}
                        <DocumentSlot
                          label="Reglamento Interno"
                          icon={<FileText className="h-5 w-5 text-emerald-500 flex-shrink-0" />}
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
  if (uploading) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5">
        {icon}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium">{label}</span>
          <span className="block text-xs text-violet-600">Subiendo...</span>
        </div>
        <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
      </div>
    );
  }

  if (doc) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5">
        {icon}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-gray-900 dark:text-white truncate block">{doc.name}</span>
          <span className="text-xs text-muted-foreground">
            {label} — {(doc.size / 1024 / 1024).toFixed(1)} MB
          </span>
        </div>
        <button
          onClick={() => onDelete(doc.id)}
          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500 transition-colors"
          title="Eliminar documento"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <label className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-gray-300 dark:border-white/10 cursor-pointer hover:border-violet-300 dark:hover:border-violet-500/30 hover:bg-violet-50/50 dark:hover:bg-violet-500/5 transition-all">
      {icon}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">PDF o Word — clic para subir</span>
      </div>
      <Upload className="h-4 w-4 text-gray-400" />
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
