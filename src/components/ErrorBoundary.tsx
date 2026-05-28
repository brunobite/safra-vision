import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const OFFLINE_CHUNK_MESSAGES = [
  "Failed to fetch dynamically imported module",
  "Importing a module script failed",
  "ChunkLoadError",
];

function isOfflineChunkError(error: Error | null) {
  if (!error) return false;
  const details = `${error.name} ${error.message}`;
  return OFFLINE_CHUNK_MESSAGES.some((message) => details.includes(message));
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] render error", error, errorInfo);
  }

  private goToDashboard = () => {
    window.location.hash = "#/";
    window.location.assign(`${window.location.origin}${import.meta.env.BASE_URL}`);
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-xl space-y-3 rounded-md border border-border bg-card p-6">
          <h1 className="text-lg font-semibold">Erro ao carregar esta tela</h1>
          <p className="text-sm text-muted-foreground">
            {isOfflineChunkError(this.state.error)
              ? "Esta tela ainda não está disponível offline. Conecte-se uma vez à internet para atualizar o cache."
              : "O aplicativo encontrou um erro nesta operação. Seus dados locais não foram apagados. Tente voltar ao Dashboard ou atualizar a página."}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={this.goToDashboard}>Voltar ao Dashboard</Button>
            <Button type="button" onClick={() => window.location.reload()}>Recarregar aplicativo</Button>
          </div>
          {import.meta.env.DEV && this.state.error && (
            <pre className="overflow-x-auto rounded bg-muted p-3 text-xs text-destructive">{this.state.error.stack || this.state.error.message}</pre>
          )}
        </div>
      </div>
    );
  }
}
