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
  group: "operations" | "growth" | "control";
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
  { id: "commandCenter", label: "Командный центр", shortLabel: "Центр", path: "/", icon: <GridIcon />, enabled: featureFlags.commandCenter, group: "operations" },
  { id: "inbox", label: "Входящие", shortLabel: "Входящие", path: "/inbox", icon: <ListIcon />, enabled: featureFlags.inbox, group: "operations" },
  { id: "pipeline", label: "Воронка", shortLabel: "Воронка", path: "/pipeline", icon: <TableIcon />, enabled: featureFlags.pipeline, group: "operations" },
  { id: "merchants", label: "Мерчи", shortLabel: "Мерчи", path: "/merchants", icon: <GroupIcon />, enabled: featureFlags.merchants, group: "operations" },
  { id: "casinos", label: "Казино", shortLabel: "Казино", path: "/casinos", icon: <BoltIcon />, enabled: featureFlags.casinos, group: "operations" },
  { id: "providers", label: "PSP", shortLabel: "PSP", path: "/psps", icon: <BoxCubeIcon />, enabled: featureFlags.providers, group: "operations" },
  { id: "offers", label: "Офферы", shortLabel: "Офферы", path: "/offers", icon: <PageIcon />, enabled: featureFlags.offers, group: "operations" },
  { id: "compliance", label: "Проверка лидов", shortLabel: "Compliance", path: "/compliance", icon: <TaskIcon />, enabled: featureFlags.compliance, group: "operations", badge: "PRO", requiresEntitlement: "pre_compliance" },
  { id: "matching", label: "Подбор решений", shortLabel: "Matching", path: "/matching", icon: <ShootingStarIcon />, enabled: featureFlags.matching, group: "operations" },
  { id: "dealDesk", label: "Сделки", shortLabel: "Сделки", path: "/deals", icon: <TaskIcon />, enabled: featureFlags.dealDesk, group: "operations" },
  { id: "communications", label: "Коммуникации", shortLabel: "Связь", path: "/communications", icon: <ChatIcon />, enabled: featureFlags.communications, group: "growth" },
  { id: "tasks", label: "Задачи и календарь", shortLabel: "Задачи", path: "/operations", icon: <TaskIcon />, enabled: featureFlags.tasks, group: "growth" },
  { id: "agents", label: "Субагенты", shortLabel: "Агенты", path: "/agents", icon: <UserCircleIcon />, enabled: featureFlags.agents, group: "growth" },
  { id: "analytics", label: "Аналитика", shortLabel: "Аналитика", path: "/analytics", icon: <PieChartIcon />, enabled: featureFlags.analytics, group: "control" },
  { id: "seoGeo", label: "SEO / GEO", shortLabel: "SEO / GEO", path: "/seo-geo", icon: <ShootingStarIcon />, enabled: featureFlags.seoGeo, group: "control" },
  { id: "finance", label: "Финансы", shortLabel: "Финансы", path: "/finance", icon: <DollarLineIcon />, enabled: featureFlags.finance, group: "control" },
  { id: "integrations", label: "Интеграции", shortLabel: "Интеграции", path: "/integrations", icon: <PlugInIcon />, enabled: featureFlags.integrations, group: "control" },
];
