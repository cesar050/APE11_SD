import java.io.*;
import java.net.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

public class PeerBully {
    static final String ENV_FILE = "peers.env";

    int id;
    boolean esBizantino;
    String bizantinosIds;
    String[] peers;
    int heartbeatIntervalMs = 2000;
    int electionTimeoutMs = 8000;
    int okWaitMs = 3000;

    DatagramSocket socket;
    int myPort;

    static final int ESPERANDO_COORD = -2;

    volatile boolean soyCoordinador = false;
    volatile int coordinadorActual = -1;
    volatile long ultimoHeartbeatRx;
    volatile boolean enEleccion = false;
    volatile boolean recibiOK = false;
    volatile boolean aislado = false;
    volatile boolean consensoPublicado = false;
    final AtomicInteger contadorPongs = new AtomicInteger(0);

    final Map<Integer, String> votosRecibidos = new ConcurrentHashMap<>();
    final BlockingQueue<String> colaMensajes = new LinkedBlockingQueue<>();
    final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(3);
    final Random rand = new Random();

    // ============================================================
    public static void main(String[] args) throws Exception {
        new PeerBully().run(args);
    }

    void run(String[] args) throws Exception {
        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--id" -> id = Integer.parseInt(args[++i]);
                case "--bizantino" -> esBizantino = true;
            }
        }

        cargarEnv();
        if (!esBizantino && bizantinosIds != null && !bizantinosIds.isEmpty()) {
            for (String s : bizantinosIds.split(",")) {
                if (Integer.parseInt(s.trim()) == id) {
                    esBizantino = true;
                    break;
                }
            }
        }
        int index = id - 1;
        String miEntrada = peers[index];
        myPort = Integer.parseInt(miEntrada.split(":")[1]);

        socket = new DatagramSocket(myPort);
        ultimoHeartbeatRx = System.currentTimeMillis();

        System.out.println("\n[P" + id + "] INICIADO en " + miEntrada + (esBizantino ? " [MODO BIZANTINO]" : ""));

        new Thread(this::loopEscucha).start();

        if (id == peers.length) {
            convertirmeEnCoordinador();
        } else {
            System.out.println("[P" + id + "] Esperando heartbeat de P" + peers.length + "...");
        }

        new Thread(this::loopMonitorHeartbeat).start();

        while (true) {
            procesarMensajes();
            Thread.sleep(50);
        }
    }

    // ============================================================
    void cargarEnv() throws IOException {
        Path path = Paths.get(ENV_FILE);
        if (!Files.exists(path)) {
            path = Paths.get("/app/" + ENV_FILE);
        }
        List<String> lineas = Files.readAllLines(path);
        for (String linea : lineas) {
            linea = linea.trim();
            if (linea.isEmpty() || linea.startsWith("#")) continue;
            String[] partes = linea.split("=", 2);
            if (partes.length < 2) continue;
            String k = partes[0].trim();
            String v = partes[1].trim();
            switch (k) {
                case "PEERS" -> peers = v.split(",");
                case "BIZANTINOS" -> bizantinosIds = v;
                case "HEARTBEAT_INTERVAL_MS" -> heartbeatIntervalMs = Integer.parseInt(v);
                case "ELECTION_TIMEOUT_MS" -> electionTimeoutMs = Integer.parseInt(v);
                case "OK_WAIT_MS" -> okWaitMs = Integer.parseInt(v);
            }
        }
        if (peers == null) throw new RuntimeException("PEERS no definido en " + ENV_FILE);
        System.out.println("[P" + id + "] Peers: " + Arrays.toString(peers));
    }

    // ============================================================
    void loopEscucha() {
        byte[] buf = new byte[1024];
        try {
            while (true) {
                DatagramPacket pkt = new DatagramPacket(buf, buf.length);
                socket.receive(pkt);
                String msg = new String(pkt.getData(), 0, pkt.getLength());
                colaMensajes.add(msg);
            }
        } catch (SocketException e) {
            // socket closed
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    void procesarMensajes() {
        String msg;
        while ((msg = colaMensajes.poll()) != null) {
            procesarMensaje(msg);
        }
    }

    void procesarMensaje(String msg) {
        String[] partes = msg.split(":", 4);
        if (partes.length < 2) return;
        String tipo = partes[0];
        int remitenteId = Integer.parseInt(partes[1]);

        switch (tipo) {
            case "HEARTBEAT" -> {
                if (coordinadorActual != remitenteId) {
                    System.out.println("[P" + id + "] Heartbeat de P" + remitenteId);
                }
                if (soyCoordinador && remitenteId > id) {
                    System.out.println("[P" + id + "] Renuncio: P" + remitenteId + " es el coordinador verdadero");
                    soyCoordinador = false;
                }
                if (remitenteId >= coordinadorActual || coordinadorActual < 0) {
                    coordinadorActual = remitenteId;
                }
                aislado = false;
                enEleccion = false;
                ultimoHeartbeatRx = System.currentTimeMillis();
            }
            case "ELECTION" -> {
                System.out.println("[P" + id + "] <<< ELECTION de P" + remitenteId);
                enviarUDP(remitenteId, "OK:" + id);
                if (!soyCoordinador && !enEleccion && id > remitenteId) {
                    iniciarEleccion();
                }
            }
            case "OK" -> {
                System.out.println("[P" + id + "] <<< OK de P" + remitenteId);
                recibiOK = true;
                coordinadorActual = ESPERANDO_COORD; 
                ultimoHeartbeatRx = System.currentTimeMillis(); 
            }
            case "COORDINATOR" -> {
                if (remitenteId < coordinadorActual) {
                    System.out.println("[P" + id + "] Ignoro COORDINATOR de P" + remitenteId + " porque ya conozco un coordinador superior");
                    break;
                }
                System.out.println("[P" + id + "] <<< COORDINATOR: P" + remitenteId + " ES EL LIDER");
                aislado = false;
                soyCoordinador = false;
                coordinadorActual = remitenteId;
                ultimoHeartbeatRx = System.currentTimeMillis();
                enEleccion = false;
            }
            case "PROPOSAL" -> {
                String propuesta = partes[2];
                System.out.println("[P" + id + "] <<< PROPUESTA de P" + remitenteId + ": " + propuesta);
                String miVoto = votoHonesto();
                for (int i = 0; i < peers.length; i++) {
                    int destId = i + 1;
                    if (destId == id) continue;
                    String votoFinal = esBizantino
                        ? ((destId % 2 == 0) ? "SI" : "NO")
                        : miVoto;
                    if (esBizantino) {
                        System.out.println("[P" + id + "] >>> VOTO " + votoFinal + " para P" + destId + " (bizantino)");
                    }
                    enviarUDP(destId, "VOTE:" + id + ":" + votoFinal);
                }
                if (!esBizantino) {
                    System.out.println("[P" + id + "] >>> VOTO " + miVoto + " a todos");
                }
            }
            case "PING" -> {
                enviarUDP(remitenteId, "PONG:" + id);
            }
            case "PONG" -> {
                contadorPongs.incrementAndGet();
            }
            case "VOTE" -> {
                String voto = partes[2];
                votosRecibidos.put(remitenteId, voto);
                System.out.println("[P" + id + "] Voto: P" + remitenteId + " -> " + voto);
                if (soyCoordinador && !consensoPublicado && votosRecibidos.size() >= votosEsperados()) {
                    mostrarResultadosConsenso();
                }
            }
            case "CONSENSUS_RESULT" -> {
                String decision = partes[2];
                String detalle = partes.length >= 4 ? partes[3] : "";
                System.out.println("\n[P" + id + "] === RESULTADO DEL CONSENSO ===");
                if (!detalle.isBlank()) {
                    System.out.println("[P" + id + "] Votos: " + detalle);
                }
                System.out.println("[P" + id + "] Decision final: " + decision);
                System.out.println();
            }
        }
    }

    // ============================================================
    void loopMonitorHeartbeat() {
        while (true) {
            try {
                Thread.sleep(heartbeatIntervalMs);
                if (!soyCoordinador) {
                    long diff = System.currentTimeMillis() - ultimoHeartbeatRx;
                    if (coordinadorActual == ESPERANDO_COORD) {
                        if (diff > electionTimeoutMs * 3) {
                            System.out.println("[P" + id + "] Timeout esperando coordinador, reintentando...");
                            coordinadorActual = -1;
                        }
                    } else if (coordinadorActual < 0) {
                        if (!aislado) {
                            iniciarEleccion();
                        }
                    } else if (diff > electionTimeoutMs) {
                        System.out.println("[P" + id + "] !!! SIN HEARTBEAT de P" + coordinadorActual
                            + " (" + diff + "ms)");
                        coordinadorActual = -1;
                        aislado = true;
                        new Thread(() -> {
                            try { Thread.sleep(electionTimeoutMs); } catch (InterruptedException e) { return; }
                            aislado = false;
                        }).start();
                    }
                }
            } catch (InterruptedException e) {
                break;
            }
        }
    }

    // ============================================================
    boolean tieneQuorum() {
        contadorPongs.set(0);
        int quorum = peers.length / 2 + 1;
        for (int i = 0; i < peers.length; i++) {
            int destId = i + 1;
            if (destId != id) {
                enviarUDP(destId, "PING:" + id);
            }
        }
        try {
            Thread.sleep(okWaitMs);
        } catch (InterruptedException e) {
            return false;
        }
        int alcanzables = 1 + contadorPongs.get();
        System.out.println("[P" + id + "] Quorum: " + alcanzables + "/" + quorum);
        return alcanzables >= quorum;
    }

    // ============================================================
    synchronized void iniciarEleccion() {
        if (enEleccion) return;
        enEleccion = true;
        recibiOK = false;
        System.out.println("[P" + id + "] === INICIANDO ELECCION ===");

        int mayores = 0;
        for (int i = id; i < peers.length; i++) {
            int destId = i + 1;
            if (destId > id) {
                enviarUDP(destId, "ELECTION:" + id);
                mayores++;
            }
        }

        if (mayores == 0) {
            if (!tieneQuorum()) {
                aislado = true;
                System.out.println("[P" + id + "] SIN QUORUM, esperando reconexion...");
                enEleccion = false;
                return;
            }
            aislado = false;
            convertirmeEnCoordinador();
            enEleccion = false;
            return;
        }

        new Thread(() -> {
            try {
                Thread.sleep(okWaitMs);
                if (!recibiOK && !soyCoordinador) {
                    aislado = false;
                    System.out.println("[P" + id + "] Sin respuesta de IDs superiores, asumo liderazgo");
                    convertirmeEnCoordinador();
                } else if (recibiOK) {
                    System.out.println("[P" + id + "] IDs superiores respondieron, esperando coordinador...");
                }
                enEleccion = false;
            } catch (InterruptedException e) {}
        }).start();
    }

    // ============================================================
    void convertirmeEnCoordinador() {
        if (soyCoordinador) return;
        soyCoordinador = true;
        coordinadorActual = id;
        enEleccion = false;
        aislado = false;
        ultimoHeartbeatRx = System.currentTimeMillis();
        System.out.println("[P" + id + "] >>> SOY EL COORDINADOR <<<");

        for (int i = 0; i < id - 1; i++) {
            int destId = i + 1;
            enviarUDP(destId, "COORDINATOR:" + id);
        }

        scheduler.scheduleAtFixedRate(() -> {
            if (soyCoordinador) {
                for (int i = 0; i < peers.length; i++) {
                    int destId = i + 1;
                    if (destId != id) {
                        enviarUDP(destId, "HEARTBEAT:" + id);
                    }
                }
            }
        }, heartbeatIntervalMs, heartbeatIntervalMs, TimeUnit.MILLISECONDS);

        scheduler.schedule(this::iniciarConsenso, 3, TimeUnit.SECONDS);
    }

    // ============================================================
    void iniciarConsenso() {
        if (!soyCoordinador) return;
        System.out.println("\n[P" + id + "] === FASE DE CONSENSO ===");
        System.out.println("[P" + id + "] Propuesta: APROBAR TRANSACCION");

        votosRecibidos.clear();
        consensoPublicado = false;

        for (int i = 0; i < peers.length; i++) {
            int destId = i + 1;
            if (destId != id) {
                enviarUDP(destId, "PROPOSAL:" + id + ":AprobarTransaccion");
            }
        }

        // Coordinator also votes
        votosRecibidos.put(id, votoHonesto());
        System.out.println("[P" + id + "] Voto propio: " + votosRecibidos.get(id));

        new Thread(() -> {
            try {
                Thread.sleep(4000);
                mostrarResultadosConsenso();
            } catch (InterruptedException e) {}
        }).start();
    }

    synchronized void mostrarResultadosConsenso() {
        if (!soyCoordinador) return;
        if (consensoPublicado) return;
        consensoPublicado = true;
        System.out.println("\n[P" + id + "] === RESULTADOS DEL CONSENSO ===");
        System.out.println("Votos recibidos:");
        int si = 0, no = 0;
        List<String> detalleVotos = new ArrayList<>();
        List<Integer> orden = new ArrayList<>(votosRecibidos.keySet());
        Collections.sort(orden);
        for (int p : orden) {
            String voto = votosRecibidos.get(p);
            System.out.println("  P" + p + " -> " + voto);
            detalleVotos.add("P" + p + "=" + voto);
            if ("SI".equals(voto)) si++;
            else if ("NO".equals(voto)) no++;
        }
        String decision;
        System.out.println("Total -> SI: " + si + ", NO: " + no);
        if (si > no) decision = "TRANSACCION APROBADA";
        else if (no > si) decision = "TRANSACCION RECHAZADA";
        else decision = "EMPATE";
        System.out.println("Decision: " + decision);
        guardarResultadoConsenso(decision, detalleVotos, si, no);
        String detalle = String.join(", ", detalleVotos);
        for (int i = 0; i < peers.length; i++) {
            int destId = i + 1;
            if (destId != id) {
                enviarUDP(destId, "CONSENSUS_RESULT:" + id + ":" + decision + ":" + detalle);
            }
        }
        System.out.println();
    }

    int votosEsperados() {
        return peers.length;
    }

    // ============================================================
    void guardarResultadoConsenso(String decision, List<String> detalleVotos, int si, int no) {
        try {
            Path stateDir = Paths.get("state");
            Files.createDirectories(stateDir);

            StringBuilder json = new StringBuilder();
            json.append("{\n");
            json.append("  \"coordinator\": ").append(id).append(",\n");
            json.append("  \"decision\": \"").append(jsonEscape(decision)).append("\",\n");
            json.append("  \"votes\": [\n");
            for (int i = 0; i < detalleVotos.size(); i++) {
                String[] partes = detalleVotos.get(i).split("=", 2);
                int peerId = Integer.parseInt(partes[0].substring(1));
                String voto = partes.length > 1 ? partes[1] : "";
                json.append("    {\"peer\": ").append(peerId)
                    .append(", \"vote\": \"").append(jsonEscape(voto)).append("\"}");
                if (i < detalleVotos.size() - 1) json.append(",");
                json.append("\n");
            }
            json.append("  ],\n");
            json.append("  \"totals\": {\"SI\": ").append(si).append(", \"NO\": ").append(no).append("}\n");
            json.append("}\n");

            Files.writeString(stateDir.resolve("consensus.json"), json.toString(),
                StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE);
        } catch (IOException e) {
            System.out.println("[P" + id + "] No se pudo guardar consensus.json: " + e.getMessage());
        }
    }

    String jsonEscape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    // ============================================================
    String votoHonesto() {
        return rand.nextBoolean() ? "SI" : "NO";
    }

    void enviarUDP(int destId, String mensaje) {
        try {
            int idx = destId - 1;
            String[] hostPort = peers[idx].split(":");
            InetAddress addr = InetAddress.getByName(hostPort[0]);
            int port = Integer.parseInt(hostPort[1]);
            byte[] buf = mensaje.getBytes();
            socket.send(new DatagramPacket(buf, buf.length, addr, port));
        } catch (IOException e) {
            // Silent: nodo caido o inalcanzable
        }
    }
}
