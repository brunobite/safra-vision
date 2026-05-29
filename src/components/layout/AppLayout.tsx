import { Outlet, NavLink } from "react-router-dom";
import { LayoutDashboard, FilePlus2, Target, FileBarChart, Users, Route, Star, CalendarDays, Settings, Sprout, GitBranch, Package, Warehouse, FileText, ListTodo } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/AppStore";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

const items = [
  { group: "Visão geral", title: "Dashboard", url: "/", icon: LayoutDashboard },
  { group: "Comercial", title: "Lançamentos", url: "/lancamentos", icon: FilePlus2 },
  { group: "Comercial", title: "Próximas ações", url: "/proximas-acoes", icon: ListTodo },
  { group: "Comercial", title: "Funil de Vendas", url: "/funil", icon: GitBranch },
  { group: "Comercial", title: "Orçamentos", url: "/orcamentos", icon: FileText },
  { group: "Cadastros", title: "Clientes", url: "/clientes", icon: Users },
  { group: "Cadastros", title: "Produtos", url: "/produtos", icon: Package },
  { group: "Cadastros", title: "Preços e Estoque", url: "/precos-estoque", icon: Warehouse },
  { group: "Planejamento", title: "Metas", url: "/metas", icon: Target },
  { group: "Planejamento", title: "Rotas", url: "/rotas", icon: Route },
  { group: "Planejamento", title: "Prioridades P1", url: "/prioridades", icon: Star },
  { group: "Planejamento", title: "Eventos", url: "/eventos", icon: CalendarDays },
  { group: "Análises", title: "Relatórios", url: "/relatorios", icon: FileBarChart },
  { group: "Sistema", title: "Configurações", url: "/configuracoes", icon: Settings },
];

function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Sprout className="h-5 w-5" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold text-sidebar-foreground">Safra 26/27</span>
            <span className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">Controle Operacional</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {Array.from(new Set(items.map((item) => item.group))).map((group) => (
        <SidebarGroup key={group}>
          <SidebarGroupLabel>{group}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.filter((item) => item.group === group).map(item => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink to={item.url} end={item.url === "/"} className={({ isActive }) =>
                      isActive ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : ""
                    }>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}

export default function AppLayout() {
  const [open, setOpen] = useState(false);
  const isOnline = useOnlineStatus();
  const { isSaving, lastSavedAt, pendingSyncCount, syncStatus, syncError } = useAppStore();

  const statusText = isOnline ? "Online" : "Offline — trabalhando com dados locais";
  const saveText = isSaving ? "Salvando localmente..." : lastSavedAt ? "Dados salvos localmente" : "";
  const syncBlockReason = (() => {
    if (!syncError) return "";
    if (syncError.includes("Aguardando sessão")) return "aguardando sessão";
    if (syncError.includes("indisponível") || syncError.includes("não autenticado")) return "sessão indisponível";
    if (syncError.includes("Tempo excedido")) return "tempo excedido";
    if (syncError.includes("não aprovado")) return "usuário não aprovado";
    if (syncError.includes("Cooldown")) return "nova tentativa em instantes";
    return syncError;
  })();
  const syncText = (() => {
    const pendingText = pendingSyncCount > 0
      ? `Pendências: ${pendingSyncCount}${syncBlockReason ? ` — ${syncBlockReason}` : ""}`
      : "";
    if (!isOnline) return pendingText;
    if (syncStatus === "syncing") return "Sincronizando...";
    if (syncStatus === "error") return pendingText || "Erro de sincronização";
    if (syncStatus === "first-upload-required") return pendingText || "Primeiro envio manual necessário";
    if (pendingSyncCount > 0) return pendingText;
    if (syncStatus === "synced") return "Sincronizado";
    return "";
  })();
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur">
            <SidebarTrigger />
            <div className="flex flex-col leading-tight">
              <h1 className="text-sm font-semibold text-foreground">Safra 26/27 — Controle Operacional</h1>
              <span className="text-[11px] text-muted-foreground">Gestão comercial agrícola</span>
            </div>
            <div className="ml-auto text-right text-[11px] leading-tight">
              <div className={isOnline ? "text-emerald-600" : "text-amber-600"}>{statusText}</div>
              {saveText && <div className="text-muted-foreground">{saveText}</div>}
              {syncText && <div className={syncStatus === "error" ? "text-destructive" : pendingSyncCount > 0 ? "text-amber-700" : "text-muted-foreground"}>{syncText}</div>}
              {syncStatus === "error" && syncError && <div className="max-w-xs truncate text-destructive/80" title={syncError}>{syncError}</div>}
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6">
            <Outlet />
          </main>
          <div className="fixed bottom-5 right-5 z-40">
            <Button className="h-12 w-12 rounded-full text-xl" onClick={() => setOpen((v) => !v)}>+</Button>
            {open && <div className="mt-2 w-48 rounded border bg-card p-2 text-sm shadow">
              <NavLink className="block rounded px-2 py-1 hover:bg-accent" to="/lancamentos">Nova visita</NavLink>
              <NavLink className="block rounded px-2 py-1 hover:bg-accent" to="/proximas-acoes">Nova ação</NavLink>
              <NavLink className="block rounded px-2 py-1 hover:bg-accent" to="/clientes">Novo cliente</NavLink>
              <NavLink className="block rounded px-2 py-1 hover:bg-accent" to="/funil">Nova oportunidade</NavLink>
              <NavLink className="block rounded px-2 py-1 hover:bg-accent" to="/orcamentos">Novo orçamento</NavLink>
            </div>}
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
