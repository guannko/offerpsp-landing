import { supabase } from "./supabase";
import { validateWorkDocument } from "./workDocuments";
import type { DocumentRead, DocumentRepository, DocumentSummary, WorkDocument } from "./workDocuments";

// Uses the existing staff session. No service credentials, local cache or client publication.
export const workDocumentRepository: DocumentRepository = {
  async list(offset) {
    const result = await supabase.rpc("list_offerpsp_work_documents", { p_offset: offset });
    if (result.error) throw new Error(result.error.message);
    if (!Array.isArray(result.data?.documents) || !Number.isInteger(result.data?.total)) throw new Error("Список документов не подтверждён сервером.");
    return result.data as { documents: DocumentSummary[]; total: number };
  },
  async get(id, revision) {
    const result = await supabase.rpc("get_offerpsp_work_document", { p_document_id: id, p_revision: revision ?? null });
    if (result.error) throw new Error(result.error.message);
    if (result.data?.id !== id || !Number.isInteger(result.data?.revision) || !Number.isInteger(result.data?.current_revision) || !Array.isArray(result.data?.history) || validateWorkDocument(result.data?.body)) throw new Error("Получен неподдерживаемый документ. Исходник не изменён.");
    return result.data as DocumentRead;
  },
  async save(draft) {
    const result = await supabase.rpc("save_offerpsp_work_document", { p_document_id: draft.id, p_expected_revision: draft.revision, p_body: draft.body });
    if (result.error) throw new Error(result.error.message);
    if (result.data?.outcome === "conflict") throw new Error("Документ изменён в другой вкладке. Твой текст остался в редакторе и ничего не перезаписал. Выгрузи его или создай рабочую копию; затем открой актуальную версию.");
    if (result.data?.outcome !== "saved") throw new Error("Сохранение не подтверждено сервером. Не закрывай черновик; проверь актуальную версию перед повтором.");
    return result.data as WorkDocument;
  },
};
