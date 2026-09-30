const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

export class FileInputError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "FileInputError";
    this.code = code;
  }
}

export function decodeBase64File(value) {
  if (typeof value !== "string") throw new FileInputError("file_required");

  const payload = value
    .replace(/^data:[^;,]+;base64,/i, "")
    .replace(/\s+/g, "");

  if (!payload) throw new FileInputError("file_required");
  if (!BASE64_PATTERN.test(payload) || payload.length % 4 === 1) {
    throw new FileInputError("invalid_base64");
  }

  const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=");
  const buffer = Buffer.from(padded, "base64");
  const canonicalInput = padded.replace(/=+$/, "");
  const canonicalOutput = buffer.toString("base64").replace(/=+$/, "");

  if (!buffer.length || canonicalInput !== canonicalOutput) {
    throw new FileInputError("invalid_base64");
  }

  return buffer;
}
