import { useCallback, useEffect, useState } from "react";
import PageMeta from "../components/common/PageMeta";
import { SkeletonPage } from "../components/control/Ui";
import CourseOrganizer from "../components/control/CourseOrganizer";
import { useControlBridge } from "../context/ControlBridgeContext";
import { supabase } from "../lib/supabase";
import { initialCoursePlan } from "../lib/coursePlan";
import type { CourseSnapshot } from "../lib/coursePlan";
import { isQaFixtureLeadId, isQaFixtureProvider } from "../lib/qaFixtures";
import { workDocumentRepository } from "../lib/workDocumentRepository";
import { isCourseBusinessLead, isCourseBusinessTask, isCourseBusinessThread } from "../lib/courseVisibility";
import type { EmailThread, OperationsWorkspaceSnapshot } from "../types/offerpsp";

export default function CoursePage() {
  const bridge = useControlBridge();
  const [snapshot, setSnapshot] = useState<CourseSnapshot>({ revision: 0, plan: initialCoursePlan(), updated_at: null });
  const [tasks, setTasks] = useState<OperationsWorkspaceSnapshot["tasks"]>([]);
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [writable, setWritable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const userId = bridge.user?.id;
  const staffActive = bridge.staff?.active;

  const load = useCallback(async () => {
    if (!userId || !staffActive) return;
    setRefreshing(true);
    try {
      const [course, operations, mail] = await Promise.all([
        supabase.rpc("get_offerpsp_course_plan"),
        supabase.rpc("get_offerpsp_operations_workspace"),
        // Use only thread headers from this existing snapshot; no mark-read writes.
        supabase.rpc("get_offerpsp_mail_index", { p_limit: 250 }),
      ]);
      const problems: string[] = [];
      if (course.error) problems.push(`План не загружен; редактирование отключено. ${course.error.message}`);
      else setSnapshot({ revision: course.data.revision, plan: course.data.plan || initialCoursePlan(), updated_at: course.data.updated_at });
      setWritable(!course.error);
      if (operations.error) problems.push(`Задачи недоступны — их отсутствие на экране не означает пустую очередь. ${operations.error.message}`);
      setTasks(operations.error ? [] : (operations.data?.tasks || []));
      if (mail.error) problems.push(`История почты недоступна. ${mail.error.message}`);
      setThreads(mail.error ? [] : (mail.data?.threads || []));
      setErrors(problems); setUpdatedAt(new Date());
    } catch (cause) {
      setWritable(false);
      setErrors([`Не удалось перечитать органайзер. ${cause instanceof Error ? cause.message : "Ошибка соединения"}`]);
    } finally { setLoading(false); setRefreshing(false); }
  }, [userId, staffActive]);
  useEffect(() => { void load(); }, [load]);
  if (bridge.loading || loading) return <SkeletonPage/>;
  const businessLeads = bridge.leads.filter(isCourseBusinessLead);
  const excludedLeadIds = new Set(bridge.leads.filter((lead) => !isCourseBusinessLead(lead)).map((lead) => lead.lead_id));
  return <><PageMeta title="Мой курс | OfferPSP" description="Рабочий курс, направления, кейсы и следующий шаг капитана."/><CourseOrganizer
    snapshot={snapshot}
    documentRepository={workDocumentRepository}
    providers={bridge.providers.filter((provider) => !isQaFixtureProvider(provider) && !/e2e|no action required/i.test(`${provider.brand_name} ${provider.internal_code || ""}`) && provider.record_state !== "archived")}
    leads={businessLeads}
    tasks={tasks.filter((task) => isCourseBusinessTask(task, excludedLeadIds))}
    threads={threads.filter((thread) => isCourseBusinessThread(thread, excludedLeadIds))}
    compliance={bridge.complianceCases.filter((item) => !isQaFixtureLeadId(item.lead_id) && !excludedLeadIds.has(item.lead_id))}
    errors={[...errors, ...(bridge.error ? [`Основные данные загружены не полностью: ${bridge.error}`] : [])]}
    writable={writable} refreshing={refreshing || bridge.refreshing} updatedAt={updatedAt}
    onRefresh={async () => { await Promise.all([load(), bridge.refresh()]); }}
    onSave={async (plan, revision) => {
      const result = await supabase.rpc("save_offerpsp_course_plan", { p_expected_revision: revision, p_plan: plan });
      if (result.error) throw new Error(result.error.message);
      if (result.data?.outcome === "conflict") throw new Error("План изменён в другой вкладке. Твои изменения не перезаписали его. Обнови данные и повтори изменение.");
      if (result.data?.outcome !== "saved") throw new Error("Сохранение не подтверждено сервером.");
      const saved = result.data as CourseSnapshot;
      setSnapshot(saved);
      return saved;
    }}/></>;
}
