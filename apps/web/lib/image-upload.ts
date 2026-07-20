export const MAX_STORED_IMAGE_BYTES = 1024 * 1024;
export const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;

const MAX_IMAGE_DIMENSION = 2048;
const MIN_JPEG_QUALITY = 0.42;
const MAX_JPEG_QUALITY = 0.9;
const ENCODE_ATTEMPTS = 8;

export function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

function compressedFileName(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, "").trim() || "image";
  return `${baseName}.jpg`;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("ไม่สามารถบีบอัดรูปภาพนี้ได้"));
    }, "image/jpeg", quality);
  });
}

function resizedCanvas(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, maxDimension: number) {
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("เบราว์เซอร์ไม่รองรับการบีบอัดรูปภาพ");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

async function encodeUnderLimit(initialCanvas: HTMLCanvasElement) {
  let canvas = initialCanvas;

  for (let resizeAttempt = 0; resizeAttempt < 5; resizeAttempt += 1) {
    let low = MIN_JPEG_QUALITY;
    let high = MAX_JPEG_QUALITY;
    let bestBlob: Blob | null = null;

    for (let attempt = 0; attempt < ENCODE_ATTEMPTS; attempt += 1) {
      const quality = (low + high) / 2;
      const blob = await canvasToJpeg(canvas, quality);
      if (blob.size <= MAX_STORED_IMAGE_BYTES) {
        bestBlob = blob;
        low = quality;
      } else {
        high = quality;
      }
    }

    if (bestBlob) return bestBlob;
    canvas = resizedCanvas(canvas, canvas.width, canvas.height, Math.round(Math.max(canvas.width, canvas.height) * 0.8));
  }

  throw new Error("ไม่สามารถลดขนาดรูปให้ต่ำกว่า 1 MB ได้ กรุณาเลือกรูปอื่น");
}

export async function compressImageForUpload(file: File) {
  if (!isImageFile(file)) return file;
  if (file.size <= 0 || file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error("รูปต้นฉบับต้องมีขนาดไม่เกิน 20 MB");
  }

  const objectURL = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";

  try {
    image.src = objectURL;
    await image.decode();
    if (file.size <= MAX_STORED_IMAGE_BYTES && Math.max(image.naturalWidth, image.naturalHeight) <= MAX_IMAGE_DIMENSION) {
      return file;
    }

    const canvas = resizedCanvas(image, image.naturalWidth, image.naturalHeight, MAX_IMAGE_DIMENSION);
    const blob = await encodeUnderLimit(canvas);
    return new File([blob], compressedFileName(file.name), { type: "image/jpeg", lastModified: Date.now() });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("ไม่สามารถ")) throw error;
    throw new Error("ไม่สามารถอ่านรูปภาพนี้ได้ กรุณาใช้ไฟล์ JPG, PNG หรือ WEBP");
  } finally {
    URL.revokeObjectURL(objectURL);
  }
}
