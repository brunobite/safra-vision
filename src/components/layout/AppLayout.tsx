import { Outlet, NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  FilePlus2,
  Target,
  FileBarChart,
  Users,
  Route,
  Star,
  CalendarDays,
  Settings,
  Sprout,
  GitBranch,
  Package,
  FileText,
  ListTodo,
  ClipboardList,
  Menu,
  Plus,
  UserRound,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppStore } from "@/store/AppStore";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useAuth } from "@/store/AuthStore";
import { canCreate, canView } from "@/lib/permissions";

const items = [
  { group: "Visão geral", title: "Dashboard", url: "/", icon: LayoutDashboard },
  { group: "Comercial", title: "Agenda e Visitas", url: "/agenda", icon: ClipboardList },
  { group: "Comercial", title: "Próximas ações", url: "/proximas-acoes", icon: ListTodo },
  { group: "Comercial", title: "Lançamentos", url: "/lancamentos", icon: FilePlus2 },
  { group: "Comercial", title: "Funil de Vendas", url: "/funil", icon: GitBranch },
  { group: "Comercial", title: "Orçamentos", url: "/orcamentos", icon: FileText },
  { group: "Cadastros", title: "Clientes", url: "/clientes", icon: Users },
  { group: "Cadastros", title: "Produtos", url: "/produtos", icon: Package },
  { group: "Planejamento", title: "Metas", url: "/metas", icon: Target },
  { group: "Planejamento", title: "Rotas", url: "/rotas", icon: Route },
  { group: "Planejamento", title: "Prioridades P1", url: "/prioridades", icon: Star },
  { group: "Planejamento", title: "Eventos", url: "/eventos", icon: CalendarDays },
  { group: "Análises", title: "Relatórios", url: "/relatorios", icon: FileBarChart },
  { group: "Sistema", title: "Meu acesso", url: "/meu-acesso", icon: UserRound },
  { group: "Sistema", title: "Configurações", url: "/configuracoes", icon: Settings },
];

const quickActions = [
  { title: "Agendar visita", url: "/agenda?action=agendar-visita" },
  { title: "Lançar visita concluída", url: "/agenda?action=visita-concluida" },
  { title: "Marcar próxima ação", url: "/agenda?action=nova-acao" },
  { title: "Criar oportunidade", url: "/funil?new=1" },
  { title: "Criar orçamento", url: "/orcamentos?new=1" },
  { title: "Cadastrar cliente", url: "/clientes?new=1" },
];

function AppSidebar() {
  const { isMobile, setOpenMobile } = useSidebar();
  const { role } = useAuth();

  const closeMobileMenu = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

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
        {Array.from(new Set(items.map((item) => item.group))).map((group) => {
          const visibleGroupItems = items.filter((item) => item.group === group && canView(item.url, role));
          if (visibleGroupItems.length === 0) return null;
          return (
            <SidebarGroup key={group}>
              <SidebarGroupLabel>{group}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleGroupItems.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild tooltip={item.title}>
                        <NavLink
                          to={item.url}
                          end={item.url === "/"}
                          onClick={closeMobileMenu}
                          className={({ isActive }) =>
                            isActive ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : ""
                          }
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}

export default function AppLayout() {
  const [open, setOpen] = useState(false);
  const { role, accessStatus, vendedorNome } = useAuth();
  const isOnline = useOnlineStatus();
  const { isSaving, lastSavedAt, pendingSyncCount, syncStatus, syncError } = useAppStore();

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
    if (pendingSyncCount > 0) return pendingText;
    if (syncStatus === "synced") return "Sincronizado";
    return "";
  })();
  const visibleQuickActions = quickActions.filter((action) => canView(action.url, role) && canCreate(action.url.includes("orcamentos") ? "orcamentos" : action.url.includes("clientes") ? "clientes" : action.url.includes("agenda") ? "agenda" : "lancamentos", role));
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-card/80 px-3 backdrop-blur md:gap-3 md:px-4">
            <SidebarTrigger className="shrink-0" />
            <div className="flex min-w-0 flex-col leading-tight">
              <h1 className="truncate text-sm font-semibold text-foreground"><span className="md:hidden">Safra 26/27</span><span className="hidden md:inline">Safra 26/27 — Controle Operacional</span></h1>
              <span className="hidden text-[11px] text-muted-foreground sm:inline">Gestão comercial agrícola</span>
            </div>
            <div className="ml-auto min-w-0 text-right text-[10px] leading-tight md:text-[11px]">
              <div className={isOnline ? "font-medium text-emerald-600" : "font-medium text-amber-600"}>{isOnline ? "Online" : "Offline"}</div>
              {saveText && <div className="hidden text-muted-foreground sm:block">{saveText}</div>}
              {syncText && <div className={syncStatus === "error" ? "max-w-[9rem] truncate text-destructive md:max-w-xs" : pendingSyncCount > 0 ? "max-w-[9rem] truncate text-amber-700 md:max-w-xs" : "hidden text-muted-foreground sm:block"} title={syncText}>{syncText}</div>}
              {syncStatus === "error" && syncError && <div className="hidden max-w-xs truncate text-destructive/80 sm:block" title={syncError}>{syncError}</div>}
              <div className="hidden text-muted-foreground sm:block">Perfil: {role}{vendedorNome ? ` • ${vendedorNome}` : ""} • {accessStatus}</div>
            </div>
          </header>
          <main className="flex-1 overflow-x-hidden p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:p-6 md:pb-6">
            <Outlet />
          </main>
          <div className="fixed bottom-5 right-5 z-40 hidden md:block">
            <Button className="h-12 w-12 rounded-full text-xl" onClick={() => setOpen((v) => !v)} aria-label="Abrir ações rápidas">+</Button>
            {open && <div className="absolute bottom-14 right-0 w-56 rounded border bg-card p-2 text-sm shadow">
              {visibleQuickActions.map((action) => (
                <NavLink key={action.url} onClick={() => setOpen(false)} className="block rounded px-2 py-2 hover:bg-accent" to={action.url}>{action.title}</NavLink>
              ))}
            </div>}
          </div>
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] backdrop-blur md:hidden">
            <div className="mx-auto grid max-w-md grid-cols-2 gap-3">
              <SidebarTrigger
                className="h-11 w-full min-w-11 justify-center rounded-xl border border-border bg-background text-foreground shadow-sm hover:bg-accent"
                aria-label="Abrir menu de navegação"
              >
                <Menu className="h-5 w-5" />
                <span>Menu</span>
              </SidebarTrigger>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="h-11 min-w-11 rounded-xl shadow-sm" aria-label="Abrir ações rápidas">
                    <Plus className="h-5 w-5" />
                    <span>Adicionar rápido</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="top" sideOffset={12} className="z-40 mb-1 w-[min(22rem,calc(100vw-2rem))] p-2">
                  <DropdownMenuLabel>Ações rápidas</DropdownMenuLabel>
                  {visibleQuickActions.map((action) => (
                    <DropdownMenuItem key={action.url} asChild className="min-h-11 cursor-pointer text-sm">
                      <NavLink to={action.url}>{action.title}</NavLink>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
