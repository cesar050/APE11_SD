# CHANGELOG — Algoritmo Bully Distribuido

## [APE11] — 2026-06-17

### Arquitectura distribuida
- Refactor completo a peers autonomos con comunicacion UDP
- Cada `PeerBully` es un ejecutable independiente que escucha en un puerto
- Mensajes: `ELECTION`, `OK`, `COORDINATOR`, `HEARTBEAT`, `PROPOSAL`, `VOTE`, `PING`, `PONG`

### HEARTBEAT y deteccion de fallas
- Coordinador envia latido cada 2s a todos los peers
- Si un peer no recibe heartbeat por 8s, inicia eleccion Bully
- Timeouts configurables en `peers.env`

### Consenso bizantino
- Fase de votacion posterior a la eleccion del coordinador
- Propuesta: `APROBAR TRANSACCION`
- Nodos honestos: mismo voto a todos los peers
- Nodos bizantinos (`BIZANTINOS` en `.env`): envian `SI` a pares, `NO` a impares
- Coordinador recopila votos, muestra resultados e inconsistencias

### Quorum check (split-brain)
- Antes de asumir liderazgo, el peer verifica quorum minimo (`N/2 + 1`)
- Envia `PING` a todos los peers, espera `PONG`
- Si no alcanza quorum → se aísla silenciosamente
- Reintenta cada ~8s hasta recuperar conectividad
- Al recibir `HEARTBEAT` o `COORDINATOR` → sale del estado aislado

### Dockerizacion
- `Dockerfile`: imagen Alpine + JDK 21 multistage
- `generate-compose.sh`: genera `docker-compose.generated.yml` desde `peers.env`
- `Makefile`: targets `build`, `up`, `down`, `logs`, `kill`, `run`, `image`, `clean`
- `run-peer.sh`: despliegue LAN con `--network host`

### Configuracion unificada en peers.env
- `PEERS=ip1:puerto,ip2:puerto,...` — define todos los nodos del cluster
- `BIZANTINOS=1,3` — IDs de nodos bizantinos (vacio = todos honestos)
- `HEARTBEAT_INTERVAL_MS`, `ELECTION_TIMEOUT_MS`, `OK_WAIT_MS`

### Legacy mantenido
- `Proceso.java`, `PracticaBully.java`, `ConsensoBizantino.java` sin cambios
- Simulacion monoproceso original intacta

## [APE10] — 2026-06-17

### Simulacion monoproceso
- `Proceso.java`: clase con ID, estado activo, envio de mensajes
- `PracticaBully.java`: algoritmo Bulley en un solo JVM
- Simulacion con 5, 7, 10 y 15 procesos
- Contador de mensajes, tiempo de convergencia, nuevo lider
- `ConsensoBizantino.java`: analisis comparativo N >= 3f+1
