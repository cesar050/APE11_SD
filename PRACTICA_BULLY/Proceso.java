public class Proceso {
    int id;
    boolean activo;

    public Proceso(int id) {
        this.id = id;
        this.activo = true;
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
}
