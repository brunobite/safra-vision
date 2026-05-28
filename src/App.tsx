import { Suspense, lazy, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppStoreProvider } from "@/store/AppStore";
import { AuthStoreProvider } from "@/store/AuthStore";
import AppLayout from "@/components/layout/AppLayout";
import { preloadOfflineRoutes } from "@/lib/preloadOfflineRoutes";

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
const PrecosEstoque = lazy(() => import("./pages/PrecosEstoque"));
const Orcamentos = lazy(() => import("./pages/Orcamentos"));
const ProximasAcoes = lazy(() => import("./pages/ProximasAcoes"));
const ClienteFicha360 = lazy(() => import("./pages/ClienteFicha360"));
const Login = lazy(() => import("./pages/Login"));

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
                <Route path="/" element={<Dashboard />} />
                <Route path="/lancamentos" element={<Lancamentos />} />
                <Route path="/funil" element={<FunilVendas />} />
                <Route path="/orcamentos" element={<Orcamentos />} />
                <Route path="/produtos" element={<Produtos />} />
                <Route path="/precos-estoque" element={<PrecosEstoque />} />
                <Route path="/metas" element={<Metas />} />
                <Route path="/relatorios" element={<Relatorios />} />
                <Route path="/clientes" element={<Clientes />} />
                <Route path="/clientes/:id" element={<ClienteFicha360 />} />
                <Route path="/rotas" element={<Rotas />} />
                <Route path="/prioridades" element={<PrioridadesP1 />} />
                <Route path="/eventos" element={<Eventos />} />
                <Route path="/proximas-acoes" element={<ProximasAcoes />} />
                <Route path="/configuracoes" element={<Configuracoes />} />
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
