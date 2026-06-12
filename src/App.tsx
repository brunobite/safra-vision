import { Suspense, lazy, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppStoreProvider } from "@/store/AppStore";
import { AuthStoreProvider, useAuth } from "@/store/AuthStore";
import AppLayout from "@/components/layout/AppLayout";
import { preloadOfflineRoutes } from "@/lib/preloadOfflineRoutes";
import { canView } from "@/lib/permissions";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Lancamentos = lazy(() => import("./pages/Lancamentos"));
const Metas = lazy(() => import("./pages/Metas"));
const Relatorios = lazy(() => import("./pages/Relatorios"));
const Clientes = lazy(() => import("./pages/Clientes"));
const Rotas = lazy(() => import("./pages/Rotas"));
const PrioridadesP1 = lazy(() => import("./pages/PrioridadesP1"));
const Eventos = lazy(() => import("./pages/Eventos"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const NotFound = lazy(() => import("./pages/NotFound"));
const FunilVendas = lazy(() => import("./pages/FunilVendas"));
const Produtos = lazy(() => import("./pages/Produtos"));
const Orcamentos = lazy(() => import("./pages/Orcamentos"));
const ProximasAcoes = lazy(() => import("./pages/ProximasAcoes"));
const Agenda = lazy(() => import("./pages/Agenda"));
const ClienteFicha360 = lazy(() => import("./pages/ClienteFicha360"));
const Login = lazy(() => import("./pages/Login"));
const MeuAcesso = lazy(() => import("./pages/MeuAcesso"));


function ProtectedPage({ route, children }: { route: string; children: React.ReactNode }) {
  const { user, loading, accessStatus, role, isLocalMode } = useAuth();

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Validando acesso...</div>;
  if (!isLocalMode && !user) return <Navigate to="/login" replace />;
  if (accessStatus === "pendente" || accessStatus === "pending") return <Navigate to="/login" replace />;
  if (["inativo", "inactive", "bloqueado", "blocked"].includes(accessStatus)) return <Navigate to="/login" replace />;
  if (!canView(route, role)) return <Navigate to="/" replace />;

  return <>{children}</>;
}

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    if (!navigator.onLine) return;

    const preloadTimer = window.setTimeout(() => {
      preloadOfflineRoutes().catch((error) => {
        console.warn("[offline-preload] Erro inesperado no pré-carregamento de rotas:", error);
      });
    }, 1500);

    return () => window.clearTimeout(preloadTimer);
  }, []);

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthStoreProvider>
      <AppStoreProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Suspense fallback={<div className="sr-only">Carregando página</div>}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/" element={<ProtectedPage route="/"><Dashboard /></ProtectedPage>} />
                <Route path="/lancamentos" element={<ProtectedPage route="/lancamentos"><Lancamentos /></ProtectedPage>} />
                <Route path="/funil" element={<ProtectedPage route="/funil"><FunilVendas /></ProtectedPage>} />
                <Route path="/orcamentos" element={<ProtectedPage route="/orcamentos"><Orcamentos /></ProtectedPage>} />
                <Route path="/produtos" element={<ProtectedPage route="/produtos"><Produtos /></ProtectedPage>} />
                <Route path="/precos-estoque" element={<Navigate to="/produtos" replace />} />
                <Route path="/metas" element={<ProtectedPage route="/metas"><Metas /></ProtectedPage>} />
                <Route path="/relatorios" element={<ProtectedPage route="/relatorios"><Relatorios /></ProtectedPage>} />
                <Route path="/clientes" element={<ProtectedPage route="/clientes"><Clientes /></ProtectedPage>} />
                <Route path="/clientes/:id" element={<ProtectedPage route="/clientes"><ClienteFicha360 /></ProtectedPage>} />
                <Route path="/rotas" element={<ProtectedPage route="/rotas"><Rotas /></ProtectedPage>} />
                <Route path="/prioridades" element={<ProtectedPage route="/prioridades"><PrioridadesP1 /></ProtectedPage>} />
                <Route path="/eventos" element={<ProtectedPage route="/eventos"><Eventos /></ProtectedPage>} />
                <Route path="/proximas-acoes" element={<ProtectedPage route="/proximas-acoes"><ProximasAcoes /></ProtectedPage>} />
                <Route path="/agenda" element={<ProtectedPage route="/agenda"><Agenda /></ProtectedPage>} />
                <Route path="/configuracoes" element={<ProtectedPage route="/configuracoes"><Configuracoes /></ProtectedPage>} />
                <Route path="/meu-acesso" element={<ProtectedPage route="/meu-acesso"><MeuAcesso /></ProtectedPage>} />
              </Route>
              <Route path="/login" element={<Login />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AppStoreProvider>
      </AuthStoreProvider>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
