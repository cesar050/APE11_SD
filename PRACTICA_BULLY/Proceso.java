import java.util.Map;
import java.util.HashMap;
import java.util.List;

public class Proceso {
    int id;
    boolean activo;
    boolean esBizantino;
    boolean esCoordinador;
    String voto; // SI o NO
    Map<Integer, String> votosRecibidos;

    public Proceso(int id) {
        this.id = id;
        this.activo = true;
        this.esBizantino = false;
        this.esCoordinador = false;
        this.voto = "";
        this.votosRecibidos = new HashMap<>();
    }

    public void asignarVoto(String voto) {
        this.voto = voto;
    }

    public String votarA(Proceso destino) {
        if (!esBizantino) {
            return this.voto;
        }
        // Bizantino: miente segun el destinatario
        if (destino.id % 2 == 0) {
            return "SI";
        } else {
            return "NO";
        }
    }

    public void recibirVoto(int remitenteId, String votoRecibido) {
        votosRecibidos.put(remitenteId, votoRecibido);
    }

    public void limpiarVotos() {
        votosRecibidos.clear();
    }

    public boolean enviarMensaje(String tipo, Proceso destino) {
        System.out.println("Mensaje [" + tipo + "] de P" + this.id + " -> P" + destino.id);
        if (!destino.activo) {
            System.out.println("  -> [SIN RESPUESTA] P" + destino.id + " esta inactivo.");
            return false;
        }
        if (tipo.equals("ELECTION")) {
            System.out.println("  -> [OK] P" + destino.id + " responde a P" + this.id);
        }
        return true;
    }

    @Override
    public String toString() {
        String etiqueta = esBizantino ? " (BIZANTINO)" : "";
        return "P" + id + etiqueta;
    }
}
