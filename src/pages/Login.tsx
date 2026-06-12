import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/store/AuthStore";

const isSupabaseStorageKey = (key: string) => {
  const normalizedKey = key.toLowerCase();
  return normalizedKey.includes("supabase") || normalizedKey.startsWith("sb-");
};

const clearSupabaseStorageKeys = (storage: Storage) => {
  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && isSupabaseStorageKey(key)) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => storage.removeItem(key));
  } catch {
    storage.clear();
  }
};

export default function Login() {
  const { user, loading, error, accessStatus, role, isLocalMode, signIn, signUp, signOut, refreshAccess, clearError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localClearError, setLocalClearError] = useState<string | null>(null);

  const statusMessage =
    (accessStatus === "pendente" || accessStatus === "pending")
      ? "Seu acesso está aguardando liberação pelo administrador da conta."
      : (accessStatus === "bloqueado" || accessStatus === "blocked")
        ? "Seu acesso está inativo ou bloqueado. Contate o administrador."
        : (accessStatus === "ativo" || accessStatus === "active")
          ? "Acesso liberado ao app."
          : "Seu acesso está inativo ou bloqueado. Contate o administrador.";

  const handleClearLocalSession = async () => {
    setLocalClearError(null);
    try {
      await supabase?.auth.signOut({ scope: "local" });
    } catch (error) {
      console.warn("Falha ao encerrar sessão local Supabase antes da limpeza manual.", error);
    }

    try {
      clearSupabaseStorageKeys(window.localStorage);
      clearSupabaseStorageKeys(window.sessionStorage);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido ao limpar sessão local.";
      setLocalClearError(message);
      return;
    }

    window.location.assign(`${window.location.origin}${import.meta.env.BASE_URL}login`);
  };

  return (
    <div className="container mx-auto max-w-lg p-4">
      <Card>
        <CardHeader>
          <CardTitle>Login e Acesso ao Safra Vision</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLocalMode && (
            <Alert>
              <AlertDescription>Modo Local: Supabase não configurado. O app continua funcionando offline.</AlertDescription>
            </Alert>
          )}

          {user && (
            <Alert>
              <AlertDescription>
                Usuário autenticado: {user.email} | papel: {role} | status: {accessStatus}
              </AlertDescription>
            </Alert>
          )}

          {user && <p className="text-sm text-muted-foreground">{statusMessage}</p>}

          {error && (
            <Alert variant="destructive" onClick={clearError}>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {localClearError && (
            <Alert variant="destructive">
              <AlertDescription>{localClearError}</AlertDescription>
            </Alert>
          )}

          <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} />

          <div className="flex flex-wrap gap-2">
            <Button disabled={loading} onClick={() => signIn(email, password)}>Entrar</Button>
            <Button variant="secondary" disabled={loading} onClick={() => signUp(email, password)}>Criar conta</Button>
            {user && (
              <>
                <Button variant="outline" disabled={loading} onClick={() => refreshAccess()}>Atualizar status</Button>
                <Button variant="outline" onClick={() => signOut()}>Sair</Button>
              </>
            )}
          </div>

          <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            <p>Use apenas se o login estiver travado.</p>
            <Button className="mt-2" variant="ghost" size="sm" onClick={() => void handleClearLocalSession()}>
              Limpar sessão local
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
