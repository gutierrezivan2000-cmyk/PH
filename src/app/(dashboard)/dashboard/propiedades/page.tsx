"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/dashboard/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Building, Plus, MapPin, Home, X } from "lucide-react";

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

  const fetchProperties = () => {
    fetch("/api/properties")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProperties(data);
      })
      .catch(console.error);
  };

  useEffect(() => { fetchProperties(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
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
      }
    } finally {
      setLoading(false);
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
          <Button onClick={() => setShowForm(!showForm)} className="gap-2">
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? "Cancelar" : "Agregar"}
          </Button>
        </div>

        {showForm && (
          <Card className="border-primary/20 shadow-md">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Nueva Propiedad</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Nombre del conjunto/edificio *</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej: Conjunto Residencial Los Pinos"
                    className="rounded-xl"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Direccion</label>
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Ej: Calle 123 #45-67"
                    className="rounded-xl"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Ciudad</label>
                    <Input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Ej: Bogota"
                      className="rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Unidades</label>
                    <Input
                      type="number"
                      value={units}
                      onChange={(e) => setUnits(e.target.value)}
                      placeholder="Ej: 120"
                      className="rounded-xl"
                    />
                  </div>
                </div>
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Guardando..." : "Guardar Propiedad"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {properties.length === 0 && !showForm && (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center py-16 text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
                <Building className="h-8 w-8 text-primary" />
              </div>
              <p className="font-semibold mb-1">No tienes propiedades registradas</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                Agrega tu primera propiedad para empezar a generar documentos profesionales
              </p>
              <Button className="mt-6 gap-2" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4" />
                Agregar primera propiedad
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {properties.map((property) => (
            <Card key={property.id} className="group hover:shadow-md transition-all duration-200">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                  <Building className="h-6 w-6 text-primary" />
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
                      <span className="text-xs text-muted-foreground">{property.city}</span>
                    )}
                    {property.units && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Home className="h-3 w-3" /> {property.units} unidades
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
