import { Card } from "@/components/ui/card";

export default function Configuracoes() {
  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold">Configurações</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Em breve: cadastro de responsáveis, frentes comerciais personalizadas, parâmetros de comissão,
        importação de planilhas e integração com Lovable Cloud para persistência dos dados.
      </p>
    </Card>
  );
}