import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppStoreProvider } from "@/store/AppStore";
import AppLayout from "@/components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import Lancamentos from "./pages/Lancamentos";
import Metas from "./pages/Metas";
import Relatorios from "./pages/Relatorios";
import Clientes from "./pages/Clientes";
import Rotas from "./pages/Rotas";
import PrioridadesP1 from "./pages/PrioridadesP1";
import Eventos from "./pages/Eventos";
import Configuracoes from "./pages/Configuracoes";
import NotFound from "./pages/NotFound.tsx";
import FunilVendas from "./pages/FunilVendas";
import Produtos from "./pages/Produtos";
import PrecosEstoque from "./pages/PrecosEstoque";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppStoreProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/lancamentos" element={<Lancamentos />} />
              <Route path="/funil" element={<FunilVendas />} />
              <Route path="/produtos" element={<Produtos />} />
              <Route path="/precos-estoque" element={<PrecosEstoque />} />
              <Route path="/metas" element={<Metas />} />
              <Route path="/relatorios" element={<Relatorios />} />
              <Route path="/clientes" element={<Clientes />} />
              <Route path="/rotas" element={<Rotas />} />
              <Route path="/prioridades" element={<PrioridadesP1 />} />
              <Route path="/eventos" element={<Eventos />} />
              <Route path="/configuracoes" element={<Configuracoes />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AppStoreProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
