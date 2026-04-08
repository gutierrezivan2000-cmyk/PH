"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/dashboard/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Building, Plus, MapPin, Home } from "lucide-react";

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
      <div className="p-6 max-w-3xl space-y-6">
        <div className="flex justify-between items-center">
          <p className="text-muted-foreground">
            Administra las propiedades horizontales que gestionas
          </p>
          <Button onClick={() => setShowForm(!showForm)} className="gap-2">
            <Plus className="h-4 w-4" />
            Agregar Propiedad
          </Button>
        </div>

        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Nueva Propiedad</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Nombre del conjunto/edificio *</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej: Conjunto Residencial Los Pinos"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Direccion</label>
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Ej: Calle 123 #45-67"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Ciudad</label>
                    <Input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Ej: Bogota"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Numero de unidades</label>
                    <Input
                      type="number"
                      value={units}
                      onChange={(e) => setUnits(e.target.value)}
                      placeholder="Ej: 120"
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button type="submit" disabled={loading}>
                    {loading ? "Guardando..." : "Guardar"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {properties.length === 0 && !showForm && (
          <Card>
            <CardContent className="flex flex-col items-center py-12 text-center">
              <Building className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="font-medium">No tienes propiedades registradas</p>
              <p className="text-sm text-muted-foreground mt-1">
                Agrega tu primera propiedad para empezar a generar documentos
              </p>
            </CardContent>
          </Card>
        )}

        {properties.map((property) => (
          <Card key={property.id}>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Building className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">{property.name}</p>
                <div className="flex gap-4 mt-1">
                  {property.address && (
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {property.address}
                    </span>
                  )}
                  {property.city && (
                    <span className="text-sm text-muted-foreground">{property.city}</span>
                  )}
                  {property.units && (
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
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
  );
}
