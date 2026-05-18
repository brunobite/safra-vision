import { Outlet, NavLink } from "react-router-dom";
import { LayoutDashboard, FilePlus2, Target, FileBarChart, Users, Route, Star, CalendarDays, Settings, Sprout } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
  SidebarHeader,
} from "@/components/ui/sidebar";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Lançamentos", url: "/lancamentos", icon: FilePlus2 },
  { title: "Metas", url: "/metas", icon: Target },
  { title: "Relatórios", url: "/relatorios", icon: FileBarChart },
  { title: "Clientes", url: "/clientes", icon: Users },
  { title: "Rotas", url: "/rotas", icon: Route },
  { title: "Prioridades P1", url: "/prioridades", icon: Star },
  { title: "Eventos", url: "/eventos", icon: CalendarDays },
  { title: "Configurações", url: "/configuracoes", icon: Settings },
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
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map(item => (
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
      </SidebarContent>
    </Sidebar>
  );
}

export default function AppLayout() {
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
          </header>
          <main className="flex-1 p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}