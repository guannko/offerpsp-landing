import { useState } from "react";
import { createRoot } from "react-dom/client";
import GeoObservationForm from "../../src/components/control/GeoObservationForm";
import type { GeoObservationInput } from "../../src/lib/geoObservationForm";
import "../../src/index.css";
import "../../src/layout/BridgePaper.css";

export function Proof() {
  const [saved, setSaved] = useState<GeoObservationInput | null>(null);
  return <main className="bridge-paper mx-auto max-w-5xl p-6">
    <p className="text-sm text-gray-500">Локальная проверка интерфейса. Нет подключения к базе; ответы никуда не отправляются.</p>
    <h1 className="mt-4 text-2xl font-semibold">GEO · проверить AI-видимость</h1>
    <GeoObservationForm busy={false} onSave={async input => { setSaved(input); }} />
    {saved && <section aria-label="Сохранённый тестовый результат" className="mt-5"><p role="status">Синтетическая проверка сохранена только в памяти браузера</p><pre className="whitespace-pre-wrap break-all">{JSON.stringify(saved, null, 2)}</pre></section>}
  </main>;
}
createRoot(document.getElementById("root")!).render(<Proof />);
