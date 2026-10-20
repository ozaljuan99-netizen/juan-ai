
import express from "express";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10kb" }));
app.use(express.static("public"));

const trabajos = new Map();

function obtenerIA() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Falta configurar GEMINI_API_KEY en el servidor.");
  }

  return new GoogleGenAI({ apiKey });
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, servicio: "JU4N AI VIDEO" });
});

app.post("/api/generate", async (req, res) => {
  const prompt = String(req.body?.prompt || "").trim();

  if (!prompt || prompt.length > 2000) {
    return res.status(400).json({
      error: "Escribe una descripción válida de hasta 2000 caracteres."
    });
  }

  const id = crypto.randomUUID();

  trabajos.set(id, { estado: "procesando" });

  res.json({ id, estado: "procesando" });

  procesarVideo(id, prompt).catch(error => {
    console.error("Error al generar:", error.message);
    trabajos.set(id, {
      estado: "error",
      error: "No se pudo generar el video. Comprueba el acceso a Veo y la cuota de tu cuenta."
    });
  });
});

async function procesarVideo(id, prompt) {
  const ai = obtenerIA();

  let operacion = await ai.models.generateVideos({
    model: "veo-3.1-generate-preview",
    prompt,
    config: {
      aspectRatio: "9:16",
      durationSeconds: 8,
      numberOfVideos: 1
    }
  });

  while (!operacion.done) {
    await new Promise(resolve => setTimeout(resolve, 10000));

    operacion = await ai.operations.getVideosOperation({
      operation: operacion
    });
  }

  const video =
    operacion.response?.generatedVideos?.[0]?.video;

  if (!video) {
    throw new Error("Google no devolvió un video.");
  }

  const archivo = await ai.files.download({ file: video });
  const partes = [];

  for await (const parte of archivo) {
    partes.push(Buffer.from(parte));
  }

  trabajos.set(id, {
    estado: "listo",
    video: Buffer.concat(partes)
  });
}

app.get("/api/status/:id", (req, res) => {
  const trabajo = trabajos.get(req.params.id);

  if (!trabajo) {
    return res.status(404).json({ error: "Trabajo no encontrado." });
  }

  res.json({
    estado: trabajo.estado,
    error: trabajo.error || null,
    videoUrl: trabajo.estado === "listo"
      ? `/api/video/${req.params.id}`
      : null
  });
});

app.get("/api/video/:id", (req, res) => {
  const trabajo = trabajos.get(req.params.id);

  if (!trabajo || trabajo.estado !== "listo") {
    return res.status(404).send("El video aún no está disponible.");
  }

  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Content-Disposition", "inline; filename=video.mp4");
  res.send(trabajo.video);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`JU4N AI VIDEO funcionando en el puerto ${PORT}`);
});
