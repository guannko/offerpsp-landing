import type { ReactNode } from "react";
import {
  BoltIcon,
  BoxCubeIcon,
  ChatIcon,
  DollarLineIcon,
  GridIcon,
  GroupIcon,
  ListIcon,
  PageIcon,
  PieChartIcon,
  PlugInIcon,
  ShootingStarIcon,
  TableIcon,
  TaskIcon,
  UserCircleIcon,
} from "../icons";

export type PlatformModule = {
  id: string;
  label: string;
  shortLabel: string;
  path: string;
  icon: ReactNode;
  enabled: boolean;
  group: "today" | "registry" | "commercial" | "control";
  badge?: string;
  requiresEntitlement?: string;
};

export const featureFlags = {
  commandCenter: true,
  inbox: true,
  pipeline: true,
  merchants: true,
  providers: true,
  offers: true,
  compliance: true,
  matching: false,
  dealDesk: true,
  casinos: true,
  intelligence: false,
  communications: true,
  tasks: true,
  agents: true,
  analytics: true,
  seoGeo: true,
  finance: false,
  integrations: true,
  settings: false,
} as const;

export const platformModules: PlatformModule[] = [
  { id: "commandCenter", label: "Сегодня", shortLabel: "Сегодня", path: "/", icon: <GridIcon />, enabled: featureFlags.commandCenter, group: "today" },
  { id: "inbox", label: "Входящие заявки", shortLabel: "Входящие", path: "/inbox", icon: <ListIcon />, enabled: featureFlags.inbox, group: "today" },
  { id: "compliance", label: "Проверка лидов", shortLabel: "Проверка", path: "/compliance", icon: <TaskIcon />, enabled: featureFlags.compliance, group: "today", badge: "PRO", requiresEntitlement: "pre_compliance" },
  { id: "tasks", label: "Задачи и календарь", shortLabel: "Задачи", path: "/operations", icon: <TaskIcon />, enabled: featureFlags.tasks, group: "today" },
  { id: "merchants", label: "Мерчи", shortLabel: "Мерчи", path: "/merchants", icon: <GroupIcon />, enabled: featureFlags.merchants, group: "registry" },
  { id: "providers", label: "PSP", shortLabel: "PSP", path: "/psps", icon: <BoxCubeIcon />, enabled: featureFlags.providers, group: "registry" },
  { id: "offers", label: "Офферы", shortLabel: "Офферы", path: "/offers", icon: <PageIcon />, enabled: featureFlags.offers, group: "registry" },
  { id: "casinos", label: "Казино", shortLabel: "Казино", path: "/casinos", icon: <BoltIcon />, enabled: featureFlags.casinos, group: "registry" },
  { id: "pipeline", label: "Обзор воронки", shortLabel: "Воронка", path: "/pipeline", icon: <TableIcon />, enabled: featureFlags.pipeline, group: "commercial" },
  { id: "dealDesk", label: "Сделки", shortLabel: "Сделки", path: "/deals", icon: <TaskIcon />, enabled: featureFlags.dealDesk, group: "commercial" },
  { id: "communications", label: "Радиорубка", shortLabel: "Почта", path: "/communications", icon: <ChatIcon />, enabled: featureFlags.communications, group: "commercial" },
  { id: "matching", label: "Подбор решений", shortLabel: "Matching", path: "/matching", icon: <ShootingStarIcon />, enabled: featureFlags.matching, group: "commercial" },
  { id: "agents", label: "Субагенты", shortLabel: "Агенты", path: "/agents", icon: <UserCircleIcon />, enabled: featureFlags.agents, group: "commercial" },
  { id: "analytics", label: "Аналитика", shortLabel: "Аналитика", path: "/analytics", icon: <PieChartIcon />, enabled: featureFlags.analytics, group: "control" },
  { id: "systemActions", label: "Действия системы", shortLabel: "Действия", path: "/system-actions", icon: <ListIcon />, enabled: true, group: "control" },
  { id: "seoGeo", label: "SEO / GEO", shortLabel: "SEO / GEO", path: "/seo-geo", icon: <ShootingStarIcon />, enabled: featureFlags.seoGeo, group: "control" },
  { id: "finance", label: "Финансы", shortLabel: "Финансы", path: "/finance", icon: <DollarLineIcon />, enabled: featureFlags.finance, group: "control" },
  { id: "integrations", label: "Интеграции", shortLabel: "Интеграции", path: "/integrations", icon: <PlugInIcon />, enabled: featureFlags.integrations, group: "control" },
];
