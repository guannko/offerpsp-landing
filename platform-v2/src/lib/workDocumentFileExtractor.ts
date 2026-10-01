import { validateDocxInflation, workFileFormat, workFileHash } from "./workDocumentFiles";

export async function extractWorkFile(file: File) {
  const format = workFileFormat(file.name,file.size);
  const buffer = await file.arrayBuffer();
  const sha256 = await workFileHash(buffer);
  let text = "";
  if (format === "docx") {
    await validateDocxInflation(buffer);
    const mammoth = await import("mammoth");
    text = (await mammoth.extractRawText({ arrayBuffer: buffer })).value.trim();
  } else {
    if (new TextDecoder().decode(buffer.slice(0,1024)).indexOf("%PDF-")<0) throw new Error("Файл не содержит заголовок PDF.");
    const [{getDocument,GlobalWorkerOptions}, worker] = await Promise.all([import("pdfjs-dist"),import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
    GlobalWorkerOptions.workerSrc = worker.default;
    const loading = getDocument({data: new Uint8Array(buffer.slice(0))});
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const interruption = new Promise<never>((_,reject) => {
        loading.onPassword = () => reject(new Error("PDF защищён паролем. Загрузи разрешённую незашифрованную копию."));
        deadline = setTimeout(() => reject(new Error("Разбор PDF занял слишком много времени.")),30000);
      });
      const pdf = await Promise.race([loading.promise,interruption]);
      if (pdf.numPages>100) throw new Error("Для автоматического разбора PDF допустимо до 100 страниц.");
      const pages:string[]=[];
      for (let number=1; number<=pdf.numPages; number++) {
        const page=await Promise.race([pdf.getPage(number),interruption]);
        const content=await Promise.race([page.getTextContent(),interruption]);
        pages.push(content.items.map(item => "str" in item ? item.str+(item.hasEOL?"\n":" ") : "").join("").trim());
        if (pages.join("\n\n").length>200000) throw new Error("Текст PDF превышает 200 000 символов.");
        page.cleanup();
      }
      text=pages.join("\n\n").trim();
    } finally { if (deadline) clearTimeout(deadline); await loading.destroy(); }
  }
  if (text.length>200000) throw new Error("Извлечённый текст превышает 200 000 символов.");
  return {format,sha256,text};
}
