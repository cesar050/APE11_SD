import java.util.ArrayList;
import java.util.List;

public class PracticaBully {
    static List<Proceso> procesos = new ArrayList<>();
    static int totalMensajes = 0;

    public static void main(String[] args) {
        int[] tamaños = {5, 7, 10, 15};

        System.out.println("============================================");
        System.out.println("  ALGORITMO BULLY - ANALISIS COMPARATIVO");
        System.out.println("============================================");
        System.out.printf("%-10s %-20s %-20s %-20s%n", "Procesos", "Mensajes", "Tiempo (ms)", "Nuevo lider");
        System.out.println("------------------------------------------------------------");

        for (int n : tamaños) {
            ejecutarSimulacion(n);
        }

        System.out.println("============================================");
    }

    static void ejecutarSimulacion(int numProcesos) {
        procesos.clear();
        totalMensajes = 0;

        for (int i = 1; i <= numProcesos; i++) {
            procesos.add(new Proceso(i));
        }

        int idLiderInicial = numProcesos;
        procesos.get(idLiderInicial - 1).activo = false;

        long tiempoInicio = System.nanoTime();

        iniciarEleccion(procesos.get(1));

        long tiempoFin = System.nanoTime();
        double tiempoMs = (tiempoFin - tiempoInicio) / 1_000_000.0;

        int nuevoLider = 0;
        for (Proceso p : procesos) {
            if (p.activo && p.id > nuevoLider) {
                nuevoLider = p.id;
            }
        }

        System.out.printf("%-10d %-20d %-20.3f P%d%n", numProcesos, totalMensajes, tiempoMs, nuevoLider);
    }

    static void iniciarEleccion(Proceso iniciador) {
        boolean alguienRespondio = false;

        for (Proceso p : procesos) {
            if (p.id > iniciador.id) {
                totalMensajes++;
                boolean respondio = iniciador.enviarMensaje("ELECTION", p);
                if (respondio) {
                    alguienRespondio = true;
                    totalMensajes++;
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

    static void anunciarCoordinador(Proceso nuevoCoordinador) {
        for (Proceso p : procesos) {
            if (p.id < nuevoCoordinador.id && p.activo) {
                totalMensajes++;
                nuevoCoordinador.enviarMensaje("COORDINATOR", p);
            }
        }
    }
}
