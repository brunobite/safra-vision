import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/store/AuthStore";

export default function Login() {
  const { user, loading, error, accessStatus, role, isLocalMode, signIn, signUp, signOut, refreshAccess, clearError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const statusMessage =
    accessStatus === "pending"
      ? "Conta aguardando aprovação administrativa para acesso à nuvem."
      : accessStatus === "blocked"
        ? "Conta bloqueada para acesso à nuvem."
        : accessStatus === "active"
          ? "Nuvem preparada (sincronização real será habilitada no Sprint 17C)."
          : "Conta inativa para recursos de nuvem.";

  return (
    <div className="container mx-auto max-w-lg p-4">
      <Card>
        <CardHeader>
          <CardTitle>Login e Acesso à Nuvem</CardTitle>
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
                Usuário autenticado: {user.email} | role: {role} | status: {accessStatus}
              </AlertDescription>
            </Alert>
          )}

          {user && <p className="text-sm text-muted-foreground">{statusMessage}</p>}

          {error && (
            <Alert variant="destructive" onClick={clearError}>
              <AlertDescription>{error}</AlertDescription>
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
                <Button variant="outline" disabled={loading} onClick={() => signOut()}>Sair</Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
