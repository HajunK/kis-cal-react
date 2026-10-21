// Getting a picked image ready to upload: cropped or shrunk, and re-encoded as
// a WebP (or a JPEG where the browser can't), so a phone photo of several MB
// goes up as a small file.

// The largest centered piece of a w x h picture with this width-to-height ratio.
export function cropRect(width, height, ratio) {
  const wantedWidth = Math.min(width, Math.round(height * ratio));
  const wantedHeight = Math.min(height, Math.round(width / ratio));
  return { x: Math.round((width - wantedWidth) / 2), y: Math.round((height - wantedHeight) / 2), width: wantedWidth, height: wantedHeight };
}

// width x height scaled down to fit inside max x max, never up.
export function fitWithin(width, height, max) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function drawn(file, width, height, crop) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const source = crop(bitmap.width, bitmap.height);
  canvas.getContext("2d").drawImage(bitmap, source.x, source.y, source.width, source.height, 0, 0, width, height);
  bitmap.close?.();
  return canvas;
}

const encode = (canvas, quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob((webp) => {
      if (webp && webp.type === "image/webp") return resolve(webp);
      canvas.toBlob((jpeg) => (jpeg ? resolve(jpeg) : reject(new Error("Couldn't read that image"))), "image/jpeg", quality);
    }, "image/webp", quality);
  });

// A card's picture: the middle of the image at 16:9, 960 x 540.
export async function prepareThumbnail(file) {
  const canvas = await drawn(file, 960, 540, (w, h) => cropRect(w, h, 16 / 9));
  return encode(canvas, 0.82);
}

// A picture for inside a guide: the whole image, at most 1600 px on a side.
export async function prepareBodyImage(file) {
  const bitmap = await createImageBitmap(file);
  const size = fitWithin(bitmap.width, bitmap.height, 1600);
  bitmap.close?.();
  const canvas = await drawn(file, size.width, size.height, (w, h) => ({ x: 0, y: 0, width: w, height: h }));
  return encode(canvas, 0.85);
}
