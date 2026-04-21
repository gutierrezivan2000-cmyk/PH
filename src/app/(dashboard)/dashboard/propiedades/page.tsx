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
} from "lucide-react";

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

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editUnits, setEditUnits] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

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

  return (
    <div>
      <Header title="Mis Propiedades" />
      <div className="p-8 max-w-3xl space-y-6">
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

        {/* Create Form - Liquid Glass */}
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
                <div className="grid grid-cols-2 gap-4">
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

        {/* Empty State - Liquid Glass */}
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
                /* Inline Edit Form */
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
                    <div className="grid grid-cols-2 gap-4">
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
                /* Display Mode */
                <div className="flex items-center gap-4 p-5">
                  <div className="w-12 h-12 bg-gradient-to-br from-violet-500/20 to-purple-500/20 backdrop-blur-sm rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform duration-300">
                    <Building className="h-6 w-6 text-violet-600 dark:text-violet-400" />
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
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEditing(property)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-2 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-500/10 text-muted-foreground hover:text-violet-600 dark:hover:text-violet-400"
                      title="Editar propiedad"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(property.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                      title="Eliminar propiedad"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
