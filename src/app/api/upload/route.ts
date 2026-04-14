import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/lib/auth";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/plain",
  "text/csv",
  "image/jpeg",
  "image/png",
  "image/webp",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const formData = await req.formData();
  const files = formData.getAll("files") as File[];

  if (files.length === 0) {
    return NextResponse.json({ error: "No se proporcionaron archivos" }, { status: 400 });
  }

  if (files.length > 20) {
    return NextResponse.json({ error: "M\u00e1ximo 20 archivos por solicitud" }, { status: 400 });
  }

  const uploadedFiles: { url: string; name: string; type: string; size: number }[] = [];

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `El archivo ${file.name} excede el l\u00edmite de 25MB` },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Tipo de archivo no soportado: ${file.type}` },
        { status: 400 }
      );
    }

    const blob = await put(`uploads/${session.user.id}/${Date.now()}-${file.name}`, file, {
      access: "private",
    });

    uploadedFiles.push({
      url: blob.url,
      name: file.name,
      type: file.type,
      size: file.size,
    });
  }

  return NextResponse.json({ files: uploadedFiles });
}
