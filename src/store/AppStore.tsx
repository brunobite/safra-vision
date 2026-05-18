import { createContext, useContext, useMemo, useState, ReactNode } from "react";
import { Cliente, Lancamento, MetaEmpresa, MetaPessoal, Evento, PrioridadeP1Item } from "@/types";
import {
  initialClientes,
  initialLancamentos,
  initialMetasEmpresa,
  initialMetasPessoais,
  initialEventos,
  initialPrioridadesP1,
} from "@/data/mockData";

interface Filters {
  dataInicial: string;
  dataFinal: string;
  mes: string;
  abc: string;
  prioridade: string;
  rota: string;
  status: string;
  frente: string;
}

interface AppStoreCtx {
  clientes: Cliente[];
  setClientes: React.Dispatch<React.SetStateAction<Cliente[]>>;
  lancamentos: Lancamento[];
  setLancamentos: React.Dispatch<React.SetStateAction<Lancamento[]>>;
  metasEmpresa: MetaEmpresa[];
  setMetasEmpresa: React.Dispatch<React.SetStateAction<MetaEmpresa[]>>;
  metasPessoais: MetaPessoal[];
  setMetasPessoais: React.Dispatch<React.SetStateAction<MetaPessoal[]>>;
  eventos: Evento[];
  setEventos: React.Dispatch<React.SetStateAction<Evento[]>>;
  prioridadesP1: PrioridadeP1Item[];
  setPrioridadesP1: React.Dispatch<React.SetStateAction<PrioridadeP1Item[]>>;
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  filtered: { lancamentos: Lancamento[] };
  clienteById: (id: string) => Cliente | undefined;
}

const Ctx = createContext<AppStoreCtx | null>(null);

const defaultFilters: Filters = {
  dataInicial: "",
  dataFinal: "",
  mes: "",
  abc: "",
  prioridade: "",
  rota: "",
  status: "",
  frente: "",
};

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [clientes, setClientes] = useState<Cliente[]>(initialClientes);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>(initialLancamentos);
  const [metasEmpresa, setMetasEmpresa] = useState<MetaEmpresa[]>(initialMetasEmpresa);
  const [metasPessoais, setMetasPessoais] = useState<MetaPessoal[]>(initialMetasPessoais);
  const [eventos, setEventos] = useState<Evento[]>(initialEventos);
  const [prioridadesP1, setPrioridadesP1] = useState<PrioridadeP1Item[]>(initialPrioridadesP1);
  const [filters, setFilters] = useState<Filters>(defaultFilters);

  const cMap = useMemo(() => new Map(clientes.map(c => [c.id, c])), [clientes]);

  const filteredLancs = useMemo(() => {
    return lancamentos.filter(l => {
      const c = cMap.get(l.clienteId);
      if (filters.dataInicial && l.data < filters.dataInicial) return false;
      if (filters.dataFinal && l.data > filters.dataFinal) return false;
      if (filters.mes && l.data.slice(0, 7) !== filters.mes) return false;
      if (filters.abc && c?.abc !== filters.abc) return false;
      if (filters.prioridade && c?.prioridade !== filters.prioridade) return false;
      if (filters.rota && c?.rota !== filters.rota) return false;
      if (filters.status && l.status !== filters.status) return false;
      if (filters.frente && l.frente !== filters.frente) return false;
      return true;
    });
  }, [lancamentos, filters, cMap]);

  return (
    <Ctx.Provider value={{
      clientes, setClientes,
      lancamentos, setLancamentos,
      metasEmpresa, setMetasEmpresa,
      metasPessoais, setMetasPessoais,
      eventos, setEventos,
      prioridadesP1, setPrioridadesP1,
      filters, setFilters,
      filtered: { lancamentos: filteredLancs },
      clienteById: (id) => cMap.get(id),
    }}>{children}</Ctx.Provider>
  );
}

export function useAppStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppStore must be used within AppStoreProvider");
  return ctx;
}