import type { AccountSyncStatus } from "@/lib/accountSyncOrchestrator";
import { normalizeAccessStatus } from "@/lib/accessStatus";

export const ACCOUNT_SYNC_MESSAGES = {
  updated: "Este dispositivo está atualizado.",
  completed: "Sincronização concluída.",
  offline: "Sem conexão. Os dados locais continuam disponíveis.",
  pendingLocal: "Há dados locais aguardando envio.",
  remoteAvailable: "Há dados da conta disponíveis para carregar.",
  conflict: "Conflito detectado. Revisão manual necessária.",
  inactive: "Usuário ainda não aprovado para sincronização.",
  active: "A conta está ativa.",
} as const;

export type AccountSyncVisualState = "Atualizado" | "Sincronizando" | "Pendente" | "Atenção" | "Offline" | "Bloqueado";

export type AccountSyncHistoryType = "auto-check" | "sync-now" | "upload" | "restore" | "compare" | "error";
export type AccountSyncHistoryStatus = "sucesso" | "pendente" | "bloqueado" | "erro" | "informativo";

export type AccountSyncHistoryEvent = {
  id: string;
  timestamp: string;
  tipo: AccountSyncHistoryType;
  status: AccountSyncHistoryStatus;
  mensagem: string;
  detalhes?: string;
};

export const ACCOUNT_SYNC_HISTORY_LIMIT = 10;

const TECHNICAL_TERMS = ["IndexedDB", "payload", "syncQueue", "RLS", "snapshot", "onlyLocal", "onlyRemote"];

export function sanitizeUserSyncMessage(message: string) {
  if (!message || TECHNICAL_TERMS.some((term) => message.toLowerCase().includes(term.toLowerCase()))) {
    return ACCOUNT_SYNC_MESSAGES.updated;
  }
  return message;
}

export function getAccountSyncUserMessage(params: {
  isOnline: boolean;
  cloudSessionExists: boolean;
  cloudAccessStatus: string | null;
  pendingSyncCount: number;
  accountSyncStatus?: AccountSyncStatus | null;
  hasRemoteOnly?: boolean;
  hasConflict?: boolean;
}) {
  if (!params.isOnline) return ACCOUNT_SYNC_MESSAGES.offline;
  const normalizedAccessStatus = normalizeAccessStatus(params.cloudAccessStatus);
  if (params.cloudSessionExists && normalizedAccessStatus === "active") {
    if (params.hasConflict) return ACCOUNT_SYNC_MESSAGES.conflict;
    if (params.pendingSyncCount > 0) return ACCOUNT_SYNC_MESSAGES.pendingLocal;
    if (params.hasRemoteOnly) return ACCOUNT_SYNC_MESSAGES.remoteAvailable;
    if (params.accountSyncStatus?.message) return sanitizeUserSyncMessage(params.accountSyncStatus.message);
    return ACCOUNT_SYNC_MESSAGES.active;
  }
  if (params.cloudSessionExists && normalizedAccessStatus !== "active") return ACCOUNT_SYNC_MESSAGES.inactive;
  if (params.accountSyncStatus?.message) return sanitizeUserSyncMessage(params.accountSyncStatus.message);
  return ACCOUNT_SYNC_MESSAGES.updated;
}

export function getAccountSyncVisualState(params: {
  isOnline: boolean;
  isSyncing: boolean;
  cloudSessionExists: boolean;
  cloudAccessStatus: string | null;
  pendingSyncCount: number;
  hasConflict?: boolean;
  hasAttention?: boolean;
}): AccountSyncVisualState {
  if (!params.isOnline) return "Offline";
  if (params.isSyncing) return "Sincronizando";
  if (!params.cloudSessionExists || normalizeAccessStatus(params.cloudAccessStatus) !== "active") return "Bloqueado";
  if (params.hasConflict) return "Atenção";
  if (params.pendingSyncCount > 0) return "Pendente";
  if (params.hasAttention) return "Atenção";
  return "Atualizado";
}

export function addAccountSyncHistoryEvent(history: AccountSyncHistoryEvent[], event: Omit<AccountSyncHistoryEvent, "id" | "timestamp"> & { id?: string; timestamp?: string }) {
  const next: AccountSyncHistoryEvent = {
    id: event.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: event.timestamp ?? new Date().toISOString(),
    tipo: event.tipo,
    status: event.status,
    mensagem: event.mensagem,
    detalhes: event.detalhes,
  };
  return [next, ...history].slice(0, ACCOUNT_SYNC_HISTORY_LIMIT);
}

export function getHistoryStatusFromAccountSyncStatus(status: AccountSyncStatus): AccountSyncHistoryStatus {
  if (status.code === "error") return "erro";
  if (status.code === "blocked") return "bloqueado";
  if (status.code === "cta-available" || status.code === "skipped") return "pendente";
  return "sucesso";
}

export const SYNC_HOMOLOGATION_CHECKLIST = `Checklist de homologação da sincronização Safra Vision

A. Celular → computador
- cadastrar ou editar cliente no celular;
- sincronizar;
- abrir computador;
- clicar Sincronizar agora;
- verificar local = nuvem.

B. Computador → celular
- cadastrar ou editar cliente no computador;
- sincronizar;
- abrir celular;
- clicar Sincronizar agora;
- verificar local = nuvem.

C. Offline → online
- deixar offline;
- criar dado local;
- voltar online;
- sincronizar;
- verificar pendências 0.

D. Base oficial online
- simular cache local antigo e dados remotos oficiais;
- confirmar que a abertura online hidrata o cache local pela nuvem;
- confirmar que pendências locais são enviadas antes da hidratação.

E. Restauração
- dispositivo novo/incompleto;
- carregar dados da conta;
- confirmar local = nuvem.`;
