FROM eclipse-temurin:21-jdk-alpine AS builder
WORKDIR /app
COPY *.java .
RUN javac PeerBully.java

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=builder /app/*.class /app/
COPY --from=builder /app/*.java /app/
COPY peers.env /app/peers.env
ENTRYPOINT ["java", "PeerBully"]
