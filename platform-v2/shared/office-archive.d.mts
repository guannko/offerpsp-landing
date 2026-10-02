export class OfficeFileError extends Error { constructor(message: string); }
export type OfficePart = { start: number; compressed: number; size: number; method: number };
export function checkOfficeArchive(data: ArrayBuffer, kind?: "docx" | "xlsx"): OfficePart[];
export function validateOfficeInflation(data: ArrayBuffer, kind?: "docx" | "xlsx"): Promise<void>;
export function validatePdfSignature(data: ArrayBuffer): void;
