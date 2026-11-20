export interface Attachment {
  base64: string;
  mime: string;
  preview: string;
  name: string;
}
export async function prepareImage(file: File): Promise<Attachment> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Pilih foto JPEG, PNG, atau WebP.");
  if (file.size > 5 * 1024 * 1024)
    throw new Error("Ukuran foto maksimal 5 MB.");
  if (!file.size) throw new Error("File foto kosong.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(
      1,
      1280 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Browser tidak mendukung pemrosesan foto.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const preview = canvas.toDataURL("image/jpeg", 0.82);
    if (preview.length > 6 * 1024 * 1024)
      throw new Error(
        "Foto masih terlalu besar setelah diproses. Pilih foto lain.",
      );
    return {
      base64: preview.split(",")[1],
      mime: "image/jpeg",
      preview,
      name: file.name,
    };
  } catch (error) {
    if (error instanceof Error && error.name !== "EncodingError") throw error;
    throw new Error("Foto tidak dapat dibaca. Pilih file foto lain.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
