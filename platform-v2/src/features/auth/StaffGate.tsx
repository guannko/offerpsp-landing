import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { SkeletonPage } from "../../components/control/Ui";
import { useControlBridge } from "../../context/ControlBridgeContext";

export default function StaffGate({ children }: { children: ReactNode }) {
  const { loading, user, staff, accessDenied, error, signOut } = useControlBridge();
  if (loading) return <div className="min-h-screen bg-gray-50 p-8 dark:bg-gray-950"><SkeletonPage/></div>;
  if (!user) return <Navigate to="/signin" replace/>;
  if (accessDenied || !staff) return <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6 dark:bg-gray-950"><div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-theme-lg dark:border-gray-800 dark:bg-gray-900"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-error-50 text-2xl dark:bg-error-500/10">🔒</span><h1 className="mt-5 text-xl font-semibold text-gray-900 dark:text-white">Доступ не подтверждён</h1><p className="mt-2 text-sm text-gray-500">{error || "Аккаунт не входит в активную команду OfferPSP."}</p><button onClick={()=>void signOut()} className="mt-6 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-gray-900">Войти другим аккаунтом</button></div></div>;
  return children;
}
