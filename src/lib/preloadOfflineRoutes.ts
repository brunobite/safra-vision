const CRITICAL_ROUTES_PRELOADERS = [
  () => import("@/pages/Dashboard"),
  () => import("@/pages/Clientes"),
  () => import("@/pages/ClienteFicha360"),
  () => import("@/pages/Lancamentos"),
  () => import("@/pages/ProximasAcoes"),
  () => import("@/pages/FunilVendas"),
  () => import("@/pages/Orcamentos"),
  () => import("@/pages/Configuracoes"),
];

export async function preloadOfflineRoutes() {
  const preloadResults = await Promise.allSettled(
    CRITICAL_ROUTES_PRELOADERS.map((loadRoute) => loadRoute()),
  );

  preloadResults.forEach((result, index) => {
    if (result.status === "rejected") {
      console.warn(`[offline-preload] Falha ao pré-carregar rota crítica #${index + 1}:`, result.reason);
    }
  });
}
