import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useAppStore } from "@/store/AppStore";
import { Evento, StatusEvento } from "@/types";
import { fmtBRL } from "@/utils/calculations";
import { Plus, Pencil, Trash2, CalendarDays } from "lucide-react";
import { toast } from "sonner";

const STATUSES: StatusEvento[] = ["Aprovar", "Planejar", "Em andamento", "Concluído", "Cancelado"];
const empty: Omit<Evento, "id"> = { tipo: "", regiaoParceiro: "", publico: "", participantesMin: 0, participantesMax: 0, custoUnitario: 0, objetivo: "", evidencia: "", status: "Planejar" };

const statusColor = (s: StatusEvento) =>
  s === "Concluído" ? "bg-success/15 text-success border-success/30"
  : s === "Cancelado" ? "bg-destructive/15 text-destructive border-destructive/30"
  : s === "Em andamento" ? "bg-primary/15 text-primary border-primary/30"
  : "bg-warning/15 text-warning border-warning/30";

export default function Eventos() {
  const { eventos, setEventos } = useAppStore();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Evento | null>(null);
  const [form, setForm] = useState<Omit<Evento, "id">>(empty);

  const openNew = () => { setEdit(null); setForm(empty); setOpen(true); };
  const openEdit = (e: Evento) => { setEdit(e); const { id, ...r } = e; void id; setForm(r); setOpen(true); };
  const save = () => {
    if (!form.tipo) return toast.error("Informe o tipo do evento.");
    if (edit) setEventos(prev => prev.map(x => x.id === edit.id ? { ...form, id: edit.id } : x));
    else setEventos(prev => [...prev, { ...form, id: `e${Date.now()}` }]);
    setOpen(false); toast.success("Evento salvo.");
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" /> Novo evento</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {eventos.map(e => {
          const min = e.participantesMin * e.custoUnitario;
          const max = e.participantesMax * e.custoUnitario;
          return (
            <Card key={e.id} className="p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/15 text-accent"><CalendarDays className="h-4 w-4" /></div>
                  <div><h3 className="font-semibold">{e.tipo}</h3><p className="text-xs text-muted-foreground">{e.regiaoParceiro}</p></div>
                </div>
                <Badge variant="outline" className={statusColor(e.status)}>{e.status}</Badge>
              </div>
              <div className="space-y-1 text-sm">
                <p><span className="text-muted-foreground">Público:</span> {e.publico}</p>
                <p><span className="text-muted-foreground">Participantes:</span> {e.participantesMin}–{e.participantesMax}</p>
                <p><span className="text-muted-foreground">Custo unit.:</span> {fmtBRL(e.custoUnitario)}</p>
                <p><span className="text-muted-foreground">Orçamento:</span> <span className="font-medium">{fmtBRL(min)} – {fmtBRL(max)}</span></p>
                <p className="text-xs"><span className="text-muted-foreground">Objetivo:</span> {e.objetivo}</p>
                <p className="text-xs"><span className="text-muted-foreground">Evidência:</span> {e.evidencia}</p>
              </div>
              <div className="mt-3 flex justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => openEdit(e)}><Pencil className="mr-1 h-3.5 w-3.5" />Editar</Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button size="sm" variant="ghost"><Trash2 className="mr-1 h-3.5 w-3.5 text-destructive" />Excluir</Button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Excluir evento?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => { setEventos(prev => prev.filter(x => x.id !== e.id)); toast.success("Evento excluído."); }}>Excluir</AlertDialogAction></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{edit ? "Editar evento" : "Novo evento"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div><Label>Tipo</Label><Input value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} /></div>
            <div><Label>Região / Parceiro</Label><Input value={form.regiaoParceiro} onChange={e => setForm({ ...form, regiaoParceiro: e.target.value })} /></div>
            <div><Label>Público</Label><Input value={form.publico} onChange={e => setForm({ ...form, publico: e.target.value })} /></div>
            <div><Label>Status</Label>
              <Select value={form.status} onValueChange={(v: StatusEvento) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Participantes mín.</Label><Input type="number" value={form.participantesMin} onChange={e => setForm({ ...form, participantesMin: +e.target.value })} /></div>
            <div><Label>Participantes máx.</Label><Input type="number" value={form.participantesMax} onChange={e => setForm({ ...form, participantesMax: +e.target.value })} /></div>
            <div><Label>Custo unitário</Label><Input type="number" value={form.custoUnitario} onChange={e => setForm({ ...form, custoUnitario: +e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Objetivo</Label><Input value={form.objetivo} onChange={e => setForm({ ...form, objetivo: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Evidência</Label><Input value={form.evidencia} onChange={e => setForm({ ...form, evidencia: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={save}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}