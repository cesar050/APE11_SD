import java.util.ArrayList;
import java.util.List;
import java.util.Random;

public class ConsensoBizantino {
    static List<Proceso> procesos = new ArrayList<>();
    static Random rand = new Random(42);
    static final String PROPUESTA = "Aprobar Transaccion";

    public static void main(String[] args) {
        System.out.println("============================================");
        System.out.println("  ANALISIS DE CONSENSO CON FALLAS BIZANTINAS");
        System.out.println("============================================");
        System.out.println();

        parte1();
        System.out.println();
        parte2();
        System.out.println();
        parte3();
        System.out.println();
        parte4();
    }

    // ============================================================
    // PARTE 1: Recuperacion del escenario Bully
    // ============================================================
    static void parte1() {
        System.out.println("--- PARTE 1: RECUPERACION BULLY ---");
        configurarProcesos(5, 0);
        ejecutarEleccionBully(false);
        int coordId = obtenerCoordinador();
        System.out.println("Coordinador elegido: P" + coordId);
    }

    // ============================================================
    // PARTE 2: Consenso simple (0 bizantinos)
    // ============================================================
    static void parte2() {
        System.out.println("--- PARTE 2: CONSENSO SIMPLE (0 BIZANTINOS) ---");
        configurarProcesos(4, 0);
        ejecutarEleccionBully(true);
        reactivarTodos();

        System.out.println("Propuesta: " + PROPUESTA);
        asignarVotosHonestos();
        ejecutarRondaConsenso();
    }

    // ============================================================
    // PARTE 3: Consenso con nodos bizantinos
    // ============================================================
    static void parte3() {
        System.out.println("--- PARTE 3: CONSENSO CON NODOS BIZANTINOS ---");
        int[] ns = {4, 7};

        for (int n : ns) {
            System.out.println();
            System.out.println(">>> N=" + n + " nodos <<<");

            for (int f = 1; f <= 2 && f < n; f++) {
                System.out.println("  [" + f + " nodo(s) bizantino(s)]");
                for (int ronda = 1; ronda <= 3; ronda++) {
                    configurarProcesos(n, f);
                    ejecutarEleccionBully(true);
                    reactivarTodos();
                    asignarVotosHonestos();
                    System.out.print("    Ronda " + ronda + ": ");
                    ejecutarRondaConsensoBizantino();
                }
            }
        }
    }

    // ============================================================
    // PARTE 4: Evaluacion de tolerancia N >= 3f + 1
    // ============================================================
    static void parte4() {
        System.out.println("--- PARTE 4: EVALUACION N >= 3f + 1 ---");
        System.out.printf("%-5s %-5s %-12s %-20s %-15s%n", "N", "f", "3f+1", "N >= 3f+1?", "Consenso?");
        System.out.println("------------------------------------------------------------------");

        int[] ns = {4, 4, 4, 7, 7, 7, 10, 10};
        int[] fs = {0, 1, 2, 0, 1, 2, 0, 2};

        for (int i = 0; i < ns.length; i++) {
            int n = ns[i];
            int f = fs[i];
            int umbral = 3 * f + 1;
            boolean condicionOk = n >= umbral;

            configurarProcesos(n, f);
            ejecutarEleccionBully(true);
            reactivarTodos();
            asignarVotosHonestos();
            boolean consenso = ejecutarRondaConsensoBizantinoSilencioso();

            System.out.printf("%-5d %-5d %-12d %-20s %-15s%n",
                n, f, umbral,
                (condicionOk ? "SI" : "NO"),
                (consenso ? "ALCANZADO" : "NO ALCANZADO"));
        }
        System.out.println("------------------------------------------------------------------");
    }

    // ============================================================
    // Metodos auxiliares
    // ============================================================

    static void configurarProcesos(int n, int bizantinos) {
        procesos.clear();
        for (int i = 1; i <= n; i++) {
            procesos.add(new Proceso(i));
        }
        for (int i = n - bizantinos; i < n; i++) {
            procesos.get(i).esBizantino = true;
        }
        if (bizantinos > 0) {
            List<String> bizIds = new ArrayList<>();
            for (Proceso p : procesos) {
                if (p.esBizantino) bizIds.add("P" + p.id);
            }
            System.out.println("  Bizantinos: " + String.join(", ", bizIds));
        }
    }

    static void reactivarTodos() {
        for (Proceso p : procesos) {
            p.activo = true;
        }
    }

    static void ejecutarEleccionBully(boolean silencioso) {
        int liderInicial = procesos.size();
        for (Proceso p : procesos) {
            if (p.id == liderInicial) {
                p.activo = false;
                break;
            }
        }

        if (silencioso) {
            iniciarEleccionSilenciosa(procesos.get(0));
        } else {
            iniciarEleccion(procesos.get(0));
        }

        int nuevoLider = 0;
        for (Proceso p : procesos) {
            if (p.activo && p.id > nuevoLider) {
                nuevoLider = p.id;
            }
        }
        for (Proceso p : procesos) {
            p.esCoordinador = (p.id == nuevoLider);
        }
    }

    static int obtenerCoordinador() {
        for (Proceso p : procesos) {
            if (p.esCoordinador) return p.id;
        }
        return -1;
    }

    static void asignarVotosHonestos() {
        for (Proceso p : procesos) {
            if (!p.esBizantino) {
                p.asignarVoto(rand.nextBoolean() ? "SI" : "NO");
            }
        }
    }

    static void ejecutarRondaConsenso() {
        Proceso coord = obtenerCoordinadorObj();
        if (coord == null) return;

        int si = 0, no = 0;
        List<String> detalles = new ArrayList<>();

        for (Proceso p : procesos) {
            if (p.activo && !p.esCoordinador) {
                String votoEmitido = p.esBizantino ? p.votarA(coord) : p.voto;
                coord.recibirVoto(p.id, votoEmitido);
                detalles.add("P" + p.id + " -> " + votoEmitido);
                if (votoEmitido.equals("SI")) si++;
                else no++;
            }
        }

        for (String d : detalles) {
            System.out.println("    " + d);
        }
        String decision = (si > no) ? "SI" : (no > si) ? "NO" : "EMPATE";
        System.out.println("  Votos -> SI: " + si + ", NO: " + no + " | Decision: " + decision);
    }

    static void ejecutarRondaConsensoBizantino() {
        Proceso coord = obtenerCoordinadorObj();
        if (coord == null) return;

        for (Proceso p : procesos) p.limpiarVotos();

        // Cada nodo envia su voto a todos los nodos activos
        List<String> inconsistencias = new ArrayList<>();

        for (Proceso p : procesos) {
            if (!p.activo || p.esCoordinador) continue;

            boolean tieneSi = false, tieneNo = false;
            for (Proceso dest : procesos) {
                if (dest.activo) {
                    String votoEmitido = p.votarA(dest);
                    dest.recibirVoto(p.id, votoEmitido);
                    if (votoEmitido.equals("SI")) tieneSi = true;
                    else tieneNo = true;
                }
            }

            if (tieneSi && tieneNo) {
                inconsistencias.add("P" + p.id + " envio SI y NO (INCONSISTENTE)");
            }
        }

        // Coordinador cuenta los votos que el recibio
        int si = 0, no = 0;
        for (Proceso p : procesos) {
            if (p.activo && !p.esCoordinador) {
                String votoRecibido = coord.votosRecibidos.get(p.id);
                if (votoRecibido != null) {
                    if (votoRecibido.equals("SI")) si++;
                    else no++;
                }
            }
        }

        boolean hayConsenso = (si > 0 && si > no) || (no > 0 && no > si);
        System.out.println("  Votos recibidos por coordinador -> SI: " + si + ", NO: " + no);
        for (String inc : inconsistencias) {
            System.out.println("    " + inc);
        }
        String decision = (si > no) ? "SI" : (no > si) ? "NO" : "EMPATE";
        System.out.println("  Decision final: " + decision + " (consenso: " + hayConsenso + ")");
    }

    static boolean ejecutarRondaConsensoBizantinoSilencioso() {
        Proceso coord = obtenerCoordinadorObj();
        if (coord == null) return false;

        for (Proceso p : procesos) p.limpiarVotos();

        for (Proceso p : procesos) {
            if (!p.activo || p.esCoordinador) continue;
            for (Proceso dest : procesos) {
                if (dest.activo) {
                    String votoEmitido = p.votarA(dest);
                    dest.recibirVoto(p.id, votoEmitido);
                }
            }
        }

        int si = 0, no = 0;
        for (Proceso p : procesos) {
            if (p.activo && !p.esCoordinador) {
                String votoRecibido = coord.votosRecibidos.get(p.id);
                if (votoRecibido != null) {
                    if (votoRecibido.equals("SI")) si++;
                    else no++;
                }
            }
        }

        return si > no;
    }

    static Proceso obtenerCoordinadorObj() {
        for (Proceso p : procesos) {
            if (p.esCoordinador) return p;
        }
        return null;
    }

    // ============================================================
    // Logica Bully silenciosa
    // ============================================================
    static void iniciarEleccion(Proceso iniciador) {
        boolean alguienRespondio = false;

        for (Proceso p : procesos) {
            if (p.id > iniciador.id) {
                boolean respondio = iniciador.enviarMensaje("ELECTION", p);
                if (respondio) {
                    alguienRespondio = true;
                }
            }
        }

        if (!alguienRespondio) {
            anunciarCoordinador(iniciador);
        } else {
            Proceso siguienteIniciador = null;
            for (int i = procesos.size() - 1; i >= 0; i--) {
                Proceso p = procesos.get(i);
                if (p.id > iniciador.id && p.activo) {
                    siguienteIniciador = p;
                    break;
                }
            }
            if (siguienteIniciador != null) {
                iniciarEleccion(siguienteIniciador);
            }
        }
    }

    static void iniciarEleccionSilenciosa(Proceso iniciador) {
        boolean alguienRespondio = false;

        for (Proceso p : procesos) {
            if (p.id > iniciador.id && p.activo) {
                alguienRespondio = true;
            }
        }

        if (!alguienRespondio && iniciador.activo) {
            return;
        } else {
            Proceso siguienteIniciador = null;
            for (int i = procesos.size() - 1; i >= 0; i--) {
                Proceso p = procesos.get(i);
                if (p.id > iniciador.id && p.activo) {
                    siguienteIniciador = p;
                    break;
                }
            }
            if (siguienteIniciador != null) {
                iniciarEleccionSilenciosa(siguienteIniciador);
            }
        }
    }

    static void anunciarCoordinador(Proceso nuevoCoordinador) {
        for (Proceso p : procesos) {
            if (p.id < nuevoCoordinador.id && p.activo) {
                nuevoCoordinador.enviarMensaje("COORDINATOR", p);
            }
        }
    }
}
