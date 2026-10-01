import { supabase } from "./supabase";
import { WORK_FILE_BUCKET, workFileHash } from "./workDocumentFiles";
import type { OriginalContent, WorkOriginal } from "./workDocumentFiles";

export async function listWorkOriginals(documentId: string,revision: number): Promise<WorkOriginal[]> {
  const result=await supabase.rpc("list_offerpsp_work_files",{p_document_id:documentId,p_revision:revision});
  if(result.error) throw new Error(result.error.message);
  if(!Array.isArray(result.data?.files)) throw new Error("Список оригиналов не подтверждён сервером.");
  return result.data.files;
}
export async function saveWorkOriginal(documentId:string,revision:number,file:File,extracted:{format:"pdf"|"docx";sha256:string;text:string}): Promise<WorkOriginal> {
  const reservation=await supabase.rpc("reserve_offerpsp_work_file",{p_document_id:documentId,p_expected_revision:revision,p_file_id:crypto.randomUUID(),
    p_filename:file.name,p_format:extracted.format,p_size:file.size,p_sha256:extracted.sha256,p_text:extracted.text});
  if(reservation.error) throw new Error(reservation.error.message);
  const original=reservation.data as WorkOriginal;
  if(original.document_id!==documentId || original.sha256!==extracted.sha256 || !original.object_path) throw new Error("Резервирование оригинала не подтверждено.");
  if(original.status==="ready") return original;
  const upload=await supabase.storage.from(WORK_FILE_BUCKET).upload(original.object_path,file,{upsert:false,
    contentType:extracted.format==="pdf"?"application/pdf":"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
  // A retry after an ambiguous upload can reuse the original, never overwrite it.
  if(upload.error && !["409","400"].includes(String(upload.error.statusCode))) throw new Error(`Загрузка не подтверждена. Повторно выбери тот же файл; оригинал не заменяется. ${upload.error.message}`);
  const complete=await supabase.rpc("complete_offerpsp_work_file",{p_file_id:original.id});
  if(complete.error) throw new Error(`Оригинал ещё не подтверждён. Повторно выбери тот же файл для продолжения. ${complete.error.message}`);
  if(complete.data?.status!=="ready" || complete.data?.id!==original.id) throw new Error("Нет подтверждения сохранённого оригинала.");
  return complete.data;
}
export async function readWorkOriginal(id:string):Promise<OriginalContent> {
  const result=await supabase.rpc("get_offerpsp_work_file",{p_file_id:id});
  if(result.error) throw new Error(result.error.message);
  if(result.data?.id!==id || result.data?.status!=="ready" || typeof result.data?.extracted_text!=="string") throw new Error("Оригинал не подтверждён сервером.");
  return result.data;
}
export async function downloadWorkOriginal(original:WorkOriginal):Promise<Blob> {
  const result=await supabase.storage.from(WORK_FILE_BUCKET).download(original.object_path);
  if(result.error) throw new Error(result.error.message);
  if(!result.data || result.data.size!==original.size_bytes || await workFileHash(await result.data.arrayBuffer())!==original.sha256) throw new Error("Размер или хеш оригинала не совпадает. Файл не открыт.");
  return result.data;
}
